import { Message } from "discord.js";
import { generateText, ImagePart } from "ai";
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";
import { getMessage, setMessageImages } from "./messages";
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

const CAPTION_SYSTEM = `You describe images posted in a Discord chat so a text-only bot can follow the conversation and joke about it.
In at most 60 words, plain text, no preamble:
- what it is (meme, screenshot of a game/app/chat, photo, drawing, chart, ...)
- the key content and anything notable or funny
- readable text, quoted briefly
Do not guess who real people are from their faces. Do not describe anyone's body in a sexual way.`;

type CaptionJob = { guildId: string; messageId: string; authorName: string; text: string };
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
          { type: "text", text: `Posted by ${job.authorName}${job.text ? ` with the message: "${job.text.slice(0, 300)}"` : ""}` },
          { type: "image", image: image.data, mediaType: image.mediaType },
        ],
      },
    ],
    maxOutputTokens: 200,
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
  for (const img of images) {
    if (img.state !== "pending") continue;
    const file = await downloader(img.url);
    if (!file) {
      img.state = "failed";
      continue;
    }
    try {
      const caption = (await captionImpl(file, job)).replace(/\s+/g, " ").trim().slice(0, 400);
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
 */
export async function requestImageParts(
  sources: { ref: string; label: string; message: Message }[],
  signal?: AbortSignal,
  max = 4
): Promise<{ intro: string; parts: ImagePart[] }> {
  const parts: ImagePart[] = [];
  const lines: string[] = [];
  for (const s of sources) {
    for (const img of imagesOf(s.message)) {
      if (parts.length >= max || img.state === "skipped") continue;
      const file = await downloader(img.url, signal);
      if (!file) continue;
      parts.push({ type: "image", image: file.data, mediaType: file.mediaType });
      lines.push(`Image ${parts.length}: from ${s.ref} by ${s.label}`);
    }
  }
  return { intro: lines.length ? `\n\n<attached_images>\n${lines.join("\n")}\n</attached_images>` : "", parts };
}
