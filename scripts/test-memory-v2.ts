/**
 * Offline checks for the v2 memory engine (no Discord, no API calls).
 *   npx ts-node --transpile-only scripts/test-memory-v2.ts
 */
import assert from "assert";
import { initV2DBAt } from "../src/utils/LLM/v2/db";
import { allowedTypos, damerauLevenshtein } from "../src/utils/LLM/v2/text";
import { addNickname, getGuildAliases, listNicknames, makeAlias, refreshAutoAliases, removeNickname, resolveName, resolveNameRefs } from "../src/utils/LLM/v2/nicknames";
import { getAISettings, setUserLearning, updateAISettings } from "../src/utils/LLM/v2/settings";
import { ResponseQueue } from "../src/utils/LLM/v2/responseQueue";
import { _setBatchRunnerForTests, factIsCurrent, getActiveFacts, isWorthExtracting, searchFacts, onEvidenceChanged, scheduleExtraction, selectFactsForReply, storeValidatedFacts, validateCandidates } from "../src/utils/LLM/v2/facts";
import { getMessage, markExtracted, mergeImages, storeDiscordMessage } from "../src/utils/LLM/v2/messages";
import { buildContext } from "../src/utils/LLM/v2/context";
import { activeJobFor, parseSince, startBackfill } from "../src/utils/LLM/v2/backfill";
import { containsContactDetails } from "../src/utils/LLM/v2/facts";
import { ago, fmtDate, fmtDateTime, parseDateInput } from "../src/utils/LLM/v2/time";
import { _setProfileGeneratorForTests, getProfile, regenerateProfile, runProfileRefreshOnce } from "../src/utils/LLM/v2/profiles";
import { buildSystemPrompt } from "../src/utils/LLM/v2/persona";
import { hasLeakedToolMarkup, parseLeakedToolCalls, stripToolMarkup } from "../src/utils/LLM/v2/leakedTools";
import { buildTools } from "../src/utils/LLM/v2/tools";
import { _setPlannerForTests, getFactIndex, getFactsByPredicates, planFactRetrieval, renderFactIndex } from "../src/utils/LLM/v2/retrieval";
import { buildProfilePrompt } from "../src/utils/LLM/v2/profiles";
import { refreshStoredImages, setMessageImages } from "../src/utils/LLM/v2/messages";
import { buildExtractionContext, chunkByConversation } from "../src/utils/LLM/v2/extractionContext";
import { _setExtractorModelForTests, runExtractionBatch } from "../src/utils/LLM/v2/facts";
import { countGuildMemory, getFactSources, looksTemporal, resetGuildMemory } from "../src/utils/LLM/v2/facts";
import { searchMessages } from "../src/utils/LLM/v2/messages";
import { addManualFact } from "../src/utils/LLM/v2/facts";
import { markProfileDirty, setManualProfile } from "../src/utils/LLM/v2/profiles";
import { getV2DB as getV2DBForTests } from "../src/utils/LLM/v2/db";
import { handleProfileEditDM, pendingProfileEdit, splitForDiscord, startProfileEdit } from "../src/utils/LLM/v2/profileEdit";
import { _captionsIdle, _setCaptionerForTests, imagesOf, queueCaptions, requestImageParts, setOnCaptioned } from "../src/utils/LLM/v2/vision";

let passed = 0;
let total = 0;
// Tests run strictly one after another (they share one database).
let chain: Promise<void> = Promise.resolve();
function test(name: string, fn: () => void | Promise<void>) {
  total++;
  chain = chain.then(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ok   ${name}`);
    } catch (err) {
      console.error(`  FAIL ${name}\n       ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });
}
function section(name: string) {
  chain = chain.then(() => console.log(name));
}

const DANIEL = "222398053703876628";
const SERGEJ = "300000000000000001";
const JASON = "300000000000000002";
const MAX = "300000000000000003";
const MAX2 = "300000000000000004";
const LUKAS = "300000000000000005";
const JOSHI = "300000000000000006";
const BOT = "959595157462868042";
const G = "665991423933546526";
const CH = "700000000000000000";

async function main() {
  // ---------------------------------------------------------------- text
  section("text");
  test("typo budget per design", () => {
    assert.deepStrictEqual(
      ["dani", "karl", "til", "lukas", "sergej", "chainsawdaniel", "abcdefghijklmnopqrst"].map(allowedTypos),
      [0, 0, 0, 1, 1, 1, 2]
    );
  });
  test("transposition costs 1", () => {
    assert.strictEqual(damerauLevenshtein("sergej", "segrej"), 1);
    assert.strictEqual(damerauLevenshtein("dani", "dnai"), 1);
    assert.strictEqual(damerauLevenshtein("kitten", "sitting"), 3);
  });

  // ---------------------------------------------------------------- resolver (pure)
  section("nickname resolver");
  const aliases = [
    makeAlias(DANIEL, "Dani", "manual")!,
    makeAlias(DANIEL, "Big Dani", "manual")!,
    makeAlias(DANIEL, "ChainsawDaniel", "manual")!,
    makeAlias(SERGEJ, "Sergej", "manual")!,
    makeAlias(JASON, "Jason", "display_name")!,
    makeAlias(LUKAS, "Lukas", "manual")!,
    makeAlias(MAX, "max", "display_name")!,
    makeAlias(MAX2, "Max", "username")!,
    makeAlias(JOSHI, "Jöshi", "manual")!,
  ];
  const ids = (text: string, opts = {}) => resolveNameRefs(text, aliases, opts).map((r) => [r.text, r.userId ?? r.userIds.join("|"), r.confidence]);

  test("exact, case, possessive", () => {
    assert.deepStrictEqual(ids("dani is cooked"), [["dani", DANIEL, "high"]]);
    assert.deepStrictEqual(ids("DANI's setup"), [["DANI's", DANIEL, "high"]]);
    assert.deepStrictEqual(ids("Danis gpu"), [["Danis", DANIEL, "high"]]);
  });
  test("short names need exact spelling", () => {
    assert.deepStrictEqual(ids("dnai lol"), []);
  });
  test("5+ letters tolerate one typo (incl. transposition)", () => {
    assert.deepStrictEqual(ids("sergje again"), [["sergje", SERGEJ, "high"]]);
    assert.deepStrictEqual(ids("lucas said"), [["lucas", LUKAS, "high"]]);
    assert.deepStrictEqual(ids("chainsawdanial"), [["chainsawdanial", DANIEL, "high"]]);
    assert.deepStrictEqual(ids("sergeyy"), []); // 2 typos
  });
  test("a real word one typo away does not match", () => {
    assert.deepStrictEqual(ids("ask mason"), []);
  });
  test("longer alias wins over overlapping shorter one", () => {
    assert.deepStrictEqual(ids("big dani moment"), [["big dani", DANIEL, "high"]]);
  });
  test("german transliteration", () => {
    assert.deepStrictEqual(ids("joeshi and joshi"), [
      ["joeshi", JOSHI, "high"],
      ["joshi", JOSHI, "high"],
    ]);
  });
  test("ambiguous between two users", () => {
    const r = resolveNameRefs("Max won", aliases);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].confidence, "ambiguous");
    assert.deepStrictEqual(r[0].userIds.sort(), [MAX, MAX2].sort());
  });
  test("common-word alias needs a signal", () => {
    const only = [makeAlias(MAX, "max", "manual")!];
    assert.strictEqual(resolveNameRefs("max settings please", only)[0].confidence, "low");
    assert.strictEqual(resolveNameRefs("Max settings please", only)[0].confidence, "high");
    assert.strictEqual(resolveNameRefs("roast max", only, { isInstruction: true })[0].confidence, "high");
    assert.strictEqual(resolveNameRefs("max settings", only, { recentParticipantIds: new Set([MAX]) })[0].confidence, "high");
  });
  test("mentions, urls and code are ignored", () => {
    assert.deepStrictEqual(ids(`<@${DANIEL}> https://dani.com/x \`dani\``), []);
  });

  // ---------------------------------------------------------------- DB-backed
  chain = chain.then(() => {
    initV2DBAt(":memory:");
  });
  section("nickname commands");
  test("add / conflict / duplicate / remove / list", () => {
    assert.ok(addNickname(G, DANIEL, "Dani", SERGEJ).ok);
    const dup = addNickname(G, DANIEL, "dani", SERGEJ);
    assert.ok(!dup.ok && /already has/.test((dup as any).error));
    const clash = addNickname(G, SERGEJ, "DANI", SERGEJ);
    assert.ok(!clash.ok && clash.error.includes(DANIEL));
    refreshAutoAliases(G, JASON, { displayName: "Jason" });
    const autoClash = addNickname(G, SERGEJ, "jason", SERGEJ);
    assert.ok(!autoClash.ok && /Discord name/.test(autoClash.error));
    assert.ok(addNickname(G, SERGEJ, "Serg", DANIEL).ok);
    assert.deepStrictEqual(resolveName(G, "serg"), [SERGEJ]);
    assert.strictEqual(listNicknames(G).length, 2);
    assert.ok(removeNickname(G, SERGEJ, "SERG"));
    assert.deepStrictEqual(resolveName(G, "serg"), []);
    assert.ok(getGuildAliases(G).some((a) => a.userId === JASON && a.source === "display_name"));
  });
  test("per-user cap of 10", () => {
    for (let i = 0; i < 9; i++) assert.ok(addNickname(G, LUKAS, `luki${i}x`, DANIEL).ok);
    assert.ok(addNickname(G, LUKAS, "Lukas", DANIEL).ok);
    assert.ok(!addNickname(G, LUKAS, "Lukinator", DANIEL).ok);
  });
  test("invalid nicknames", () => {
    assert.ok(!addNickname(G, DANIEL, "x", DANIEL).ok);
    assert.ok(!addNickname(G, DANIEL, `<@${SERGEJ}>`, DANIEL).ok);
    assert.ok(!addNickname(G, DANIEL, "a b c d", DANIEL).ok);
  });

  section("settings");
  test("legacy by default, toggle persists", () => {
    assert.strictEqual(getAISettings("1").engine, "legacy");
    updateAISettings("1", { engine: "memory" }, DANIEL);
    assert.strictEqual(getAISettings("1").engine, "memory");
    assert.ok(getAISettings("1").engineEnabledAt! > 0);
    updateAISettings("1", { engine: "legacy" }, DANIEL);
    assert.strictEqual(getAISettings("1").engine, "legacy");
  });

  // ---------------------------------------------------------------- queue
  section("response queue");
  test("same channel runs in order; next job sees previous result", async () => {
    const q = new ResponseQueue({ maxPendingPerChannel: 10, maxTriggersPerUser: 10, userWindowMs: 1000, maxConcurrent: 3, jobTimeoutMs: 2000 });
    const log: string[] = [];
    const done = new Promise<void>((resolve) => {
      for (let i = 1; i <= 3; i++) {
        q.enqueue({
          id: `t${i}`,
          key: "g:c",
          userId: `u${i}`,
          run: async () => {
            log.push(`start${i} saw:${log.filter((l) => l.startsWith("reply")).length}`);
            await new Promise((r) => setTimeout(r, 20));
            if (i === 1) throw new Error("boom"); // failure must not block the rest
            log.push(`reply${i}`);
            if (i === 3) resolve();
          },
        });
      }
    });
    await done;
    assert.deepStrictEqual(log, ["start1 saw:0", "start2 saw:0", "reply2", "start3 saw:1", "reply3"]);
  });
  test("different channels run concurrently", async () => {
    const q = new ResponseQueue({ maxPendingPerChannel: 10, maxTriggersPerUser: 10, userWindowMs: 1000, maxConcurrent: 3, jobTimeoutMs: 2000 });
    let concurrent = 0;
    let peak = 0;
    await Promise.all(
      ["a", "b", "c"].map(
        (k) =>
          new Promise<void>((resolve) =>
            q.enqueue({
              id: k,
              key: k,
              userId: k,
              run: async () => {
                peak = Math.max(peak, ++concurrent);
                await new Promise((r) => setTimeout(r, 30));
                concurrent--;
                resolve();
              },
            })
          )
      )
    );
    assert.strictEqual(peak, 3);
  });
  test("per-user rate limit, duplicates, channel cap", () => {
    const q = new ResponseQueue({ maxPendingPerChannel: 2, maxTriggersPerUser: 3, userWindowMs: 10_000, maxConcurrent: 1, jobTimeoutMs: 2000 });
    const never = () => new Promise<void>(() => {});
    assert.ok(q.enqueue({ id: "1", key: "x", userId: "u", run: never }).accepted);
    assert.strictEqual((q.enqueue({ id: "1", key: "x", userId: "v", run: never }) as any).reason, "duplicate");
    assert.ok(q.enqueue({ id: "2", key: "x", userId: "u", run: never }).accepted);
    assert.strictEqual((q.enqueue({ id: "3", key: "x", userId: "w", run: never }) as any).reason, "channel_full");
    assert.ok(q.enqueue({ id: "4", key: "y", userId: "u", run: never }).accepted);
    assert.strictEqual((q.enqueue({ id: "5", key: "z", userId: "u", run: never }) as any).reason, "user_rate_limited");
    assert.ok(q.cancel("4"));
  });

  // ---------------------------------------------------------------- fake Discord + context
  section("messages + context");
  const members = new Map<string, any>([
    [DANIEL, { id: DANIEL, displayName: "Daniel", user: { id: DANIEL, username: "doniel", globalName: "Daniel" } }],
    [SERGEJ, { id: SERGEJ, displayName: "Sergej", user: { id: SERGEJ, username: "serg", globalName: "Sergej" } }],
    [JASON, { id: JASON, displayName: "Jason", user: { id: JASON, username: "jason", globalName: "Jason" } }],
  ]);
  const channelStore = new Map<string, any>();
  const channel: any = {
    id: CH,
    messages: {
      fetch: async (arg: any) => {
        if (typeof arg === "string") {
          const m = channelStore.get(arg);
          if (!m) throw new Error("Unknown Message");
          return m;
        }
        return new Map();
      },
    },
  };
  const guild: any = { id: G, members: { cache: members } };
  let clock = Date.now() - 60 * 60 * 1000; // relative to now: the context only looks back 6h
  let nextId = 800000000000000000n;
  function fakeMessage(authorId: string, content: string, opts: { replyTo?: string; mentions?: string[]; isBot?: boolean; attachments?: any[]; embeds?: any[] } = {}) {
    const id = String(nextId++);
    clock += 1000;
    const m = members.get(authorId);
    const mentionIds = opts.mentions ?? [...content.matchAll(/<@!?(\d+)>/g)].map((x) => x[1]);
    const msg: any = {
      id,
      guild,
      guildId: G,
      channel,
      content,
      createdTimestamp: clock,
      author: { id: authorId, bot: !!opts.isBot, username: m?.user.username ?? "uwu bot", globalName: m?.user.globalName, displayName: m?.displayName ?? "UwU Bot v2" },
      member: m ?? null,
      reference: opts.replyTo ? { messageId: opts.replyTo } : null,
      mentions: {
        users: new Map(mentionIds.map((x) => [x, { id: x }])),
        members: new Map(mentionIds.filter((x) => members.has(x)).map((x) => [x, members.get(x)])),
      },
      attachments: new Map((opts.attachments ?? []).map((a, i) => [String(i), a])),
      embeds: opts.embeds ?? [],
      stickers: new Map(),
    };
    channelStore.set(id, msg);
    return msg;
  }
  const say = (authorId: string, content: string, opts = {}) => {
    const m = fakeMessage(authorId, content, opts);
    storeDiscordMessage(m, { ownBotId: BOT });
    return m;
  };

  chain = chain.then(() => {
    addNickname(G, SERGEJ, "Sergio", DANIEL);
  });

  test("interleaved conversation keeps authors, nicknames and targets by ID", async () => {
    const a = say(DANIEL, "just bought a 4070 lol");
    say(JASON, "anyone up for ranked later?");
    const c = say(SERGEJ, "a 4070 in 2026? brokie", { replyTo: a.id });
    say(JASON, "guys ranked???");
    const trigger = say(DANIEL, `<@${BOT}> roast sergio for that take`, { mentions: [BOT] });

    const ctx = await buildContext(trigger, BOT);
    assert.deepStrictEqual(ctx.targetIds, [SERGEJ]);
    assert.strictEqual(ctx.targetSource, "nickname");
    assert.strictEqual(ctx.requesterId, DANIEL);
    const all = ctx.messages.map((m) => m.content as string).join("\n");
    assert.ok(all.includes(`Sergej [user ${SERGEJ}] replying to m1 by Daniel [user ${DANIEL}]: a 4070 in 2026? brokie`), all);
    assert.ok(all.includes(`sergio [= Sergej [user ${SERGEJ}]]`), all);
    assert.ok(all.includes("nicknames: Sergio"), all);
    assert.ok(!all.includes(`<@${BOT}>`), "bot mention should be rendered as @bot");
    assert.strictEqual(getMessage(G, c.id)!.authorId, SERGEJ);
  });

  test("rapid pings: second request sees first reply, not later pings", async () => {
    const p1 = say(JASON, `<@${BOT}> what rank is good`, { mentions: [BOT] });
    const p2 = say(DANIEL, `<@${BOT}> and roast jason`, { mentions: [BOT] });
    const p3 = say(SERGEJ, `<@${BOT}> third ping`, { mentions: [BOT] });
    // reply to p1 is sent after p2/p3 arrived
    const r1 = fakeMessage(BOT, "Gold is the participation trophy of ranks.", { isBot: true, replyTo: p1.id });
    storeDiscordMessage(r1, { ownBotId: BOT, triggerMessageId: p1.id });

    const ctx = await buildContext(p2, BOT);
    const turns = ctx.messages.map((m) => `${m.role}: ${m.content}`);
    const idxAssistant = turns.findIndex((t) => t.startsWith("assistant: Gold is"));
    assert.ok(idxAssistant > 0, "first reply should be an assistant turn");
    assert.ok(turns[idxAssistant - 1].includes("what rank is good"), "reply sits right after its trigger");
    assert.ok(!turns.join("\n").includes("third ping"), "later pings are not context for an earlier request");
    assert.deepStrictEqual(ctx.targetIds, [JASON]);
  });

  test("reply-to-human targets the replied author", async () => {
    const victim = say(JASON, "i main yasuo btw");
    const trigger = say(DANIEL, `<@${BOT}> cook him`, { replyTo: victim.id, mentions: [BOT] });
    const ctx = await buildContext(trigger, BOT);
    assert.deepStrictEqual(ctx.targetIds, [JASON]);
    assert.strictEqual(ctx.replyTargetMessageId, victim.id);
  });

  // ---------------------------------------------------------------- facts
  section("facts");
  test("validation: quotes, subjects, jokes, hearsay", () => {
    const m1 = say(DANIEL, "I bought a 4070 yesterday");
    const m2 = say(SERGEJ, `Daniel owns a 4090 actually`);
    const m3 = say(DANIEL, "I'm literally a toaster");
    const refs = new Map([["m1", getMessage(G, m1.id)!], ["m2", getMessage(G, m2.id)!], ["m3", getMessage(G, m3.id)!]]);
    const batch = new Set(["m1", "m2", "m3"]);
    const base = { multi_valued: true, supersedes_fact_id: null };
    const valid = validateCandidates(
      G,
      [
        { ...base, source_ref: "m1", subject_user_id: DANIEL, predicate: "owns_gpu", value: "RTX 4070", category: "possession", classification: "self_report", evidence_quote: "I bought a 4070" },
        { ...base, source_ref: "m1", subject_user_id: DANIEL, predicate: "owns_gpu", value: "RTX 5090", category: "possession", classification: "self_report", evidence_quote: "I bought a 5090" },
        { ...base, source_ref: "m2", subject_user_id: DANIEL, predicate: "owns_gpu", value: "RTX 4090", category: "possession", classification: "self_report", evidence_quote: "Daniel owns a 4090" },
        { ...base, source_ref: "m3", subject_user_id: DANIEL, predicate: "is", value: "toaster", category: "possession", classification: "joke", evidence_quote: "literally a toaster" },
        { ...base, source_ref: "m1", subject_user_id: JASON, predicate: "owns_gpu", value: "x", category: "possession", classification: "third_party_claim", evidence_quote: "I bought a 4070" },
      ] as any,
      refs,
      batch,
      new Map()
    );
    assert.deepStrictEqual(
      valid.map((v) => [v.value, v.kind]),
      [
        ["RTX 4070", "self_report"],
        ["RTX 4090", "third_party_claim"], // m2 subject Daniel via nickname/auto alias "Daniel"
      ]
    );
    storeValidatedFacts(G, valid);
    const facts = getActiveFacts(G, [DANIEL]);
    assert.strictEqual(facts.length, 2);
    assert.ok(facts.find((f) => f.kind === "third_party_claim")!.reporters.includes(SERGEJ));
  });

  test("single-valued self-report supersedes old value; hearsay never does", () => {
    const m = say(SERGEJ, "I work as a plumber");
    const m2 = say(SERGEJ, "quit plumbing, I'm a chef now");
    const m3 = say(JASON, "sergej is a dentist");
    const r = (msg: any) => getMessage(G, msg.id)!;
    const mk = (ref: string, value: string, cls: string, quote: string) =>
      ({ source_ref: ref, subject_user_id: SERGEJ, predicate: "job", value, category: "work_or_school", classification: cls, multi_valued: false, evidence_quote: quote, supersedes_fact_id: null } as any);
    const refs = new Map([["a", r(m)], ["b", r(m2)], ["c", r(m3)]]);
    storeValidatedFacts(G, validateCandidates(G, [mk("a", "plumber", "self_report", "I work as a plumber")], refs, new Set(["a"]), new Map()));
    storeValidatedFacts(G, validateCandidates(G, [mk("b", "chef", "correction", "I'm a chef now")], refs, new Set(["b"]), new Map()));
    storeValidatedFacts(G, validateCandidates(G, [mk("c", "dentist", "third_party_claim", "sergej is a dentist")], refs, new Set(["c"]), new Map()));
    const jobs = getActiveFacts(G, [SERGEJ]).filter((f) => f.predicate === "job").map((f) => `${f.value}:${f.kind}`).sort();
    assert.deepStrictEqual(jobs, ["chef:self_report", "dentist:third_party_claim"]);
  });

  test("relevance gating outside roasts, ammo about the target in roasts", () => {
    assert.deepStrictEqual(selectFactsForReply(G, CH, [DANIEL], [DANIEL], "what's the weather in berlin", "what's the weather"), []);
    const gpu = selectFactsForReply(G, CH, [DANIEL], [DANIEL], "is a 4070 enough for 1440p", "is a 4070 enough");
    assert.ok(gpu.length >= 1 && gpu.every((f) => f.subjectUserId === DANIEL && !f.ammo));
    // A roast hands over the target's facts even when nothing matches the topic.
    const roast = selectFactsForReply(G, CH, [SERGEJ, DANIEL], [SERGEJ], "roast him", "roast him");
    assert.strictEqual(roast.length, 2, "two facts of ammo, no more");
    assert.ok(roast.every((f) => f.subjectUserId === SERGEJ && f.ammo), "only the target's facts are ammo");
    assert.ok(selectFactsForReply(G, CH, [SERGEJ], [SERGEJ], "", "cook this guy").length >= 2, "'cook' counts as a roast");
  });

  test("deleting evidence retracts unsupported facts", () => {
    const m = say(JASON, "I have three cats");
    const refs = new Map([["x", getMessage(G, m.id)!]]);
    storeValidatedFacts(
      G,
      validateCandidates(
        G,
        [{ source_ref: "x", subject_user_id: JASON, predicate: "has_pet", value: "three cats", category: "possession", classification: "self_report", multi_valued: true, evidence_quote: "three cats", supersedes_fact_id: null } as any],
        refs,
        new Set(["x"]),
        new Map()
      )
    );
    assert.strictEqual(getActiveFacts(G, [JASON]).length, 1);
    onEvidenceChanged(G, m.id);
    assert.strictEqual(getActiveFacts(G, [JASON]).length, 0);
  });

  section("immediate extraction");
  test("short replies are analysed, laughter never", () => {
    assert.ok(isWorthExtracting("same", true));
    assert.ok(isWorthExtracting("yes", true));
    assert.ok(!isWorthExtracting("same", false));
    assert.ok(!isWorthExtracting("lmaooo", true));
    assert.ok(!isWorthExtracting("💀", true));
  });
  test("pre-filter skips noise, keeps short facts", () => {
    for (const t of ["lol", "lmao", "xD", "ok", "https://x.com/a/b", "<:kek:123456789012345678>", `<@${DANIEL}> gg`]) {
      assert.ok(!isWorthExtracting(t), t);
    }
    for (const t of ["I'm vegan", "got a 5090 today", "ich bin Koch"]) assert.ok(isWorthExtracting(t), t);
  });
  test("a burst is extracted once, ~2s after the channel goes quiet", async () => {
    updateAISettings(G, { engine: "memory", learning: true }, DANIEL);
    const calls: { at: number; ids: string[]; extract: string[] }[] = [];
    _setBatchRunnerForTests(async (job) => {
      calls.push({ at: Date.now(), ids: job.batch.map((m) => m.content), extract: job.batch.filter((m) => isWorthExtracting(m.content)).map((m) => m.content) });
      markExtracted(G, job.batch.map((m) => ({ messageId: m.messageId, revision: m.revision })));
    });
    const BURST_CH = "700000000000000099";
    const sayNow = (authorId: string, content: string) => {
      clock = Date.now();
      const m = fakeMessage(authorId, content);
      m.channel = { ...channel, id: BURST_CH };
      storeDiscordMessage(m, { ownBotId: BOT });
      scheduleExtraction(G, BURST_CH);
    };
    const t0 = Date.now();
    sayNow(DANIEL, "just got a new job at a bank");
    await new Promise((r) => setTimeout(r, 500));
    sayNow(SERGEJ, "lol");
    await new Promise((r) => setTimeout(r, 500));
    sayNow(DANIEL, "starting monday");
    await new Promise((r) => setTimeout(r, 2600));
    assert.strictEqual(calls.length, 1, `expected one batched call, got ${calls.length}`);
    const elapsed = calls[0].at - t0;
    assert.ok(elapsed >= 2900 && elapsed < 3600, `extracted after ${elapsed}ms`);
    assert.deepStrictEqual(calls[0].ids, ["just got a new job at a bank", "lol", "starting monday"]);
    assert.deepStrictEqual(calls[0].extract, ["just got a new job at a bank", "starting monday"]);
    _setBatchRunnerForTests();
  });
  test("non-stop chatter still extracts within 8s", async () => {
    const calls: number[] = [];
    _setBatchRunnerForTests(async (job) => {
      calls.push(Date.now());
      markExtracted(G, job.batch.map((m) => ({ messageId: m.messageId, revision: m.revision })));
    });
    const CH2 = "700000000000000098";
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      clock = Date.now();
      const m = fakeMessage(JASON, `message number ${i} about stuff`);
      m.channel = { ...channel, id: CH2 };
      storeDiscordMessage(m, { ownBotId: BOT });
      scheduleExtraction(G, CH2);
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(calls.length >= 1, "no extraction during constant chatter");
    assert.ok(calls[0] - t0 < 8500, `first extraction after ${calls[0] - t0}ms`);
    _setBatchRunnerForTests();
  });
  test("learning off means no extraction", async () => {
    updateAISettings(G, { learning: false }, DANIEL);
    let called = false;
    _setBatchRunnerForTests(async () => {
      called = true;
    });
    clock = Date.now();
    const m = fakeMessage(DANIEL, "I moved to Hamburg");
    storeDiscordMessage(m, { ownBotId: BOT });
    scheduleExtraction(G, CH);
    await new Promise((r) => setTimeout(r, 2500));
    assert.ok(!called);
    _setBatchRunnerForTests();
    updateAISettings(G, { learning: true, engine: "legacy" }, DANIEL);
  });

  section("images");
  const png = (name = "pic.png") => ({ url: `https://cdn.discordapp.com/attachments/1/2/${name}?ex=1`, name, contentType: "image/png", size: 200_000 });
  const fakeDownload = async (url: string) => (url.includes("broken") ? null : { data: new Uint8Array([1, 2, 3]), mediaType: "image/png" });
  _setCaptionerForTests(async (_img, job) => {
    return job.text.includes("setup") ? "Photo of a desk with a gaming PC, RGB fans and an RTX 5090 box" : "Meme: a cat staring at a cucumber";
  }, fakeDownload);

  test("which attachments count as images", () => {
    clock = Date.now();
    const m = fakeMessage(DANIEL, "look", {
      attachments: [png(), { url: "https://x/doc.pdf", name: "doc.pdf", contentType: "application/pdf", size: 10 }, { ...png("huge.png"), size: 20_000_000 }],
      embeds: [{ thumbnail: { url: "https://media.tenor.com/abc.gif" }, provider: { name: "Tenor" } }],
    });
    const imgs = imagesOf(m);
    assert.deepStrictEqual(imgs.map((i) => [i.name, i.source, i.state]), [
      ["pic.png", "attachment", "pending"],
      ["huge.png", "attachment", "skipped"],
      ["Tenor", "embed", "pending"],
    ]);
    storeDiscordMessage(m, { ownBotId: BOT });
    const stored = getMessage(G, m.id)!;
    assert.strictEqual(stored.content, "look [attachment: doc.pdf]");
    assert.strictEqual(stored.images.length, 3);
  });

  test("images get captioned and show up in the chat log", async () => {
    clock = Date.now();
    const m = fakeMessage(SERGEJ, "rate my setup", { attachments: [png("desk.png"), png("broken.png")] });
    storeDiscordMessage(m, { ownBotId: BOT });
    queueCaptions(m);
    await _captionsIdle();
    const stored = getMessage(G, m.id)!;
    assert.deepStrictEqual(stored.images.map((i) => i.state), ["done", "failed"]);
    assert.ok(stored.images[0].caption!.includes("RTX 5090"));
    clock = Date.now();
    const trigger = fakeMessage(DANIEL, `<@${BOT}> roast this`, { replyTo: m.id, mentions: [BOT] });
    storeDiscordMessage(trigger, { ownBotId: BOT });
    const ctx = await buildContext(trigger, BOT);
    const all = ctx.messages.map((x) => x.content as string).join("\n");
    assert.ok(all.includes("[image: Photo of a desk with a gaming PC"), all.slice(-600));
    assert.ok(ctx.topicText.includes("5090"));
    assert.deepStrictEqual(ctx.imageSources.map((s) => s.messageId), [m.id]);
  });

  test("a random nickname is picked per reply for people who have nicknames", async () => {
    clock = Date.now();
    const said = fakeMessage(LUKAS, "anyone up for ranked");
    storeDiscordMessage(said, { ownBotId: BOT });
    clock = Date.now();
    const trigger = fakeMessage(DANIEL, `<@${BOT}> roast him`, { replyTo: said.id, mentions: [BOT] });
    storeDiscordMessage(trigger, { ownBotId: BOT });
    const lukasNicks = listNicknames(G, LUKAS).map((n) => n.nickname);
    const picks = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const ctx = await buildContext(trigger, BOT);
      const text = ctx.messages[ctx.messages.length - 1].content as string;
      const line = text.split("\n").find((l) => l.includes(`[user ${LUKAS}]`) && l.startsWith("- "))!;
      const m = /call them "([^"]+)" in this reply/.exec(line);
      assert.ok(m && lukasNicks.includes(m[1]), line);
      picks.add(m![1]);
    }
    assert.ok(picks.size > 1, "nickname varies between replies");
  });

  test("request images are downloaded fresh and passed as image parts", async () => {
    clock = Date.now();
    const m = fakeMessage(JASON, "my rank", { attachments: [png("rank.png"), png("broken.png")] });
    const res = await requestImageParts([{ ref: "m3", label: "Jason", message: m }]);
    assert.strictEqual(res.parts.length, 1);
    assert.strictEqual(res.parts[0].type, "image");
    assert.ok(res.intro.includes("Image 1: from m3 by Jason"));
  });

  test("text-only chat model: request images become descriptions instead of parts", async () => {
    clock = Date.now();
    const m = fakeMessage(SERGEJ, "rate my setup", { attachments: [png("desk2.png"), png("broken.png")] });
    const res = await requestImageParts([{ ref: "m4", label: "Sergej", message: m }], undefined, { textOnly: true });
    assert.strictEqual(res.parts.length, 0);
    assert.ok(res.intro.includes("Image 1: from m4 by Sergej: Photo of a desk"), res.intro);
    assert.ok(res.intro.includes("can't see these images"), res.intro);
  });

  test("link-preview images that arrive later are merged and captioned", async () => {
    clock = Date.now();
    const m = fakeMessage(JASON, "https://tenor.com/view/cat-123");
    storeDiscordMessage(m, { ownBotId: BOT });
    assert.strictEqual(getMessage(G, m.id)!.images.length, 0);
    m.embeds = [{ thumbnail: { url: "https://media.tenor.com/cat.gif" }, provider: { name: "Tenor" } }];
    assert.ok(mergeImages(m));
    queueCaptions(m);
    await _captionsIdle();
    assert.strictEqual(getMessage(G, m.id)!.images[0].caption, "Meme: a cat staring at a cucumber");
    assert.ok(!mergeImages(m), "second update adds nothing");
  });

  test("facts from images need the poster's own claim", () => {
    clock = Date.now();
    const mine = fakeMessage(SERGEJ, "finally finished my new setup", { attachments: [png("a.png")] });
    const meme = fakeMessage(JASON, "lol look at this", { attachments: [png("b.png")] });
    storeDiscordMessage(mine, { ownBotId: BOT });
    storeDiscordMessage(meme, { ownBotId: BOT });
    const cap = (id: string, caption: string) => {
      const st = getMessage(G, id)!;
      return { ...st, images: st.images.map((i) => ({ ...i, state: "done" as const, caption })) };
    };
    const refs = new Map([
      ["a", cap(mine.id, "Photo of a desk with an RTX 5090 graphics card")],
      ["b", cap(meme.id, "Photo of a desk with an RTX 5090 graphics card")],
    ]);
    const mk = (ref: string, who: string) =>
      ({ source_ref: ref, subject_user_id: who, predicate: "owns_gpu", value: "RTX 5090", category: "possession", classification: "self_report", multi_valued: true, evidence_quote: "RTX 5090 graphics card", supersedes_fact_id: null } as any);
    const valid = validateCandidates(G, [mk("a", SERGEJ), mk("b", JASON)], refs, new Set(["a", "b"]), new Map());
    assert.deepStrictEqual(valid.map((v) => v.subject_user_id), [SERGEJ]);
  });

  test("extraction waits for a pending caption, then runs", async () => {
    updateAISettings(G, { engine: "memory", learning: true }, DANIEL);
    setOnCaptioned((g, c) => scheduleExtraction(g, c));
    const IMG_CH = "700000000000000097";
    const batches: string[][] = [];
    _setBatchRunnerForTests(async (job) => {
      batches.push(job.batch.map((m) => `${m.content}|${m.images.map((i) => i.state).join(",")}`));
      markExtracted(G, job.batch.map((m) => ({ messageId: m.messageId, revision: m.revision })));
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    _setCaptionerForTests(async () => {
      await gate; // the caption takes a while
      return "Photo of a new mechanical keyboard";
    });
    clock = Date.now();
    const m = fakeMessage(DANIEL, "my new keyboard arrived", { attachments: [png("kb.png")] });
    m.channel = { ...channel, id: IMG_CH };
    storeDiscordMessage(m, { ownBotId: BOT });
    queueCaptions(m);
    scheduleExtraction(G, IMG_CH);
    await new Promise((r) => setTimeout(r, 2600));
    assert.strictEqual(batches.length, 0, "should wait for the caption");
    release();
    await _captionsIdle();
    await new Promise((r) => setTimeout(r, 2600));
    assert.deepStrictEqual(batches, [["my new keyboard arrived|done"]]);
    _setBatchRunnerForTests();
    updateAISettings(G, { engine: "legacy" }, DANIEL);
  });

  section("backfill");
  test("parseSince", () => {
    const now = Date.UTC(2026, 10, 13);
    assert.strictEqual(parseSince("2026-08-01"), Date.UTC(2026, 7, 1));
    assert.strictEqual(parseSince("90d", now), now - 90 * 86400000);
    assert.strictEqual(parseSince("2026-02-30"), null);
    assert.strictEqual(parseSince("yesterday"), null);
  });

  const BF_GUILD = "665991423933546999";
  function fakeDiscord(choice: "confirm" | "cancel") {
    const dmEdits: string[] = [];
    let collectorStopped = false;
    const day = 86400000;
    const now = Date.now();
    let idCounter = 900000000000000000n;
    const bfGuild: any = { id: BF_GUILD, name: "Test Server", members: { me: {}, cache: members } };
    const mk = (authorId: string, content: string, ageDays: number, bot = false) => {
      const m: any = fakeMessage(authorId, content);
      m.id = String(idCounter++);
      m.guild = bfGuild;
      m.guildId = BF_GUILD;
      m.createdTimestamp = now - ageDays * day;
      m.author = { ...m.author, bot };
      m.system = false;
      return m;
    };
    // newest first, like Discord
    const history = [
      mk(DANIEL, "I just adopted a dog named Bruno", 2),
      mk(SERGEJ, "lol", 3),
      mk("111111111111111111", "beep boop I am another bot", 4, true),
      mk(SERGEJ, "I switched jobs, I'm a nurse now", 10),
      mk(JASON, "I play bass in a band", 40),
      mk(JASON, "ancient message from long ago", 400),
    ];
    const textChannel: any = {
      id: "710000000000000001",
      name: "general",
      type: 0, // GuildText
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      threads: { fetchArchived: async () => ({ threads: new Map(), hasMore: false }) },
      messages: {
        fetch: async ({ before }: { before?: string }) => {
          const start = before ? history.findIndex((m) => m.id === before) + 1 : 0;
          return new Map(history.slice(start, start + 100).map((m) => [m.id, m]));
        },
      },
    };
    history.forEach((m) => (m.channel = textChannel));
    bfGuild.channels = { fetch: async (id?: string) => (id ? textChannel : new Map([[textChannel.id, textChannel]])), fetchActiveThreads: async () => ({ threads: new Map() }) };
    const dm: any = {
      id: "dm1",
      content: "",
      channel: { id: "dmchan" },
      edit: async (x: any) => {
        dm.content = typeof x === "string" ? x : x.content;
        dmEdits.push(dm.content);
        return dm;
      },
      awaitMessageComponent: async ({ filter }: any) => {
        const i: any = {
          user: { id: DANIEL },
          customId: `bf:${choice}:${lastJobId()}`,
          update: async (x: any) => dm.edit(x),
        };
        assert.ok(filter(i), "owner's click must pass the filter");
        assert.ok(!filter({ ...i, user: { id: SERGEJ } }), "someone else's click must not");
        return i;
      },
      createMessageComponentCollector: () => ({ on: () => {}, stop: () => (collectorStopped = true) }),
    };
    const client: any = {
      user: { id: BOT },
      users: { fetch: async () => ({ createDM: async () => ({ send: async (t: string) => ((dm.content = t), dmEdits.push(t), dm) }) }) },
    };
    return { client, guild: bfGuild, dmEdits, history, collectorStopped: () => collectorStopped };
  }
  let currentJobId = 0;
  const lastJobId = () => currentJobId;

  test("full flow: scan -> DM estimate -> confirm -> facts -> summary", async () => {
    updateAISettings(BF_GUILD, { engine: "legacy", learning: true }, DANIEL);
    const calls: string[][] = [];
    _setBatchRunnerForTests(async (job) => {
      calls.push(job.batch.map((m) => m.content));
      markExtracted(job.guildId, job.batch.map((m) => ({ messageId: m.messageId, revision: m.revision })));
      return { stored: 2, cost: 0.0003, calls: 1 };
    });
    currentJobId = 1;
    const fx = fakeDiscord("confirm");
    const res = await startBackfill({ client: fx.client, guild: fx.guild, ownerId: DANIEL, since: Date.now() - 60 * 86400000, includeImages: false });
    assert.ok(res.ok);
    for (let i = 0; i < 100 && !fx.dmEdits.some((e) => e.startsWith("**Backfill done**")); i++) await new Promise((r) => setTimeout(r, 50));
    const estimate = fx.dmEdits.find((e) => e.includes("Estimated cost"))!;
    assert.ok(estimate, fx.dmEdits.join("\n---\n"));
    assert.ok(estimate.includes("scanned 5 messages (4 new)"), estimate); // 400-day-old message excluded, other bot skipped
    assert.ok(estimate.includes("To analyze: **3 messages**"), estimate); // "lol" filtered out
    const final = fx.dmEdits[fx.dmEdits.length - 1];
    // Messages days apart are separate conversations -> one batch each, oldest first.
    assert.ok(final.startsWith("**Backfill done**") && final.includes("learned 8 facts"), final);
    assert.deepStrictEqual(calls, [["I play bass in a band"], ["I switched jobs, I'm a nurse now"], ["lol"], ["I just adopted a dog named Bruno"]]);
    assert.ok(!getMessage(BF_GUILD, fx.history[5].id), "message before the start date is not stored");
    assert.ok(!getMessage(BF_GUILD, fx.history[2].id), "other bots are skipped");
    assert.ok(activeJobFor(BF_GUILD) === undefined);
    _setBatchRunnerForTests();
  });

  test("a second run finds nothing new and spends nothing", async () => {
    let called = false;
    _setBatchRunnerForTests(async () => {
      called = true;
    });
    currentJobId = 2;
    const fx = fakeDiscord("cancel");
    const res = await startBackfill({ client: fx.client, guild: fx.guild, ownerId: DANIEL, since: Date.now() - 60 * 86400000, includeImages: false });
    assert.ok(res.ok);
    for (let i = 0; i < 100 && !fx.dmEdits.some((e) => e.includes("Cancelled") || e.includes("Nothing new")); i++) await new Promise((r) => setTimeout(r, 50));
    // first run already analyzed everything, so this one has nothing new
    assert.ok(fx.dmEdits.some((e) => e.includes("Nothing new to analyze")), fx.dmEdits.join("\n---\n"));
    assert.ok(!called);
    _setBatchRunnerForTests();
  });

  test("cancel before confirming", async () => {
    let called = false;
    _setBatchRunnerForTests(async () => {
      called = true;
    });
    currentJobId = 3;
    const fx = fakeDiscord("cancel");
    // fresh messages for a different guild id so there is work to do
    fx.guild.id = "665991423933547000";
    fx.history.forEach((m: any) => {
      m.guild = fx.guild;
      m.guildId = fx.guild.id;
      m.id = String(BigInt(m.id) + 1000n);
    });
    updateAISettings(fx.guild.id, { learning: true }, DANIEL);
    const res = await startBackfill({ client: fx.client, guild: fx.guild, ownerId: DANIEL, since: Date.now() - 60 * 86400000, includeImages: false });
    assert.ok(res.ok);
    for (let i = 0; i < 100 && !fx.dmEdits.some((e) => e.includes("Cancelled")); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(fx.dmEdits.some((e) => e.includes("**Cancelled.** Nothing was spent.")), fx.dmEdits.join("\n---\n"));
    assert.ok(!called);
    assert.ok(activeJobFor(fx.guild.id) === undefined);
    _setBatchRunnerForTests();
  });

  test("refuses a second job and paused learning", async () => {
    updateAISettings("665991423933547001", { learning: false }, DANIEL);
    const fx = fakeDiscord("confirm");
    fx.guild.id = "665991423933547001";
    const res = await startBackfill({ client: fx.client, guild: fx.guild, ownerId: DANIEL, since: Date.now() - 86400000 * 5, includeImages: false });
    assert.ok("error" in res && /Learning is paused/.test(res.error));
  });

  section("time-aware memory");
  const TG = "665991423933547100";
  const D = 86400000;
  const sayAt = (authorId: string, content: string, at: number) => {
    clock = at - 1000; // fakeMessage adds 1s
    const m: any = fakeMessage(authorId, content);
    m.guild = { ...guild, id: TG };
    m.guildId = TG;
    storeDiscordMessage(m, { ownBotId: BOT });
    return getMessage(TG, m.id)!;
  };
  const job = (msg: any, value: string, quote: string, cls = "self_report") =>
    ({ source_ref: "x", subject_user_id: msg.authorId, predicate: "job", value, category: "work_or_school", classification: cls, multi_valued: false, evidence_quote: quote, supersedes_fact_id: null } as any);
  const storeOne = (msg: any, cand: any) =>
    storeValidatedFacts(TG, validateCandidates(TG, [cand], new Map([["x", msg]]), new Set(["x"]), new Map()));

  test("facts are dated by when they were said, not when processed", () => {
    const said = Date.now() - 100 * D;
    const m = sayAt(DANIEL, "I work as a barista now", said);
    storeOne(m, job(m, "barista", "I work as a barista"));
    const f = getActiveFacts(TG, [DANIEL]).find((x) => x.value === "barista")!;
    assert.strictEqual(f.firstSeenAt, said);
    assert.strictEqual(f.lastConfirmedAt, said);
  });

  test("out-of-order backfill: the most recently SAID value wins", () => {
    const newer = sayAt(SERGEJ, "I'm a nurse now", Date.now() - 30 * D);
    const older = sayAt(SERGEJ, "I work as a plumber", Date.now() - 90 * D);
    storeOne(newer, job(newer, "nurse", "I'm a nurse now")); // processed first
    storeOne(older, job(older, "plumber", "I work as a plumber")); // older statement arrives late
    const current = getActiveFacts(TG, [SERGEJ]).filter((f) => f.predicate === "job").map((f) => f.value);
    assert.deepStrictEqual(current, ["nurse"]);
    const history = searchFacts(TG, [SERGEJ], "", 10, { history: true }).map((f) => `${f.value}:${factIsCurrent(f) ? "current" : f.status}`);
    assert.deepStrictEqual(history.sort(), ["nurse:current", "plumber:superseded"]);
  });

  test("temporary / time-bound facts are never learned", () => {
    const m = sayAt(JASON, "I'm sick today ugh", Date.now());
    const stored = storeOne(m, { ...job(m, "sick", "I'm sick today", "temporary_state"), predicate: "health_state" });
    assert.strictEqual(stored, 0);
    assert.strictEqual(searchFacts(TG, [JASON], "", 10, { history: true }).length, 0);
  });

  test("fact date-range filter", () => {
    const inRange = searchFacts(TG, [DANIEL, SERGEJ], "", 10, { from: Date.now() - 95 * D, to: Date.now() - 80 * D });
    assert.deepStrictEqual(inRange.map((f) => f.value), ["plumber"]);
  });

  test("parseDateInput", () => {
    const now = Date.UTC(2026, 10, 13, 12, 0);
    const d = parseDateInput("2026-08-04", false, now)!;
    assert.strictEqual(fmtDateTime(d), "2026-08-04 00:00");
    assert.strictEqual(fmtDateTime(parseDateInput("2026-08-04", true, now)!), "2026-08-04 23:59");
    assert.strictEqual(fmtDate(parseDateInput("yesterday", false, now)!), "2026-11-12");
    assert.strictEqual(parseDateInput("7d", false, now), now - 7 * D);
    assert.strictEqual(fmtDateTime(parseDateInput("2026-08-04 14:30", false, now)!), "2026-08-04 14:30");
    assert.strictEqual(parseDateInput("garbage"), null);
    assert.strictEqual(ago(now - 40 * D, now), "6 weeks ago");
  });

  test("searchMessages by date, author and keyword", () => {
    const base = Date.now() - 50 * D;
    sayAt(DANIEL, "ranked was rigged today", base);
    sayAt(SERGEJ, "skill issue tbh", base + 60_000);
    sayAt(DANIEL, "new keyboard arrived", base + D);
    const day = searchMessages(TG, { from: base - 1000, to: base + D - 1000, limit: 40 });
    assert.deepStrictEqual(day.messages.map((m) => m.content), ["ranked was rigged today", "skill issue tbh"]);
    const byDani = searchMessages(TG, { from: base - 1000, to: base + 2 * D, authorIds: [DANIEL], limit: 40 });
    assert.strictEqual(byDani.total, 2);
    const kw = searchMessages(TG, { from: 0, to: Date.now(), words: ["keyboard"], limit: 40 });
    assert.deepStrictEqual(kw.messages.map((m) => m.content), ["new keyboard arrived"]);
    const pct = searchMessages(TG, { from: 0, to: Date.now(), words: ["100%"], limit: 40 });
    assert.strictEqual(pct.total, 0, "% is matched literally");
  });

  section("profiles");
  test("changed facts mark profiles dirty; refresh writes them", async () => {
    updateAISettings(TG, { learning: true }, DANIEL);
    const prompts: string[] = [];
    _setProfileGeneratorForTests(async (prompt) => {
      prompts.push(prompt);
      return "Who: nurse since Oct 2026 (was a plumber).\nTalks like: dry, short.";
    });
    // facts were stored above -> touched subjects exist
    await runProfileRefreshOnce();
    const p = getProfile(TG, SERGEJ);
    assert.ok(p && p.profile.startsWith("Who: nurse"), JSON.stringify(p));
    const sergPrompt = prompts.find((x) => x.includes(`[user ${SERGEJ}]`) && x.includes("nurse"))!;
    assert.ok(sergPrompt, prompts.join("\n=====\n"));
    assert.ok(sergPrompt.includes("- job: nurse (said by themself)"), sergPrompt);
    assert.ok(!/\d{4}-\d{2}-\d{2}|\bago\b/.test(sergPrompt), "no dates in profile input");
    const factsSection = sergPrompt.slice(sergPrompt.indexOf("<facts>"), sergPrompt.indexOf("</facts>"));
    assert.ok(!factsSection.includes("plumber"), "replaced facts are not listed as current facts");
  });

  test("opt-out removes the profile and stops regeneration", async () => {
    setUserLearning(TG, SERGEJ, false);
    assert.strictEqual(await regenerateProfile(TG, SERGEJ), null);
    assert.strictEqual(getProfile(TG, SERGEJ), null);
    setUserLearning(TG, SERGEJ, true);
  });

  test("persona prompt has the new tone and tools", () => {
    const sp = buildSystemPrompt({ botId: BOT, now: "now", timezone: "Europe/Berlin", webEnabled: true });
    assert.ok(sp.includes("4chan") && sp.includes("search_messages") && sp.includes("<profiles>") && sp.includes("Hard limits"));
    assert.ok(!buildSystemPrompt({ botId: BOT, now: "now", timezone: "x", webEnabled: false }).includes("web_search:"));
  });

  section("leaked tool calls");
  test("DeepSeek DSML markup (as seen in Discord) is parsed", () => {
    const fullwidth = [
      "<｜DSML｜calls>",
      '<｜DSML｜invoke name="search_messages">',
      '<｜DSML｜parameter name="from" string="true">2026-10-01</｜DSML｜parameter>',
      '<｜DSML｜parameter name="to" string="true">2026-10-31</｜DSML｜parameter>',
      '<｜DSML｜parameter name="user" string="true">222398053703876628</｜DSML｜parameter>',
      '<｜DSML｜parameter name="limit" string="false">120</｜DSML｜parameter>',
      "</｜DSML｜invoke>",
      "</｜DSML｜calls>",
    ].join("\n");
    const spaced = fullwidth.replace(/｜/g, " | ");
    for (const text of [fullwidth, spaced]) {
      assert.ok(hasLeakedToolMarkup(text));
      assert.deepStrictEqual(parseLeakedToolCalls(text), [
        { name: "search_messages", args: { from: "2026-10-01", to: "2026-10-31", user: "222398053703876628", limit: 120 } },
      ]);
      assert.strictEqual(stripToolMarkup(text), "");
    }
  });
  test("other leaked formats and normal text", () => {
    const hermes = 'sure <tool_call>{"name": "web_search", "arguments": {"query": "patch notes"}}</tool_call>';
    assert.deepStrictEqual(parseLeakedToolCalls(hermes), [{ name: "web_search", args: { query: "patch notes" } }]);
    assert.strictEqual(stripToolMarkup(hermes), "sure");
    const legacy = '<｜tool▁call▁begin｜>function<｜tool▁sep｜>search_user_memory\n```json\n{"user":"serg","query":""}\n```<｜tool▁call▁end｜>';
    assert.deepStrictEqual(parseLeakedToolCalls(legacy), [{ name: "search_user_memory", args: { user: "serg", query: "" } }]);
    assert.ok(!hasLeakedToolMarkup("anon this is literally the first google result | cope"));
  });

  section("profile-only facts, sources, reset");
  test("plans, temporal and uncategorized facts are rejected", () => {
    clock = Date.now();
    const m = fakeMessage(JASON, "I'm going to buy a 5090 next week, I main Yasuo and I'm hardstuck silver");
    storeDiscordMessage(m, { ownBotId: BOT });
    const msg = getMessage(G, m.id)!;
    const base = { source_ref: "x", subject_user_id: JASON, classification: "self_report", multi_valued: true, supersedes_fact_id: null };
    const valid = validateCandidates(
      G,
      [
        { ...base, category: "possession", predicate: "plans_to_buy", value: "going to buy a 5090", evidence_quote: "I'm going to buy a 5090" },
        { ...base, category: "game", predicate: "main", value: "Yasuo", evidence_quote: "I main Yasuo" },
        { ...base, category: "skill_or_rank", predicate: "rank", value: "hardstuck silver", evidence_quote: "I'm hardstuck silver" },
        { ...base, category: "random_trivia", predicate: "x", value: "silver", evidence_quote: "hardstuck silver" },
      ] as any,
      new Map([["x", msg]]),
      new Set(["x"]),
      new Map()
    );
    assert.deepStrictEqual(valid.map((v) => v.value), ["Yasuo", "hardstuck silver"]);
    assert.ok(looksTemporal("moving to Berlin next month", ""));
    assert.ok(looksTemporal("x", "thinking about quitting league"));
    assert.ok(!looksTemporal("plays bass", "I play bass"));
  });

  test("every fact links to its source message", () => {
    clock = Date.now();
    const m = fakeMessage(JASON, "I literally never wear belts");
    storeDiscordMessage(m, { ownBotId: BOT });
    const msg = getMessage(G, m.id)!;
    storeValidatedFacts(
      G,
      validateCandidates(
        G,
        [{ source_ref: "x", subject_user_id: JASON, classification: "self_report", category: "habit", predicate: "wears_belts", value: "never wears belts", multi_valued: false, evidence_quote: "never wear belts", supersedes_fact_id: null } as any],
        new Map([["x", msg]]),
        new Set(["x"]),
        new Map()
      )
    );
    const fact = getActiveFacts(G, [JASON]).find((f) => f.value === "never wears belts")!;
    assert.deepStrictEqual(fact.sourceMessageIds, [m.id]);
    assert.strictEqual(fact.category, "habit");
    const src = getFactSources(G, fact.id);
    assert.strictEqual(src.length, 1);
    assert.strictEqual(src[0].quote, "never wear belts");
    assert.strictEqual(src[0].link, `https://discord.com/channels/${G}/${CH}/${m.id}`);
  });

  test("reset wipes facts and profiles and marks messages for re-learning", () => {
    const before = countGuildMemory(G);
    assert.ok(before.facts > 0);
    const r = resetGuildMemory(G);
    assert.strictEqual(r.facts, before.facts);
    assert.strictEqual(countGuildMemory(G).facts, 0);
    assert.strictEqual(countGuildMemory(G).profiles, 0);
    assert.ok(r.messages > 0);
    // other guilds untouched
    assert.ok(countGuildMemory(TG).facts > 0);
  });

  test("persona: no 'anon', one reply, proof tool", () => {
    const sp = buildSystemPrompt({ botId: BOT, now: "now", timezone: "Europe/Berlin", webEnabled: true });
    assert.ok(!/\banon\b/i.test(sp.replace('Never call anyone "anon"', "")), "anon only appears in the rule forbidding it");
    assert.ok(sp.includes("exactly ONE Discord message"));
    assert.ok(sp.includes("get_fact_source"));
  });

  section("tool limits");
  test("the 11th tool call in one reply is refused", async () => {
    const trace = { used: [] as string[], sources: [], factsReturned: [], webSearches: 0 };
    const tools: any = buildTools(
      { guildId: G, channelId: CH, refMap: new Map(), names: new Map(), webEnabled: false, canView: () => true, channelName: () => "general" },
      trace as any
    );
    const results: any[] = [];
    for (let i = 0; i < 11; i++) {
      const tool = i % 2 ? tools.search_messages : tools.list_user_facts;
      results.push(await tool.execute(i % 2 ? { from: "7d" } : { user: DANIEL }, {}));
    }
    assert.ok(results.slice(0, 10).every((r) => !/limit/.test(r.error ?? "")), "first 10 calls run");
    assert.ok(/limit/.test(results[10].error), JSON.stringify(results[10]));
    assert.strictEqual(trace.used.length, 11);
  });

  section("conversation-aware extraction");
  const XG = "665991423933547200";
  const XCH = "710000000000000777";
  const M = 60_000;
  const post = (authorId: string, content: string, at: number, replyTo?: string) => {
    clock = at - 1000;
    const m: any = fakeMessage(authorId, content, replyTo ? { replyTo } : {});
    m.guild = { ...guild, id: XG };
    m.guildId = XG;
    m.channel = { ...channel, id: XCH };
    storeDiscordMessage(m, { ownBotId: BOT });
    return getMessage(XG, m.id)!;
  };
  const t0 = Date.now() - 5 * 60 * M;
  // Created in order with the other tests (after the in-memory DB exists).
  let oldQ: any, early: any, c1: any, c2: any, b1: any, b2: any, a1: any, later: any;
  chain = chain.then(() => {
    oldQ = post(SERGEJ, "who here actually sleeps before 3am", t0 - 10 * 24 * 60 * M); // 10 days earlier
    early = post(JASON, "unrelated stuff from the morning", t0 - 90 * M); // before a gap
    c1 = post(DANIEL, "I sleep at 4am every single day", t0 - 10 * M);
    c2 = post(SERGEJ, "that's why you're always late lmao", t0 - 5 * M, c1.messageId);
    b1 = post(JASON, "same", t0, c1.messageId);
    b2 = post(DANIEL, "me neither lol", t0 + 1 * M, oldQ.messageId);
    a1 = post(SERGEJ, "you two are hopeless", t0 + 2 * M);
    later = post(JASON, "new topic hours later", t0 + 120 * M);
  });

  test("batches never cross a conversation gap", () => {
    const chunks = chunkByConversation([early, c1, c2, b1, b2, a1, later], 25);
    assert.deepStrictEqual(chunks.map((c) => c.length), [1, 5, 1]);
    assert.deepStrictEqual(chunkByConversation([c1, c2, b1, b2, a1], 2).map((c) => c.length), [2, 2, 1]);
  });

  test("context: same conversation back to the gap, old replied-to messages, reactions after", () => {
    const ctx = buildExtractionContext(XG, XCH, [b1, b2]);
    assert.deepStrictEqual(ctx.before.map((m) => m.content), ["I sleep at 4am every single day", "that's why you're always late lmao"]);
    assert.deepStrictEqual(ctx.parents.map((m) => m.content), ["who here actually sleeps before 3am"], "10-day-old replied-to message is included");
    assert.deepStrictEqual(ctx.after.map((m) => m.content), ["you two are hopeless"]);
  });

  test("the extractor sees reply authors, tags and times", async () => {
    let seen = "";
    _setBatchRunnerForTests(undefined);
    const ctx = buildExtractionContext(XG, XCH, [b1, b2]);
    // render through the real prompt builder by capturing what the model would get
    const captured: string[] = [];
    _setExtractorModelForTests(async (prompt: string) => {
      captured.push(prompt);
      return { facts: [] };
    });
    updateAISettings(XG, { engine: "memory", learning: true }, DANIEL);
    await runExtractionBatch({ guildId: XG, context: ctx.before, parents: ctx.parents, after: ctx.after, batch: [b1, b2], backfill: true });
    _setExtractorModelForTests(undefined);
    seen = captured[0] ?? "";
    assert.ok(/\[REPLIED\] m1 \d\d:\d\d Sergej \[user \d+\]: who here actually sleeps before 3am/.test(seen), seen);
    assert.ok(/\[EXTRACT\] m4 \d\d:\d\d Jason \[user \d+\] \(reply to m2 by Daniel \[user \d+\]\): same/.test(seen), seen);
    assert.ok(/\[CONTEXT\] m3 .*that's why you're always late/.test(seen), seen);
    assert.ok(/\[EXTRACT\] m5 .* \(reply to m1 by Sergej \[user \d+\]\): me neither lol/.test(seen), seen);
    assert.ok(/\[AFTER\] m6 .*you two are hopeless/.test(seen), seen);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(seen), "no dates, only time of day");
    updateAISettings(XG, { engine: "legacy" }, DANIEL);
  });

  test("confidence gate and context evidence", () => {
    const refs = new Map([["m4", b1], ["m2", c1]]);
    const base = { source_ref: "m4", subject_user_id: JASON, classification: "self_report", category: "habit", multi_valued: false, evidence_quote: "same", supersedes_fact_id: null };
    const valid = validateCandidates(
      XG,
      [
        { ...base, predicate: "sleep_schedule", value: "sleeps around 4am", confidence: "high", context_ref: "m2" },
        { ...base, predicate: "always_late", value: "always late", confidence: "medium", context_ref: null },
      ] as any,
      refs,
      new Set(["m4"]),
      new Map()
    );
    assert.deepStrictEqual(valid.map((v) => v.value), ["sleeps around 4am"]);
    storeValidatedFacts(XG, valid);
    const fact = getActiveFacts(XG, [JASON]).find((f) => f.value === "sleeps around 4am")!;
    const src = getFactSources(XG, fact.id);
    assert.deepStrictEqual(src.map((x) => x.quote).sort(), ["I sleep at 4am every single day", "same"].sort(), "source + the message it relies on");
    assert.deepStrictEqual(fact.reporters, [JASON], "the context author is not listed as a reporter");
    assert.strictEqual(fact.evidenceCount, 1);
    // deleting the real source withdraws the fact even though the context message still exists
    onEvidenceChanged(XG, b1.messageId);
    assert.ok(!getActiveFacts(XG, [JASON]).some((f) => f.value === "sleeps around 4am"));
  });

  section("fact lifetime");
  test("facts never expire, hearsay included", () => {
    clock = Date.now() - 400 * 24 * 60 * 60 * 1000; // said more than a year ago
    const m = fakeMessage(SERGEJ, "jason is hardstuck bronze in valorant");
    storeDiscordMessage(m, { ownBotId: BOT });
    const msg = getMessage(G, m.id)!;
    storeValidatedFacts(
      G,
      validateCandidates(
        G,
        [{ source_ref: "x", subject_user_id: JASON, classification: "third_party_claim", category: "skill_or_rank", predicate: "valorant_rank", value: "hardstuck bronze", multi_valued: false, evidence_quote: "hardstuck bronze", supersedes_fact_id: null, confidence: "high", context_ref: null } as any],
        new Map([["x", msg]]),
        new Set(["x"]),
        new Map()
      )
    );
    const f = getActiveFacts(G, [JASON]).find((x) => x.value === "hardstuck bronze")!;
    assert.ok(f, "a year-old hearsay fact is still active");
    assert.strictEqual(f.expiresAt, null);
  });

  section("backfill images on stored messages");
  test("images:true picks up images of messages that were stored without them", () => {
    const pic = (name: string, q = "ex=1") => ({ url: `https://cdn.discordapp.com/attachments/1/2/${name}?${q}`, name, contentType: "image/png", size: 1000 });
    clock = Date.now();
    // 1) stored by an earlier backfill without images -> "skipped"
    const a: any = fakeMessage(DANIEL, "look at my desk", { attachments: [pic("desk.png")] });
    storeDiscordMessage(a, { ownBotId: BOT, skipImages: true });
    assert.strictEqual(getMessage(G, a.id)!.images[0].state, "skipped");
    assert.strictEqual(refreshStoredImages(a), 1);
    assert.strictEqual(getMessage(G, a.id)!.images[0].state, "pending");

    // 2) stored before image support existed -> no image info at all
    const b: any = fakeMessage(SERGEJ, "meme dump");
    storeDiscordMessage(b, { ownBotId: BOT });
    assert.strictEqual(getMessage(G, b.id)!.images.length, 0);
    b.attachments = new Map([["0", pic("meme1.png")], ["1", pic("meme2.png")]]);
    assert.strictEqual(refreshStoredImages(b), 2);

    // 3) already described: the description survives fresh (re-signed) links
    const c: any = fakeMessage(JASON, "new mouse", { attachments: [pic("mouse.png")] });
    storeDiscordMessage(c, { ownBotId: BOT });
    setMessageImages(G, c.id, getMessage(G, c.id)!.images.map((i) => ({ ...i, state: "done" as const, caption: "a pink gaming mouse" })));
    c.attachments = new Map([["0", pic("mouse.png", "ex=2&is=3&hm=abc")]]);
    assert.strictEqual(refreshStoredImages(c), 0);
    const img = getMessage(G, c.id)!.images[0];
    assert.strictEqual(img.caption, "a pink gaming mouse");
    assert.ok(img.url.includes("ex=2"), "the stored link is the fresh one");
  });

  section("images in context");
  const IG = "665991423933547300";
  const ICH = "710000000000000888";
  const ipost = (authorId: string, content: string, at: number, opts: any = {}) => {
    clock = at - 1000;
    const m: any = fakeMessage(authorId, content, opts);
    m.guild = { ...guild, id: IG };
    m.guildId = IG;
    m.channel = { ...channel, id: ICH };
    storeDiscordMessage(m, { ownBotId: BOT });
    return m;
  };
  const ipng = (name: string) => ({ url: `https://cdn.discordapp.com/attachments/1/2/${name}?ex=1`, name, contentType: "image/png", size: 1000 });
  let take: any, reaction: any;
  chain = chain.then(() => {
    const t = Date.now() - 60 * 60_000;
    ipost(JASON, "ranked tonight?", t - 3 * 60_000);
    take = ipost(SERGEJ, "I'm honestly the best league player in this server", t - 60_000);
    reaction = ipost(DANIEL, "", t, { replyTo: take.id, attachments: [ipng("son.png")] });
    ipost(JASON, "LMAOOO", t + 30_000, { replyTo: reaction.id });
    ipost(SERGEJ, "whatever", t + 60_000);
  });

  test("the image model sees what the image answers and how people reacted", async () => {
    const jobsSeen: any[] = [];
    _setCaptionerForTests(async (_img, job) => {
      jobsSeen.push(job);
      return "Shows: anime girl laughing with the caption SON\nUsed as: reaction mocking Sergej's claim to be the best league player";
    });
    queueCaptions(reaction);
    await _captionsIdle();
    const ctx: string = jobsSeen[0].context;
    assert.ok(ctx.includes("reply to this message:\nSergej: I'm honestly the best league player in this server"), ctx);
    assert.ok(ctx.includes("Chat right before:\nJason: ranked tonight?"), ctx);
    assert.ok(/Reactions after it:\nJason: LMAOOO\nSergej: whatever/.test(ctx), ctx);
    const img = getMessage(IG, reaction.id)!.images[0];
    assert.strictEqual(img.caption, "Shows: anime girl laughing with the caption SON | Used as: reaction mocking Sergej's claim to be the best league player");
  });

  test("profiles see the images someone posts, including image-only messages", () => {
    const { prompt } = buildProfilePrompt(IG, DANIEL);
    assert.ok(prompt.includes("[posted image: Shows: anime girl laughing"), prompt);
  });

  section("confidence levels");
  test("medium is kept for harmless self-reports only", () => {
    clock = Date.now();
    const m = fakeMessage(MAX, "play league, perform decently, then play cs and bottom frag. sergej is a sore loser");
    storeDiscordMessage(m, { ownBotId: BOT });
    const msg = getMessage(G, m.id)!;
    const base = { source_ref: "x", multi_valued: true, supersedes_fact_id: null, context_ref: null };
    const valid = validateCandidates(
      G,
      [
        { ...base, subject_user_id: MAX, classification: "self_report", category: "game", predicate: "plays_game", value: "League and CS", evidence_quote: "play league", confidence: "medium" },
        { ...base, subject_user_id: MAX, classification: "self_report", category: "personality", predicate: "humble", value: "self-deprecating", evidence_quote: "bottom frag", confidence: "medium" },
        { ...base, subject_user_id: SERGEJ, classification: "third_party_claim", category: "personality", predicate: "sore_loser", value: "sore loser", evidence_quote: "sergej is a sore loser", confidence: "medium" },
        { ...base, subject_user_id: MAX, classification: "self_report", category: "skill_or_rank", predicate: "cs_skill", value: "bottom frags in CS", evidence_quote: "bottom frag", confidence: "low" },
        { ...base, subject_user_id: SERGEJ, classification: "third_party_claim", category: "personality", predicate: "sore_loser", value: "sore loser", evidence_quote: "sergej is a sore loser", confidence: "high" },
      ] as any,
      new Map([["x", msg]]),
      new Set(["x"]),
      new Map()
    );
    assert.deepStrictEqual(
      valid.map((v) => `${v.predicate}:${v.confidence}`),
      ["plays_game:medium", "sore_loser:high"],
      "medium self-report game kept; medium personality/hearsay and low dropped; high hearsay kept"
    );
  });

  section("harsher fact gate");
  test("sensitive topics, contact details, unnamed places and medium possessions are dropped", () => {
    clock = Date.now();
    const mk = (text: string) => {
      const m = fakeMessage(JASON, text);
      storeDiscordMessage(m, { ownBotId: BOT });
      return getMessage(G, m.id)!;
    };
    const msgs = {
      addr: mk("I live at Cosimastaße 170, 81927 Munich"),
      phone: mk("call me at 0151 2345 6789 lol"),
      score: mk("we won 13-11 13-9 and I main Jett"),
      autism: mk("autism"),
      deathnote: mk("death note is peak"),
      pc: mk("my pc is loud"),
      car: mk("my car is a red Golf GTI"),
      place: mk("sonst schaff ich das glaub nich"),
      augsburg: mk("Ich hab jetzt eine Wohnung in Augsburg"),
    };
    const refs = new Map(Object.entries(msgs));
    const c = (ref: string, category: string, predicate: string, value: string, quote: string, confidence = "high") =>
      ({ source_ref: ref, subject_user_id: JASON, classification: "self_report", category, predicate, value, evidence_quote: quote, confidence, context_ref: null, multi_valued: true, supersedes_fact_id: null } as any);
    const valid = validateCandidates(
      G,
      [
        c("addr", "location", "lives_in", "Munich", "I live at Cosimastaße 170, 81927 Munich"),
        c("phone", "identity", "phone", "has a phone", "call me at 0151 2345 6789"),
        c("score", "game", "main", "Jett", "I main Jett"),
        c("autism", "identity", "has_autism", "autism", "autism"),
        c("deathnote", "taste", "likes", "Death Note", "death note is peak"),
        c("pc", "possession", "owns_pc", "a PC", "my pc", "medium"),
        c("car", "possession", "owns_car", "a red Golf GTI", "my car is a red Golf GTI"),
        c("place", "location", "lives_in", "Meitingen", "sonst schaff ich das glaub nich"),
        c("augsburg", "location", "lives_in", "Augsburg", "Ich hab jetzt eine Wohnung in Augsburg"),
      ],
      refs,
      new Set(Object.keys(msgs)),
      new Map()
    );
    assert.deepStrictEqual(valid.map((v) => v.value), ["Jett", "Death Note", "a red Golf GTI", "Augsburg"]);
    assert.ok(!containsContactDetails("13-11 13-9 and 2024-2025"));
    assert.ok(containsContactDetails("+49 151 23456789"));
  });

  section("planned fact retrieval");
  const RG = "665991423933547400";
  chain = chain.then(() => {
    updateAISettings(RG, { engine: "memory", learning: true }, DANIEL);
    clock = Date.now();
    const say = (author: string, text: string) => {
      const m: any = fakeMessage(author, text);
      m.guild = { ...guild, id: RG };
      m.guildId = RG;
      storeDiscordMessage(m, { ownBotId: BOT });
      return getMessage(RG, m.id)!;
    };
    const store = (msg: any, subject: string, category: string, predicate: string, value: string, quote: string) =>
      storeValidatedFacts(
        RG,
        validateCandidates(
          RG,
          [{ source_ref: "x", subject_user_id: subject, classification: "self_report", category, predicate, value, evidence_quote: quote, confidence: "high", context_ref: null, multi_valued: true, supersedes_fact_id: null } as any],
          new Map([["x", msg]]),
          new Set(["x"]),
          new Map()
        )
      );
    const a = say(SERGEJ, "I main Yasuo, I play League and Valorant, hardstuck silver, I love pizza and techno, I own a Golf GTI");
    store(a, SERGEJ, "game", "mains_champion", "Yasuo", "I main Yasuo");
    store(a, SERGEJ, "game", "plays_game", "League of Legends", "I play League");
    store(a, SERGEJ, "game", "plays_game", "Valorant", "Valorant");
    store(a, SERGEJ, "skill_or_rank", "rank", "hardstuck silver", "hardstuck silver");
    store(a, SERGEJ, "taste", "likes_food", "pizza", "I love pizza");
    store(a, SERGEJ, "taste", "likes_music", "techno", "techno");
    store(a, SERGEJ, "possession", "owns_car", "a Golf GTI", "I own a Golf GTI");
    const b = say(DANIEL, "I play osu every day");
    store(b, DANIEL, "game", "plays_game", "osu!", "I play osu");
  });

  test("fact index groups predicates by category with counts and examples", () => {
    const idx = getFactIndex(RG, SERGEJ);
    const games = idx.filter((e) => e.category === "game");
    assert.deepStrictEqual(games.map((e) => `${e.predicate}:${e.count}`), ["plays_game:2", "mains_champion:1"]);
    assert.ok(renderFactIndex(idx).includes("skill_or_rank: rank (1: hardstuck silver)"), renderFactIndex(idx));
  });

  test("facts by predicate: topic-related first, per-predicate cap, categories", () => {
    const byPred = getFactsByPredicates(RG, SERGEJ, { predicates: ["plays_game"], topic: "valorant ranked tonight" });
    assert.deepStrictEqual(byPred.map((f) => f.value), ["Valorant", "League of Legends"]);
    assert.strictEqual(getFactsByPredicates(RG, SERGEJ, { predicates: ["plays_game"], perPredicate: 1 }).length, 1);
    assert.deepStrictEqual(getFactsByPredicates(RG, SERGEJ, { categories: ["taste"] }).map((f) => f.predicate).sort(), ["likes_food", "likes_music"]);
  });

  test("planner picks predicates; invalid users/predicates are dropped; roast facts become ammo", async () => {
    let seenPrompt = "";
    _setPlannerForTests(async (prompt) => {
      seenPrompt = prompt;
      return {
        picks: [
          { user_id: SERGEJ, predicates: ["rank", "mains_champion", "made_up_predicate"] },
          { user_id: "999999999999999999", predicates: ["rank"] },
        ],
      };
    });
    const res = await planFactRetrieval({
      guildId: RG,
      channelId: CH,
      users: [
        { id: SERGEJ, name: "Sergej", role: "target" },
        { id: DANIEL, name: "Daniel", role: "requester" },
      ],
      targetIds: [SERGEJ],
      request: "roast serg",
      chat: "",
    });
    _setPlannerForTests();
    assert.ok(res.planned);
    assert.ok(seenPrompt.includes("ROAST") && seenPrompt.includes("## Sergej") && seenPrompt.includes("## Daniel"), seenPrompt);
    assert.deepStrictEqual(res.picks, [{ user_id: SERGEJ, predicates: ["rank", "mains_champion"] }]);
    assert.deepStrictEqual(res.facts.map((f) => f.value).sort(), ["Yasuo", "hardstuck silver"]);
    assert.ok(res.facts.every((f) => f.ammo), "target facts on a roast are roast material");
  });

  test("planner may pick nothing; failure falls back to keyword selection", async () => {
    _setPlannerForTests(async () => ({ picks: [] }));
    const none = await planFactRetrieval({ guildId: RG, channelId: CH, users: [{ id: SERGEJ, name: "Sergej", role: "requester" }], targetIds: [SERGEJ], request: "what's the weather", chat: "" });
    assert.deepStrictEqual(none.facts, []);
    _setPlannerForTests(async () => {
      throw new Error("model down");
    });
    const fb = await planFactRetrieval({ guildId: RG, channelId: CH, users: [{ id: SERGEJ, name: "Sergej", role: "requester" }], targetIds: [SERGEJ], request: "is valorant still good", chat: "" });
    _setPlannerForTests();
    assert.strictEqual(fb.planned, false);
    assert.ok(fb.facts.some((f) => f.value === "Valorant"), "fallback still finds topic facts");
  });

  test("list_user_facts / get_user_facts tools", async () => {
    const trace = { used: [] as string[], sources: [], factsReturned: [] as any[], webSearches: 0 };
    const tools: any = buildTools(
      { guildId: RG, channelId: CH, refMap: new Map(), names: new Map([[SERGEJ, "Sergej"]]), webEnabled: false, canView: () => true, channelName: () => "general" },
      trace as any
    );
    const list = await tools.list_user_facts.execute({ user: SERGEJ }, {});
    assert.strictEqual(list.fact_count, 7);
    assert.deepStrictEqual(Object.keys(list.categories).sort(), ["game", "possession", "skill_or_rank", "taste"]);
    const got = await tools.get_user_facts.execute({ user: SERGEJ, predicates: ["owns_car"], categories: ["skill_or_rank"] }, {});
    assert.deepStrictEqual(got.facts.map((f: any) => f.fact).sort(), ["owns car: a Golf GTI", "rank: hardstuck silver"]);
    assert.strictEqual(trace.factsReturned.length, 2);
    const bad = await tools.get_user_facts.execute({ user: SERGEJ }, {});
    assert.ok(/predicates/.test(bad.error));
  });

  section("hand-added facts and hand-edited profiles");

  test("/memory add stores a curated fact that learning can't supersede", async () => {
    const added = addManualFact(RG, { subjectUserId: SERGEJ, category: "reputation", value: "  rage quits   every ranked game ", addedBy: DANIEL, addedByName: "daniel" });
    assert.ok(added.ok);
    const f = (added as any).fact;
    assert.strictEqual(f.kind, "curated_seed");
    assert.strictEqual(f.predicate, "known_for");
    assert.strictEqual(f.value, "rage quits every ranked game");
    assert.ok(getFactIndex(RG, SERGEJ).some((e) => e.predicate === "known_for"));
    const again = addManualFact(RG, { subjectUserId: SERGEJ, category: "reputation", value: "rage quits every ranked game", addedBy: DANIEL });
    assert.ok(again.ok && (again as any).existed && (again as any).fact.id === f.id);
    assert.ok(!addManualFact(RG, { subjectUserId: SERGEJ, category: "nonsense", value: "x y", addedBy: DANIEL }).ok);

    // A hand-added single value stays next to a later learned one of the same predicate.
    const rank = addManualFact(RG, { subjectUserId: JASON, category: "skill_or_rank", value: "Diamond 2", predicate: "Rank", addedBy: DANIEL });
    assert.ok(rank.ok && (rank as any).fact.predicate === "rank");
    clock = Date.now();
    const msg: any = fakeMessage(JASON, "I'm gold now");
    msg.guild = { ...guild, id: RG };
    msg.guildId = RG;
    storeDiscordMessage(msg, { ownBotId: BOT });
    const stored = getMessage(RG, msg.id)!;
    storeValidatedFacts(
      RG,
      validateCandidates(
        RG,
        [{ source_ref: "x", subject_user_id: JASON, classification: "self_report", category: "skill_or_rank", predicate: "rank", value: "gold", evidence_quote: "I'm gold now", confidence: "high", context_ref: null, multi_valued: false, supersedes_fact_id: null } as any],
        new Map([["x", stored]]),
        new Set(["x"]),
        new Map()
      )
    );
    assert.deepStrictEqual(getActiveFacts(RG, [JASON]).filter((x) => x.predicate === "rank").map((x) => x.value).sort(), ["Diamond 2", "gold"]);

    // Its "source" says who added it, with no fake jump link.
    const trace = { used: [] as string[], sources: [], factsReturned: [] as any[], webSearches: 0 };
    const tools: any = buildTools({ guildId: RG, channelId: CH, refMap: new Map(), names: new Map(), webEnabled: false, canView: () => true, channelName: () => "general" }, trace as any);
    const src = await tools.get_fact_source.execute({ fact_id: f.id }, {});
    assert.ok(src.sources[0].added_by_hand && !src.sources[0].link, JSON.stringify(src));
    assert.ok(buildProfilePrompt(RG, SERGEJ).prompt.includes("rage quits every ranked game (added by hand"));
  });

  test("hand-edited profiles are locked until an explicit refresh, which builds on them", async () => {
    let calls = 0;
    let lastPrompt = "";
    _setProfileGeneratorForTests(async (prompt) => {
      if (prompt.includes(`[user ${SERGEJ}]`)) calls++;
      lastPrompt = prompt;
      return "Regenerated profile text.";
    });
    const saved = setManualProfile(RG, SERGEJ, "Sergej is the group's designated Yasuo enjoyer and hardstuck in silver.");
    assert.ok(saved.manual && getProfile(RG, SERGEJ)!.manual);
    markProfileDirty(RG, SERGEJ);
    getV2DBForTests().prepare("UPDATE user_profiles SET updated_at = 0 WHERE guild_id = ?").run(RG);
    await runProfileRefreshOnce();
    assert.strictEqual(getProfile(RG, SERGEJ)!.profile, saved.profile, "background refresh leaves it alone");
    assert.strictEqual(calls, 0);
    const fresh = await regenerateProfile(RG, SERGEJ);
    assert.ok(lastPrompt.includes('hand_edited="true"') && lastPrompt.includes("designated Yasuo enjoyer"), lastPrompt.slice(0, 400));
    assert.ok(fresh && !fresh.manual && !getProfile(RG, SERGEJ)!.manual);
  });

  test("profile edit by DM: next DM replaces it, cancel keeps it, code blocks are unwrapped", async () => {
    const replies: string[] = [];
    const dm = (author: string, content: string): any => ({ guild: null, author: { id: author, bot: false }, content, reply: async (t: string) => void replies.push(t) });
    assert.strictEqual(await handleProfileEditDM(dm(DANIEL, "hi")), false, "no pending edit: ignored");

    startProfileEdit(DANIEL, { guildId: RG, userId: LUKAS, userName: "Lukas" });
    assert.strictEqual(await handleProfileEditDM(dm(DANIEL, "cancel")), true);
    assert.strictEqual(getProfile(RG, LUKAS), null);

    startProfileEdit(DANIEL, { guildId: RG, userId: LUKAS, userName: "Lukas" });
    assert.ok(await handleProfileEditDM(dm(DANIEL, "too short")));
    assert.ok(pendingProfileEdit(DANIEL), "a too-short reply keeps the edit open");
    assert.ok(await handleProfileEditDM(dm(DANIEL, "```\nJason claims Diamond 2 but plays like he's still in gold.\n```")));
    const p = getProfile(RG, LUKAS)!;
    assert.strictEqual(p.profile, "Jason claims Diamond 2 but plays like he's still in gold.");
    assert.ok(p.manual);
    assert.strictEqual(pendingProfileEdit(DANIEL), null);

    startProfileEdit(DANIEL, { guildId: RG, userId: LUKAS, userName: "Lukas" }, Date.now() - 60 * 60_000);
    assert.strictEqual(await handleProfileEditDM(dm(DANIEL, "a late reply that should be ignored entirely")), false, "expired");
    const parts = splitForDiscord("word ".repeat(700).trim());
    assert.ok(parts.length === 2 && parts.every((s) => s.length <= 1900), parts.map((s) => s.length).join(","));
    assert.strictEqual(parts.join(" "), "word ".repeat(700).trim());
  });

  await chain;
  console.log(`\n${passed}/${total} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
