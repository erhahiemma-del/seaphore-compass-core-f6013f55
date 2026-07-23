/**
 * Stable content hash — used for evidence dedupe and citation stability.
 * Not cryptographic; a fast FNV-1a over a canonical JSON encoding.
 */
export function stableHash(value: unknown): string {
  const encoded = canonicalJson(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < encoded.length; i++) {
    h ^= encoded.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}
