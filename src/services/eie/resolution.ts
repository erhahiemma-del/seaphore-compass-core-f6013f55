/**
 * EIE · Entity Resolution.
 *
 * Merges duplicate canonical ids that describe the same real-world entity.
 * Six rules, in priority order:
 *
 *   1. IMO number              (vessels — authoritative, immutable)
 *   2. Bill of Lading number   (documentary chain)
 *   3. Container number        (ISO 6346)
 *   4. Company registration    (RC / CAC / Companies House)
 *   5. MMSI                    (re-assignable, so ranked below IMO)
 *   6. Name similarity         (last resort, always INFERRED-strength)
 *
 * Two ids only ever merge when they are the same entity type AND share a
 * matching key. Every merge is returned as an explained cluster — a merge
 * the officer cannot audit is a Golden Rule violation.
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import type { EieEntityType, EieResolutionCluster, EieResolutionRule } from "./types";

const RULE_PRIORITY: ReadonlyArray<EieResolutionRule> = [
  "imo",
  "bill-of-lading",
  "container-number",
  "company-registration",
  "mmsi",
  "name-similarity",
];

const RULE_CONFIDENCE: Record<EieResolutionRule, number> = {
  imo: 0.99,
  "bill-of-lading": 0.95,
  "container-number": 0.95,
  "company-registration": 0.93,
  mmsi: 0.85,
  "name-similarity": 0.7,
};

const RULE_LABEL: Record<EieResolutionRule, string> = {
  imo: "IMO number",
  "bill-of-lading": "Bill of Lading number",
  "container-number": "Container number",
  "company-registration": "Company registration",
  mmsi: "MMSI",
  "name-similarity": "Name similarity",
};

/** Derive the EIE entity type from a canonical id, with an optional hint. */
export function deriveEntityType(id: string, hint?: EieEntityType): EieEntityType {
  if (hint) return hint;
  const [head, second] = id.split(":");
  switch (head) {
    case "vessel":
      return "vessel";
    case "company":
      return "company";
    case "person":
      return "person";
    case "port":
      return "port";
    case "terminal":
      return "terminal";
    case "voyage":
      return "voyage";
    case "importer":
      return "importer";
    case "exporter":
      return "exporter";
    case "consignee":
      return "consignee";
    case "container":
      return "container";
    case "manifest":
      return "manifest";
    case "bol":
      return "bill-of-lading";
    case "cargo":
      switch (second) {
        case "manifest":
          return "manifest";
        case "bol":
        case "bill-of-lading":
          return "bill-of-lading";
        case "container":
          return "container";
        case "voyage":
          return "voyage";
        case "company":
          return "company";
        case "port":
          return "port";
        case "terminal":
          return "terminal";
        default:
          return "cargo";
      }
    default:
      return "cargo";
  }
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(mv|m\/v|ms|the)\b/g, " ")
    .replace(/\b(ltd|limited|plc|inc|llc|corp|corporation|co|company|sa|nv|bv|gmbh|pte)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0..1 similarity over normalised names. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

export const NAME_SIMILARITY_THRESHOLD = 0.9;

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Extract every identity key an evidence record asserts about its entity. */
export function extractIdentityKeys(
  record: NormalizedEvidence,
): ReadonlyArray<{ rule: EieResolutionRule; key: string }> {
  const out: { rule: EieResolutionRule; key: string }[] = [];
  const f = record.fields as Record<string, unknown>;
  const id = record.entity.id;
  const segs = id.split(":");

  const push = (rule: EieResolutionRule, raw: string | null): void => {
    if (!raw) return;
    const key = raw.replace(/\s+/g, "").toUpperCase();
    if (!key) return;
    if (!out.some((o) => o.rule === rule && o.key === key)) out.push({ rule, key });
  };

  // Canonical id namespaces carry the strongest key directly.
  if (segs[0] === "vessel" && segs[1] === "imo") push("imo", segs[2]);
  if (segs[0] === "vessel" && segs[1] === "mmsi") push("mmsi", segs[2]);
  if (segs[1] === "container") push("container-number", segs.slice(2).join(":"));
  if (segs[1] === "bol" || segs[1] === "bill-of-lading") {
    push("bill-of-lading", segs[segs.length - 1]);
  }
  if (segs[0] === "company" && segs.length >= 3) push("company-registration", segs.slice(2).join(":"));

  push("imo", str(f.imo ?? f.imoNumber));
  push("mmsi", str(f.mmsi));
  push("container-number", str(f.containerNumber ?? f.container_no ?? f.containerId));
  push("bill-of-lading", str(f.billOfLading ?? f.bolNumber ?? f.bl_number));
  push(
    "company-registration",
    str(f.registrationNumber ?? f.companyRegistration ?? f.rcNumber ?? f.regNumber),
  );
  return out;
}

interface IdFacts {
  readonly type: EieEntityType;
  readonly labels: Set<string>;
  readonly keys: Map<EieResolutionRule, Set<string>>;
}

export interface ResolutionResult {
  /** id → canonical id it resolved into (identity for unmerged ids). */
  readonly canonicalOf: ReadonlyMap<string, string>;
  readonly clusters: ReadonlyArray<EieResolutionCluster>;
  readonly duplicatesResolved: number;
}

/**
 * Resolve every canonical id observed in `records` into a merged identity.
 * Deterministic: the same evidence always produces the same clusters.
 */
export function resolveDuplicates(
  records: ReadonlyArray<NormalizedEvidence>,
): ResolutionResult {
  const facts = new Map<string, IdFacts>();
  for (const r of records) {
    const id = r.entity.id;
    let entry = facts.get(id);
    if (!entry) {
      entry = { type: deriveEntityType(id), labels: new Set(), keys: new Map() };
      facts.set(id, entry);
    }
    if (r.entity.label) entry.labels.add(r.entity.label);
    for (const { rule, key } of extractIdentityKeys(r)) {
      if (!entry.keys.has(rule)) entry.keys.set(rule, new Set());
      entry.keys.get(rule)!.add(key);
    }
  }

  const ids = Array.from(facts.keys()).sort();
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const merges: { rule: EieResolutionRule; key: string; a: string; b: string }[] = [];
  const union = (a: string, b: string, rule: EieResolutionRule, key: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent.set(rb, ra);
    merges.push({ rule, key, a, b });
  };

  // Key-based merges, strongest rule first.
  for (const rule of RULE_PRIORITY) {
    if (rule === "name-similarity") continue;
    const byKey = new Map<string, string[]>();
    for (const id of ids) {
      const keys = facts.get(id)!.keys.get(rule);
      if (!keys) continue;
      for (const k of keys) {
        const bucketKey = `${facts.get(id)!.type}::${k}`;
        if (!byKey.has(bucketKey)) byKey.set(bucketKey, []);
        byKey.get(bucketKey)!.push(id);
      }
    }
    for (const [bucketKey, members] of Array.from(byKey.entries()).sort()) {
      if (members.length < 2) continue;
      const sorted = members.slice().sort();
      for (let i = 1; i < sorted.length; i++) {
        union(sorted[0], sorted[i], rule, bucketKey.split("::")[1]);
      }
    }
  }

  // Name-similarity pass — only for ids not already merged by a hard key.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const fa = facts.get(a)!;
      const fb = facts.get(b)!;
      if (fa.type !== fb.type) continue;
      if (find(a) === find(b)) continue;
      let best = 0;
      let bestPair = "";
      for (const la of fa.labels) {
        for (const lb of fb.labels) {
          if (normalizeName(la).length < 4 || normalizeName(lb).length < 4) continue;
          const s = nameSimilarity(la, lb);
          if (s > best) {
            best = s;
            bestPair = `${la} ≈ ${lb}`;
          }
        }
      }
      if (best >= NAME_SIMILARITY_THRESHOLD) {
        union(a, b, "name-similarity", bestPair);
      }
    }
  }

  // Choose a canonical id per group: strongest available rule key wins.
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  const canonicalOf = new Map<string, string>();
  const canonicalByRoot = new Map<string, string>();
  for (const [root, members] of groups) {
    const ranked = members.slice().sort((a, b) => {
      const ra = RULE_PRIORITY.findIndex((r) => facts.get(a)!.keys.has(r));
      const rb = RULE_PRIORITY.findIndex((r) => facts.get(b)!.keys.has(r));
      const na = ra === -1 ? RULE_PRIORITY.length : ra;
      const nb = rb === -1 ? RULE_PRIORITY.length : rb;
      return na !== nb ? na - nb : a.localeCompare(b);
    });
    const canonical = ranked[0];
    canonicalByRoot.set(root, canonical);
    for (const m of members) canonicalOf.set(m, canonical);
  }

  // Explain each merge as a cluster on the canonical id.
  const clusterMap = new Map<string, EieResolutionCluster>();
  for (const m of merges) {
    const canonical = canonicalByRoot.get(find(m.a))!;
    const members = new Set<string>([m.a, m.b]);
    const existing = clusterMap.get(`${canonical}::${m.rule}::${m.key}`);
    if (existing) for (const x of existing.memberIds) members.add(x);
    clusterMap.set(`${canonical}::${m.rule}::${m.key}`, {
      canonicalId: canonical,
      memberIds: Array.from(members).sort(),
      rule: m.rule,
      key: m.key,
      confidence: RULE_CONFIDENCE[m.rule],
      explanation:
        m.rule === "name-similarity"
          ? `Merged on name similarity (${m.key}) — inferred, not an authoritative identifier.`
          : `Merged on matching ${RULE_LABEL[m.rule]} ${m.key}.`,
    });
  }

  const clusters = Array.from(clusterMap.values()).sort((a, b) =>
    a.canonicalId === b.canonicalId
      ? a.rule.localeCompare(b.rule)
      : a.canonicalId.localeCompare(b.canonicalId),
  );

  return {
    canonicalOf,
    clusters,
    duplicatesResolved: ids.length - groups.size,
  };
}
