/**
 * Sprint 11 · PII scrubbing & officer anonymisation.
 *
 * Dashboards MUST NOT expose raw officer identities or free-text PII.
 * `officerHash()` is a one-way FNV-1a fold with a runtime salt so the
 * ops team can still correlate feedback with queries by the same actor
 * without recovering identity. `scrub()` masks emails, phone numbers,
 * IMO numbers, and long digit runs.
 */

const SALT = (globalThis.crypto?.randomUUID?.() ?? String(Date.now())) + ":seaphore:obs";

/** FNV-1a 32-bit hash — deterministic within a process, salted per-boot. */
export function officerHash(officerId: string): string {
  const s = SALT + "|" + officerId;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `off_${(h >>> 0).toString(36)}`;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const IMO = /\bIMO\s?\d{7}\b/gi;
const LONG_DIGITS = /\b\d{9,}\b/g;

export function scrub(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]")
    .replace(IMO, "[imo]")
    .replace(LONG_DIGITS, "[num]");
}
