/**
 * Some models (notably DeepSeek through some OpenRouter providers) sometimes
 * write their tool calls as plain text instead of real tool calls, e.g.
 *
 *   <｜DSML｜invoke name="search_messages">
 *   <｜DSML｜parameter name="from" string="true">2026-10-01</｜DSML｜parameter>
 *   </｜DSML｜invoke>
 *
 * This module recognizes those formats so the engine can run the tool itself
 * and never posts the raw markup to Discord.
 */

export type LeakedCall = { name: string; args: Record<string, unknown> };

const BAR = "[|｜]";
const DSML = `<\\s*\\/?\\s*${BAR}\\s*DSML\\s*${BAR}`;
const DSML_INVOKE = new RegExp(
  `<\\s*${BAR}\\s*DSML\\s*${BAR}\\s*invoke\\s+name\\s*=\\s*"([^"]+)"\\s*>([\\s\\S]*?)<\\s*\\/\\s*${BAR}\\s*DSML\\s*${BAR}\\s*invoke\\s*>`,
  "g"
);
const DSML_PARAM = new RegExp(
  `<\\s*${BAR}\\s*DSML\\s*${BAR}\\s*parameter\\s+name\\s*=\\s*"([^"]+)"(?:\\s+string\\s*=\\s*"(true|false)")?\\s*>([\\s\\S]*?)<\\s*\\/\\s*${BAR}\\s*DSML\\s*${BAR}\\s*parameter\\s*>`,
  "g"
);
// Older DeepSeek format: <｜tool▁call▁begin｜>function<｜tool▁sep｜>name ```json {...}``` <｜tool▁call▁end｜>
const DS_LEGACY = /<[|｜]tool[▁_ ]call[▁_ ]begin[|｜]>\s*(?:function)?\s*<[|｜]tool[▁_ ]sep[|｜]>\s*([\w.-]+)\s*(?:```(?:json)?)?\s*(\{[\s\S]*?\})\s*(?:```)?\s*<[|｜]tool[▁_ ]call[▁_ ]end[|｜]>/g;
// Hermes / Qwen style: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
const HERMES = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

const MARKERS = new RegExp(`${DSML}|<[|｜]tool[▁_ ]|<\\/?tool_call>|<\\/?function_calls>`, "i");

export function hasLeakedToolMarkup(text: string): boolean {
  return MARKERS.test(text);
}

function parseValue(raw: string, isString: string | undefined): unknown {
  const v = raw.trim();
  if (isString === "true") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function allMatches(re: RegExp, text: string): RegExpExecArray[] {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: RegExpExecArray[] = [];
  for (let m = r.exec(text); m !== null; m = r.exec(text)) out.push(m);
  return out;
}

export function parseLeakedToolCalls(text: string): LeakedCall[] {
  const calls: LeakedCall[] = [];
  for (const m of allMatches(DSML_INVOKE, text)) {
    const args: Record<string, unknown> = {};
    for (const p of allMatches(DSML_PARAM, m[2])) args[p[1]] = parseValue(p[3], p[2]);
    calls.push({ name: m[1].trim(), args });
  }
  for (const m of allMatches(DS_LEGACY, text)) {
    try {
      calls.push({ name: m[1], args: JSON.parse(m[2]) });
    } catch {
      /* ignore malformed */
    }
  }
  for (const m of allMatches(HERMES, text)) {
    try {
      const obj = JSON.parse(m[1]);
      const args = typeof obj.arguments === "string" ? JSON.parse(obj.arguments) : obj.arguments ?? obj.parameters ?? {};
      if (typeof obj.name === "string") calls.push({ name: obj.name, args });
    } catch {
      /* ignore malformed */
    }
  }
  return calls;
}

/** Remove any tool-call markup (and the lines it sits on) from a reply. */
export function stripToolMarkup(text: string): string {
  return text
    .replace(DSML_INVOKE, "")
    .replace(DS_LEGACY, "")
    .replace(HERMES, "")
    .split("\n")
    .filter((line) => !MARKERS.test(line))
    .join("\n")
    .trim();
}
