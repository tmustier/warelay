import fs from "node:fs";
import os from "node:os";
import { isVerbose, logVerbose } from "./globals.js";

export async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

export type Provider = "twilio" | "web";

export function assertProvider(input: string): asserts input is Provider {
  if (input !== "twilio" && input !== "web") {
    throw new Error("Provider must be 'twilio' or 'web'");
  }
}

export function normalizePath(p: string): string {
  if (!p.startsWith("/")) return `/${p}`;
  return p;
}

export function withWhatsAppPrefix(number: string): string {
  return number.startsWith("whatsapp:") ? number : `whatsapp:${number}`;
}

export function normalizeE164(number: string): string {
  const withoutPrefix = number.replace(/^whatsapp:/, "").trim();
  const digits = withoutPrefix.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1)}`;
  return `+${digits}`;
}

export function toWhatsappJid(number: string): string {
  const e164 = normalizeE164(number);
  const digits = e164.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function jidToE164(jid: string): string | null {
  // Convert a WhatsApp JID (with optional device suffix, e.g. 1234:1@s.whatsapp.net) back to +1234.
  const match = jid.match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/);
  if (match) {
    const digits = match[1];
    return `+${digits}`;
  }

  // Support @lid format (WhatsApp Linked ID) - look up reverse mapping
  const lidMatch = jid.match(/^(\d+)(?::\d+)?@lid$/);
  if (lidMatch) {
    const lid = lidMatch[1];
    try {
      const mappingPath = `${CONFIG_DIR}/credentials/lid-mapping-${lid}_reverse.json`;
      const data = fs.readFileSync(mappingPath, "utf8");
      const phone = JSON.parse(data);
      if (phone) return `+${phone}`;
    } catch {
      if (isVerbose()) {
        logVerbose(
          `LID mapping not found for ${lid}; skipping inbound message`,
        );
      }
      // Mapping not found, fall through
    }
  }

  return null;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const CONFIG_DIR = `${os.homedir()}/.warelay`;

/**
 * Split text into chunks at natural boundaries (sentences, then words).
 * Creates readable message chunks that fit within the specified limit.
 *
 * @param text - The text to split into chunks
 * @param maxChars - Maximum characters per chunk (default 400)
 * @returns Array of text chunks, each <= maxChars
 */
export function splitIntoChunks(text: string, maxChars = 400): string[] {
  if (!text?.trim()) return [];
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining) break;

    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to split at sentence boundary within maxChars
    const searchText = remaining.slice(0, maxChars);
    let splitIndex: number | null = null;

    // Find last sentence boundary (., !, ?) followed by space or at end
    for (let i = searchText.length - 1; i >= 0; i--) {
      if (".!?".includes(searchText[i])) {
        if (i === searchText.length - 1 || /\s/.test(searchText[i + 1])) {
          splitIndex = i + 1;
          break;
        }
      }
    }

    // Fall back to word boundary if no sentence boundary found
    if (splitIndex === null) {
      const lastSpace = searchText.lastIndexOf(" ");
      splitIndex = lastSpace > 0 ? lastSpace : maxChars;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex);
  }

  return chunks.filter((c) => c.length > 0);
}
