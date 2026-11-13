import { jsonSchema, tool, ToolSet } from "ai";
import { getOpenRouterKey, logAPICall } from "../utils/api/openrouter";
import { factIsCurrent, getFact, getFactSources, jumpLink, searchFacts, Fact } from "./facts";
import { getMessagesAround, searchMessages, storedRange } from "./messages";
import { getProfile } from "./profiles";
import { fmtDate, fmtDateTime, parseDateInput } from "./time";
import { resolveName } from "./nicknames";
import { MODELS } from "./settings";
import { anySignal, timeoutSignal } from "./compat";

export type ToolContext = {
  guildId: string;
  channelId: string;
  refMap: Map<string, string>;
  names: Map<string, string>;
  webEnabled: boolean;
  /** may the requesting user see this channel? (message search only returns visible channels) */
  canView: (channelId: string) => boolean;
  channelName: (channelId: string) => string;
};

export type ToolTrace = {
  used: string[];
  sources: { title: string; url: string }[];
  factsReturned: Fact[];
  webSearches: number;
};

const MAX_WEB_SEARCHES = 2;
/** Total tool calls allowed per reply; afterwards the model has to write its answer. */
export const MAX_TOOL_CALLS = 10;
const LIMIT_REACHED = {
  error: `tool limit (${MAX_TOOL_CALLS} per reply) reached. Stop looking things up and write your reply now with what you have.`,
};

/** Count a tool call; returns false once the per-reply total is used up. */
function allow(trace: ToolTrace, name: string): boolean {
  trace.used.push(name);
  return trace.used.length <= MAX_TOOL_CALLS;
}
const WEB_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const webCache = new Map<string, { at: number; value: WebResult }>();

type WebResult =
  | { ok: true; summary: string; sources: { title: string; url: string }[] }
  | { ok: false; error: string };

/**
 * Runs one OpenRouter Responses call with the `openrouter:web_search` server
 * tool and returns a compact, cited summary. Isolated here because server
 * tools are beta and the installed AI SDK provider does not expose them.
 */
export async function webSearch(query: string, signal?: AbortSignal): Promise<WebResult> {
  const key = query.trim().toLowerCase();
  const hit = webCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const start = Date.now();
  const combined = anySignal([signal, timeoutSignal(WEB_TIMEOUT_MS)]);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      signal: combined,
      headers: { Authorization: `Bearer ${getOpenRouterKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELS.search,
        input: [
          {
            role: "user",
            content:
              `Search the web and answer factually and concisely (max 120 words). ` +
              `Include dates for anything time-sensitive. Today is ${new Date().toISOString().slice(0, 10)}.\n\nQuery: ${query}`,
          },
        ],
        tools: [
          {
            type: "openrouter:web_search",
            parameters: { engine: process.env.V2_SEARCH_ENGINE || "exa", max_results: 5, max_uses: 1 },
          },
        ],
        max_tool_calls: 2,
        max_output_tokens: 600,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `search failed (HTTP ${res.status}) ${body.slice(0, 200)}` };
    }
    const data: any = await res.json();

    let summary = typeof data.output_text === "string" ? data.output_text : "";
    const sources: { title: string; url: string }[] = [];
    for (const item of data.output ?? []) {
      for (const part of item?.content ?? []) {
        if (!summary && part?.type === "output_text" && typeof part.text === "string") summary += part.text;
        for (const a of part?.annotations ?? []) {
          if (a?.type === "url_citation" && typeof a.url === "string" && !sources.some((s) => s.url === a.url)) {
            sources.push({ title: String(a.title ?? a.url).slice(0, 120), url: a.url });
          }
        }
      }
    }

    const searches = data.usage?.server_tool_use_details?.web_search_requests ?? data.usage?.server_tool_use?.web_search_requests ?? 0;
    logAPICall({
      type: "MemoryV2.web_search",
      model: MODELS.search,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cost: "see OpenRouter",
      durationMs: Date.now() - start,
      extra: { query, searches, sources: sources.length },
    });

    if (!summary.trim()) return { ok: false, error: "search returned no results" };
    const value: WebResult = { ok: true, summary: summary.trim().slice(0, 1500), sources: sources.slice(0, 5) };
    webCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    const msg = (err as Error).name === "TimeoutError" ? "search timed out" : (err as Error).message;
    return { ok: false, error: msg };
  }
}

function resolveUser(ctx: ToolContext, user: string): string[] {
  const trimmed = user.trim();
  const mention = trimmed.match(/^<@!?(\d{15,22})>$/) ?? trimmed.match(/^(?:user\s*)?(\d{15,22})$/);
  if (mention) return [mention[1]];
  return resolveName(ctx.guildId, trimmed);
}

export function buildTools(ctx: ToolContext, trace: ToolTrace): ToolSet {
  const tools: ToolSet = {
    search_user_memory: tool({
      description:
        "Look up what you remember about a server member (facts learned from chat, plus their profile). " +
        "Use when someone asks what you know about a person, when you need more ammo for a roast of someone not covered in <roast_material>, " +
        "or when a remembered detail clearly helps. history=true also returns facts that were later replaced.",
      inputSchema: jsonSchema<{ user: string; query: string; history?: boolean; from?: string; to?: string }>({
        type: "object",
        additionalProperties: false,
        required: ["user", "query"],
        properties: {
          user: { type: "string", description: "Discord user ID, <@id> mention, or a name/nickname" },
          query: { type: "string", description: "topic to look for, e.g. 'gpu', 'games'; empty string for anything" },
          history: { type: "boolean", description: "include replaced/expired facts" },
          from: { type: "string", description: "only facts stated on/after this date (YYYY-MM-DD, 'yesterday', '30d')" },
          to: { type: "string", description: "only facts stated on/before this date (YYYY-MM-DD)" },
        },
      }),
      execute: async (input: { user: string; query: string; history?: boolean; from?: string; to?: string }) => {
        if (!allow(trace, "search_user_memory")) return LIMIT_REACHED;
        const ids = resolveUser(ctx, input.user);
        if (ids.length === 0) return { error: `no server member matches "${input.user}"` };
        if (ids.length > 1) return { error: `"${input.user}" is ambiguous`, candidates: ids.map((id) => ({ id, name: ctx.names.get(id) })) };
        const from = parseDateInput(input.from) ?? undefined;
        const to = parseDateInput(input.to, true) ?? undefined;
        const facts = searchFacts(ctx.guildId, ids, input.query ?? "", 12, { history: !!input.history, from, to });
        trace.factsReturned.push(...facts.filter((f) => factIsCurrent(f)));
        const profile = getProfile(ctx.guildId, ids[0]);
        return {
          user_id: ids[0],
          profile: profile ? profile.profile : null,
          facts: facts.map((f) => ({
            id: f.id,
            source_message_ids: f.sourceMessageIds,
            fact: `${f.predicate.replace(/_/g, " ")}: ${f.value}`,
            kind: f.kind,
            status: factIsCurrent(f) ? "current" : f.status === "superseded" ? "replaced by a newer fact" : "expired",
            reported_by: f.reporters.map((r) => (r === f.subjectUserId ? "themself" : `user ${r}`)),
          })),
        };
      },
    } as any),

    search_messages: tool({
      description:
        "Search the stored chat log of this server by date/time range, optionally filtered by author, keywords and channel. " +
        "Use for questions like \"what did Dani say yesterday?\", \"what happened on 2026-08-04?\", \"when did Serg first mention his new job?\". " +
        "Returns at most 25 messages, oldest first. Dates are in the server's timezone. The log only covers what the bot has stored (see coverage in the result).",
      inputSchema: jsonSchema<{ from: string; to?: string; user?: string; query?: string; channel?: string; limit?: number }>({
        type: "object",
        additionalProperties: false,
        required: ["from"],
        properties: {
          from: { type: "string", description: "start: YYYY-MM-DD, 'YYYY-MM-DD HH:MM', 'today', 'yesterday' or '7d'" },
          to: { type: "string", description: "end (inclusive; a date means the end of that day). Default: end of the 'from' day for dates, otherwise now" },
          user: { type: "string", description: "only messages by this user (ID, mention or name/nickname)" },
          query: { type: "string", description: "keywords that must all appear" },
          channel: { type: "string", description: "only this channel (ID, or 'this' for the current channel)" },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      }),
      execute: async (input: { from: string; to?: string; user?: string; query?: string; channel?: string; limit?: number }) => {
        if (!allow(trace, "search_messages")) return LIMIT_REACHED;
        const from = parseDateInput(input.from);
        if (from == null) return { error: `can't read the date "${input.from}"` };
        const fromText = input.from.trim();
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(fromText) || /^(today|yesterday)$/i.test(fromText);
        const to = parseDateInput(input.to, true) ?? (dateOnly ? (parseDateInput(fromText, true) as number) : Date.now());
        let authorIds: string[] | undefined;
        if (input.user) {
          authorIds = resolveUser(ctx, input.user);
          if (authorIds.length === 0) return { error: `no server member matches "${input.user}"` };
        }
        const channelIds = input.channel
          ? [input.channel.trim() === "this" ? ctx.channelId : input.channel.replace(/[<#>]/g, "").trim()]
          : undefined;
        const words = (input.query ?? "")
          .split(/\s+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 2);
        const limit = Math.min(Math.max(input.limit ?? 20, 1), 25);

        // Over-fetch, then drop channels the requester can't see.
        const res = searchMessages(ctx.guildId, { from, to, authorIds, channelIds, words, limit: limit * 3 });
        const visible = res.messages.filter((m) => ctx.canView(m.channelId)).slice(0, limit);
        const range = storedRange(ctx.guildId);
        return {
          range: `${fmtDateTime(from)} to ${fmtDateTime(to)}`,
          coverage: range.first ? `stored messages exist from ${fmtDate(range.first)} to ${fmtDate(range.last!)}` : "nothing stored yet",
          total_matches: res.total,
          returned: visible.length,
          messages: visible.map((m) => ({
            time: fmtDateTime(m.createdAt),
            channel: `#${ctx.channelName(m.channelId)}`,
            author: m.isOwnBot ? "you (the bot)" : `${m.authorName} [user ${m.authorId}]`,
            text: [m.content, ...m.images.filter((i) => i.caption).map((i) => `[image: ${i.caption}]`)].join(" ").slice(0, 250),
          })),
        };
      },
    } as any),

    get_fact_source: tool({
      description:
        "Get the proof for a remembered fact: the original Discord message(s) it was learned from, with the exact quote and a jump link. " +
        "Use whenever someone asks where/when they said something, wants proof, or denies a fact. Post the link in your reply.",
      inputSchema: jsonSchema<{ fact_id: number }>({
        type: "object",
        additionalProperties: false,
        required: ["fact_id"],
        properties: { fact_id: { type: "integer", description: "the fact id, shown as [fact #id]" } },
      }),
      execute: async (input: { fact_id: number }) => {
        if (!allow(trace, "get_fact_source")) return LIMIT_REACHED;
        const fact = getFact(ctx.guildId, Number(input.fact_id));
        if (!fact) return { error: `no fact #${input.fact_id} in this server` };
        const sources = getFactSources(ctx.guildId, fact.id).filter((src) => !src.channelId || ctx.canView(src.channelId));
        return {
          fact: `${ctx.names.get(fact.subjectUserId) ?? `user ${fact.subjectUserId}`}: ${fact.predicate.replace(/_/g, " ")}: ${fact.value}`,
          sources: sources.length
            ? sources.map((src) => ({
                link: src.link ?? jumpLink(ctx.guildId, ctx.channelId, src.messageId),
                author: src.authorName ?? `user ${src.authorId}`,
                channel: src.channelId ? `#${ctx.channelName(src.channelId)}` : "unknown",
                quote: src.quote,
                full_message: src.content ? src.content.slice(0, 400) : "(message no longer stored)",
              }))
            : "no source message you can show here (deleted, or in a channel the requester can't see)",
        };
      },
    } as any),

    get_conversation_context: tool({
      description:
        "Fetch more messages around a message in this channel (by ref like m3 or a Discord message ID), when the chat log you have is not enough to understand a reply.",
      inputSchema: jsonSchema<{ message: string; limit?: number }>({
        type: "object",
        additionalProperties: false,
        required: ["message"],
        properties: {
          message: { type: "string" },
          limit: { type: "integer", minimum: 2, maximum: 20 },
        },
      }),
      execute: async ({ message, limit }: { message: string; limit?: number }) => {
        if (!allow(trace, "get_conversation_context")) return LIMIT_REACHED;
        const id = ctx.refMap.get(message.trim()) ?? message.trim();
        const msgs = getMessagesAround(ctx.guildId, ctx.channelId, id, Math.min(limit ?? 10, 20));
        if (msgs.length === 0) return { error: "message not found in this channel" };
        return {
          messages: msgs.map((m) => ({
            id: m.messageId,
            author: m.isOwnBot ? "you (the bot)" : `${m.authorName} [user ${m.authorId}]`,
            reply_to: m.replyToMessageId,
            time: fmtDateTime(m.createdAt),
            text: m.content.slice(0, 500),
          })),
        };
      },
    }),
  };

  if (ctx.webEnabled) {
    tools.web_search = tool({
      description:
        "Search the public web for current information (news, prices, releases, patch notes, sports, anything after your training cutoff, " +
        "or facts you are unsure about). Never search for Discord members or private chat content. Not needed for normal banter.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: { query: { type: "string", description: "a concise web search query" } },
      }),
      execute: async ({ query }: { query: string }, { abortSignal }: { abortSignal?: AbortSignal }) => {
        if (!allow(trace, "web_search")) return LIMIT_REACHED;
        if (trace.webSearches >= MAX_WEB_SEARCHES) return { ok: false, error: "search limit for this reply reached; answer with what you have" };
        trace.webSearches++;
        const result = await webSearch(query, abortSignal);
        if (result.ok) {
          for (const s of result.sources) if (!trace.sources.some((x) => x.url === s.url)) trace.sources.push(s);
        }
        return result;
      },
    });
  }

  return tools;
}
