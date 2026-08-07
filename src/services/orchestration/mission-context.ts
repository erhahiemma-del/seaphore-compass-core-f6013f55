/**
 * LAYER 2.2 — Mission Context.
 *
 * The subject an officer currently has open, or nothing.
 *
 * ## Why nullable, and why transient
 *
 * Before G6.0 the console booted with an investigation already selected
 * (`useState("inv-ocean-pearl")`) and fell back to a hardcoded vessel name
 * wherever context was absent. The effect was that there was no such state
 * as "no investigation": every question was asked against a subject, and
 * an officer looking at the whole fleet was silently looking at one vessel.
 *
 * So mission context is `null` until an officer opens something, and
 * returns to `null` when they close it. `null` is the normal state, not an
 * error state.
 *
 * Lifecycle, exactly:
 *
 *   null ──open(vessel A)──▶ A ──open(vessel B)──▶ B ──close()──▶ null
 *
 * Opening replaces rather than stacks. A second subject means the officer
 * moved on; keeping the first would be the contamination this removes.
 *
 * ## This is not the mission *store*
 *
 * `@/stores/mission-context.store` persists the rich per-investigation
 * workspace (evidence, tasks, hypotheses, conversation). This module owns
 * only the question "what, if anything, is the officer looking at?", in a
 * form the orchestration pipeline can consume without importing a React
 * store. The store adopts this shape; it does not compete with it.
 */
import type { EntityKind, ResolvedEntity } from "./understanding/types";

/** The subject of an open investigation. */
export interface MissionContext {
  /** Stable id for the investigation, e.g. `"inv-9438291"`. */
  readonly investigationId: string;
  readonly subject: ResolvedEntity;
  /** When the officer opened it. */
  readonly openedAt: string;
}

/**
 * Build a mission context for a subject the officer opened.
 *
 * `confidence` is 1: the officer selected this subject explicitly, so
 * there is nothing uncertain about which entity is meant. That is the
 * difference between an opened subject and an extracted one.
 */
export function openMission(
  subject: { kind: EntityKind; label: string; identifier?: string | null },
  now: number = Date.now(),
): MissionContext {
  const identifier = subject.identifier ?? null;
  return {
    investigationId: `inv-${identifier ?? slug(subject.label)}`,
    subject: {
      kind: subject.kind,
      text: subject.label,
      identifier,
      identifierKind: identifier ? inferIdentifierKind(identifier) : null,
      confidence: 1,
    },
    openedAt: new Date(now).toISOString(),
  };
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferIdentifierKind(identifier: string): ResolvedEntity["identifierKind"] {
  if (/^[A-Z]{3}[UJZ]\d{7}$/.test(identifier)) return "container";
  if (/^\d{9}$/.test(identifier)) return "mmsi";
  if (/^\d{7}$/.test(identifier)) return "imo";
  return null;
}

/**
 * The subject to offer a query as ambient context.
 *
 * Returns `null` when nothing is open. Offering it is not the same as
 * applying it — `understand()` accepts this only when the query's own
 * context policy resolves to `inherit`, which is the single gate that
 * stops an open investigation reaching an unrelated question.
 */
export function ambientEntityOf(mission: MissionContext | null): ResolvedEntity | null {
  return mission?.subject ?? null;
}

/** Officer-facing label for the context bar. Absence is stated, not hidden. */
export function describeMission(mission: MissionContext | null): string {
  if (!mission) return "No active investigation";
  const { subject } = mission;
  return subject.identifier ? `${subject.text} · ${subject.identifier}` : subject.text;
}
