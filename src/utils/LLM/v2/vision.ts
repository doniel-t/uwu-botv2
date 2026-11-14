import { Message } from "discord.js";
import { generateText, ImagePart } from "ai";
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";
import { getMessage, getMessagesAfter, getMessagesBefore, setMessageImages, StoredMessage } from "./messages";
import { MODELS } from "./settings";
import { anySignal, timeoutSignal } from "./compat";

/**
 * Image understanding for the memory engine.
 *
 * 1. Every image posted while the engine is on gets a short caption from a
 *    cheap vision model. The caption is stored with the message, so the chat
 *    log, fact extraction and fact search all "see" the image as text.
 * 2. Images that are part of the current request (on the ping itself or on
 *    the message it replies to) are also sent to the reply model directly.
 */

export type ImageInfo = {
  url: string;
  name: string;
  contentType: string | null;
  size: number | null;
  source: "attachment" | "embed";
  caption: string | null;
  state: "pending" | "done" | "failed" | "skipped";
};

const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const CAPTION_CONCURRENCY = 2;
const SUPPORTED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)(\?|$)/i;

/** Image attachments and link-preview images (e.g. Tenor GIFs) of a message. */
export function imagesOf(message: Message): ImageInfo[] {
  const out: ImageInfo[] = [];
  message.attachments?.forEach((a) => {
    const type = a.contentType?.split(";")[0] ?? null;
    const isImage = type ? type.startsWith("image/") : IMAGE_EXT.test(a.name ?? a.url);
    if (!isImage) return;
    const tooBig = (a.size ?? 0) > MAX_BYTES;
    const unsupported = type !== null && !SUPPORTED.has(type);
    out.push({
      url: a.url,
      name: a.name ?? "image",
      contentType: type,
      size: a.size ?? null,
      source: "attachment",
      caption: null,
      state: tooBig || unsupported ? "skipped" : "pending",
    });
  });
  for (const e of message.embeds ?? []) {
    const url = e.image?.url ?? e.thumbnail?.url;
    if (!url) continue;
    out.push({
      url,
      name: e.title ?? e.provider?.name ?? "link preview",
      contentType: null,
      size: null,
      source: "embed",
      caption: null,
      state: "pending",
    });
  }
  return out.slice(0, MAX_IMAGES_PER_MESSAGE);
}

/** How images show up in text prompts. */
export function renderImages(images: ImageInfo[]): string {
  return images
    .map((img) =>
      img.state === "done" && img.caption
        ? `[image: ${img.caption}]`
        : img.state === "pending"
        ? `[image: ${img.name}, not looked at yet]`
        : `[image: ${img.name}]`
    )
    .join(" ");
}

export async function downloadImage(url: string, signal?: AbortSignal): Promise<{ data: Uint8Array; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: anySignal([signal, timeoutSignal(DOWNLOAD_TIMEOUT_MS)]) });
    if (!res.ok) return null;
    const mediaType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED.has(mediaType)) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES || buf.byteLength === 0) return null;
    return { data: buf, mediaType };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Captioning queue
// ---------------------------------------------------------------------------

const CAPTION_SYSTEM = `You describe images posted in a Discord friend group so a text-only bot understands them. You get the image and the conversation around it.
Images there are often reaction images and memes answering someone, or things people comment on, so explain the image's role, not just its pixels.
Answer in exactly this format, max 80 words, no preamble:
Shows: what it is (reaction image, meme, screenshot of a game/app/chat, own photo, drawing, ...), the key content, readable text quoted briefly.
Used as: its role in the conversation, e.g. "reaction to Sergej's message about his rank, mocking him", "the poster's own setup photo", "sharing patch notes", "agreeing with Dani". Name who it's aimed at when clear. If there's no conversation context, write "Used as: posted without context".
Do not guess who real people are from their faces. Do not describe anyone's body in a sexual way.`;

/** Context window for describing an image: what came before, what it answers, and the reactions. */
const CAPTION_BEFORE_MS = 10 * 60_000;
const CAPTION_AFTER_MS = 15 * 60_000;

function captionLine(m: StoredMessage): string {
  const imgs = m.images
    .filter((i) => i.state === "done" && i.caption)
    .map((i) => ` [image: ${i.caption}]`)
    .join("");
  const text = (m.content || "").replace(/\s+/g, " ").slice(0, 200);
  return `${m.isOwnBot ? "BOT" : m.authorName}: ${text || "(no text)"}${imgs}`;
}

/** The conversation around an image message, as plain text for the vision model. */
export function buildCaptionContext(stored: StoredMessage): string {
  const parts: string[] = [];
  if (stored.replyToMessageId) {
    const parent = getMessage(stored.guildId, stored.replyToMessageId);
    if (parent && !parent.deletedAt) parts.push(`The image post is a reply to this message:\n${captionLine(parent)}`);
  }
  const before = getMessagesBefore(stored.guildId, stored.channelId, stored.createdAt, 5).filter(
    (m) => stored.createdAt - m.createdAt <= CAPTION_BEFORE_MS && m.messageId !== stored.replyToMessageId
  );
  if (before.length) parts.push(`Chat right before:\n${before.map(captionLine).join("\n")}`);
  const after = getMessagesAfter(stored.guildId, stored.channelId, stored.createdAt, 25).filter(
    (m) => m.createdAt - stored.createdAt <= CAPTION_AFTER_MS
  );
  const reactions = [
    ...after.filter((m) => m.replyToMessageId === stored.messageId).slice(0, 3),
    ...after.filter((m) => m.replyToMessageId !== stored.messageId).slice(0, 2),
  ].sort((a, b) => a.createdAt - b.createdAt);
  if (reactions.length) parts.push(`Reactions after it:\n${reactions.map(captionLine).join("\n")}`);
  return parts.join("\n\n");
}

type CaptionJob = { guildId: string; messageId: string; authorName: string; text: string; context?: string };
const jobs: CaptionJob[] = [];
let active = 0;
let onCaptioned: (guildId: string, channelId: string) => void = () => {};

/** Called after captions for a message are written (used to trigger fact extraction). */
export function setOnCaptioned(fn: (guildId: string, channelId: string) => void): void {
  onCaptioned = fn;
}

let captionImpl = async (image: { data: Uint8Array; mediaType: string }, job: CaptionJob): Promise<string> => {
  const start = Date.now();
  const result = await generateText({
    model: createOpenRouter().chat(MODELS.vision),
    system: CAPTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Posted by ${job.authorName}${job.text ? ` with the message: "${job.text.slice(0, 300)}"` : " without text"}.` +
              (job.context ? `\n\n${job.context}` : ""),
          },
          { type: "image", image: image.data, mediaType: image.mediaType },
        ],
      },
    ],
    maxOutputTokens: 250,
    maxRetries: 1,
    timeout: 25_000,
  });
  const u = result.totalUsage;
  logAPICall({
    type: "MemoryV2.caption",
    model: MODELS.vision,
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    cost: computeCost(MODELS.vision, u.inputTokens || 0, u.outputTokens || 0).toFixed(6),
    durationMs: Date.now() - start,
    extra: { caption: result.text.slice(0, 100) },
  });
  return result.text;
};

/** Test hook: replace the vision call (pass nothing to restore). */
export function _setCaptionerForTests(fn?: typeof captionImpl, download?: typeof downloadImage): void {
  if (fn) captionImpl = fn;
  if (download) downloader = download;
}
let downloader = downloadImage;

/** Queue captions for an already stored message (backfill: no live Message needed). */
export function queueCaptionsFor(guildId: string, messageId: string): boolean {
  const stored = getMessage(guildId, messageId);
  if (!stored || !stored.images.some((i) => i.state === "pending")) return false;
  jobs.push({ guildId, messageId, authorName: stored.authorName, text: stored.content });
  pump();
  return true;
}

export function captionQueueSize(): number {
  return jobs.length + active;
}

export function queueCaptions(message: Message): void {
  if (!message.guild) return;
  const stored = getMessage(message.guild.id, message.id);
  if (!stored || !stored.images.some((i) => i.state === "pending")) return;
  jobs.push({
    guildId: message.guild.id,
    messageId: message.id,
    authorName: stored.authorName,
    text: message.content ?? "",
  });
  pump();
}

function pump() {
  while (active < CAPTION_CONCURRENCY && jobs.length > 0) {
    const job = jobs.shift()!;
    active++;
    captionMessage(job)
      .catch((err) => console.error("[MemoryV2] Captioning failed:", err))
      .finally(() => {
        active--;
        pump();
      });
  }
}

/** Resolves when the caption queue is empty (tests). */
export async function _captionsIdle(): Promise<void> {
  while (active > 0 || jobs.length > 0) await new Promise((r) => setTimeout(r, 20));
}

async function captionMessage(job: CaptionJob): Promise<void> {
  const stored = getMessage(job.guildId, job.messageId);
  if (!stored || stored.deletedAt) return;
  const images = stored.images.map((i) => ({ ...i }));
  const withContext: CaptionJob = { ...job, context: buildCaptionContext(stored) };
  for (const img of images) {
    if (img.state !== "pending") continue;
    const file = await downloader(img.url);
    if (!file) {
      img.state = "failed";
      continue;
    }
    try {
      const caption = (await captionImpl(file, withContext)).replace(/\s+/g, " ").replace(/ ?Used as:/, " | Used as:").trim().slice(0, 500);
      img.caption = caption || null;
      img.state = caption ? "done" : "failed";
    } catch (err) {
      console.warn("[MemoryV2] Caption call failed:", (err as Error).message);
      img.state = "failed";
    }
  }
  setMessageImages(job.guildId, job.messageId, images);
  onCaptioned(job.guildId, stored.channelId);
}

// ---------------------------------------------------------------------------
// Images for the reply model
// ---------------------------------------------------------------------------

/**
 * Fresh image parts for the current request. Discord CDN links expire, so the
 * caller passes live Message objects (re-fetched), not stored URLs.
 *
 * With textOnly (the chat model can't take images), each image is described by
 * the vision model instead and the descriptions go into the text.
 */
export async function requestImageParts(
  sources: { ref: string; label: string; message: Message }[],
  signal?: AbortSignal,
  opts: { max?: number; textOnly?: boolean } = {}
): Promise<{ intro: string; parts: ImagePart[] }> {
  const max = opts.max ?? 4;
  const parts: ImagePart[] = [];
  const lines: string[] = [];
  let count = 0;
  for (const s of sources) {
    for (const img of imagesOf(s.message)) {
      if (count >= max || img.state === "skipped") continue;
      const file = await downloader(img.url, signal);
      if (!file) continue;
      count++;
      if (!opts.textOnly) {
        parts.push({ type: "image", image: file.data, mediaType: file.mediaType });
        lines.push(`Image ${count}: from ${s.ref} by ${s.label}`);
        continue;
      }
      const guildId = s.message.guild?.id ?? "";
      const stored = guildId ? getMessage(guildId, s.message.id) : null;
      const caption = await captionImpl(file, {
        guildId,
        messageId: s.message.id,
        authorName: s.label,
        text: s.message.content ?? "",
        context: stored ? buildCaptionContext(stored) : undefined,
      })
        .then((t) => t.replace(/\s+/g, " ").replace(/ ?Used as:/, " | Used as:").trim().slice(0, 500))
        .catch((err) => {
          console.warn("[MemoryV2] Describing a request image failed:", (err as Error).message);
          return "";
        });
      lines.push(`Image ${count}: from ${s.ref} by ${s.label}: ${caption || "(could not be described)"}`);
    }
  }
  if (!lines.length) return { intro: "", parts };
  const note = opts.textOnly ? "You can't see these images directly; these are descriptions of them.\n" : "";
  return { intro: `\n\n<attached_images>\n${note}${lines.join("\n")}\n</attached_images>`, parts };
}
