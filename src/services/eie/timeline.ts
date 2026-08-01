/**
 * EIE · Entity Timeline.
 *
 * Builds a chronological history for an entity directly from the evidence
 * that observed it. Every event cites the records behind it; nothing is
 * synthesised to fill a quiet period.
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import type { EieTimelineEvent } from "./types";
import { strongestGrade } from "./types";

const KIND_LABEL: Record<NormalizedEvidence["kind"], string> = {
  identity: "Identity recorded",
  position: "Position reported",
  voyage: "Voyage activity",
  ownership: "Ownership recorded",
  cargo: "Cargo documented",
  sanctions: "Sanctions screening",
  compliance: "Compliance record",
  "port-call": "Port call",
  inspection: "Inspection record",
  incident: "Incident reported",
  weather: "Environmental observation",
  other: "Observation",
};

function describe(record: NormalizedEvidence): string {
  const f = record.fields as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(f).slice(0, 4)) {
    const v = f[key];
    if (v === null || v === undefined || v === "") continue;
    parts.push(`${key}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  const detail = parts.length ? parts.join(" · ") : "no additional fields on this record";
  return `${record.sourceName} — ${detail}`;
}

/**
 * Collapse the records for one entity into a chronological timeline.
 * Records sharing the same timestamp AND evidence kind become one event
 * so the officer sees observations, not transport noise.
 */
export function buildTimeline(
  entityId: string,
  records: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<EieTimelineEvent> {
  const buckets = new Map<string, NormalizedEvidence[]>();
  for (const r of records) {
    const key = `${r.observedAt}::${r.kind}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const events: EieTimelineEvent[] = [];
  for (const [key, group] of buckets) {
    const [at, kind] = key.split("::") as [string, NormalizedEvidence["kind"]];
    const sorted = group.slice().sort((a, b) => a.id.localeCompare(b.id));
    events.push({
      at,
      entityId,
      kind,
      label: KIND_LABEL[kind] ?? "Observation",
      description: sorted.map(describe).join(" | "),
      grade: strongestGrade(sorted.map((r) => r.grade)),
      sources: Array.from(new Set(sorted.map((r) => r.source))).sort(),
      evidenceIds: sorted.map((r) => r.id),
    });
  }

  return events.sort((a, b) =>
    a.at === b.at ? a.kind.localeCompare(b.kind) : a.at.localeCompare(b.at),
  );
}
