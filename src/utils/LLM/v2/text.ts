/**
 * Text helpers shared by nickname resolution and fact retrieval.
 */

export type Token = {
  /** normalized form (lowercase, no diacritics, no apostrophes) */
  norm: string;
  /** original surface text */
  raw: string;
  start: number;
  end: number;
};

/** Lowercase, strip diacritics (NFKD), ß -> ss, drop apostrophes. */
export function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/['’]/g, "");
}

/** German transliteration variant: ä -> ae, ö -> oe, ü -> ue, then normalize. */
export function transliterateGerman(word: string): string {
  return normalizeWord(
    word
      .replace(/[äÄ]/g, "ae")
      .replace(/[öÖ]/g, "oe")
      .replace(/[üÜ]/g, "ue")
  );
}

// A word, optionally with a possessive 's / ’s glued on.
const TOKEN_RE = /[\p{L}\p{N}]+(?:['’][sS])?/gu;

/**
 * Remove parts of a message that must never be name-matched (code blocks,
 * inline code, URLs, Discord mentions/emoji) by blanking them with spaces so
 * character offsets stay valid.
 */
export function maskUnmatchable(text: string): string {
  const blank = (m: string) => " ".repeat(m.length);
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/`[^`]*`/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/<a?:\w+:\d+>/g, blank)
    .replace(/<[@#][!&]?\d+>/g, blank);
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const norm = normalizeWord(raw);
    if (!norm) continue;
    tokens.push({ norm, raw, start: m.index!, end: m.index! + raw.length });
  }
  return tokens;
}

/** Normalized alias form: tokens joined by single spaces. */
export function normalizeAlias(name: string): string {
  return tokenize(name)
    .map((t) => t.norm)
    .join(" ");
}

export function normalizeAliasGerman(name: string): string {
  return tokenize(name)
    .map((t) => transliterateGerman(t.raw))
    .join(" ");
}

/**
 * Optimal string alignment distance (Damerau-Levenshtein where an adjacent
 * transposition costs 1). Returns max+1 early when the distance exceeds max.
 */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prevPrev: number[] = new Array(m + 1).fill(0);
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  let cur: number[] = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prevPrev;
    prevPrev = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[m];
}

/**
 * Typos tolerated for an alias, per the design:
 *   1-4 chars: 0, 5-19 chars: 1, then 10% (floor).
 * Length ignores spaces.
 */
export function allowedTypos(normalizedAlias: string): number {
  const len = normalizedAlias.replace(/ /g, "").length;
  if (len < 5) return 0;
  return Math.max(1, Math.floor(0.1 * len));
}

/**
 * Common English + German words. Used for:
 *  - the common-word guard (an alias that is a normal word needs extra signal)
 *  - rejecting fuzzy (distance >= 1) matches where the candidate is itself a word
 *  - dropping noise words in lexical fact retrieval
 */
export const COMMON_WORDS = new Set(
  `
a about above after again against all almost also always am an and any are aren around as ask at away back bad be because
been before being below best better between big bit both but by call came can cannot cant come could couldn day did didn
do does doesn doing don done down during each even ever every few find first for from full fun get gets give go goes going
gone good got great guy guys had has have haven having he her here hers him his how i if im in into is isn it its just keep
kind know last least less let like little long look lot made make man many may maybe me mean men might mine more most much
must my myself near need never new next nice no nor not now of off oh ok okay old on once one only or other our out over own
part people play please point pretty put quite rather real really right said same saw say see seem she should show side
since small so some something still such sure take tell than thank thanks that the their them then there these they thing
think this those though through time to today too took top try two under until up us use very want was wasn way we well
went were what when where which while who whole why will win with without won word work would yeah yes yet you your yours
lol lmao bro dude max chef king boss mate fine cool sick main game games rank ranked mason will bill mark rob sky angel
also hello hey hi bye

aber alle allem allen aller alles als also am an ander andere anderem anderen anderer anderes auch auf aus bei bin bis bist
da damit dann das dass dein deine dem den der des dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein
eine einem einen einer eines einmal er es etwas euch euer eure fur gegen gewesen hab habe haben hat hatte hier hin hinter ich
ihm ihn ihnen ihr ihre im in indem ins ist ja jede jedem jeden jeder jedes jetzt kann kein keine keinem keinen keiner man
manche mehr mein meine mich mir mit muss nach nicht nichts noch nun nur ob oder ohne sehr sein seine sich sie sind so solche
soll sondern sonst uber um und uns unser unter viel vom von vor wann war waren warum was weg weil weiter welche wenn wer
werde werden wie wieder will wir wird wo wollen wurde zu zum zur zwar zwischen geil digga alter junge chef mann frau heute
morgen gut schlecht
`
    .split(/\s+/)
    .filter(Boolean)
);

export function isCommonWord(normalized: string): boolean {
  return COMMON_WORDS.has(normalized);
}

/** Content words for lexical scoring (normalized, no common words, len >= 3). */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokenize(text)) {
    const w = t.norm.replace(/s$/, "");
    if (w.length >= 3 && !COMMON_WORDS.has(t.norm) && !COMMON_WORDS.has(w)) out.add(w);
  }
  return out;
}
