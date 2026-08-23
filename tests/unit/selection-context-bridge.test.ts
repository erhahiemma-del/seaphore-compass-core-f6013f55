/** TEST_FIXTURE — synthetic selections only. */
import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/services/orchestration";
import {
  SELECTION_ENTITY,
  ambientEntityOf,
  missionChanged,
  missionForSelection,
} from "@/services/orchestration";
import type { MapSelection } from "@/services/geospatial";

const NOW = Date.parse("2026-08-22T10:00:00.000Z");

/** TEST_FIXTURE */
const VESSEL_A: MapSelection = { kind: "vessel", id: "v-a", imo: "9074729", mmsi: null };
const VESSEL_B: MapSelection = { kind: "vessel", id: "v-b", imo: "9432187", mmsi: null };

function ask(query: string, selection: MapSelection | null) {
  const bridged = missionForSelection(selection, { now: NOW });
  const mission = bridged.status === "opened" ? bridged.mission : null;
  return classifyIntent({ query, officer_id: "test" }, { ambientEntity: ambientEntityOf(mission) });
}

/* ═══════ Bridging ═══════ */

describe("map selection becomes operational context", () => {
  it("resolves a vessel selection to a vessel subject carrying its IMO", () => {
    const result = missionForSelection(VESSEL_A, { label: "TEST_FIXTURE MV ABC", now: NOW });

    expect(result.status).toBe("opened");
    if (result.status !== "opened") return;
    expect(result.mission.subject.kind).toBe("vessel");
    expect(result.mission.subject.identifier).toBe("9074729");
    expect(result.mission.subject.identifierKind).toBe("imo");
  });

  it("prefers IMO over MMSI — IMO is hull-bound, MMSI is reassigned on reflag", () => {
    const both: MapSelection = { kind: "vessel", id: "v", imo: "9074729", mmsi: "657123456" };
    const result = missionForSelection(both, { now: NOW });

    if (result.status !== "opened") throw new Error("expected opened");
    expect(result.mission.subject.identifier).toBe("9074729");
  });

  it("falls back to MMSI when no IMO is published — GFW routinely omits it", () => {
    const mmsiOnly: MapSelection = { kind: "vessel", id: "v", imo: null, mmsi: "657123456" };
    const result = missionForSelection(mmsiOnly, { now: NOW });

    if (result.status !== "opened") throw new Error("expected opened");
    expect(result.mission.subject.identifier).toBe("657123456");
  });

  it("clears context when nothing is selected", () => {
    expect(missionForSelection(null).status).toBe("cleared");
  });

  it("refuses to call a SAR detection a vessel", () => {
    // The whole point of the partial mapping: a radar return has no
    // established identity, and asserting one would put a fabricated
    // subject into the officer's ambient context.
    const sar: MapSelection = { kind: "sar-detection", id: "d-1", sceneId: "S1A_X" };
    const result = missionForSelection(sar, { now: NOW });

    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") return;
    expect(result.reason).toMatch(/identity/i);
  });

  it("states a position for every selection kind", () => {
    // The record is total, so a new MapSelection kind cannot be added
    // without deciding what it means as context.
    for (const [kind, mapping] of Object.entries(SELECTION_ENTITY)) {
      if (mapping.entity === null) {
        expect(mapping.reason, `${kind} needs a reason`).toBeTruthy();
      }
    }
  });
});

/* ═══════ Context isolation — the safeguard that must not regress ═══════ */

describe("selecting a vessel does not contaminate unrelated questions", () => {
  it("uses the selected vessel for an elliptical follow-up", () => {
    // The bridge's payoff: a follow-up with no subject of its own now
    // resolves against what the officer has open on the *map*, which
    // before this bridge was invisible to the Copilot.
    const intent = ask("and her compliance history?", VESSEL_A);

    expect(intent.understanding.contextPolicy).toBe("inherit");
    expect(intent.understanding.primaryEntity?.identifier).toBe("9074729");
  });

  it("documents that `why did that happen?` does NOT inherit today", () => {
    // Recorded, not asserted as desirable. The classifier treats this as
    // a fresh question rather than an ellipsis, so it resolves passive.
    // Widening the inherit rule is a change to the contamination
    // boundary and is deliberately not made here.
    const intent = ask("why did that happen?", VESSEL_A);
    expect(intent.understanding.contextPolicy).toBe("passive");
  });

  it("does NOT apply the selection to a fleet-wide question", () => {
    // Vessel A is open on the map; the officer asks about everything.
    const intent = ask("which vessels are live today?", VESSEL_A);

    expect(intent.understanding.contextPolicy).toBe("passive");
    expect(intent.understanding.scope).not.toBe("entity");
  });

  it("does NOT apply the selection to an unrelated domain question", () => {
    const intent = ask("what is the revenue leakage this quarter?", VESSEL_A);
    expect(intent.understanding.contextPolicy).toBe("passive");
  });

  it("keeps an explicitly named vessel as the subject", () => {
    const intent = ask("what is happening with TEST_FIXTURE MV ABC?", VESSEL_A);
    expect(intent.understanding.scope).toBe("entity");
  });
});

/* ═══════ Stale context ═══════ */

describe("switching selection cannot leave stale context", () => {
  it("produces a different mission for Vessel A than Vessel B", () => {
    const a = missionForSelection(VESSEL_A, { now: NOW });
    const b = missionForSelection(VESSEL_B, { now: NOW });
    if (a.status !== "opened" || b.status !== "opened") throw new Error("expected opened");

    expect(a.mission.investigationId).not.toBe(b.mission.investigationId);
    expect(missionChanged(a.mission, b.mission)).toBe(true);
  });

  it("reports no change when the same vessel is reselected", () => {
    const first = missionForSelection(VESSEL_A, { now: NOW });
    const again = missionForSelection(VESSEL_A, { now: NOW + 5_000 });
    if (first.status !== "opened" || again.status !== "opened") throw new Error("expected opened");

    // Re-selecting must not churn ambient context on every render.
    expect(missionChanged(first.mission, again.mission)).toBe(false);
  });

  it("carries Vessel B's identifier after switching, never Vessel A's", () => {
    const b = missionForSelection(VESSEL_B, { now: NOW });
    if (b.status !== "opened") throw new Error("expected opened");

    expect(b.mission.subject.identifier).toBe("9432187");
    expect(b.mission.subject.identifier).not.toBe("9074729");
  });

  it("clears context when selection moves to an unsupported kind", () => {
    // Vessel A → SAR detection must not leave Vessel A ambient.
    const sar: MapSelection = { kind: "sar-detection", id: "d-1", sceneId: "S1A_X" };
    const result = missionForSelection(sar, { now: NOW });

    expect(result.status).toBe("unsupported");
    // The caller reads this as "no ambient entity", not "keep the last one".
    const intent = ask("why did that happen?", sar);
    expect(ambientEntityOf(null)).toBeNull();
    expect(intent.understanding.contextPolicy).toBeDefined();
  });
});
