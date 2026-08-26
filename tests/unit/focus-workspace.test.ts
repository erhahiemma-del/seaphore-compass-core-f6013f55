/**
 * Contextual Focus Workspace — behavioural contract.
 *
 * Phase 3 made Mission Control adaptive to what the officer has
 * selected. The failures worth guarding are the quiet ones, where the
 * screen still looks right:
 *
 *   A dismissed drawer silently discarding the officer's subject.
 *   A berth click putting "the port" in focus and every downstream
 *   surface confidently describing an object nobody chose.
 *   An empty evidence section rendering "0 records" instead of saying no
 *   case has been opened.
 *   A second focus store appearing beside the first, so the map and the
 *   Copilot disagree about what is in hand.
 *
 * None of these throw, and none is visible in a screenshot.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { MISSION_MODES, MISSION_MODE_ORDER } from "@/features/mission-control/modes";
import { buildFocusWorkspace, type FocusActionId } from "@/features/focus-workspace/model";
import { deriveCopilotContext } from "@/features/mission-control/useCopilotContextBinding";
import {
  dedicatedDestination,
  focusDestination,
  type FocusDestination,
} from "@/features/focus-workspace/handoff";
import { focusSubjectFromMapSelection } from "@/features/focus-workspace/map-bridge";
import { useFocusSubjectStore, type FocusSubject } from "@/stores/focus-subject.store";
import type { InvestigationCase } from "@/services/investigations-workflow";
import type { MapSelection } from "@/services/geospatial/selection";
import type { Role } from "@/lib/permissions";

/* ═══════════ Fixtures ═══════════ */

const VESSEL: FocusSubject = {
  kind: "vessel",
  id: "9438291",
  title: "9438291",
  descriptor: "Vessel · IMO 9438291",
};

const PORT: FocusSubject = { kind: "port", id: "NGAPP", title: "NGAPP" };

const MODE = MISSION_MODES["national-picture"];

function caseFor(subject: FocusSubject, over: Partial<InvestigationCase> = {}): InvestigationCase {
  return {
    id: "case_1",
    title: "Manifest verification",
    subject: { kind: subject.kind as never, id: subject.id, label: subject.title },
    stage: "evidence",
    openedAt: "2026-08-01T00:00:00.000Z",
    openedBy: "officer-1",
    priority: "monitor",
    evidence: [],
    findings: [],
    auditTrail: [],
    ...over,
  };
}

const build = (over: Partial<Parameters<typeof buildFocusWorkspace>[0]> = {}) =>
  buildFocusWorkspace({ subject: VESSEL, mode: MODE, cases: [], roles: ["officer"], ...over });

const actionById = (
  model: ReturnType<typeof buildFocusWorkspace>,
  id: FocusActionId,
): { enabled: boolean; disabledReason?: string } | undefined =>
  model.actions.find((a) => a.id === id);

/* ═══════════ 1–3, 5. Focus lifecycle ═══════════ */

describe("focus lifecycle", () => {
  beforeEach(() => {
    useFocusSubjectStore.setState({ subject: null, workspaceOpen: false });
  });

  it("opens the workspace when a focusable subject is selected", () => {
    useFocusSubjectStore.getState().openWorkspace(VESSEL);
    const state = useFocusSubjectStore.getState();
    expect(state.subject).toEqual(VESSEL);
    expect(state.workspaceOpen).toBe(true);
  });

  it("replaces focus rather than stacking when a second subject is selected", () => {
    const store = useFocusSubjectStore.getState();
    store.openWorkspace(VESSEL);
    store.openWorkspace(PORT);
    const state = useFocusSubjectStore.getState();
    expect(state.subject).toEqual(PORT);
    expect(state.workspaceOpen).toBe(true);
  });

  it("dismisses the transient surface without discarding the subject", () => {
    const store = useFocusSubjectStore.getState();
    store.openWorkspace(VESSEL);
    store.dismissWorkspace();
    const state = useFocusSubjectStore.getState();
    // The distinction the whole store rests on: a closed panel is not a
    // finished piece of work.
    expect(state.workspaceOpen).toBe(false);
    expect(state.subject).toEqual(VESSEL);
  });

  it("keeps focus across navigation so returning restores the subject", () => {
    const store = useFocusSubjectStore.getState();
    store.openWorkspace(VESSEL);
    // What the host does on handoff: close the drawer, keep the subject.
    store.dismissWorkspace();
    expect(useFocusSubjectStore.getState().subject).toEqual(VESSEL);
  });

  it("clears both when the subject itself is dropped", () => {
    const store = useFocusSubjectStore.getState();
    store.openWorkspace(VESSEL);
    store.clearSubject();
    const state = useFocusSubjectStore.getState();
    expect(state.subject).toBeNull();
    // A cleared subject must not leave a surface with nothing to render.
    expect(state.workspaceOpen).toBe(false);
  });

  it("leaves the workspace closed when a centre focuses without opening it", () => {
    // `setSubject` is the pre-Phase-3 path the Intelligence Centres use.
    // It must not start opening drawers on surfaces this phase did not touch.
    useFocusSubjectStore.getState().setSubject(VESSEL);
    expect(useFocusSubjectStore.getState().workspaceOpen).toBe(false);
  });
});

/* ═══════════ 8, 9. Map and non-map converge ═══════════ */

describe("map selection translates into the same focus state", () => {
  it("produces a focus subject a panel selection would also produce", () => {
    const fromMap = focusSubjectFromMapSelection({
      kind: "vessel",
      id: "9438291",
      imo: "9438291",
    } as MapSelection);
    expect(fromMap?.kind).toBe("vessel");
    expect(fromMap?.id).toBe("9438291");
    // Same store, same shape — one focus, whichever surface set it.
    expect(fromMap && Object.keys(fromMap).sort()).toEqual(
      ["descriptor", "id", "kind", "title"].sort(),
    );
  });

  it("titles a vessel by its identifier and never invents a name", () => {
    const subject = focusSubjectFromMapSelection({
      kind: "vessel",
      id: "abc",
      imo: null,
    } as MapSelection);
    // No IMO published: the id is the only identifier that exists.
    expect(subject?.title).toBe("abc");
  });

  it("creates no focus for selections that name no focusable subject", () => {
    const unfocusable: ReadonlyArray<MapSelection> = [
      { kind: "berth", id: "b1", terminalId: "t1" },
      { kind: "anchorage", id: "a1", portId: "NGAPP" },
      { kind: "zone", id: "z1", zoneType: "eez" },
      { kind: "geofence", id: "g1" },
      { kind: "sar-detection", id: "s1", sceneId: "sc1" },
      { kind: "ais-gap", id: "g2", mmsi: "123456789" },
      { kind: "terminal", id: "t1", portId: "NGAPP" },
      { kind: "infrastructure", id: "i1", assetType: "platform" },
    ];
    for (const selection of unfocusable) {
      expect(
        focusSubjectFromMapSelection(selection),
        `${selection.kind} must not become a focus subject`,
      ).toBeNull();
    }
  });

  it("creates no focus from an empty selection", () => {
    expect(focusSubjectFromMapSelection(null)).toBeNull();
  });
});

/* ═══════════ 10. No fabricated zeros ═══════════ */

describe("unavailable state is explicit, never a zero", () => {
  it("reports no active workflow rather than an empty case", () => {
    const model = build({ cases: [] });
    expect(model.work.state).toBe("unavailable");
    if (model.work.state === "unavailable") {
      expect(model.work.reason).toBe("NO_ACTIVE_WORKFLOW");
    }
  });

  it("distinguishes 'no case' from 'a case with nothing linked'", () => {
    // These are different sentences and must not collapse into "0".
    const noCase = build({ cases: [] }).evidence;
    const emptyCase = build({ cases: [caseFor(VESSEL)] }).evidence;
    expect(noCase.state).toBe("unavailable");
    expect(emptyCase.state).toBe("unavailable");
    if (noCase.state === "unavailable" && emptyCase.state === "unavailable") {
      expect(noCase.reason).toBe("NO_ACTIVE_WORKFLOW");
      expect(emptyCase.reason).toBe("NO_EVIDENCE_RECEIVED");
      expect(noCase.reason).not.toBe(emptyCase.reason);
    }
  });

  it("never exposes a numeric field on an unavailable section", () => {
    const model = build({ cases: [] });
    for (const section of [model.work, model.evidence, model.relationships, model.metadata]) {
      if (section.state === "unavailable") {
        expect(section).not.toHaveProperty("data");
      }
    }
  });

  it("counts evidence only from records that exist", () => {
    const withEvidence = caseFor(VESSEL, {
      evidence: [
        {
          evidenceId: "e1",
          source: "src-a",
          sourceName: "A",
          grade: "VERIFIED",
          linkedAt: "2026-08-02T00:00:00.000Z",
          linkedBy: "officer-1",
        },
        {
          evidenceId: "e2",
          source: "src-a",
          sourceName: "A",
          grade: "REPORTED",
          linkedAt: "2026-08-02T00:00:00.000Z",
          linkedBy: "officer-1",
        },
      ],
    });
    const evidence = build({ cases: [withEvidence] }).evidence;
    expect(evidence.state).toBe("present");
    if (evidence.state === "present") {
      expect(evidence.data.records).toBe(2);
      // Two records, one source — counted, not assumed.
      expect(evidence.data.sources).toBe(1);
    }
  });

  it("reports an unresolvable kind differently from an uncorrelated one", () => {
    const noIdentity = build({ subject: { kind: "incident", id: "i1", title: "i1" } });
    const noGraph = build({ canonicalId: "vessel:imo:9438291", graph: null });
    expect(noIdentity.relationships.state).toBe("unavailable");
    expect(noGraph.relationships.state).toBe("unavailable");
    if (
      noIdentity.relationships.state === "unavailable" &&
      noGraph.relationships.state === "unavailable"
    ) {
      expect(noIdentity.relationships.reason).toBe("NOT_RESOLVABLE");
      expect(noGraph.relationships.reason).toBe("NOT_CORRELATED");
    }
  });

  it("does not attach another subject's case", () => {
    // Same id, different kind. Showing the vessel's workflow on a company
    // keyed identically would be worse than showing none.
    const model = build({ subject: PORT, cases: [caseFor(VESSEL)] });
    expect(model.work.state).toBe("unavailable");
  });

  it("ignores a closed case when reporting active work", () => {
    const model = build({ cases: [caseFor(VESSEL, { stage: "closed" })] });
    expect(model.work.state).toBe("unavailable");
  });
});

/* ═══════════ 6. Mode × Focus independence ═══════════ */

describe("mission mode and focus stay independent", () => {
  it("returns the same facts under every lens", () => {
    const models = MISSION_MODE_ORDER.map((id) => build({ mode: MISSION_MODES[id] }));
    const shapes = models.map((m) =>
      JSON.stringify({ work: m.work, evidence: m.evidence, identity: m.identity }),
    );
    // Only the reading order may change. A lens that altered the facts
    // would make the same vessel two different vessels.
    expect(new Set(shapes).size).toBe(1);
  });

  it("changes only the section order between lenses", () => {
    const investigation = build({ mode: MISSION_MODES["investigation"] }).sectionOrder;
    const port = build({ mode: MISSION_MODES["port-intelligence"] }).sectionOrder;
    expect([...investigation].sort()).toEqual([...port].sort());
    expect(investigation).not.toEqual(port);
  });

  it("always orders every section exactly once", () => {
    for (const id of MISSION_MODE_ORDER) {
      const order = build({ mode: MISSION_MODES[id] }).sectionOrder;
      expect([...order].sort()).toEqual(["evidence", "metadata", "relationships", "work"]);
    }
  });
});

/* ═══════════ 11. Permissions ═══════════ */

describe("permissions are respected through the existing matrix", () => {
  it("disables investigate for a role that may not create cases", () => {
    // external_agency is a partner read-only role.
    const model = build({ roles: ["external_agency"] as ReadonlyArray<Role> });
    const investigate = actionById(model, "investigate");
    expect(investigate?.enabled).toBe(false);
    expect(investigate?.disabledReason).toContain("investigation.create");
  });

  it("enables investigate for an analyst", () => {
    expect(actionById(build({ roles: ["analyst"] }), "investigate")?.enabled).toBe(true);
  });

  it("disables continuing a workflow for a role that may not submit decisions", () => {
    const model = build({ roles: ["analyst"], cases: [caseFor(VESSEL)] });
    expect(actionById(model, "continue-workflow")?.enabled).toBe(false);
  });

  it("gives an unauthenticated officer no permitted actions requiring a role", () => {
    const model = build({ roles: null });
    for (const id of ["investigate", "view-evidence", "continue-workflow"] as FocusActionId[]) {
      const action = actionById(model, id);
      if (action) expect(action.enabled).toBe(false);
    }
  });

  it("states a reason whenever an action is disabled", () => {
    // The Administration centre's convention: tell the officer, never
    // leave a dead control unexplained.
    const model = build({ roles: ["external_agency"] });
    for (const action of model.actions) {
      if (!action.enabled) expect(action.disabledReason, action.id).toBeTruthy();
    }
  });

  it("offers continue-workflow instead of investigate when a case is open", () => {
    const model = build({ cases: [caseFor(VESSEL)] });
    expect(actionById(model, "continue-workflow")).toBeDefined();
    expect(actionById(model, "investigate")).toBeUndefined();
  });
});

/* ═══════════ 4. Handoff uses existing routes ═══════════ */

describe("dedicated-module handoff", () => {
  const ROUTES = readdirSync(resolve(process.cwd(), "src/routes"));

  /** Every destination this feature can produce, and its route file. */
  const DESTINATION_ROUTE: Record<FocusDestination["kind"], string> = {
    entity: "entity.$id.tsx",
    investigation: "investigate.$id.tsx",
    "new-investigation": "investigate.tsx",
    manifest: "manifest.tsx",
    evidence: "evidence.tsx",
    copilot: "copilot.tsx",
  };

  it("names only routes that exist on disk", () => {
    for (const [kind, file] of Object.entries(DESTINATION_ROUTE)) {
      expect(ROUTES, `${kind} points at a route that does not exist`).toContain(file);
    }
  });

  it("routes the entity-profile kinds through their canonical id", () => {
    const dest = dedicatedDestination(VESSEL, "vessel:imo:9438291");
    expect(dest).toEqual({ kind: "entity", id: "vessel:imo:9438291" });
  });

  it("offers no full workspace without a canonical id", () => {
    // The entity route is keyed by canonical id; a raw id would open a
    // different entity or none.
    expect(dedicatedDestination(VESSEL, null)).toBeNull();
  });

  it("reports no dedicated module for kinds that genuinely have none", () => {
    for (const kind of ["incident", "risk-event"] as const) {
      expect(dedicatedDestination({ kind, id: "x", title: "x" }, "any")).toBeNull();
    }
  });

  it("disables open-full-workspace when there is no module to open", () => {
    const model = build({ hasDedicatedModule: false });
    const action = actionById(model, "open-full-workspace");
    expect(action?.enabled).toBe(false);
    expect(action?.disabledReason).toBeTruthy();
  });

  it("continues an open case rather than starting a second one", () => {
    const work = build({ cases: [caseFor(VESSEL)] }).work;
    expect(work.state).toBe("present");
    if (work.state === "present") {
      expect(focusDestination("continue-workflow", VESSEL, null, work.data)).toEqual({
        kind: "investigation",
        id: "case_1",
      });
    }
  });

  it("navigates nowhere for the two actions that stay in the drawer", () => {
    expect(focusDestination("work-here", VESSEL, "vessel:imo:1", null)).toBeNull();
    expect(focusDestination("dismiss", VESSEL, "vessel:imo:1", null)).toBeNull();
  });

  it("takes next stages from the workflow service rather than restating them", () => {
    const work = build({ cases: [caseFor(VESSEL, { stage: "analysis" })] }).work;
    if (work.state === "present") {
      // The service's own transition table for `analysis`.
      expect([...work.data.nextStages].sort()).toEqual(["closed", "decision", "evidence"]);
    }
  });
});

/* ═══════════ 7. Copilot context ═══════════ */

describe("copilot receives mode, focus and workflow", () => {
  it("reports the focused subject with the lens as secondary detail", () => {
    const ctx = deriveCopilotContext(MODE, {
      kind: "vessel",
      title: "9438291",
      descriptor: "IMO 9438291",
    });
    expect(ctx.kind).toBe("vessel");
    expect(ctx.label).toBe("9438291");
    expect(ctx.detail).toContain(MODE.label);
  });

  it("includes the workflow only when a case is genuinely open", () => {
    const focus = { kind: "vessel" as const, title: "9438291" };
    const without = deriveCopilotContext(MODE, focus, null);
    const with_ = deriveCopilotContext(MODE, focus, {
      caseTitle: "Manifest verification",
      stage: "evidence",
    });
    expect(without.detail).not.toContain("Manifest verification");
    expect(with_.detail).toContain("Manifest verification");
    expect(with_.detail).toContain("evidence");
  });

  it("never coerces a subject kind the vocabulary cannot express", () => {
    for (const kind of ["cargo", "company", "manifest", "voyage", "incident"] as const) {
      const ctx = deriveCopilotContext(MODE, { kind, title: "X" });
      // Falls back to the lens rather than claiming X is a vessel.
      expect(ctx.kind).toBe("investigation");
      expect(ctx.label).toBe(MODE.label);
    }
  });

  it("distinguishes a focused case from having no subject", () => {
    const focused = deriveCopilotContext(MODE, { kind: "investigation", title: "case_1" });
    const none = deriveCopilotContext(MODE, null);
    expect(focused.kind).toBe("case");
    expect(none.kind).toBe("investigation");
    expect(focused.kind).not.toBe(none.kind);
  });
});

/* ═══════════ 12. No parallel systems ═══════════ */

describe("the focus workspace introduces no parallel systems", () => {
  const DIR = resolve(process.cwd(), "src/features/focus-workspace");
  const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const sourceOf = (f: string) => readFileSync(resolve(DIR, f), "utf8");
  const all = FILES.map(sourceOf).join("\n");

  it("declares no store of its own", () => {
    // focus-subject.store is the single source of truth for focus. A
    // second one here would let the map and the Copilot disagree about
    // what the officer has in hand.
    for (const file of FILES) {
      expect(sourceOf(file), `${file} creates a store`).not.toMatch(/\bcreate<|\bcreate\(/);
    }
  });

  it("reads focus from the shared store", () => {
    expect(all).toContain("useFocusSubjectStore");
  });

  it("never writes map selection", () => {
    // The bridge translates one way. Writing back would make SGS and
    // focus race each other.
    expect(all).not.toContain("setActiveLayers");
    expect(all).not.toMatch(/\.select\(/);
    expect(all).not.toContain("clearSelection");
  });

  it("builds no second permission check", () => {
    // `can()` and the shared matrix, or nothing.
    expect(all).not.toMatch(/ROLE_RANK|isOfficerOrAbove\s*\(/);
  });

  it("keeps the landmarks a visual pass must not remove", () => {
    for (const testid of ["focus-workspace", "focus-title"]) {
      expect(all, `data-testid="${testid}" was removed`).toContain(`data-testid="${testid}"`);
    }
    // Per-action and per-section ids are generated from the id, so the
    // template is what has to survive — asserting a rendered literal like
    // `focus-action-dismiss` would fail against source that is working.
    expect(all, "per-action testid template was removed").toContain("data-testid={`focus-action-");
    expect(all, "per-section testid template was removed").toContain(
      "data-testid={`focus-section-",
    );
  });

  it("fabricates no operational figure", () => {
    const readable = all
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ")
      .replace(/className=(?:"[^"]*"|\{[^}]*\})/g, " ");
    expect(readable).not.toMatch(/₦\s*[\d.]/);
    expect(readable).not.toMatch(/\d+\s+(vessels?|ports?|incidents?|investigations?|alerts?)\b/i);
  });
});
