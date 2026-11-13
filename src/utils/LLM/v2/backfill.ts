import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  Guild,
  GuildBasedChannel,
  GuildMember,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { computeCost } from "../utils/api/openrouter";
import { getV2DB } from "./db";
import { EXTRACTION_BATCH_SIZE, isWorthExtracting, runExtractionBatch } from "./facts";
import { getMessage, getMessagesBefore, getUnextractedRange, StoredMessage, storeDiscordMessage } from "./messages";
import { getAISettings, MODELS } from "./settings";
import { captionQueueSize, queueCaptionsFor } from "./vision";

/**
 * Owner-only history backfill.
 *
 *  /backfill since:2026-08-01  ->  scan Discord history into memory-v2.db
 *  -> DM to the owner with counts + cost estimate + Confirm/Cancel buttons
 *  -> on Confirm: (optional captions) + fact extraction, progress edited into the DM
 */

export const BACKFILL_OWNER_ID = process.env.BACKFILL_OWNER_ID || "222398053703876628";

const CONFIRM_TIMEOUT_MS = 30 * 60_000;
const PROGRESS_EVERY_MS = 15_000;
const CONCURRENCY = 3;
/** Stop automatically if spending runs far past the estimate. */
const OVERSPEND_FACTOR = 3;

// Rough token model for the estimate (see extractBatch's prompt).
const PROMPT_OVERHEAD_TOKENS = 1_100;
const TOKENS_PER_LINE = 22;
const CHARS_PER_TOKEN = 3.5;
const OUTPUT_TOKENS_PER_CALL = 150;
const CAPTION_INPUT_TOKENS = 1_300;
const CAPTION_OUTPUT_TOKENS = 120;
const SECONDS_PER_CALL = 2.5;

type JobState = "scanning" | "awaiting_confirm" | "running" | "done" | "cancelled" | "expired" | "failed";

type JobRow = {
  id: number;
  guild_id: string;
  owner_id: string;
  since: number;
  until: number;
  channel_ids: string;
  include_images: number;
  state: JobState;
  dm_channel_id: string | null;
  dm_message_id: string | null;
  scanned: number;
  to_analyze: number;
  images: number;
  estimate_cost: number | null;
  processed: number;
  facts_stored: number;
  cost_spent: number;
  error: string | null;
};

const running = new Map<number, { stop: boolean }>();

function updateJob(id: number, fields: Partial<Record<keyof JobRow, unknown>>) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  getV2DB()
    .prepare(`UPDATE backfill_jobs SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => (fields as any)[k]), Date.now(), id);
}

function getJob(id: number): JobRow {
  return getV2DB().prepare("SELECT * FROM backfill_jobs WHERE id = ?").get(id) as JobRow;
}

export function activeJobFor(guildId: string): JobRow | undefined {
  return getV2DB()
    .prepare("SELECT * FROM backfill_jobs WHERE guild_id = ? AND state IN ('scanning', 'awaiting_confirm', 'running') LIMIT 1")
    .get(guildId) as JobRow | undefined;
}

/** "2026-08-01" or "90d" -> epoch ms (UTC midnight for dates). */
export function parseSince(input: string, now = Date.now()): number | null {
  const s = input.trim().toLowerCase();
  const rel = s.match(/^(\d{1,4})\s*d(ays?)?$/);
  if (rel) return now - Number(rel[1]) * 24 * 60 * 60 * 1000;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t) || new Date(t).getUTCDate() !== Number(m[3])) return null;
  return t;
}

const money = (x: number | null) => (x == null ? "unknown" : x < 0.01 ? "<$0.01" : `$${x.toFixed(2)}`);
const num = (n: number) => n.toLocaleString("en-US");
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

type Readable = { id: string; name: string; messages: { fetch(opts: { limit: number; before?: string }): Promise<Map<string, Message>> } };

async function listChannels(guild: Guild, since: number, onlyId?: string): Promise<Readable[]> {
  const me: GuildMember = guild.members.me ?? (await guild.members.fetch(guild.client.user!.id));
  const canRead = (ch: GuildBasedChannel) =>
    !!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]);

  const out = new Map<string, Readable>();
  const add = (ch: GuildBasedChannel | null | undefined) => {
    if (ch && ch.isTextBased() && canRead(ch)) out.set(ch.id, ch as unknown as Readable);
  };

  const channels = await guild.channels.fetch();
  for (const ch of channels.values()) {
    if (!ch) continue;
    const isParent = !onlyId || ch.id === onlyId;
    if (isParent) add(ch);
    // Archived public threads of text / forum / announcement channels.
    if (
      isParent &&
      canRead(ch) &&
      (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildAnnouncement)
    ) {
      let before: Date | undefined;
      for (let page = 0; page < 20; page++) {
        const res = await ch.threads.fetchArchived({ type: "public", limit: 100, before }).catch(() => null);
        if (!res || res.threads.size === 0) break;
        let oldest = Infinity;
        res.threads.forEach((t) => {
          const archivedAt = t.archiveTimestamp ?? t.createdTimestamp ?? 0;
          oldest = Math.min(oldest, archivedAt);
          if (archivedAt >= since) add(t);
        });
        if (!res.hasMore || oldest < since) break;
        before = new Date(oldest);
      }
    }
  }
  const active = await guild.channels.fetchActiveThreads().catch(() => null);
  active?.threads.forEach((t) => {
    if (!onlyId || t.id === onlyId || t.parentId === onlyId) add(t);
  });
  if (onlyId && !out.has(onlyId)) {
    const single = await guild.channels.fetch(onlyId).catch(() => null);
    add(single);
  }
  return [...out.values()];
}

type ScanResult = { channels: number; scanned: number; stored: number };

async function scanHistory(
  guild: Guild,
  botId: string,
  job: JobRow,
  onProgress: (text: string) => void
): Promise<ScanResult & { channelIds: string[] }> {
  const onlyId = JSON.parse(job.channel_ids)[0] as string | undefined;
  const channels = await listChannels(guild, job.since, onlyId);
  let scanned = 0;
  let stored = 0;

  for (const [i, ch] of channels.entries()) {
    let before: string | undefined;
    for (;;) {
      if (running.get(job.id)?.stop) throw new Error("cancelled");
      const page = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!page || page.size === 0) break;
      let reachedStart = false;
      let oldestId: string | undefined;
      for (const m of page.values()) {
        oldestId = m.id;
        if (m.createdTimestamp < job.since) {
          reachedStart = true;
          continue;
        }
        if (m.createdTimestamp > job.until) continue;
        scanned++;
        if (m.system || (m.author.bot && m.author.id !== botId)) continue;
        if (getMessage(guild.id, m.id)) continue;
        storeDiscordMessage(m, { ownBotId: botId, skipImages: job.include_images !== 1 });
        stored++;
      }
      onProgress(`Scanning **#${ch.name}** (${i + 1}/${channels.length}) · ${num(scanned)} messages so far`);
      if (reachedStart || page.size < 100 || !oldestId) break;
      before = oldestId;
    }
  }
  return { channels: channels.length, scanned, stored, channelIds: channels.map((c) => c.id) };
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export type Estimate = {
  toAnalyze: number;
  calls: number;
  images: number;
  extractCost: number | null;
  captionCost: number | null;
  total: number | null;
  minutes: number;
};

export function estimateBackfill(guildId: string, channelIds: string[], since: number, until: number, includeImages: boolean): Estimate {
  const rows = getUnextractedRange(guildId, channelIds, since, until);
  const byChannel = new Map<string, StoredMessage[]>();
  for (const r of rows) byChannel.set(r.channelId, [...(byChannel.get(r.channelId) ?? []), r]);

  let calls = 0;
  let inputTokens = 0;
  let toAnalyze = 0;
  for (const list of byChannel.values()) {
    for (let i = 0; i < list.length; i += EXTRACTION_BATCH_SIZE) {
      const batch = list.slice(i, i + EXTRACTION_BATCH_SIZE);
      const worthy = batch.filter((m) => !m.isOwnBot && isWorthExtracting(m.content)).length;
      if (worthy === 0) continue;
      toAnalyze += worthy;
      calls++;
      const lines = batch.length + 8;
      const chars = batch.reduce((s, m) => s + m.content.length, 0) * (lines / batch.length);
      inputTokens += PROMPT_OVERHEAD_TOKENS + lines * TOKENS_PER_LINE + chars / CHARS_PER_TOKEN;
    }
  }
  const images = includeImages ? rows.reduce((s, m) => s + m.images.filter((i) => i.state === "pending").length, 0) : 0;

  const extractCost = computeCost(MODELS.extract, inputTokens, calls * OUTPUT_TOKENS_PER_CALL);
  const captionCost = images > 0 ? computeCost(MODELS.vision, images * CAPTION_INPUT_TOKENS, images * CAPTION_OUTPUT_TOKENS) : 0;
  const priced = calls === 0 || extractCost > 0;
  const total = priced ? extractCost + captionCost : null;
  return {
    toAnalyze,
    calls,
    images,
    extractCost: priced ? extractCost : null,
    captionCost: images === 0 || captionCost > 0 ? captionCost : null,
    total,
    minutes: Math.max(1, Math.ceil(((calls / CONCURRENCY) * SECONDS_PER_CALL + images * 2) / 60)),
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function runBackfill(job: JobRow, report: (text: string, final?: boolean) => Promise<void>): Promise<void> {
  const state = running.get(job.id) ?? { stop: false };
  running.set(job.id, state);
  const channelIds = JSON.parse(job.channel_ids) as string[];
  let processed = job.processed;
  let facts = job.facts_stored;
  let spent = job.cost_spent;
  let lastReport = 0;
  const budget = job.estimate_cost != null ? Math.max(job.estimate_cost * OVERSPEND_FACTOR, 0.5) : null;

  const progress = async (phase: string, force = false) => {
    if (!force && Date.now() - lastReport < PROGRESS_EVERY_MS) return;
    lastReport = Date.now();
    updateJob(job.id, { processed, facts_stored: facts, cost_spent: spent });
    await report(
      `**Backfill running** since ${day(job.since)}\n${phase}\n` +
        `Analyzed ${num(processed)} / ${num(job.to_analyze)} messages · ${num(facts)} facts learned · spent ${money(spent)}` +
        (job.estimate_cost != null ? ` of ~${money(job.estimate_cost)}` : "")
    ).catch(() => {});
  };

  try {
    // 1. Captions first, so facts can use them.
    if (job.include_images === 1) {
      const rows = getUnextractedRange(job.guild_id, channelIds, job.since, job.until);
      let queued = 0;
      for (const m of rows) if (queueCaptionsFor(job.guild_id, m.messageId)) queued++;
      while (captionQueueSize() > 0) {
        if (state.stop) throw new Error("cancelled");
        await progress(`Describing images: ${num(Math.max(0, queued - captionQueueSize()))} / ${num(queued)} messages`);
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }

    // 2. Fact extraction, oldest first per channel, a few channels in parallel.
    const rows = getUnextractedRange(job.guild_id, channelIds, job.since, job.until);
    const byChannel = new Map<string, StoredMessage[]>();
    for (const r of rows) byChannel.set(r.channelId, [...(byChannel.get(r.channelId) ?? []), r]);
    const queue = [...byChannel.values()];

    const worker = async () => {
      for (let list = queue.shift(); list; list = queue.shift()) {
        for (let i = 0; i < list.length; i += EXTRACTION_BATCH_SIZE) {
          if (state.stop) return;
          if (budget != null && spent > budget) {
            state.stop = true;
            throw new Error(`stopped: spent ${money(spent)}, more than ${OVERSPEND_FACTOR}x the estimate`);
          }
          const batch = list.slice(i, i + EXTRACTION_BATCH_SIZE);
          const ctx = getMessagesBefore(job.guild_id, batch[0].channelId, batch[0].createdAt, 8);
          let stats = { stored: 0, cost: 0, calls: 0 };
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              stats = await runExtractionBatch({ guildId: job.guild_id, context: ctx, batch, backfill: true });
              break;
            } catch (err) {
              if (attempt === 3) console.error("[MemoryV2] Backfill batch failed, skipping:", (err as Error).message);
              else await new Promise((r) => setTimeout(r, 2_000 * attempt));
            }
          }
          processed += batch.filter((m) => !m.isOwnBot && isWorthExtracting(m.content)).length;
          facts += stats.stored;
          spent += stats.cost;
          await progress("Learning facts…");
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    updateJob(job.id, { processed, facts_stored: facts, cost_spent: spent });
    if (state.stop) {
      updateJob(job.id, { state: "cancelled" });
      await report(`**Backfill stopped.** Analyzed ${num(processed)} messages, learned ${num(facts)} facts, spent ${money(spent)}.`, true);
    } else {
      updateJob(job.id, { state: "done" });
      await report(
        `**Backfill done** (since ${day(job.since)}).\nAnalyzed ${num(processed)} messages · learned ${num(facts)} facts · spent ${money(spent)}.`,
        true
      );
    }
  } catch (err) {
    const msg = (err as Error).message;
    updateJob(job.id, { processed, facts_stored: facts, cost_spent: spent, state: msg === "cancelled" ? "cancelled" : "failed", error: msg });
    await report(`**Backfill ${msg === "cancelled" ? "stopped" : "failed"}:** ${msg}\nAnalyzed ${num(processed)} messages, spent ${money(spent)}.`, true).catch(() => {});
  } finally {
    running.delete(job.id);
  }
}

// ---------------------------------------------------------------------------
// DM flow
// ---------------------------------------------------------------------------

const buttons = (...b: ButtonBuilder[]) => [new ActionRowBuilder<ButtonBuilder>().addComponents(...b)];

function stopButton(jobId: number) {
  return buttons(new ButtonBuilder().setCustomId(`bf:stop:${jobId}`).setLabel("Stop").setStyle(ButtonStyle.Danger));
}

/** Attach a Stop-button listener and run the job, editing `dm` with progress. */
function startRunning(job: JobRow, dm: Message): void {
  const collector = dm.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === job.owner_id && i.customId === `bf:stop:${job.id}`,
  });
  collector.on("collect", async (i: ButtonInteraction) => {
    const st = running.get(job.id);
    if (st) st.stop = true;
    await i.update({ content: `${dm.content}\n\n**Stopping…** (finishing the current batches)`, components: [] }).catch(() => {});
  });

  runBackfill(job, async (text, final) => {
    await dm.edit({ content: text, components: final ? [] : stopButton(job.id) });
    if (final) collector.stop();
  }).catch((err) => console.error("[MemoryV2] Backfill crashed:", err));
}

export type BackfillRequest = {
  client: Client;
  guild: Guild;
  ownerId: string;
  since: number;
  channelId?: string;
  includeImages: boolean;
};

/**
 * Scan, estimate, ask for confirmation via DM, then run. Resolves after the
 * DM with the estimate is sent (the run continues in the background).
 */
export async function startBackfill(req: BackfillRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  const { client, guild } = req;
  if (!client.user) return { ok: false, error: "Bot is not ready yet." };
  if (activeJobFor(guild.id)) return { ok: false, error: "A backfill for this server is already in progress." };
  if (!getAISettings(guild.id).learning) return { ok: false, error: "Learning is paused here (`/ai learning enabled:true` first)." };

  const owner = await client.users.fetch(req.ownerId);
  const dmChannel = await owner.createDM().catch(() => null);
  const dm = await dmChannel?.send(`**Backfill for ${guild.name}** since ${day(req.since)}\nPreparing…`).catch(() => null);
  if (!dm) return { ok: false, error: "I can't DM you. Allow DMs from server members and try again." };

  const now = Date.now();
  // While the memory engine is learning live, it already covers the recent window
  // (see sinceFor in facts.ts); stop the backfill there to avoid double work.
  const s = getAISettings(guild.id);
  const until = s.engine === "memory" ? Math.max(s.engineEnabledAt ?? 0, now - 24 * 60 * 60 * 1000) : now;
  if (until <= req.since) {
    await dm.edit(`**Backfill for ${guild.name}**: nothing to do, live learning already covers everything since ${day(req.since)}.`);
    return { ok: true };
  }
  const id = Number(
    getV2DB()
      .prepare(
        `INSERT INTO backfill_jobs (guild_id, owner_id, since, until, channel_ids, include_images, state, dm_channel_id, dm_message_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'scanning', ?, ?, ?, ?)`
      )
      .run(guild.id, req.ownerId, req.since, until, JSON.stringify(req.channelId ? [req.channelId] : []), req.includeImages ? 1 : 0, dm.channel.id, dm.id, now, now)
      .lastInsertRowid
  );
  running.set(id, { stop: false });

  // Continue in the background; the slash command has already been answered.
  void (async () => {
    try {
      let lastEdit = 0;
      const scan = await scanHistory(guild, client.user!.id, getJob(id), (text) => {
        if (Date.now() - lastEdit < 5_000) return;
        lastEdit = Date.now();
        dm.edit(`**Backfill for ${guild.name}** since ${day(req.since)}\n${text}`).catch(() => {});
      });
      running.delete(id);

      const est = estimateBackfill(guild.id, scan.channelIds, req.since, until, req.includeImages);
      updateJob(id, {
        state: "awaiting_confirm",
        channel_ids: JSON.stringify(scan.channelIds),
        scanned: scan.scanned,
        to_analyze: est.toAnalyze,
        images: est.images,
        estimate_cost: est.total,
      });

      if (est.calls === 0 && est.images === 0) {
        updateJob(id, { state: "done" });
        await dm.edit(
          `**Backfill for ${guild.name}** since ${day(req.since)}\nScanned ${num(scan.scanned)} messages in ${scan.channels} channels. Nothing new to analyze.`
        );
        return;
      }

      const summary =
        `**Backfill for ${guild.name}** since ${day(req.since)}\n` +
        `Channels: ${scan.channels} · scanned ${num(scan.scanned)} messages (${num(scan.stored)} new)\n` +
        `To analyze: **${num(est.toAnalyze)} messages** in ~${num(est.calls)} calls with \`${MODELS.extract}\`` +
        (req.includeImages ? `\nImages to describe: **${num(est.images)}** with \`${MODELS.vision}\`` : "\nImages: not described (run with `images:true` to include them)") +
        `\n\n**Estimated cost: ~${money(est.total)}**` +
        (est.total != null ? ` (could be up to ~${money(est.total * 1.5)})` : " (model price not loaded)") +
        ` · ~${est.minutes} min\n` +
        `-# Opted-out users are skipped. Stops automatically above ${OVERSPEND_FACTOR}x the estimate. Expires in 30 min.`;

      await dm.edit({
        content: summary,
        components: buttons(
          new ButtonBuilder().setCustomId(`bf:confirm:${id}`).setLabel(`Confirm (~${money(est.total)})`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bf:cancel:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        ),
      });

      const choice = await dm
        .awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === req.ownerId && i.customId.startsWith("bf:") && i.customId.endsWith(`:${id}`),
          time: CONFIRM_TIMEOUT_MS,
        })
        .catch(() => null);

      if (!choice) {
        updateJob(id, { state: "expired" });
        await dm.edit({ content: `${summary}\n\n**Expired.** Run \`/backfill\` again if you still want it.`, components: [] });
        return;
      }
      if (choice.customId.startsWith("bf:cancel:")) {
        updateJob(id, { state: "cancelled" });
        await choice.update({ content: `${summary}\n\n**Cancelled.** Nothing was spent.`, components: [] });
        return;
      }

      updateJob(id, { state: "running" });
      await choice.update({ content: `${summary}\n\n**Confirmed.** Starting…`, components: stopButton(id) });
      startRunning(getJob(id), dm);
    } catch (err) {
      running.delete(id);
      const msg = (err as Error).message;
      updateJob(id, { state: msg === "cancelled" ? "cancelled" : "failed", error: msg });
      await dm.edit({ content: `**Backfill failed while scanning:** ${msg}`, components: [] }).catch(() => {});
    }
  })();

  return { ok: true };
}

/** After a restart: resume confirmed jobs, expire unconfirmed ones. */
export async function resumeBackfills(client: Client): Promise<void> {
  const rows = getV2DB()
    .prepare("SELECT * FROM backfill_jobs WHERE state IN ('scanning', 'awaiting_confirm', 'running')")
    .all() as JobRow[];
  for (const job of rows) {
    try {
      const owner = await client.users.fetch(job.owner_id);
      const dmChannel = await owner.createDM();
      if (job.state !== "running") {
        updateJob(job.id, { state: "expired", error: "interrupted by restart" });
        await dmChannel.send(`Backfill #${job.id} was interrupted by a restart before it was confirmed. Run \`/backfill\` again.`);
        continue;
      }
      const dm = await dmChannel.send({ content: `Bot restarted. **Resuming backfill #${job.id}**…`, components: stopButton(job.id) });
      updateJob(job.id, { dm_message_id: dm.id });
      startRunning(job, dm);
    } catch (err) {
      console.error(`[MemoryV2] Could not resume backfill #${job.id}:`, err);
    }
  }
}
