/**
 * Evidence timeline for a single (entity, field).
 *
 * Marks the winning record as `latest`, the next one as `previous`, older
 * ones as `historical`, and any losing candidate as `superseded`.
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import type { FusedFieldTimelineEntry } from "./types";
import type { ValueCandidate } from "./fusion-rules";
import { valueKey } from "./conflict-detector";

export function buildFieldTimeline(
  field: string,
  winner: ValueCandidate,
  losers: ReadonlyArray<ValueCandidate>,
): FusedFieldTimelineEntry[] {
  const winnerKey = valueKey(winner.value);
  const all: Array<{ rec: NormalizedEvidence; superseded: boolean }> = [];
  for (const r of winner.records) all.push({ rec: r, superseded: false });
  for (const l of losers) for (const r of l.records) all.push({ rec: r, superseded: true });

  // Newest first.
  all.sort((a, b) => tsMs(b.rec.observedAt) - tsMs(a.rec.observedAt));

  const entries: FusedFieldTimelineEntry[] = [];
  let winnerIndex = 0;
  for (const item of all) {
    const value = item.rec.fields[field] ?? null;
    let status: FusedFieldTimelineEntry["status"];
    if (item.superseded) {
      status = "superseded";
    } else if (valueKey(value) === winnerKey) {
      if (winnerIndex === 0) status = "latest";
      else if (winnerIndex === 1) status = "previous";
      else status = "historical";
      winnerIndex += 1;
    } else {
      status = "superseded";
    }
    entries.push({
      value,
      observedAt: item.rec.observedAt,
      source: item.rec.source,
      evidenceId: item.rec.id,
      status,
    });
  }
  return entries;
}

function tsMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}
