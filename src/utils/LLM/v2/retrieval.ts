import { generateText, jsonSchema, Output } from "ai";
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";
import { getV2DB } from "./db";
import { Fact, factIsCurrent, getActiveFacts, getFactHistory, isRoastRequest, RankedFact, selectFactsForReply } from "./facts";
import { MODELS } from "./settings";
import { contentWords } from "./text";

/**
 * Fact retrieval in two steps:
 *   1. an index per person: category -> predicates (with counts and a few example values)
 *   2. a cheap planner call picks which predicates of which person fit the request,
 *      then those facts are loaded (topic-related and not-recently-used ones first).
 * The same index/fetch functions back the list_user_facts / get_user_facts tools.
 */

export type FactIndexEntry = { category: string; predicate: string; count: number; examples: string[] };

/** What is known about a person, grouped by category and predicate. */
export function getFactIndex(guildId: string, userId: string): FactIndexEntry[] {
  const map = new Map<string, FactIndexEntry>();
  for (const f of getActiveFacts(guildId, [userId])) {
    const category = f.category ?? "other";
    const key = `${category}/${f.predicate}`;
    const e = map.get(key) ?? { category, predicate: f.predicate, count: 0, examples: [] };
    e.count++;
    if (e.examples.length < 3) e.examples.push(f.value.length > 40 ? f.value.slice(0, 40) + "…" : f.value);
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => a.category.localeCompare(b.category) || b.count - a.count);
}

/** Compact text form of an index, one line per category. */
export function renderFactIndex(entries: FactIndexEntry[]): string {
  const byCategory = new Map<string, FactIndexEntry[]>();
  for (const e of entries) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  return [...byCategory.entries()]
    .map(([cat, list]) => `  ${cat}: ${list.map((e) => `${e.predicate} (${e.count}: ${e.examples.join(", ")}${e.count > e.examples.length ? ", …" : ""})`).join(" · ")}`)
    .join("\n");
}

function recentlyUsedIds(guildId: string, channelId: string): Set<number> {
  const rows = getV2DB()
    .prepare(
      `SELECT DISTINCT fact_id FROM fact_usage WHERE guild_id = ? AND channel_id = ? AND used_at > ?
       UNION SELECT fact_id FROM (SELECT fact_id FROM fact_usage WHERE guild_id = ? AND channel_id = ? ORDER BY used_at DESC LIMIT 10)`
    )
    .all(guildId, channelId, Date.now() - 24 * 60 * 60 * 1000, guildId, channelId) as { fact_id: number }[];
  return new Set(rows.map((r) => r.fact_id));
}

/**
 * Facts of one person for some predicates and/or categories. Inside a predicate,
 * facts related to `topic` come first, then ones not used recently in the channel.
 */
export function getFactsByPredicates(
  guildId: string,
  userId: string,
  opts: { predicates?: string[]; categories?: string[]; history?: boolean; topic?: string; channelId?: string; perPredicate?: number; limit?: number }
): Fact[] {
  const all = opts.history ? getFactHistory(guildId, [userId]) : getActiveFacts(guildId, [userId]);
  const preds = new Set((opts.predicates ?? []).map((p) => p.trim().toLowerCase()));
  const cats = new Set((opts.categories ?? []).map((c) => c.trim().toLowerCase()));
  const wanted = all.filter((f) => preds.has(f.predicate) || (f.category != null && cats.has(f.category)));
  const topic = contentWords(opts.topic ?? "");
  const used = opts.channelId ? recentlyUsedIds(guildId, opts.channelId) : new Set<number>();
  const score = (f: Fact) => {
    let rel = 0;
    for (const w of contentWords(`${f.predicate.replace(/_/g, " ")} ${f.value}`)) if (topic.has(w)) rel++;
    return rel * 10 + (used.has(f.id) ? -5 : 0) + (f.kind === "self_report" ? 1 : 0);
  };
  const perPredicate = opts.perPredicate ?? 6;
  const counts = new Map<string, number>();
  const out: Fact[] = [];
  for (const f of [...wanted].sort((a, b) => score(b) - score(a))) {
    const n = counts.get(f.predicate) ?? 0;
    if (n >= perPredicate) continue;
    counts.set(f.predicate, n + 1);
    out.push(f);
    if (out.length >= (opts.limit ?? 25)) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export type RetrievalUser = { id: string; name: string; role: "requester" | "target" | "mentioned" };

const MAX_PREDICATES_PER_USER = 5;
const MAX_PREDICATES_TOTAL = 10;
const MAX_FACTS = 20;

const PLANNER_SYSTEM = `You decide which remembered facts a sarcastic Discord bot should load before replying.
You get the request, the recent chat and, for each person involved, an index of what is known about them:
"category: predicate (count: example values)".

Pick the predicates whose facts would make THIS reply better:
- roast: the angles that hit hardest for the target (games and skill, habits, taste, reputation, things they're proud of). A few strong predicates, not everything.
- a question about a person ("what does X play", "is X good at Y"): the predicates that answer it.
- general question or banter: only predicates that clearly relate; usually none.
Never pick something just because it exists. At most ${MAX_PREDICATES_PER_USER} predicates per person and ${MAX_PREDICATES_TOTAL} overall.
Use the exact predicate names from the index. Return {"picks": []} when nothing fits.`;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["user_id", "predicates"],
        properties: {
          user_id: { type: "string" },
          predicates: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
type Plan = { picks: { user_id: string; predicates: string[] }[] };

let plannerImpl = async (prompt: string, signal?: AbortSignal): Promise<Plan> => {
  const start = Date.now();
  const result = await generateText({
    model: createOpenRouter().chat(MODELS.planner),
    system: PLANNER_SYSTEM,
    prompt,
    output: Output.object({ schema: jsonSchema<Plan>(PLAN_SCHEMA as any) }),
    maxRetries: 1,
    abortSignal: signal,
    timeout: 20_000,
  });
  const u = result.totalUsage;
  logAPICall({
    type: "MemoryV2.plan",
    model: MODELS.planner,
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    cost: computeCost(MODELS.planner, u.inputTokens || 0, u.outputTokens || 0).toFixed(6),
    durationMs: Date.now() - start,
  });
  return ((result as any).output as Plan) ?? { picks: [] };
};

/** Test hook: replace the planner model call (pass nothing to restore). */
let defaultPlanner = plannerImpl;
export function _setPlannerForTests(fn?: (prompt: string) => Promise<Plan>): void {
  plannerImpl = (fn as any) ?? defaultPlanner;
}

export function buildPlannerPrompt(users: RetrievalUser[], indexes: Map<string, FactIndexEntry[]>, request: string, chat: string, isRoast: boolean): string {
  const people = users
    .filter((u) => (indexes.get(u.id) ?? []).length > 0)
    .map((u) => `## ${u.name} [user ${u.id}] (${u.role})\n${renderFactIndex(indexes.get(u.id)!)}`)
    .join("\n\n");
  return [
    `Request${isRoast ? " (this is a ROAST request)" : ""}: ${request.slice(0, 500)}`,
    chat ? `\nRecent chat:\n${chat.slice(-1500)}` : "",
    `\nWhat is known:\n${people}`,
  ].join("\n");
}

/**
 * Plan and load the facts for a reply. Falls back to the old keyword selection
 * if the planner call fails.
 */
export async function planFactRetrieval(input: {
  guildId: string;
  channelId: string;
  users: RetrievalUser[];
  targetIds: string[];
  request: string;
  chat: string;
  signal?: AbortSignal;
}): Promise<{ facts: RankedFact[]; planned: boolean; picks: Plan["picks"] }> {
  const { guildId, channelId, users, targetIds } = input;
  const isRoast = isRoastRequest(input.request);
  const indexes = new Map(users.map((u) => [u.id, getFactIndex(guildId, u.id)]));
  if (![...indexes.values()].some((e) => e.length > 0)) return { facts: [], planned: true, picks: [] };

  let plan: Plan;
  try {
    plan = await plannerImpl(buildPlannerPrompt(users, indexes, input.request, input.chat, isRoast), input.signal);
  } catch (err) {
    console.warn("[MemoryV2] Fact planner failed, using keyword selection:", (err as Error).message);
    const facts = selectFactsForReply(guildId, channelId, users.map((u) => u.id), targetIds, `${input.request} ${input.chat}`, input.request);
    return { facts, planned: false, picks: [] };
  }

  // Keep only real people and real predicates, within the limits.
  const allowedUsers = new Set(users.map((u) => u.id));
  const picks: Plan["picks"] = [];
  let total = 0;
  for (const p of plan.picks ?? []) {
    if (!allowedUsers.has(p.user_id)) continue;
    const known = new Set((indexes.get(p.user_id) ?? []).map((e) => e.predicate));
    const preds = [...new Set((p.predicates ?? []).map((x) => String(x).trim().toLowerCase()))].filter((x) => known.has(x)).slice(0, MAX_PREDICATES_PER_USER);
    const take = preds.slice(0, Math.max(0, MAX_PREDICATES_TOTAL - total));
    if (take.length) {
      picks.push({ user_id: p.user_id, predicates: take });
      total += take.length;
    }
  }

  const topic = `${input.request} ${input.chat.slice(-800)}`;
  const facts: RankedFact[] = [];
  for (const p of picks) {
    for (const f of getFactsByPredicates(guildId, p.user_id, { predicates: p.predicates, topic, channelId, perPredicate: 4 })) {
      if (!factIsCurrent(f) || facts.some((x) => x.id === f.id)) continue;
      facts.push({ ...f, relevance: 1, ammo: isRoast && targetIds.includes(f.subjectUserId) });
      if (facts.length >= MAX_FACTS) break;
    }
  }
  return { facts, planned: true, picks };
}
