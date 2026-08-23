/**
 * NpaChangeDetectionService.
 *
 * Compares consecutive snapshots and reports what moved.
 *
 * ## Change is the intelligence
 *
 * A single day's schedule says what NPA expects. Two days say whether
 * NPA's expectation is holding — and an ETA that has slipped three times
 * is a different operational fact from one published once. Everything
 * downstream (ETA reliability, berth waiting time, schedule performance,
 * congestion) is derived from these diffs rather than from any single
 * snapshot.
 *
 * ## Every change keeps both sides
 *
 * `oldValue` and `newValue` are retained with both snapshot ids, so a
 * change can always be traced back to the two observations that produced
 * it. Nothing here overwrites; the snapshots remain immutable and this
 * module only reads them.
 *
 * ## Absence is not departure
 *
 * A vessel disappearing from the expected list usually means it arrived,
 * sometimes means the schedule was corrected, and occasionally means the
 * fetch was partial. `REMOVED_VESSEL` therefore states the observation —
 * it left the dataset — and never asserts why.
 */
import type { PortSchedule } from "./models";
import { snapshotVesselKey, type NpaDailySnapshot } from "./snapshot";

export type NpaChangeType =
  | "NEW_VESSEL"
  | "REMOVED_VESSEL"
  | "ETA_CHANGED"
  | "ETD_CHANGED"
  | "PORT_CHANGED"
  | "TERMINAL_CHANGED"
  | "BERTH_CHANGED"
  | "STATUS_CHANGED"
  | "CARGO_CHANGED"
  | "TONNAGE_CHANGED"
  | "AGENT_CHANGED"
  | "VESSEL_DIMENSION_CHANGED";

export interface NpaChange {
  readonly type: NpaChangeType;
  /** Stable across snapshots. IMO where available. */
  readonly vesselKey: string;
  readonly vesselName: string;
  readonly imo: string | null;
  readonly fieldChanged: string | null;
  readonly oldValue: string | number | null;
  readonly newValue: string | number | null;
  readonly previousSnapshot: string;
  readonly currentSnapshot: string;
  readonly detectedAt: string;
  readonly source: string;
  /** Officer-facing sentence. Describes the change, never its cause. */
  readonly detail: string;
}

/** Fields compared field-by-field, with the change each emits. */
const TRACKED_FIELDS: readonly {
  readonly field: keyof PortSchedule;
  readonly type: NpaChangeType;
  readonly label: string;
}[] = [
  { field: "eta", type: "ETA_CHANGED", label: "ETA" },
  { field: "etd", type: "ETD_CHANGED", label: "ETD" },
  { field: "portName", type: "PORT_CHANGED", label: "Port" },
  { field: "terminalName", type: "TERMINAL_CHANGED", label: "Terminal" },
  { field: "berthName", type: "BERTH_CHANGED", label: "Berth" },
  { field: "status", type: "STATUS_CHANGED", label: "Status" },
  { field: "cargo", type: "CARGO_CHANGED", label: "Cargo" },
  { field: "commodity", type: "CARGO_CHANGED", label: "Commodity" },
  { field: "tonnage", type: "TONNAGE_CHANGED", label: "Tonnage" },
  { field: "agent", type: "AGENT_CHANGED", label: "Agent" },
];

function scalar(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : String(value);
}

/** Index a snapshot's records by cross-snapshot vessel key. */
function indexByVessel(snapshot: NpaDailySnapshot): Map<string, PortSchedule> {
  const index = new Map<string, PortSchedule>();
  for (const record of snapshot.records) {
    const key = snapshotVesselKey(record.normalizedRecord);
    // First occurrence wins. A vessel listed twice in one snapshot is a
    // rotation, and the second row is its own schedule event rather than
    // a correction of the first.
    if (!index.has(key)) index.set(key, record.normalizedRecord);
  }
  return index;
}

/**
 * Compare two consecutive snapshots of the same dataset.
 *
 * Throws on a dataset mismatch: diffing "expected" against "at berth"
 * would report every vessel as new and every one as removed, which is
 * noise dressed as intelligence.
 */
export function detectChanges(
  previous: NpaDailySnapshot,
  current: NpaDailySnapshot,
  now: number = Date.now(),
): readonly NpaChange[] {
  if (previous.dataset !== current.dataset) {
    throw new Error(
      `Cannot diff ${previous.dataset} against ${current.dataset} — snapshots must be of the same dataset.`,
    );
  }

  // Identical content means nothing moved. Cheap exit that also makes a
  // re-run of the same day a no-op rather than a wall of false changes.
  if (previous.contentHash === current.contentHash) return [];

  const detectedAt = new Date(now).toISOString();
  const before = indexByVessel(previous);
  const after = indexByVessel(current);
  const changes: NpaChange[] = [];

  const base = (record: PortSchedule, key: string) => ({
    vesselKey: key,
    vesselName: record.vessel.name,
    imo: record.vessel.imo,
    previousSnapshot: previous.snapshotId,
    currentSnapshot: current.snapshotId,
    detectedAt,
    source: current.source,
  });

  for (const [key, record] of after) {
    const prior = before.get(key);

    if (!prior) {
      changes.push({
        ...base(record, key),
        type: "NEW_VESSEL",
        fieldChanged: null,
        oldValue: null,
        newValue: record.vessel.name,
        detail: `${record.vessel.name} appeared on the ${current.dataset} list${
          record.terminalName ? ` for ${record.terminalName}` : ""
        }.`,
      });
      continue;
    }

    for (const { field, type, label } of TRACKED_FIELDS) {
      const oldValue = scalar(prior[field]);
      const newValue = scalar(record[field]);
      if (oldValue === newValue) continue;
      // A field appearing for the first time is enrichment, not a change:
      // reporting "Agent changed: null → Acme" as a schedule change would
      // bury the real ones.
      if (oldValue === null) continue;

      changes.push({
        ...base(record, key),
        type,
        fieldChanged: String(field),
        oldValue,
        newValue,
        detail: `${record.vessel.name}: ${label} ${describeValue(oldValue)} → ${describeValue(newValue)}.`,
      });
    }

    // Dimensions live on the nested vessel object.
    const oldLength = prior.vessel.lengthM;
    const newLength = record.vessel.lengthM;
    if (oldLength !== null && newLength !== null && oldLength !== newLength) {
      changes.push({
        ...base(record, key),
        type: "VESSEL_DIMENSION_CHANGED",
        fieldChanged: "vessel.lengthM",
        oldValue: oldLength,
        newValue: newLength,
        // Worth surfacing: a vessel's length does not change, so this is
        // either a data-quality problem or two different vessels sharing
        // an identity.
        detail: `${record.vessel.name}: length ${oldLength} m → ${newLength} m. A vessel's length does not change; treat as a data-quality signal.`,
      });
    }
  }

  for (const [key, record] of before) {
    if (after.has(key)) continue;
    changes.push({
      ...base(record, key),
      type: "REMOVED_VESSEL",
      fieldChanged: null,
      oldValue: record.vessel.name,
      newValue: null,
      // States the observation, not a cause.
      detail: `${record.vessel.name} is no longer on the ${current.dataset} list. This may mean the vessel progressed, or that the schedule was revised.`,
    });
  }

  return changes;
}

function describeValue(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") return String(value);
  // Render ISO timestamps as something an officer reads at a glance.
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? `${value.slice(0, 16).replace("T", " ")}Z` : value;
}

/* ─────────────────────────── ETA history ─────────────────────────── */

/** One observation of a vessel's ETA, and how it moved. */
export interface EtaObservationPoint {
  readonly snapshotId: string;
  readonly snapshotDate: string;
  readonly observedAt: string;
  readonly eta: string;
  /** Milliseconds moved since the previous observation. Null for the first. */
  readonly deltaMs: number | null;
}

export interface EtaHistory {
  readonly vesselKey: string;
  readonly vesselName: string;
  readonly imo: string | null;
  readonly points: readonly EtaObservationPoint[];
  /** Net movement from first to last ETA. Positive means later. */
  readonly netDriftMs: number;
  /** How many times the ETA moved at all. */
  readonly revisions: number;
}

/**
 * Reconstruct a vessel's ETA history across snapshots.
 *
 * The ETA is never overwritten anywhere in this domain, so the history is
 * simply read back out of the snapshots in order. An ETA that went
 * 16:00 → 17:20 → 18:30 is three observations and a +2h30m drift, and
 * both facts matter: the drift for delay analysis, the count for
 * schedule reliability.
 */
export function etaHistory(
  snapshots: readonly NpaDailySnapshot[],
  vesselKey: string,
): EtaHistory | null {
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt),
  );

  const points: EtaObservationPoint[] = [];
  let vesselName = "";
  let imo: string | null = null;
  let previousEta: number | null = null;

  for (const snapshot of ordered) {
    const record = snapshot.records.find(
      (r) => snapshotVesselKey(r.normalizedRecord) === vesselKey,
    )?.normalizedRecord;
    if (!record?.eta) continue;

    vesselName = record.vessel.name;
    imo = record.vessel.imo;
    const etaMs = Date.parse(record.eta);
    if (Number.isNaN(etaMs)) continue;

    // Only record when it actually moved — a repeated identical ETA is
    // the same observation restated, not a revision.
    if (previousEta !== null && etaMs === previousEta) continue;

    points.push({
      snapshotId: snapshot.snapshotId,
      snapshotDate: snapshot.snapshotDate,
      observedAt: snapshot.retrievedAt,
      eta: record.eta,
      deltaMs: previousEta === null ? null : etaMs - previousEta,
    });
    previousEta = etaMs;
  }

  if (points.length === 0) return null;

  const first = Date.parse(points[0].eta);
  const last = Date.parse(points[points.length - 1].eta);

  return {
    vesselKey,
    vesselName,
    imo,
    points,
    netDriftMs: last - first,
    revisions: Math.max(0, points.length - 1),
  };
}

/** Officer-facing drift, e.g. "+2h 30m". */
export function describeDrift(deltaMs: number): string {
  const sign = deltaMs >= 0 ? "+" : "−";
  const abs = Math.abs(deltaMs);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.round((abs % 3_600_000) / 60_000);
  if (hours === 0) return `${sign}${minutes}m`;
  return `${sign}${hours}h ${minutes}m`;
}

/**
 * Every vessel whose ETA moved between two snapshots.
 *
 * Convenience over `detectChanges` for the Copilot question "which
 * vessels changed their ETA?".
 */
export function etaChanges(changes: readonly NpaChange[]): readonly NpaChange[] {
  return changes.filter((change) => change.type === "ETA_CHANGED");
}

/** Group changes by type, for a triage summary. */
export function summarizeChanges(
  changes: readonly NpaChange[],
): readonly { readonly type: NpaChangeType; readonly count: number }[] {
  const counts = new Map<NpaChangeType, number>();
  for (const change of changes) {
    counts.set(change.type, (counts.get(change.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}
