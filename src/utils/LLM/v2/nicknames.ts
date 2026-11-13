import { getV2DB } from "./db";
import {
  allowedTypos,
  damerauLevenshtein,
  isCommonWord,
  maskUnmatchable,
  normalizeAlias,
  normalizeAliasGerman,
  tokenize,
} from "./text";

export type AliasSource = "manual" | "display_name" | "global_name" | "username";

export type Alias = {
  userId: string;
  nickname: string;
  normalized: string;
  /** German transliteration form (ä -> ae ...), only when it differs */
  german?: string;
  source: AliasSource;
  tokenCount: number;
  allowed: number;
  common: boolean;
};

export type NameRef = {
  start: number;
  end: number;
  text: string;
  /** set when exactly one user matched */
  userId?: string;
  /** all candidate users (length > 1 means ambiguous) */
  userIds: string[];
  alias: string;
  distance: number;
  confidence: "high" | "low" | "ambiguous";
};

export type ResolveOptions = {
  /** users who spoke recently in the channel (common-word guard) */
  recentParticipantIds?: Set<string>;
  /** true when the text is an instruction to the bot ("roast max") */
  isInstruction?: boolean;
};

const MAX_MANUAL_PER_USER = 10;
const MAX_NGRAM = 3;
// Words after which a name is very likely the object of an instruction.
const TARGET_VERBS = new Set([
  "roast", "flame", "insult", "diss", "rate", "judge", "destroy", "cook", "mock", "clown",
  "about", "tell", "ask", "describe", "remind", "ping", "bully", "vs", "versus",
]);

const SOURCE_PRIORITY: Record<AliasSource, number> = {
  manual: 0,
  display_name: 1,
  global_name: 2,
  username: 3,
};

export function makeAlias(userId: string, nickname: string, source: AliasSource): Alias | null {
  const normalized = normalizeAlias(nickname);
  if (!normalized) return null;
  const german = normalizeAliasGerman(nickname);
  const tokens = normalized.split(" ");
  return {
    userId,
    nickname,
    normalized,
    german: german !== normalized ? german : undefined,
    source,
    tokenCount: tokens.length,
    allowed: allowedTypos(normalized),
    common: tokens.every((t) => isCommonWord(t)),
  };
}

type Candidate = {
  start: number;
  end: number;
  userId: string;
  alias: Alias;
  distance: number;
  capitalized: boolean;
  afterTargetVerb: boolean;
};

/**
 * Find nickname references in free text. Pure function over an alias list so
 * it can be unit tested without Discord or a database.
 */
export function resolveNameRefs(text: string, aliases: Alias[], opts: ResolveOptions = {}): NameRef[] {
  if (aliases.length === 0 || !text) return [];
  const tokens = tokenize(maskUnmatchable(text));
  if (tokens.length === 0) return [];

  const byTokenCount = new Map<number, Alias[]>();
  for (const a of aliases) {
    if (a.tokenCount > MAX_NGRAM) continue;
    const list = byTokenCount.get(a.tokenCount) ?? [];
    list.push(a);
    byTokenCount.set(a.tokenCount, list);
  }

  const candidates: Candidate[] = [];

  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= MAX_NGRAM && i + n <= tokens.length; n++) {
      const list = byTokenCount.get(n);
      if (!list) continue;

      const span = tokens.slice(i, i + n);
      const base = span.map((t) => t.norm).join(" ");
      const variants = [base];
      // possessive / plural "s" ("Danis", "Dani's") is free, never counted as a typo
      if (base.endsWith("s") && span[span.length - 1].norm.length > 3) variants.push(base.slice(0, -1));
      const candidateIsWord = span.every((t) => isCommonWord(t.norm));

      const prevToken = i > 0 ? tokens[i - 1].norm : "";
      const first = span[0].raw;

      for (const alias of list) {
        let best = Infinity;
        for (const form of alias.german ? [alias.normalized, alias.german] : [alias.normalized]) {
          for (const v of variants) {
            const d = damerauLevenshtein(v, form, alias.allowed);
            if (d < best) best = d;
          }
        }
        if (best > alias.allowed) continue;
        // Fuzzy guard: a real word one typo away from an alias is not a reference ("mason" != "jason").
        if (best > 0 && (candidateIsWord || variants.some((v) => isCommonWord(v)))) continue;

        candidates.push({
          start: span[0].start,
          end: span[span.length - 1].end,
          userId: alias.userId,
          alias,
          distance: best,
          capitalized: first[0] !== first[0].toLowerCase(),
          afterTargetVerb: TARGET_VERBS.has(prevToken),
        });
      }
    }
  }

  // Exact before fuzzy, longer spans before shorter, manual before automatic.
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.end - b.start - (a.end - a.start) ||
      SOURCE_PRIORITY[a.alias.source] - SOURCE_PRIORITY[b.alias.source] ||
      a.start - b.start
  );

  const accepted: NameRef[] = [];
  const overlaps = (s: number, e: number) => accepted.some((r) => s < r.end && e > r.start);
  const handled = new Set<string>();

  for (const c of candidates) {
    const key = `${c.start}:${c.end}`;
    if (handled.has(key) || overlaps(c.start, c.end)) continue;
    handled.add(key);

    // Every candidate for this exact span at the same distance competes.
    const same = candidates.filter((o) => o.start === c.start && o.end === c.end && o.distance === c.distance);
    // Manual nicknames beat Discord names; among Discord names nobody wins.
    const anyManual = same.some((o) => o.alias.source === "manual");
    const top = anyManual ? same.filter((o) => o.alias.source === "manual") : same;
    const userIds = [...new Set(top.map((o) => o.userId))];

    let confidence: NameRef["confidence"];
    if (userIds.length > 1) {
      confidence = "ambiguous";
    } else if (!c.alias.common) {
      confidence = "high";
    } else {
      const strongSignal =
        c.capitalized ||
        (opts.recentParticipantIds?.has(c.userId) ?? false) ||
        (!!opts.isInstruction && c.afterTargetVerb);
      confidence = strongSignal ? "high" : "low";
    }

    accepted.push({
      start: c.start,
      end: c.end,
      text: text.slice(c.start, c.end),
      userId: userIds.length === 1 ? userIds[0] : undefined,
      userIds,
      alias: c.alias.nickname,
      distance: c.distance,
      confidence,
    });
  }

  return accepted.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Persistence + per-guild cache
// ---------------------------------------------------------------------------

type NicknameRow = {
  id: number;
  guild_id: string;
  user_id: string;
  nickname: string;
  normalized: string;
  source: AliasSource;
  added_by: string | null;
  created_at: number;
};

const aliasCache = new Map<string, Alias[]>();
const autoAliasSeen = new Map<string, string>(); // `${guild}:${user}` -> joined names

export function getGuildAliases(guildId: string): Alias[] {
  const cached = aliasCache.get(guildId);
  if (cached) return cached;
  const rows = getV2DB()
    .prepare("SELECT * FROM nicknames WHERE guild_id = ?")
    .all(guildId) as NicknameRow[];
  const aliases = rows
    .map((r) => makeAlias(r.user_id, r.nickname, r.source))
    .filter((a): a is Alias => a !== null);
  aliasCache.set(guildId, aliases);
  return aliases;
}

function invalidate(guildId: string) {
  aliasCache.delete(guildId);
}

/**
 * Keep display name / global name / username aliases current. Cheap to call
 * on every message: it only writes when the names changed.
 */
export function refreshAutoAliases(
  guildId: string,
  userId: string,
  names: { displayName?: string | null; globalName?: string | null; username?: string | null }
): void {
  const entries: [AliasSource, string][] = [];
  if (names.displayName) entries.push(["display_name", names.displayName]);
  if (names.globalName) entries.push(["global_name", names.globalName]);
  if (names.username) entries.push(["username", names.username]);

  const key = `${guildId}:${userId}`;
  const signature = entries.map((e) => e.join("=")).join("|");
  if (autoAliasSeen.get(key) === signature) return;
  autoAliasSeen.set(key, signature);

  const db = getV2DB();
  const now = Date.now();
  db.transaction(() => {
    db.prepare("DELETE FROM nicknames WHERE guild_id = ? AND user_id = ? AND source != 'manual'").run(guildId, userId);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO nicknames (guild_id, user_id, nickname, normalized, source, added_by, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    );
    for (const [source, name] of entries) {
      const normalized = normalizeAlias(name);
      if (normalized) insert.run(guildId, userId, name, normalized, source, now);
    }
  })();
  invalidate(guildId);
}

export type AddNicknameResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

export function addNickname(guildId: string, userId: string, name: string, addedBy: string): AddNicknameResult {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 32) {
    return { ok: false, error: "Nicknames must be 2-32 characters." };
  }
  if (/<[@#][!&]?\d+>/.test(trimmed) || /@(everyone|here)/i.test(trimmed)) {
    return { ok: false, error: "Nicknames can't contain mentions." };
  }
  const normalized = normalizeAlias(trimmed);
  if (!normalized) return { ok: false, error: "That nickname has no letters or digits." };
  if (normalized.split(" ").length > MAX_NGRAM) {
    return { ok: false, error: `Nicknames can have at most ${MAX_NGRAM} words.` };
  }

  const db = getV2DB();
  const clash = db
    .prepare("SELECT user_id, source FROM nicknames WHERE guild_id = ? AND normalized = ? AND user_id != ? LIMIT 1")
    .get(guildId, normalized, userId) as { user_id: string; source: AliasSource } | undefined;
  if (clash) {
    const how = clash.source === "manual" ? "a nickname of" : "the Discord name of";
    return { ok: false, error: `"${trimmed}" is already ${how} <@${clash.user_id}>. Remove it there first.` };
  }

  const existing = db
    .prepare("SELECT 1 FROM nicknames WHERE guild_id = ? AND user_id = ? AND normalized = ? AND source = 'manual'")
    .get(guildId, userId, normalized);
  if (existing) return { ok: false, error: `<@${userId}> already has the nickname "${trimmed}".` };

  const count = (
    db
      .prepare("SELECT COUNT(*) AS c FROM nicknames WHERE guild_id = ? AND user_id = ? AND source = 'manual'")
      .get(guildId, userId) as { c: number }
  ).c;
  if (count >= MAX_MANUAL_PER_USER) {
    return { ok: false, error: `<@${userId}> already has ${MAX_MANUAL_PER_USER} nicknames. Remove one first.` };
  }

  db.prepare(
    `INSERT INTO nicknames (guild_id, user_id, nickname, normalized, source, added_by, created_at)
     VALUES (?, ?, ?, ?, 'manual', ?, ?)`
  ).run(guildId, userId, trimmed, normalized, addedBy, Date.now());
  invalidate(guildId);

  const alias = makeAlias(userId, trimmed, "manual")!;
  const warning = alias.common
    ? `"${trimmed}" is also a normal word, so it only counts when capitalized, right after "roast"/"about", or when that person spoke recently.`
    : alias.allowed === 0
    ? `Names under 5 letters must be spelled exactly (case, accents and 's are ignored).`
    : undefined;
  return { ok: true, warning };
}

export function removeNickname(guildId: string, userId: string, name: string): boolean {
  const normalized = normalizeAlias(name);
  const res = getV2DB()
    .prepare("DELETE FROM nicknames WHERE guild_id = ? AND user_id = ? AND normalized = ? AND source = 'manual'")
    .run(guildId, userId, normalized);
  invalidate(guildId);
  return res.changes > 0;
}

export function listNicknames(guildId: string, userId?: string): { userId: string; nickname: string; addedBy: string | null }[] {
  const rows = (
    userId
      ? getV2DB()
          .prepare("SELECT * FROM nicknames WHERE guild_id = ? AND user_id = ? AND source = 'manual' ORDER BY created_at")
          .all(guildId, userId)
      : getV2DB()
          .prepare("SELECT * FROM nicknames WHERE guild_id = ? AND source = 'manual' ORDER BY user_id, created_at")
          .all(guildId)
  ) as NicknameRow[];
  return rows.map((r) => ({ userId: r.user_id, nickname: r.nickname, addedBy: r.added_by }));
}

/** Manual nicknames per user, for the participant roster in prompts. */
export function nicknamesFor(guildId: string, userIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const a of getGuildAliases(guildId)) {
    if (a.source !== "manual" || !userIds.includes(a.userId)) continue;
    const list = out.get(a.userId) ?? [];
    list.push(a.nickname);
    out.set(a.userId, list);
  }
  return out;
}

/** Resolve a bare name ("dani") to user IDs; used by tools. */
export function resolveName(guildId: string, name: string): string[] {
  const refs = resolveNameRefs(name, getGuildAliases(guildId), { isInstruction: true });
  const ids = new Set<string>();
  for (const r of refs) if (r.confidence !== "low") r.userIds.forEach((id) => ids.add(id));
  return [...ids];
}
