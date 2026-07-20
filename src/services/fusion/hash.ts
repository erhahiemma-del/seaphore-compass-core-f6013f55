/**
 * Deterministic content hashing — dedup optimisation (Sprint 7 risk mitigation).
 * FNV-1a 32-bit is sufficient for bucketing candidates before a full compare,
 * and works uniformly in Node and the browser without a crypto import.
 * NOT a security hash — use for identity/bucketing only.
 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Stable, order-independent hash of a claim (source + attribute + value + unit). */
export function claimHash(parts: {
  sourceSystem: string;
  attribute: string;
  value: unknown;
  unit: string | null;
}): string {
  const canonical = JSON.stringify({
    s: parts.sourceSystem.toLowerCase(),
    a: parts.attribute.toLowerCase(),
    v: typeof parts.value === "string" ? parts.value.trim().toLowerCase() : parts.value,
    u: parts.unit ? parts.unit.toLowerCase() : null,
  });
  return `fnv1a:${fnv1a(canonical)}`;
}
