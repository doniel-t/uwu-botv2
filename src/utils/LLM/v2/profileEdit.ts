import { Message, User } from "discord.js";
import { getProfile, setManualProfile } from "./profiles";

/**
 * Editing a profile by DM (/memory editprofile): the bot DMs the current profile,
 * and the editor's next DM message replaces it. Pending edits live in memory
 * (a restart cancels them) and expire after EDIT_WINDOW_MS.
 */

const EDIT_WINDOW_MS = 15 * 60_000;
const CHUNK = 1900;

type PendingEdit = { guildId: string; userId: string; userName: string; expiresAt: number };
const pending = new Map<string, PendingEdit>();

/** Split text into Discord-sized pieces, preferring line breaks. */
export function splitForDiscord(text: string, size = CHUNK): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size / 2) cut = rest.lastIndexOf(" ", size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) out.push(rest);
  return out;
}

export function startProfileEdit(editorId: string, edit: Omit<PendingEdit, "expiresAt">, now = Date.now()): void {
  pending.set(editorId, { ...edit, expiresAt: now + EDIT_WINDOW_MS });
}

export function pendingProfileEdit(editorId: string, now = Date.now()): PendingEdit | null {
  const p = pending.get(editorId);
  if (!p) return null;
  if (p.expiresAt < now) {
    pending.delete(editorId);
    return null;
  }
  return p;
}

/** DM the editor the current profile and wait for the replacement. */
export async function sendProfileForEditing(editor: User, guildId: string, userId: string, userName: string): Promise<void> {
  const profile = getProfile(guildId, userId);
  startProfileEdit(editor.id, { guildId, userId, userName });
  const header =
    `**Editing the profile of ${userName}**${profile?.manual ? " (already hand-edited)" : ""}\n` +
    `Your next message here replaces it completely. Send \`cancel\` to keep it. This expires in ${EDIT_WINDOW_MS / 60_000} minutes.\n` +
    `Current profile:`;
  await editor.send({ content: header, allowedMentions: { parse: [] } });
  if (!profile) {
    await editor.send({ content: "*(no profile yet: write one from scratch)*" });
    return;
  }
  for (const part of splitForDiscord(profile.profile)) {
    await editor.send({ content: "```\n" + part.replace(/```/g, "'''") + "\n```", allowedMentions: { parse: [] } });
  }
}

/**
 * Handle a DM. Returns true if it was the reply to a pending profile edit
 * (and was consumed), false otherwise.
 */
export async function handleProfileEditDM(message: Message): Promise<boolean> {
  if (message.guild || message.author.bot) return false;
  const edit = pendingProfileEdit(message.author.id);
  if (!edit) return false;
  pending.delete(message.author.id);

  // People often paste the profile back inside the code block; unwrap it.
  const text = (message.content ?? "").trim().replace(/^```[a-z]*\n?([\s\S]*?)\n?```$/i, "$1").trim();
  if (!text || /^cancel$/i.test(text)) {
    await message.reply(`Okay, the profile of ${edit.userName} stays as it was.`).catch(() => {});
    return true;
  }
  if (text.length < 20) {
    startProfileEdit(message.author.id, edit); // give them another go
    await message.reply("That's very short for a profile. Send the full text (or `cancel`).").catch(() => {});
    return true;
  }
  const saved = setManualProfile(edit.guildId, edit.userId, text);
  await message
    .reply(
      `Saved the profile of ${edit.userName} (${saved.profile.length} characters). It won't be rewritten automatically; ` +
        "`/memory profile refresh:true` rewrites it from the facts, using your version as the base."
    )
    .catch(() => {});
  return true;
}
