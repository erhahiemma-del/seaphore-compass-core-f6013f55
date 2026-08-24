/**
 * NPA progressive ingestion — immutable daily snapshots.
 *
 * ## Why snapshots rather than a current-state table
 *
 * A table of "vessels expected today", updated in place, answers exactly
 * one question and destroys the answer to every other one. Once today's
 * row overwrites yesterday's, nobody can ask whether the ETA moved, how
 * long a vessel waited, or whether the schedule is reliable — and those
 * are the questions that make a port schedule intelligence rather than a
 * noticeboard.
 *
 * So every retrieval is preserved whole. Seaphore accumulates its own
 * historical NPA dataset one day at a time, and the analytics come later
 * for free.
 *
 * ## Snapshots are immutable
 *
 * Frozen at construction. There is no update path and no delete path.
 * A correction is a new snapshot, not an edit — an observation that was
 * wrong is still an observation we made, and erasing it would make the
 * change history lie.
 *
 * ## A failed fetch is never an empty snapshot
 *
 * The single most dangerous bug available here: storing zero records
 * because the source was unreachable, and rendering it as "no vessels
 * expected". `ingest()` refuses to build a snapshot from a failed fetch
 * and returns an `IngestionFailure` carrying the last good snapshot
 * instead.
 */
import { stableHash } from "@/services/ial/hash";

import type { FetchResult } from "../adapter";
import type { PortSchedule } from "./models";

/** Datasets that can be snapshotted. */
export type NpaDatasetKey =
  | "NPA_DAILY_SHIPPING_SCHEDULE"
  | "NPA_VESSELS_EXPECTED"
  | "NPA_AWAITING_BERTH"
  | "NPA_AT_BERTH"
  | "NPA_DEPARTED";

export type ProcessingStatus = "RAW" | "NORMALIZED" | "VALIDATED" | "FAILED";

export type LicenseStatus = "APPROVED" | "REVIEW_REQUIRED" | "RESTRICTED" | "UNKNOWN";

/**
 * One record inside a snapshot.
 *
 * Both the raw payload and the normalised record are kept. The raw is the
 * evidence — if normalisation is later found wrong, every past snapshot
 * can be re-normalised without re-fetching data that no longer exists
 * upstream.
 */
export interface SnapshotRecord {
  readonly snapshotId: string;
  readonly sourceRecordId: string | null;
  /** Exactly what the source returned for this row. Never edited. */
  readonly rawPayload: unknown;
  readonly normalizedRecord: PortSchedule;
  readonly sourceTimestamp: string | null;
  readonly retrievedAt: string;
  readonly contentHash: string;
}

/** An immutable daily observation of one NPA dataset. */
export interface NpaDailySnapshot {
  readonly snapshotId: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly dataset: NpaDatasetKey;
  /** The calendar day this snapshot describes, `YYYY-MM-DD`. */
  readonly snapshotDate: string;
  readonly sourceTimestamp: string | null;
  readonly retrievedAt: string;
  readonly retrievalMethod: string;
  readonly recordCount: number;
  /** Hash over the normalised records. Identical data ⇒ identical hash. */
  readonly contentHash: string;
  readonly schemaVersion: string;
  readonly processingStatus: ProcessingStatus;
  readonly licenseStatus: LicenseStatus;
  readonly records: readonly SnapshotRecord[];
}

/**
 * A retrieval that failed.
 *
 * Recorded as its own kind of outcome so the absence of a snapshot for a
 * day is explicable rather than merely missing.
 */
export interface IngestionFailure {
  readonly kind: "INGESTION_FAILED";
  readonly attemptedAt: string;
  readonly source: string;
  readonly dataset: NpaDatasetKey;
  readonly error: string;
  /** So the UI can say how stale the last good picture is. */
  readonly lastSuccessfulSnapshot: {
    readonly snapshotId: string;
    readonly snapshotDate: string;
    readonly retrievedAt: string;
    readonly recordCount: number;
  } | null;
}

export type IngestionOutcome =
  | { readonly kind: "SNAPSHOT"; readonly snapshot: NpaDailySnapshot }
  | IngestionFailure;

/** `YYYY-MM-DD` in UTC. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Identity of a vessel *across* snapshots.
 *
 * IMO when present — it is the only stable maritime identifier. Otherwise
 * name plus terminal, which is weaker but scoped: two vessels sharing a
 * name at the same terminal on the same schedule is rare enough to accept,
 * and the alternative is losing every un-numbered vessel from the change
 * history entirely.
 *
 * Never a fuzzy match. A near-miss on a name is a different vessel.
 */
export function snapshotVesselKey(record: PortSchedule): string {
  if (record.vessel.imo) return `imo:${record.vessel.imo}`;
  const name = record.vessel.name.trim().toLowerCase();
  const terminal = (record.terminalName ?? "").trim().toLowerCase();
  return `name:${name}|terminal:${terminal}`;
}

/**
 * Build an immutable snapshot from a successful fetch.
 *
 * Deep-frozen, so a caller holding a reference cannot alter history —
 * accidentally or otherwise.
 */
export function createSnapshot(args: {
  readonly dataset: NpaDatasetKey;
  readonly source: string;
  readonly sourceUrl: string;
  readonly retrievalMethod: string;
  readonly records: readonly PortSchedule[];
  readonly rawPayloads?: readonly unknown[];
  readonly sourceTimestamp: string | null;
  readonly retrievedAt: string;
  readonly schemaVersion: string;
  readonly licenseStatus?: LicenseStatus;
}): NpaDailySnapshot {
  const snapshotId = `snap:${args.dataset}:${dayOf(args.retrievedAt)}:${stableHash({
    dataset: args.dataset,
    retrievedAt: args.retrievedAt,
  }).slice(0, 12)}`;

  const records: SnapshotRecord[] = args.records.map((record, index) => ({
    snapshotId,
    sourceRecordId: record.sourceRecordId,
    rawPayload: args.rawPayloads?.[index] ?? null,
    normalizedRecord: record,
    sourceTimestamp: record.sourceTimestamp,
    retrievedAt: record.retrievedAt,
    contentHash: record.contentHash,
  }));

  const snapshot: NpaDailySnapshot = {
    snapshotId,
    source: args.source,
    sourceUrl: args.sourceUrl,
    dataset: args.dataset,
    snapshotDate: dayOf(args.retrievedAt),
    sourceTimestamp: args.sourceTimestamp,
    retrievedAt: args.retrievedAt,
    retrievalMethod: args.retrievalMethod,
    recordCount: records.length,
    // Over the normalised content, so re-running an unchanged day
    // produces an identical hash and change detection reports nothing.
    contentHash: stableHash(records.map((r) => r.contentHash).sort()),
    schemaVersion: args.schemaVersion,
    processingStatus: "NORMALIZED",
    licenseStatus: args.licenseStatus ?? "REVIEW_REQUIRED",
    records: Object.freeze(records.map((r) => Object.freeze(r))),
  };

  return Object.freeze(snapshot);
}

/**
 * Turn a fetch result into an ingestion outcome.
 *
 * The guard that matters: a fetch which did not succeed **never** becomes
 * a snapshot, however many records it carries. Zero records from a
 * healthy source is a real observation — the schedule was empty. Zero
 * records from a failed one is our blindness, and storing it as a
 * snapshot would make an outage indistinguishable from a quiet day.
 */
export function ingest(
  result: FetchResult<PortSchedule>,
  dataset: NpaDatasetKey,
  lastSuccessful: NpaDailySnapshot | null,
  options: { readonly schemaVersion: string; readonly licenseStatus?: LicenseStatus },
): IngestionOutcome {
  if (result.health !== "UP" || result.unavailableReason) {
    return {
      kind: "INGESTION_FAILED",
      attemptedAt: result.retrievedAt,
      source: result.sourceId,
      dataset,
      error:
        result.unavailableReason ??
        `Source reported health ${result.health}; no snapshot was recorded.`,
      lastSuccessfulSnapshot: lastSuccessful
        ? {
            snapshotId: lastSuccessful.snapshotId,
            snapshotDate: lastSuccessful.snapshotDate,
            retrievedAt: lastSuccessful.retrievedAt,
            recordCount: lastSuccessful.recordCount,
          }
        : null,
    };
  }

  return {
    kind: "SNAPSHOT",
    snapshot: createSnapshot({
      dataset,
      source: result.sourceId,
      sourceUrl: result.records[0]?.sourceUrl ?? "",
      retrievalMethod: result.route ?? "unknown",
      records: result.records,
      sourceTimestamp: result.sourceTimestamp,
      retrievedAt: result.retrievedAt,
      schemaVersion: options.schemaVersion,
      licenseStatus: options.licenseStatus,
    }),
  };
}

/**
 * Officer-facing description of an ingestion failure.
 *
 * Deliberately never phrased as an absence of vessels. "NPA data
 * unavailable — last successful snapshot 19 Aug" and "no vessels
 * expected" are opposite claims, and the UI must not be able to confuse
 * them.
 */
export function describeFailure(failure: IngestionFailure): string {
  const last = failure.lastSuccessfulSnapshot;
  return last
    ? `NPA data unavailable — last successful snapshot ${last.snapshotDate} (${last.recordCount} records, retrieved ${last.retrievedAt}).`
    : "NPA data unavailable — no successful snapshot has ever been recorded for this dataset.";
}

/** Days of continuous coverage. Gates historical analytics. */
export function coverageDays(snapshots: readonly NpaDailySnapshot[]): number {
  return new Set(snapshots.map((s) => s.snapshotDate)).size;
}

/**
 * Whether enough history exists for an analysis window.
 *
 * Analytics stay hidden until the data supports them: a "90-day average"
 * computed over four days of snapshots is a fabricated statistic wearing
 * a real label.
 */
export function hasCoverageFor(
  snapshots: readonly NpaDailySnapshot[],
  windowDays: number,
): { readonly sufficient: boolean; readonly have: number; readonly need: number } {
  const have = coverageDays(snapshots);
  return { sufficient: have >= windowDays, have, need: windowDays };
}
