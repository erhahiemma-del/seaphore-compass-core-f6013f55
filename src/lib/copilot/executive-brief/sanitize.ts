/**
 * Sanitisers for the Executive Briefing.
 *
 * Strip technical residue — UUIDs, SHA hashes, ISO timestamps, database
 * key names — from any string that will be rendered to the officer.
 * The reasoning pipeline is unchanged; only the presentation layer is
 * cleaned. See sprint spec: "Never expose UUIDs / created_at / …".
 */

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SHA_RE = /\b[a-f0-9]{32,}\b/gi;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const KEY_RE = /\b(created_at|updated_at|deleted_at|foreign_key|[a-z_]+_id)\b\s*[:=]\s*\S+/gi;
const JSON_RE = /\{[^{}]*"[^"]+"\s*:\s*[^{}]+\}/g;

/** Redact IDs and metadata from a single string. */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  let out = input;
  out = out.replace(UUID_RE, "");
  out = out.replace(SHA_RE, "");
  out = out.replace(ISO_RE, "");
  out = out.replace(KEY_RE, "");
  out = out.replace(JSON_RE, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Humanise a snake_case / camelCase database key into a display label. */
export function humaniseLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when the key/value pair should be hidden from the officer view. */
export function isTechnicalKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k === "id") return true;
  if (k.endsWith("_id") || k.endsWith("id")) return /uuid|record|row/.test(k) || k === "id";
  return (
    k.endsWith("_id") ||
    k === "created_at" ||
    k === "updated_at" ||
    k === "deleted_at" ||
    k === "tenant_id" ||
    k === "foreign_key" ||
    k === "hash" ||
    k === "checksum"
  );
}

/** Format an ISO timestamp for display (falls back to the raw string). */
export function formatWhen(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
