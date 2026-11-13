import { jsonSchema, tool, ToolSet } from "ai";
import { getOpenRouterKey, logAPICall } from "../utils/api/openrouter";
import { searchFacts, Fact } from "./facts";
import { getMessagesAround } from "./messages";
import { resolveName } from "./nicknames";
import { MODELS } from "./settings";

export type ToolContext = {
  guildId: string;
  channelId: string;
  refMap: Map<string, string>;
  names: Map<string, string>;
  webEnabled: boolean;
};

export type ToolTrace = {
  used: string[];
  sources: { title: string; url: string }[];
  factsReturned: Fact[];
  webSearches: number;
};

const MAX_WEB_SEARCHES = 2;
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
  const timeout = AbortSignal.timeout(WEB_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

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
        "Look up what you remember about a server member (learned from past chat). Use when someone asks what you know about a person, " +
        "or when a specific remembered detail would clearly improve the answer. Do NOT call it just to find roast material.",
      inputSchema: jsonSchema<{ user: string; query: string }>({
        type: "object",
        additionalProperties: false,
        required: ["user", "query"],
        properties: {
          user: { type: "string", description: "Discord user ID, <@id> mention, or a name/nickname" },
          query: { type: "string", description: "topic to look for, e.g. 'gpu', 'games'; empty for anything" },
        },
      }),
      execute: async ({ user, query }) => {
        trace.used.push("search_user_memory");
        const ids = resolveUser(ctx, user);
        if (ids.length === 0) return { error: `no server member matches "${user}"` };
        if (ids.length > 1) return { error: `"${user}" is ambiguous`, candidates: ids.map((id) => ({ id, name: ctx.names.get(id) })) };
        const facts = searchFacts(ctx.guildId, ids, query);
        trace.factsReturned.push(...facts);
        return {
          user_id: ids[0],
          facts: facts.map((f) => ({
            id: f.id,
            fact: `${f.predicate.replace(/_/g, " ")}: ${f.value}`,
            kind: f.kind,
            reported_by: f.reporters.map((r) => (r === f.subjectUserId ? "themself" : `user ${r}`)),
            last_confirmed: new Date(f.lastConfirmedAt).toISOString().slice(0, 10),
          })),
        };
      },
    }),

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
      execute: async ({ message, limit }) => {
        trace.used.push("get_conversation_context");
        const id = ctx.refMap.get(message.trim()) ?? message.trim();
        const msgs = getMessagesAround(ctx.guildId, ctx.channelId, id, Math.min(limit ?? 10, 20));
        if (msgs.length === 0) return { error: "message not found in this channel" };
        return {
          messages: msgs.map((m) => ({
            id: m.messageId,
            author: m.isOwnBot ? "you (the bot)" : `${m.authorName} [user ${m.authorId}]`,
            reply_to: m.replyToMessageId,
            time: new Date(m.createdAt).toISOString(),
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
      execute: async ({ query }, { abortSignal }) => {
        trace.used.push("web_search");
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
