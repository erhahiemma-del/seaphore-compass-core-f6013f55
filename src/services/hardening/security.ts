/**
 * Sprint 12 · Security hardening.
 *
 * Small, dependency-free helpers for the OWASP Top-10 gaps we can close
 * in code: strict input validation, SQL-injection detection at the
 * repository boundary, XSS-safe text rendering, and secret-header
 * timing-safe compare for webhooks. Not a replacement for RLS or
 * schema-level defence — a defence-in-depth layer on top.
 */

import { z } from "zod";

// -------- Zod primitives with sane ceilings --------
export const SafeString = z.string().trim().min(1).max(2_000);
export const SafeText = z.string().trim().min(1).max(20_000);
export const SafeEmail = z.string().trim().email().max(320);
export const SafeUUID = z.string().uuid();
export const SafeSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/i);
export const SafeIMO = z.string().regex(/^IMO\d{7}$/);

// -------- XSS-safe text (HR-3: never trust upstream content) --------
const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
};
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"'/]/g, (c) => HTML_ESCAPE[c] ?? c);
}

/** Strip control characters (except \n and \t). */
export function stripControls(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

// -------- SQL-injection tripwire --------
// We use parameterised queries end-to-end; this helper detects obvious
// misuse (raw SQL fragments interpolated from user input) so a code
// review can flag it before merge. NOT a substitute for parameterisation.
const SQLI_PATTERNS: RegExp[] = [
  /(\bunion\b\s+\bselect\b)/i,
  /(\bor\b\s+\d+=\d+)/i,
  /('|")\s*;\s*(drop|delete|update|insert)\b/i,
  /--\s*$/,
  /\/\*.*\*\//,
];
export function looksLikeSqlInjection(input: string): boolean {
  return SQLI_PATTERNS.some((r) => r.test(input));
}

/** Whitelist an ORDER BY / column identifier. Never accept from user input directly. */
export function assertSafeIdent(id: string, allowed: readonly string[]): string {
  if (!allowed.includes(id)) throw new Error(`unsafe identifier: ${id}`);
  return id;
}

// -------- Timing-safe compare for shared secrets --------
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// -------- URL allow-listing (SSRF guard for outbound fetches) --------
export function assertAllowedUrl(url: string, allowedHosts: readonly string[]): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:") throw new Error("https required");
  if (!allowedHosts.includes(u.hostname)) throw new Error(`host not allowed: ${u.hostname}`);
  return u;
}

// -------- Standard security response headers --------
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
});

export function withSecurityHeaders(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return { ...init, headers };
}
