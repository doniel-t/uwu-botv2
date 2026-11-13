/**
 * Offline checks for the v2 memory engine (no Discord, no API calls).
 *   npx ts-node --transpile-only scripts/test-memory-v2.ts
 */
import assert from "assert";
import { initV2DBAt } from "../src/utils/LLM/v2/db";
import { allowedTypos, damerauLevenshtein } from "../src/utils/LLM/v2/text";
import { addNickname, getGuildAliases, listNicknames, makeAlias, refreshAutoAliases, removeNickname, resolveName, resolveNameRefs } from "../src/utils/LLM/v2/nicknames";
import { getAISettings, updateAISettings } from "../src/utils/LLM/v2/settings";
import { ResponseQueue } from "../src/utils/LLM/v2/responseQueue";
import { _setBatchRunnerForTests, getActiveFacts, isWorthExtracting, onEvidenceChanged, scheduleExtraction, selectFactsForReply, storeValidatedFacts, validateCandidates } from "../src/utils/LLM/v2/facts";
import { getMessage, markExtracted, mergeImages, storeDiscordMessage } from "../src/utils/LLM/v2/messages";
import { buildContext } from "../src/utils/LLM/v2/context";
import { activeJobFor, parseSince, startBackfill } from "../src/utils/LLM/v2/backfill";
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
  let clock = Date.UTC(2026, 10, 13, 12, 0, 0);
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
        { ...base, source_ref: "m1", subject_user_id: DANIEL, predicate: "owns_gpu", value: "RTX 4070", classification: "self_report", evidence_quote: "I bought a 4070" },
        { ...base, source_ref: "m1", subject_user_id: DANIEL, predicate: "owns_gpu", value: "RTX 5090", classification: "self_report", evidence_quote: "I bought a 5090" },
        { ...base, source_ref: "m2", subject_user_id: DANIEL, predicate: "owns_gpu", value: "RTX 4090", classification: "self_report", evidence_quote: "Daniel owns a 4090" },
        { ...base, source_ref: "m3", subject_user_id: DANIEL, predicate: "is", value: "toaster", classification: "joke", evidence_quote: "literally a toaster" },
        { ...base, source_ref: "m1", subject_user_id: JASON, predicate: "owns_gpu", value: "x", classification: "third_party_claim", evidence_quote: "I bought a 4070" },
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
      ({ source_ref: ref, subject_user_id: SERGEJ, predicate: "job", value, classification: cls, multi_valued: false, evidence_quote: quote, supersedes_fact_id: null } as any);
    const refs = new Map([["a", r(m)], ["b", r(m2)], ["c", r(m3)]]);
    storeValidatedFacts(G, validateCandidates(G, [mk("a", "plumber", "self_report", "I work as a plumber")], refs, new Set(["a"]), new Map()));
    storeValidatedFacts(G, validateCandidates(G, [mk("b", "chef", "correction", "I'm a chef now")], refs, new Set(["b"]), new Map()));
    storeValidatedFacts(G, validateCandidates(G, [mk("c", "dentist", "third_party_claim", "sergej is a dentist")], refs, new Set(["c"]), new Map()));
    const jobs = getActiveFacts(G, [SERGEJ]).filter((f) => f.predicate === "job").map((f) => `${f.value}:${f.kind}`).sort();
    assert.deepStrictEqual(jobs, ["chef:self_report", "dentist:third_party_claim"]);
  });

  test("relevance gating: unrelated topics get no facts, roasts get at most one", () => {
    assert.deepStrictEqual(selectFactsForReply(G, CH, [DANIEL], [DANIEL], "what's the weather in berlin", "what's the weather"), []);
    const gpu = selectFactsForReply(G, CH, [DANIEL], [DANIEL], "is a 4070 enough for 1440p", "is a 4070 enough");
    assert.ok(gpu.length >= 1 && gpu.every((f) => f.subjectUserId === DANIEL));
    const roast = selectFactsForReply(G, CH, [SERGEJ], [SERGEJ], "roast him", "roast him");
    assert.ok(roast.length <= 1);
  });

  test("deleting evidence retracts unsupported facts", () => {
    const m = say(JASON, "I have three cats");
    const refs = new Map([["x", getMessage(G, m.id)!]]);
    storeValidatedFacts(
      G,
      validateCandidates(
        G,
        [{ source_ref: "x", subject_user_id: JASON, predicate: "has_pet", value: "three cats", classification: "self_report", multi_valued: true, evidence_quote: "three cats", supersedes_fact_id: null } as any],
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

  test("request images are downloaded fresh and passed as image parts", async () => {
    clock = Date.now();
    const m = fakeMessage(JASON, "my rank", { attachments: [png("rank.png"), png("broken.png")] });
    const res = await requestImageParts([{ ref: "m3", label: "Jason", message: m }]);
    assert.strictEqual(res.parts.length, 1);
    assert.strictEqual(res.parts[0].type, "image");
    assert.ok(res.intro.includes("Image 1: from m3 by Jason"));
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
      ({ source_ref: ref, subject_user_id: who, predicate: "owns_gpu", value: "RTX 5090", classification: "self_report", multi_valued: true, evidence_quote: "RTX 5090 graphics card", supersedes_fact_id: null } as any);
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
    assert.ok(final.startsWith("**Backfill done**") && final.includes("learned 2 facts"), final);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], ["I play bass in a band", "I switched jobs, I'm a nurse now", "lol", "I just adopted a dog named Bruno"]);
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

  await chain;
  console.log(`\n${passed}/${total} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
