import DiscordJS from "discord.js";

/**
 * Small helpers that avoid APIs whose TypeScript types differ between the
 * discord.js / @types/node versions in the lockfile (Docker) and newer local
 * installs. The project type-checks with TypeScript 4.9 via ts-node.
 */

/** Like AbortSignal.any (not in every @types/node version). */
export function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort((s as any).reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort((s as any).reason), { once: true });
  }
  return controller.signal;
}

/** Abort after `ms` (AbortSignal.timeout with a typed fallback). */
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  const t = setTimeout(() => {
    const err = new Error("The operation timed out");
    err.name = "TimeoutError";
    c.abort(err);
  }, ms);
  (t as any).unref?.();
  return c.signal;
}

// Slash-command options through the base `options.get()`, which every
// discord.js 14 typing exposes (the typed getString/getUser helpers do not).
type AnyInteraction = DiscordJS.CommandInteraction | DiscordJS.ChatInputCommandInteraction;

const raw = (i: AnyInteraction, name: string) => ((i as any).options).get(name) as DiscordJS.CommandInteractionOption | null;

export const optString = (i: AnyInteraction, name: string): string | null => {
  const v = raw(i, name)?.value;
  return typeof v === "string" ? v : null;
};
export const optBoolean = (i: AnyInteraction, name: string): boolean | null => {
  const v = raw(i, name)?.value;
  return typeof v === "boolean" ? v : null;
};
export const optInteger = (i: AnyInteraction, name: string): number | null => {
  const v = raw(i, name)?.value;
  return typeof v === "number" ? v : null;
};
export const optUser = (i: AnyInteraction, name: string): DiscordJS.User | null => raw(i, name)?.user ?? null;
export const optChannelId = (i: AnyInteraction, name: string): string | null => {
  const o = raw(i, name);
  return (o?.channel?.id as string | undefined) ?? (typeof o?.value === "string" ? o.value : null);
};
export const subcommand = (i: AnyInteraction): string => ((i as any).options).getSubcommand();

/** Ephemeral flag that works with both old (`ephemeral`) and new (`flags`) typings. */
export const EPHEMERAL = { ephemeral: true } as any;
