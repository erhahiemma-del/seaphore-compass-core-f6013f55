/**
 * Inline continuation suggestions — PRESENTATION ONLY.
 *
 * When the officer pauses typing, the console offers faint "Continue with..."
 * fragments that append to the officer's own words. Nothing is submitted,
 * filtered or rewritten: the officer can ignore them, press Tab, or click one.
 * No popup, no modal.
 */

import { detectIntentHint } from "./intent-hints";

/** Generic maritime follow-ups that apply to almost any subject. */
const BASE = [
  "ownership",
  "sanctions",
  "previous inspections",
  "last known position",
] as const;

/** Intent-specific extras, appended after the base set where relevant. */
const BY_INTENT: Record<string, readonly string[]> = {
  IMO: ["vessel particulars", "flag history"],
  VESSEL: ["port calls", "AIS gaps"],
  COMPANY: ["beneficial owners", "linked vessels"],
  MANIFEST: ["declared value", "duplicate bills of lading"],
  CONTAINER: ["route history", "consignee"],
  BOL: ["shipper history", "declared cargo"],
  VOYAGE: ["port calls", "deviation analysis"],
  PORT: ["congestion trend", "recent arrivals"],
  SANCTIONS: ["screening sources", "network hops"],
};

/**
 * Continuation fragments for a partially typed query. Returns an empty list
 * when the text is too short to continue honestly, or when every candidate is
 * already covered by what the officer wrote.
 */
export function continuationsFor(raw: string, limit = 4): string[] {
  const text = raw.trim();
  if (text.length < 4) return [];
  // A trailing connector means the officer is mid-word — wait for them.
  if (/\b(the|a|an|of|for|and|with)$/i.test(text)) return [];

  const hint = detectIntentHint(text);
  const pool = [...BASE, ...(hint ? (BY_INTENT[hint.key] ?? []) : [])];
  const lower = text.toLowerCase();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of pool) {
    if (seen.has(item)) continue;
    seen.add(item);
    // Skip anything the officer has already asked for.
    const head = item.split(" ")[0].toLowerCase();
    if (lower.includes(item.toLowerCase()) || lower.includes(head)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Append a continuation to the officer's text, keeping their wording intact.
 * Uses a natural connector so the result reads as one instruction.
 */
export function appendContinuation(current: string, fragment: string): string {
  const base = current.trimEnd().replace(/[,\s]+$/, "");
  if (!base) return fragment;
  const connector = /\b(and|with|,)$/i.test(base) ? " " : " — check ";
  return `${base}${connector}${fragment}`;
}
