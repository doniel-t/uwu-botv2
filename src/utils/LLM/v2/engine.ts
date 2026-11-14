import { GuildTextBasedChannel, Message, PermissionFlagsBits } from "discord.js";
import { generateText, stepCountIs } from "ai";
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";
import { getV2DB } from "./db";
import { buildContext, TIMEZONE } from "./context";
import { recordFactUsage, RankedFact } from "./facts";
import { planFactRetrieval, RetrievalUser } from "./retrieval";
import { getMessage, storeDiscordMessage } from "./messages";
import { ResponseQueue } from "./responseQueue";
import { getAISettings, MODELS } from "./settings";
import { buildTools, MAX_TOOL_CALLS, ToolTrace } from "./tools";
import { requestImageParts } from "./vision";
import { hasLeakedToolMarkup, parseLeakedToolCalls, stripToolMarkup } from "./leakedTools";
import type { ModelMessage, ToolSet } from "ai";
import { buildSystemPrompt } from "./persona";
import { getProfile } from "./profiles";

const queue = new ResponseQueue();
/** Room for MAX_TOOL_CALLS lookups plus the final answer. */
const MAX_STEPS = MAX_TOOL_CALLS + 2;
// Reasoning models (gpt-6-luna) spend part of this on hidden thinking, so it has to be far above
// the ~500 tokens a 2000-character Discord message needs, or the reply gets cut mid-sentence.
const REPLY_MAX_TOKENS = 20000;
const DISCORD_LIMIT = 2000;

export function pendingResponses(): number {
  return queue.pendingCount();
}

function systemPrompt(botId: string, webEnabled: boolean): string {
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  return buildSystemPrompt({ botId, now, timezone: TIMEZONE, webEnabled });
}

function memoryBlock(facts: RankedFact[], names: Map<string, string>): string {
  if (facts.length === 0) return "";
  const line = (f: RankedFact) => {
    const who = `${names.get(f.subjectUserId) ?? "unknown"} [user ${f.subjectUserId}]`;
    const reporters = f.reporters.filter((r) => r !== f.subjectUserId);
    const source = f.kind === "third_party_claim" && reporters.length ? ` (according to ${reporters.map((r) => names.get(r) ?? `user ${r}`).join(", ")})` : "";
    return `- [fact #${f.id}] ${who}: ${f.predicate.replace(/_/g, " ")}: ${f.value}${source}`;
  };
  const ammo = facts.filter((f) => f.ammo);
  const other = facts.filter((f) => !f.ammo);
  let out = "";
  if (ammo.length) {
    out +=
      "\n\n<roast_material>\nOptional ammo about the target. Use AT MOST ONE, only if it makes the joke land harder. Never list or summarize these.\n" +
      ammo.map(line).join("\n") +
      "\n</roast_material>";
  }
  if (other.length) out += `\n\n<memory>\n${other.map(line).join("\n")}\n</memory>`;
  return out;
}

const MAX_PROFILES = 3;
/** Profiles are background on who someone is, not a list of material to recite. */
const PROFILE_PROMPT_CHARS = 1400;

function profilesBlock(guildId: string, userIds: string[], names: Map<string, string>): string {
  const lines: string[] = [];
  for (const id of userIds.slice(0, MAX_PROFILES)) {
    const p = getProfile(guildId, id);
    if (!p) continue;
    const text = p.profile.length > PROFILE_PROMPT_CHARS ? p.profile.slice(0, PROFILE_PROMPT_CHARS).replace(/\s+\S*$/, "") + "…" : p.profile;
    lines.push(`## ${names.get(id) ?? "unknown"} [user ${id}]\n${text}`);
  }
  return lines.length ? `\n\n<profiles>\n${lines.join("\n\n")}\n</profiles>` : "";
}

const MAX_RECOVERY_ROUNDS = 2;

async function recoverLeakedToolCalls(
  text: string,
  o: { tools: ToolSet; trace: ToolTrace; signal: AbortSignal; system: string; messages: ModelMessage[] }
): Promise<{ text: string; results: string[] }> {
  let current = text;
  const results: string[] = [];
  for (let round = 0; round < MAX_RECOVERY_ROUNDS && hasLeakedToolMarkup(current); round++) {
    const calls = parseLeakedToolCalls(current).slice(0, 3);
    if (calls.length === 0) break;
    console.warn(`[MemoryV2] Model wrote ${calls.length} tool call(s) as text; running them manually:`, calls.map((c) => c.name).join(", "));
    for (const [i, call] of calls.entries()) {
      const t: any = (o.tools as any)[call.name];
      let output: unknown;
      if (!t?.execute) {
        output = { error: `unknown tool ${call.name}` };
      } else {
        try {
          output = await t.execute(call.args, { toolCallId: `leaked-${round}-${i}`, messages: [], abortSignal: o.signal });
        } catch (err) {
          output = { error: (err as Error).message };
        }
      }
      results.push(`<tool_result name="${call.name}" args='${JSON.stringify(call.args)}'>\n${JSON.stringify(output).slice(0, 12_000)}\n</tool_result>`);
    }
    const follow = await generateText({
      model: createOpenRouter().chat(MODELS.chat),
      system: o.system,
      messages: [
        ...o.messages,
        { role: "assistant", content: "Let me check." },
        {
          role: "user",
          content: `${results.join("\n\n")}\n\nThose are the results of your lookups. Now answer the <current_request> in plain text. Do not call or write any tools.`,
        },
      ] as ModelMessage[],
      abortSignal: o.signal,
      maxRetries: 1,
      maxOutputTokens: REPLY_MAX_TOKENS,
    });
    current = follow.text;
  }
  return { text: hasLeakedToolMarkup(current) ? stripToolMarkup(current) : current, results };
}

/**
 * The model ended without any text (often after spending every step on
 * lookups). Give it everything it found and ask once more, without tools.
 */
async function forceFinalAnswer(o: {
  system: string;
  messages: ModelMessage[];
  stepMessages: ModelMessage[];
  extraResults: string[];
  signal: AbortSignal;
}): Promise<string> {
  const nudge =
    (o.extraResults.length ? `${o.extraResults.join("\n\n")}\n\n` : "") +
    "You're done looking things up. Write your reply to the <current_request> now: plain text, one message, no tool calls. " +
    "If the lookups didn't find what was asked, say that in character.";
  const follow = await generateText({
    model: createOpenRouter().chat(MODELS.chat),
    system: o.system,
    messages: [...o.messages, ...o.stepMessages, { role: "user", content: nudge }] as ModelMessage[],
    abortSignal: o.signal,
    maxRetries: 1,
    maxOutputTokens: REPLY_MAX_TOKENS,
  });
  return hasLeakedToolMarkup(follow.text) ? stripToolMarkup(follow.text) : follow.text;
}

function updateResponse(triggerId: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  getV2DB()
    .prepare(`UPDATE responses SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE trigger_message_id = ?`)
    .run(...keys.map((k) => fields[k] as any), triggerId);
}

function finalize(text: string, trace: ToolTrace): string {
  let body = text.trim() || "My brain lagged. Ask again.";
  let footer = "";
  if (trace.sources.length > 0) {
    footer = "\n-# Sources: " + trace.sources.slice(0, 3).map((s) => `<${s.url}>`).join(" · ");
  }
  const room = DISCORD_LIMIT - footer.length - 1;
  if (body.length > room) body = body.slice(0, room - 1).trimEnd() + "…";
  return body + footer;
}

/**
 * Entry point for a bot mention while the guild uses the memory engine.
 * The message must already be stored (see observeMessage in router.ts).
 */
export async function handleMention(trigger: Message, botId: string): Promise<void> {
  const guildId = trigger.guild!.id;
  const channelId = trigger.channel.id;
  const channel = trigger.channel as GuildTextBasedChannel;

  // Idempotency: one response per trigger message, even on duplicate events.
  const inserted = getV2DB()
    .prepare(
      `INSERT OR IGNORE INTO responses (trigger_message_id, guild_id, channel_id, requester_id, state, engine, created_at)
       VALUES (?, ?, ?, ?, 'pending', 'memory', ?)`
    )
    .run(trigger.id, guildId, channelId, trigger.author.id, Date.now());
  if (inserted.changes === 0) return;

  // Snapshot settings at enqueue time.
  const webEnabled = getAISettings(guildId).webMode === "auto";

  let typing: NodeJS.Timeout | null = null;
  const stopTyping = () => {
    if (typing) clearInterval(typing);
    typing = null;
  };

  const result = queue.enqueue({
    id: trigger.id,
    key: `${guildId}:${channelId}`,
    userId: trigger.author.id,
    onCancelled: () => {
      stopTyping();
      updateResponse(trigger.id, { state: "cancelled", finished_at: Date.now() });
    },
    run: async (signal) => {
      try {
        await respond(trigger, botId, webEnabled, signal);
      } finally {
        stopTyping();
      }
    },
  });

  if ("reason" in result) {
    updateResponse(trigger.id, { state: "cancelled", error: result.reason, finished_at: Date.now() });
    if (result.reason === "user_rate_limited") {
      await trigger.react("⏳").catch(() => {});
    } else if (result.reason === "channel_full") {
      await trigger.reply("I'm drowning in requests here. Give me a sec.").catch(() => {});
    }
    return;
  }

  channel.sendTyping?.().catch(() => {});
  typing = setInterval(() => channel.sendTyping?.().catch(() => {}), 8_000);
}

/** Cancel a queued (not yet running) request whose trigger was deleted. */
export function cancelForDeletedTrigger(messageId: string): void {
  queue.cancel(messageId);
}

async function respond(trigger: Message, botId: string, webEnabled: boolean, signal: AbortSignal): Promise<void> {
  const guildId = trigger.guild!.id;
  const channelId = trigger.channel.id;
  const channel = trigger.channel as GuildTextBasedChannel;
  const started = Date.now();

  const stored = getMessage(guildId, trigger.id);
  if (!stored || stored.deletedAt) {
    updateResponse(trigger.id, { state: "cancelled", error: "trigger deleted", finished_at: Date.now() });
    return;
  }

  updateResponse(trigger.id, { state: "running", model: MODELS.chat });

  try {
    const ctx = await buildContext(trigger, botId);

    // Everyone the request involves: targets, the requester, and anyone mentioned or named.
    const involved: RetrievalUser[] = [];
    const add = (id: string, role: RetrievalUser["role"]) => {
      if (id && id !== botId && !involved.some((u) => u.id === id)) involved.push({ id, name: ctx.names.get(id) ?? id, role });
    };
    ctx.targetIds.forEach((id) => add(id, "target"));
    add(ctx.requesterId, "requester");
    stored.mentionedUserIds.forEach((id) => add(id, "mentioned"));
    stored.nameRefs.filter((r) => r.confidence !== "low" && r.userId).forEach((r) => add(r.userId!, "mentioned"));
    const subjects = involved.slice(0, 5);

    // A cheap planner looks at each person's fact index and picks the predicates worth loading.
    const plan = await planFactRetrieval({
      guildId,
      channelId,
      users: subjects,
      targetIds: ctx.targetIds,
      request: stored.content,
      chat: ctx.topicText,
      signal,
    });
    const facts = plan.facts;

    // Images on the ping or the replied-to message go to the model directly.
    // Re-fetch those messages: stored Discord CDN links expire.
    const imageMessages = await Promise.all(
      ctx.imageSources.map(async (s) => {
        const live = s.messageId === trigger.id ? trigger : await channel.messages.fetch(s.messageId).catch(() => null);
        return live ? { ref: s.ref, label: s.label, message: live } : null;
      })
    );
    const images = await requestImageParts(imageMessages.filter((x) => x !== null), signal);

    const last = ctx.messages[ctx.messages.length - 1];
    if (last.role === "user" && typeof last.content === "string") {
      // Profiles of everyone involved, targets first (they matter more than single facts).
      const profileIds = subjects.map((u) => u.id);
      const text = last.content + profilesBlock(guildId, profileIds, ctx.names) + memoryBlock(facts, ctx.names) + images.intro;
      ctx.messages[ctx.messages.length - 1] =
        images.parts.length > 0 ? { role: "user", content: [{ type: "text", text }, ...images.parts] } : { role: "user", content: text };
    }

    const trace: ToolTrace = { used: [], sources: [], factsReturned: [], webSearches: 0 };
    const tools = buildTools(
      {
        guildId,
        channelId,
        refMap: ctx.refMap,
        names: ctx.names,
        webEnabled,
        canView: (id: string) => {
          const ch: any = trigger.guild!.channels.cache.get(id);
          if (!ch || !trigger.member) return id === channelId;
          try {
            return !!ch.permissionsFor(trigger.member)?.has(PermissionFlagsBits.ViewChannel);
          } catch {
            return false;
          }
        },
        channelName: (id: string) => (trigger.guild!.channels.cache.get(id) as any)?.name ?? id,
      },
      trace
    );

    const result = await generateText({
      model: createOpenRouter().chat(MODELS.chat),
      system: systemPrompt(botId, webEnabled),
      messages: ctx.messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      // After MAX_TOOL_CALLS lookups (or on the last step) tools are switched off,
      // so the model has to write its answer.
      prepareStep: ({ stepNumber }: { stepNumber: number }) =>
        trace.used.length >= MAX_TOOL_CALLS || stepNumber >= MAX_STEPS - 1 ? ({ activeTools: [], toolChoice: "none" } as any) : {},
      abortSignal: signal,
      maxRetries: 1,
      maxOutputTokens: REPLY_MAX_TOKENS,
    });

    // Some models write tool calls as text (e.g. DeepSeek's "<｜DSML｜invoke ...>").
    // Run those tools ourselves and ask for the real answer; never post the markup.
    const recovered = await recoverLeakedToolCalls(result.text, {
      tools,
      trace,
      signal,
      system: systemPrompt(botId, webEnabled),
      messages: ctx.messages,
    });
    let replyText = recovered.text;
    if (result.finishReason === "length") {
      console.warn(`[MemoryV2] Reply from ${MODELS.chat} hit the ${REPLY_MAX_TOKENS}-token output limit and may be cut off`);
    }
    if (!replyText.trim()) {
      const last = result.steps[result.steps.length - 1];
      console.warn(
        `[MemoryV2] Empty reply from ${MODELS.chat} after ${result.steps.length} step(s) ` +
          `(finish: ${result.finishReason}, last step: ${last?.finishReason}, tools: ${trace.used.join(",") || "none"}); forcing a final answer`
      );
      replyText = await forceFinalAnswer({
        system: systemPrompt(botId, webEnabled),
        messages: ctx.messages,
        stepMessages: ((result as any).response?.messages ?? []) as ModelMessage[],
        extraResults: recovered.results,
        signal,
      }).catch((err) => {
        console.error("[MemoryV2] Forced final answer failed:", err);
        return "";
      });
      if (!replyText.trim()) console.warn("[MemoryV2] Still empty after forcing; sending the fallback message");
    }
    const content = finalize(replyText, trace);

    updateResponse(trigger.id, { state: "sending" });
    let replyTo: Message = trigger;
    if (ctx.replyTargetMessageId !== trigger.id) {
      replyTo = await channel.messages.fetch(ctx.replyTargetMessageId).catch(() => trigger);
    }
    const sent = await replyTo.reply({ content, allowedMentions: { parse: ["users"], repliedUser: true } });
    storeDiscordMessage(sent, { ownBotId: botId, triggerMessageId: trigger.id });

    const usedFactIds = recordFactUsage(guildId, channelId, [...facts, ...trace.factsReturned], replyText);
    const usage = result.totalUsage;
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const cost = computeCost(MODELS.chat, inputTokens, outputTokens);

    updateResponse(trigger.id, {
      state: "sent",
      reply_message_id: sent.id,
      target_ids: JSON.stringify(ctx.targetIds),
      tools_used: JSON.stringify(trace.used),
      fact_ids: JSON.stringify(usedFactIds),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost,
      finished_at: Date.now(),
    });

    logAPICall({
      type: "MemoryV2.reply",
      model: MODELS.chat,
      inputTokens,
      outputTokens,
      cost: cost.toFixed(6),
      durationMs: Date.now() - started,
      extra: {
        targets: ctx.targetIds,
        via: ctx.targetSource,
        facts: facts.map((f) => f.id),
        plan: plan.planned ? plan.picks.map((p) => `${ctx.names.get(p.user_id) ?? p.user_id}: ${p.predicates.join(", ")}`) : "fallback",
        tools: trace.used,
        steps: result.steps.length,
        response: replyText.slice(0, 100),
      },
    });
  } catch (err) {
    const aborted = signal.aborted;
    console.error("[MemoryV2] Reply failed:", err);
    updateResponse(trigger.id, { state: "failed", error: String((err as Error)?.message ?? err).slice(0, 500), finished_at: Date.now() });
    await trigger
      .reply(aborted ? "That took too long, my brain timed out. Try again." : "Something broke on my end. Try again later.")
      .catch(() => {});
  }
}
