/**
 * Ordered response processing.
 *
 * One FIFO queue per (guild, channel/thread): the whole
 * build-context -> generate -> send -> persist operation for request N
 * finishes before request N+1 builds its context, so a rapid second ping
 * sees the first answer. Different channels run concurrently, bounded by a
 * small global concurrency cap.
 */

export type QueueLimits = {
  maxPendingPerChannel: number;
  maxTriggersPerUser: number;
  userWindowMs: number;
  maxConcurrent: number;
  jobTimeoutMs: number;
};

export const DEFAULT_LIMITS: QueueLimits = {
  maxPendingPerChannel: 10,
  maxTriggersPerUser: 3,
  userWindowMs: 10_000,
  maxConcurrent: 3,
  jobTimeoutMs: 120_000, // up to 10 lookups + a forced final answer
};

export type EnqueueResult = { accepted: true; position: number } | { accepted: false; reason: "channel_full" | "user_rate_limited" | "duplicate" };

export type Job = {
  id: string;
  key: string;
  userId: string;
  run: (signal: AbortSignal) => Promise<void>;
  onCancelled?: () => void;
};

export class ResponseQueue {
  private queues = new Map<string, Job[]>();
  private runningKeys = new Set<string>();
  private active = 0;
  private waitingKeys: string[] = [];
  private userHits = new Map<string, number[]>();
  private known = new Set<string>();

  constructor(private limits: QueueLimits = DEFAULT_LIMITS) {}

  enqueue(job: Job): EnqueueResult {
    if (this.known.has(job.id)) return { accepted: false, reason: "duplicate" };

    const now = Date.now();
    const hits = (this.userHits.get(job.userId) ?? []).filter((t) => now - t < this.limits.userWindowMs);
    if (hits.length >= this.limits.maxTriggersPerUser) {
      this.userHits.set(job.userId, hits);
      return { accepted: false, reason: "user_rate_limited" };
    }

    const q = this.queues.get(job.key) ?? [];
    const pending = q.length + (this.runningKeys.has(job.key) ? 1 : 0);
    if (pending >= this.limits.maxPendingPerChannel) return { accepted: false, reason: "channel_full" };

    hits.push(now);
    this.userHits.set(job.userId, hits);
    this.known.add(job.id);
    q.push(job);
    this.queues.set(job.key, q);
    this.schedule(job.key);
    return { accepted: true, position: pending };
  }

  /** Cancel a job that has not started yet (e.g. its trigger was deleted). */
  cancel(jobId: string): boolean {
    for (const [key, q] of this.queues) {
      const i = q.findIndex((j) => j.id === jobId);
      if (i >= 0) {
        const [job] = q.splice(i, 1);
        if (q.length === 0) this.queues.delete(key);
        job.onCancelled?.();
        return true;
      }
    }
    return false;
  }

  pendingCount(key?: string): number {
    if (key) return (this.queues.get(key)?.length ?? 0) + (this.runningKeys.has(key) ? 1 : 0);
    let n = this.active;
    for (const q of this.queues.values()) n += q.length;
    return n;
  }

  private schedule(key: string) {
    if (this.runningKeys.has(key)) return;
    if (this.active >= this.limits.maxConcurrent) {
      if (!this.waitingKeys.includes(key)) this.waitingKeys.push(key);
      return;
    }
    const q = this.queues.get(key);
    const job = q?.shift();
    if (!job) {
      this.queues.delete(key);
      return;
    }
    if (q!.length === 0) this.queues.delete(key);

    this.runningKeys.add(key);
    this.active++;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("job timeout")), this.limits.jobTimeoutMs);

    job
      .run(controller.signal)
      .catch((err) => console.error(`[MemoryV2] Job ${job.id} failed:`, err))
      .finally(() => {
        clearTimeout(timer);
        this.known.delete(job.id);
        this.runningKeys.delete(key);
        this.active--;
        // Same channel first (keeps order), then channels waiting for a slot.
        if (this.queues.has(key)) this.schedule(key);
        while (this.active < this.limits.maxConcurrent && this.waitingKeys.length > 0) {
          const next = this.waitingKeys.shift()!;
          this.schedule(next);
        }
      });
  }
}
