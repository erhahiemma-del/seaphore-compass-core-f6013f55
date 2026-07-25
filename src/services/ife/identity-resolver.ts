/**
 * IFE — Cross-connector Identity Resolution.
 *
 * Different connectors describe the same real-world vessel/company/port
 * with different canonical ids (one uses `vessel:imo:9438291`, another
 * uses `vessel:mmsi:440825000`, a third uses `vessel:name:DONGWON NO.16`).
 * The correlator groups by `entity.id` verbatim, so without this pass a
 * single vessel becomes three separate canonical records and the officer
 * sees duplicated intelligence.
 *
 * This resolver runs BEFORE correlation. It:
 *   1. Extracts identity signals (IMO, MMSI, call sign, name, aliases)
 *      from every record's entity.id and fields.
 *   2. Groups records with matching identifiers or high name similarity
 *      into an identity cluster (union-find).
 *   3. Elects a canonical id per cluster (IMO > MMSI > call sign > name)
 *      and rewrites every record's entity ref to that id.
 *   4. Scores the cluster using the existing IdentityConfidenceScorer so
 *      the officer can see WHY records were merged.
 *
 * Pure. Deterministic. Never fabricates identity — if a record has no
 * shared signal with any other, it stays in its own cluster untouched.
 */
import type { CanonicalEntityRef, NormalizedEvidence } from "@/services/ial/types";
import {
  scoreIdentityCandidate,
  nameSimilarity,
  type IdentityCandidate,
  type IdentityConfidenceResult,
} from "@/intelligence/matching/identity-confidence";

const NAME_MERGE_THRESHOLD = 0.92;

export interface IdentityCluster {
  /** Elected canonical id (highest-precedence signal). */
  readonly canonicalId: string;
  readonly entityKind: CanonicalEntityRef["kind"];
  readonly label: string | null;
  /** Every entity id that fell into this cluster. */
  readonly aliasIds: ReadonlyArray<string>;
  /** All identity signals collected across the merged records. */
  readonly signals: {
    readonly imo: string | null;
    readonly mmsi: string | null;
    readonly callSign: string | null;
    readonly name: string | null;
    readonly aliases: ReadonlyArray<string>;
    readonly historicalNames: ReadonlyArray<string>;
    readonly flag: string | null;
  };
  /** Identity confidence for the merge (the strongest cluster member). */
  readonly confidence: IdentityConfidenceResult;
  /** Evidence ids inside this cluster. */
  readonly evidenceIds: ReadonlyArray<string>;
}

export interface IdentityResolution {
  /** Records rewritten so every entity.id points at its cluster canonical id. */
  readonly records: ReadonlyArray<NormalizedEvidence>;
  /** One entry per resolved entity. */
  readonly clusters: ReadonlyArray<IdentityCluster>;
}

interface Signals {
  imo: string | null;
  mmsi: string | null;
  callSign: string | null;
  name: string | null;
  aliases: Set<string>;
  historicalNames: Set<string>;
  flag: string | null;
}

function readStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractSignals(r: NormalizedEvidence): Signals {
  const f = r.fields as Record<string, unknown>;
  const s: Signals = {
    imo: readStr(f.imo) ?? readStr(f.IMO),
    mmsi: readStr(f.mmsi) ?? readStr(f.MMSI),
    callSign: readStr(f.callSign) ?? readStr(f.call_sign),
    name: readStr(f.name) ?? readStr(f.shipname) ?? readStr(r.entity.label ?? null),
    aliases: new Set<string>(),
    historicalNames: new Set<string>(),
    flag: readStr(f.flag) ?? readStr(f.flag_state),
  };
  // Pull id-embedded signals: vessel:imo:9438291 / vessel:mmsi:440825000
  const parts = r.entity.id.split(":");
  if (parts.length >= 3) {
    const kind = parts[1]?.toLowerCase();
    const val = parts.slice(2).join(":");
    if (kind === "imo" && !s.imo) s.imo = val;
    else if (kind === "mmsi" && !s.mmsi) s.mmsi = val;
    else if (kind === "callsign" && !s.callSign) s.callSign = val;
  }
  const aliasField = f.aliases;
  if (Array.isArray(aliasField)) for (const a of aliasField) { const v = readStr(a); if (v) s.aliases.add(v); }
  const histField = f.historicalNames ?? f.priorNames;
  if (Array.isArray(histField)) for (const h of histField) { const v = readStr(h); if (v) s.historicalNames.add(v); }
  return s;
}

function mergeSignals(a: Signals, b: Signals): Signals {
  return {
    imo: a.imo ?? b.imo,
    mmsi: a.mmsi ?? b.mmsi,
    callSign: a.callSign ?? b.callSign,
    name: a.name ?? b.name,
    aliases: new Set([...a.aliases, ...b.aliases]),
    historicalNames: new Set([...a.historicalNames, ...b.historicalNames]),
    flag: a.flag ?? b.flag,
  };
}

// ── Union-Find ──────────────────────────────────────────────────────────
class DSU {
  private parent = new Map<number, number>();
  find(x: number): number {
    let p = this.parent.get(x);
    if (p === undefined) { this.parent.set(x, x); return x; }
    while (p !== x) {
      const gp = this.parent.get(p) ?? p;
      this.parent.set(x, gp);
      x = p; p = gp;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a); const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function electCanonicalId(kind: CanonicalEntityRef["kind"], s: Signals, fallback: string): string {
  if (s.imo) return `${kind}:imo:${s.imo}`;
  if (s.mmsi) return `${kind}:mmsi:${s.mmsi}`;
  if (s.callSign) return `${kind}:callsign:${s.callSign.toUpperCase()}`;
  if (s.name) return `${kind}:name:${s.name.toLowerCase().replace(/\s+/g, "-")}`;
  return fallback;
}

/**
 * Group records by shared identity signal and rewrite every record's
 * `entity` reference to the cluster's canonical id.
 */
export function resolveIdentities(records: ReadonlyArray<NormalizedEvidence>): IdentityResolution {
  if (records.length === 0) return { records: [], clusters: [] };

  // Only vessels/companies participate in cross-connector merging today;
  // ports use UN/LOCODE and are already stable. Everything else passes
  // through unchanged.
  const mergeableIdx: number[] = [];
  const signals: Signals[] = new Array(records.length);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    signals[i] = extractSignals(r);
    if (r.entity.kind === "vessel" || r.entity.kind === "company" || r.entity.kind === "person") {
      mergeableIdx.push(i);
    }
  }

  const dsu = new DSU();
  // Bucket by strong identifiers first (fast, deterministic).
  const byImo = new Map<string, number>();
  const byMmsi = new Map<string, number>();
  const byCall = new Map<string, number>();
  for (const i of mergeableIdx) {
    const s = signals[i];
    if (s.imo) {
      const anchor = byImo.get(s.imo);
      if (anchor !== undefined) dsu.union(i, anchor); else byImo.set(s.imo, i);
    }
    if (s.mmsi) {
      const anchor = byMmsi.get(s.mmsi);
      if (anchor !== undefined) dsu.union(i, anchor); else byMmsi.set(s.mmsi, i);
    }
    if (s.callSign) {
      const key = s.callSign.toUpperCase();
      const anchor = byCall.get(key);
      if (anchor !== undefined) dsu.union(i, anchor); else byCall.set(key, i);
    }
  }
  // Second pass: fuzzy-name merge, only when no strong id disagreement exists.
  for (let a = 0; a < mergeableIdx.length; a++) {
    for (let b = a + 1; b < mergeableIdx.length; b++) {
      const i = mergeableIdx[a]; const j = mergeableIdx[b];
      const si = signals[i]; const sj = signals[j];
      if (dsu.find(i) === dsu.find(j)) continue;
      if (si.imo && sj.imo && si.imo !== sj.imo) continue;
      if (si.mmsi && sj.mmsi && si.mmsi !== sj.mmsi) continue;
      if (records[i].entity.kind !== records[j].entity.kind) continue;
      const sim = nameSimilarity(si.name, sj.name);
      if (sim >= NAME_MERGE_THRESHOLD) dsu.union(i, j);
    }
  }

  // Build clusters.
  interface Bucket {
    kind: CanonicalEntityRef["kind"];
    indices: number[];
    signals: Signals;
    aliasIds: Set<string>;
    label: string | null;
  }
  const clusterMap = new Map<number, Bucket>();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const root = (r.entity.kind === "vessel" || r.entity.kind === "company" || r.entity.kind === "person")
      ? dsu.find(i)
      : i; // non-mergeable: cluster of one
    let bucket = clusterMap.get(root);
    if (!bucket) {
      bucket = {
        kind: r.entity.kind,
        indices: [],
        signals: signals[i] ?? extractSignals(r),
        aliasIds: new Set(),
        label: r.entity.label ?? null,
      };
      clusterMap.set(root, bucket);
    } else {
      bucket.signals = mergeSignals(bucket.signals, signals[i] ?? extractSignals(r));
      if (!bucket.label && r.entity.label) bucket.label = r.entity.label;
    }
    bucket.indices.push(i);
    bucket.aliasIds.add(r.entity.id);
  }

  // Elect canonical id per cluster + rewrite records.
  const rewritten: NormalizedEvidence[] = new Array(records.length);
  const clusters: IdentityCluster[] = [];
  for (const bucket of clusterMap.values()) {
    const canonicalId = electCanonicalId(bucket.kind, bucket.signals, records[bucket.indices[0]].entity.id);
    const label = bucket.label ?? bucket.signals.name ?? canonicalId;
    for (const i of bucket.indices) {
      const r = records[i];
      rewritten[i] = r.entity.id === canonicalId
        ? r
        : { ...r, entity: { kind: bucket.kind, id: canonicalId, label } };
    }
    // Confidence: score the cluster's strongest name/imo/mmsi against itself.
    const query = bucket.signals.imo ?? bucket.signals.mmsi ?? bucket.signals.name ?? label;
    const candidate: IdentityCandidate = {
      id: canonicalId,
      name: bucket.signals.name,
      imo: bucket.signals.imo,
      mmsi: bucket.signals.mmsi,
      callSign: bucket.signals.callSign,
      flag: bucket.signals.flag,
      aliases: Array.from(bucket.signals.aliases),
      historicalNames: Array.from(bucket.signals.historicalNames),
    };
    const confidence = scoreIdentityCandidate(candidate, {
      query,
      hints: {
        imo: bucket.signals.imo ?? undefined,
        mmsi: bucket.signals.mmsi ?? undefined,
        callSign: bucket.signals.callSign ?? undefined,
        flag: bucket.signals.flag ?? undefined,
      },
    });
    clusters.push({
      canonicalId,
      entityKind: bucket.kind,
      label,
      aliasIds: Array.from(bucket.aliasIds),
      signals: {
        imo: bucket.signals.imo,
        mmsi: bucket.signals.mmsi,
        callSign: bucket.signals.callSign,
        name: bucket.signals.name,
        aliases: Array.from(bucket.signals.aliases),
        historicalNames: Array.from(bucket.signals.historicalNames),
        flag: bucket.signals.flag,
      },
      confidence,
      evidenceIds: bucket.indices.map((i) => records[i].id),
    });
  }

  return { records: rewritten, clusters };
}
