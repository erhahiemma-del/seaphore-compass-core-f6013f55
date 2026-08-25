/**
 * The Focus Workspace model.
 *
 * One pure function turning "the officer selected this subject" into
 * "here is what we actually know about it and what they may do next".
 * No store, no fetching, no React — every input is passed in by the
 * caller from the service that already owns it, which is what keeps this
 * testable and keeps the Focus Workspace from becoming a second source
 * of truth for anything.
 *
 * ## Why one model and not one per subject kind
 *
 * A vessel workspace, a manifest-exception workspace and a workflow
 * workspace differ in *what is worth reading first*, not in what they
 * are. Building three components would mean three copies of "is there an
 * open case", "how much evidence", "may this officer investigate" —
 * and they would drift. Instead there is one model with one set of
 * sections, and the lens reorders them (`prioritiseSections`).
 *
 * ## Sections are present or explicitly unavailable
 *
 * Every section is a discriminated union. There is deliberately no way
 * to express "zero evidence records" as a number: absence has a reason
 * attached, and the reason is what the officer needs. An evidence count
 * of 0 and "no provider is reporting" look identical on screen and mean
 * completely different things — one says we looked and found nothing,
 * the other says we never looked.
 */
import {
  canAdvance,
  type CaseStage,
  type InvestigationCase,
} from "@/services/investigations-workflow";
import { can, type Permission, type Role } from "@/lib/permissions";
import type {
  FocusSubject,
  FocusSubjectFact,
  FocusSubjectKind,
} from "@/stores/focus-subject.store";
import type { MissionMode } from "@/features/mission-control/modes";
import type { MkgEdge, MkgSnapshot } from "@/services/mkg/types";

/* ═══════════ Interaction levels ═══════════ */

/**
 * How much surface an interaction deserves.
 *
 * Three classes rather than a modal for everything. The distinction is
 * about consequence: reading a provider's state changes nothing and
 * should not cost the officer their place, whereas advancing a case is a
 * dedicated activity that deserves the whole screen.
 */
export type FocusLevel =
  /** Popover. Metadata, provider state, a layer explanation. */
  | "quick-context"
  /** The contextual drawer. A real operational subject. */
  | "focus-workspace"
  /** Hand off to an existing dedicated route. */
  | "dedicated-workflow";

/**
 * Subject kinds that warrant the full workspace rather than a popover.
 *
 * Everything the officer can *work on* is here. The kinds left out are
 * not lesser — they are references, and opening a drawer on a reference
 * would interrupt the officer to tell them something a tooltip already
 * said.
 */
const WORKSPACE_KINDS: ReadonlySet<FocusSubjectKind> = new Set<FocusSubjectKind>([
  "vessel",
  "port",
  "cargo",
  "company",
  "risk-event",
  "voyage",
  "manifest",
  "incident",
  "investigation",
]);

export function levelForSubject(subject: FocusSubject): FocusLevel {
  return WORKSPACE_KINDS.has(subject.kind) ? "focus-workspace" : "quick-context";
}

/* ═══════════ Unavailability ═══════════ */

/**
 * Why a section has nothing to show.
 *
 * A separate vocabulary from `KpiStateCode`, and deliberately so. That
 * one describes a *KPI domain* across the whole platform — whether the
 * manifest pipeline is reporting at all. This describes *one section of
 * one subject*: this vessel has no open case, this company has not been
 * correlated. Sharing the type would let a section claim
 * "AWAITING_CREDENTIALS" about a subject when what it means is that
 * nobody has opened a case, and the two are not the same sentence.
 */
export type FocusUnavailableReason =
  /** No case exists for this subject. Not a failure — the normal state. */
  | "NO_ACTIVE_WORKFLOW"
  /** A case exists but nothing has been linked to it yet. */
  | "NO_EVIDENCE_RECEIVED"
  /** The knowledge graph holds nothing for this subject yet. */
  | "NOT_CORRELATED"
  /** The subject's kind has no canonical identity the graph can resolve. */
  | "NOT_RESOLVABLE"
  /** The calling surface projected no facts for this subject. */
  | "NO_METADATA_PROJECTED";

export const FOCUS_UNAVAILABLE_LABELS: Readonly<Record<FocusUnavailableReason, string>> = {
  NO_ACTIVE_WORKFLOW: "No active workflow",
  NO_EVIDENCE_RECEIVED: "No evidence received",
  NOT_CORRELATED: "Not correlated",
  NOT_RESOLVABLE: "No canonical identity",
  NO_METADATA_PROJECTED: "No metadata projected",
};

/** A section either has real data or an explicit reason it does not. */
export type FocusSection<T> =
  | { readonly state: "present"; readonly data: T }
  | { readonly state: "unavailable"; readonly reason: FocusUnavailableReason };

const present = <T>(data: T): FocusSection<T> => ({ state: "present", data });
const unavailable = <T>(reason: FocusUnavailableReason): FocusSection<T> => ({
  state: "unavailable",
  reason,
});

/* ═══════════ Section payloads ═══════════ */

export interface FocusIdentity {
  readonly kind: FocusSubjectKind;
  readonly title: string;
  readonly descriptor?: string;
}

export interface FocusWork {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly stage: CaseStage;
  readonly priority: InvestigationCase["priority"];
  /** Stages reachable from here, via the workflow's own transition rules. */
  readonly nextStages: ReadonlyArray<CaseStage>;
  /** Findings recorded but not yet officer-approved. */
  readonly awaitingApproval: number;
  readonly openedBy: string;
}

export interface FocusEvidence {
  readonly records: number;
  /** Distinct sources, counted from the links themselves. */
  readonly sources: number;
}

export interface FocusRelationships {
  readonly related: number;
  /** Distinct edge types, so the drawer can say *how* things relate. */
  readonly kinds: ReadonlyArray<string>;
  /**
   * Whether the identity fusion engine recorded a contradiction touching
   * this subject. Read from the node the graph already computed — this
   * does not decide what a conflict is.
   */
  readonly hasContradictions: boolean;
}

/* ═══════════ Actions ═══════════ */

export type FocusActionId =
  | "work-here"
  | "open-full-workspace"
  | "investigate"
  | "view-evidence"
  | "continue-workflow"
  | "ask-seaphore"
  | "dismiss";

export interface FocusAction {
  readonly id: FocusActionId;
  readonly label: string;
  readonly level: FocusLevel;
  readonly enabled: boolean;
  /**
   * Why the action cannot be taken, for the officer to read.
   *
   * Present only when `enabled` is false. Following the convention the
   * Administration centre already sets — an officer who lacks a
   * permission is told so, rather than shown a screen with a silently
   * missing button and left to wonder whether the feature exists.
   */
  readonly disabledReason?: string;
}

/** Permission gates, taken from the existing matrix. Never a new one. */
const ACTION_PERMISSION: Readonly<Partial<Record<FocusActionId, Permission>>> = {
  investigate: "investigation.create",
  "continue-workflow": "decision.submit",
  "view-evidence": "entity.read",
};

/* ═══════════ The model ═══════════ */

export interface FocusWorkspaceModel {
  readonly subject: FocusSubject;
  readonly level: FocusLevel;
  readonly identity: FocusIdentity;
  readonly metadata: FocusSection<ReadonlyArray<FocusSubjectFact>>;
  readonly work: FocusSection<FocusWork>;
  readonly evidence: FocusSection<FocusEvidence>;
  readonly relationships: FocusSection<FocusRelationships>;
  readonly actions: ReadonlyArray<FocusAction>;
  /** Section keys in the order this lens wants them read. */
  readonly sectionOrder: ReadonlyArray<FocusSectionKey>;
}

export type FocusSectionKey = "metadata" | "work" | "evidence" | "relationships";

export interface FocusWorkspaceInput {
  readonly subject: FocusSubject;
  readonly mode: MissionMode;
  /** Every case the workflow store holds. Filtered here, not fetched. */
  readonly cases: ReadonlyArray<InvestigationCase>;
  /** The officer's roles, from the existing permissions hook. */
  readonly roles: ReadonlyArray<Role> | null;
  /** Knowledge-graph snapshot, or null when the graph is not loaded. */
  readonly graph?: MkgSnapshot | null;
  /**
   * The canonical id for this subject, when one can be built.
   *
   * Supplied by the caller rather than derived here: `canonicalEntityId`
   * only covers kinds the IAL recognises, and guessing an id for the
   * others would attribute another entity's relationships to this one.
   */
  readonly canonicalId?: string | null;
}

/**
 * Which section each lens wants read first.
 *
 * Mode and focus stay independent — this reads the mode, it never writes
 * it, and the same subject produces the same facts under every lens.
 * Only the order changes, which is the whole of "their combination may
 * affect presentation priority".
 */
const MODE_SECTION_PRIORITY: Readonly<Record<string, ReadonlyArray<FocusSectionKey>>> = {
  "revenue-assurance": ["evidence", "metadata", "work", "relationships"],
  investigation: ["evidence", "relationships", "work", "metadata"],
  "risk-compliance": ["relationships", "evidence", "work", "metadata"],
  "port-intelligence": ["metadata", "work", "evidence", "relationships"],
};

const DEFAULT_SECTION_ORDER: ReadonlyArray<FocusSectionKey> = [
  "metadata",
  "work",
  "evidence",
  "relationships",
];

export function prioritiseSections(mode: MissionMode): ReadonlyArray<FocusSectionKey> {
  return MODE_SECTION_PRIORITY[mode.id] ?? DEFAULT_SECTION_ORDER;
}

/**
 * Find the open case for a subject.
 *
 * Matched on the workflow's own subject id and kind. A case whose
 * subject kind differs is not this subject's case even when the ids
 * collide — port `NGAPP` and a company keyed `NGAPP` are different
 * things, and showing one's workflow on the other would be worse than
 * showing none.
 */
function findCase(
  cases: ReadonlyArray<InvestigationCase>,
  subject: FocusSubject,
): InvestigationCase | null {
  return (
    cases.find(
      (c) =>
        c.stage !== "closed" &&
        c.subject.id === subject.id &&
        String(c.subject.kind) === String(subject.kind),
    ) ?? null
  );
}

function buildWork(active: InvestigationCase | null): FocusSection<FocusWork> {
  if (!active) return unavailable("NO_ACTIVE_WORKFLOW");
  const stages: ReadonlyArray<CaseStage> = ["intake", "evidence", "analysis", "decision", "closed"];
  return present({
    caseId: active.id,
    caseTitle: active.title,
    stage: active.stage,
    priority: active.priority,
    // Asked of the workflow service rather than restated here. This
    // phase does not own the stage machine and must not encode a second
    // copy of its rules.
    nextStages: stages.filter((s) => canAdvance(active.stage, s)),
    awaitingApproval: active.findings.filter((f) => !f.officerApproved).length,
    openedBy: active.openedBy,
  });
}

function buildEvidence(active: InvestigationCase | null): FocusSection<FocusEvidence> {
  if (!active) return unavailable("NO_ACTIVE_WORKFLOW");
  if (active.evidence.length === 0) return unavailable("NO_EVIDENCE_RECEIVED");
  return present({
    records: active.evidence.length,
    sources: new Set(active.evidence.map((e) => e.source)).size,
  });
}

function buildRelationships(
  graph: MkgSnapshot | null | undefined,
  canonicalId: string | null | undefined,
): FocusSection<FocusRelationships> {
  // No canonical identity means no safe way to ask the graph anything.
  // Reported distinctly from "the graph knows nothing about it": one is
  // a limit of this subject's kind, the other is a fact about the data.
  if (!canonicalId) return unavailable("NOT_RESOLVABLE");
  if (!graph) return unavailable("NOT_CORRELATED");

  const node = graph.nodes.find((n) => n.id === canonicalId || n.aliases.includes(canonicalId));
  if (!node) return unavailable("NOT_CORRELATED");

  const touching: ReadonlyArray<MkgEdge> = graph.edges.filter(
    (e) => e.fromId === node.id || e.toId === node.id,
  );
  if (touching.length === 0) return unavailable("NOT_CORRELATED");

  return present({
    related: new Set(touching.map((e) => (e.fromId === node.id ? e.toId : e.fromId))).size,
    kinds: [...new Set(touching.map((e) => e.type))].sort(),
    hasContradictions: node.hasContradictions,
  });
}

function buildActions(
  subject: FocusSubject,
  roles: ReadonlyArray<Role> | null,
  work: FocusSection<FocusWork>,
  evidence: FocusSection<FocusEvidence>,
): ReadonlyArray<FocusAction> {
  const gate = (id: FocusActionId, label: string, level: FocusLevel): FocusAction => {
    const permission = ACTION_PERMISSION[id];
    if (permission && !can(roles, permission)) {
      return {
        id,
        label,
        level,
        enabled: false,
        disabledReason: `Requires ${permission}`,
      };
    }
    return { id, label, level, enabled: true };
  };

  const actions: FocusAction[] = [
    gate("work-here", "Work here", "focus-workspace"),
    gate("open-full-workspace", "Open full workspace", "dedicated-workflow"),
  ];

  // Investigating a subject that already has an open case is not a
  // second investigation — it is continuing the first one.
  if (work.state === "present") {
    actions.push(gate("continue-workflow", "Continue workflow", "dedicated-workflow"));
  } else {
    actions.push(gate("investigate", "Investigate", "dedicated-workflow"));
  }

  if (evidence.state === "present") {
    actions.push(gate("view-evidence", "View evidence", "dedicated-workflow"));
  }

  actions.push(gate("ask-seaphore", "Ask Seaphore", "focus-workspace"));
  actions.push(gate("dismiss", "Dismiss", "quick-context"));
  return actions;
}

/**
 * Build the workspace for a focused subject.
 *
 * Pure. Given the same subject, cases, roles and graph it returns the
 * same model, which is what lets the whole contract be tested without a
 * router, a session or a mounted component.
 */
export function buildFocusWorkspace(input: FocusWorkspaceInput): FocusWorkspaceModel {
  const { subject, mode, cases, roles, graph, canonicalId } = input;
  const active = findCase(cases, subject);

  const work = buildWork(active);
  const evidence = buildEvidence(active);
  const relationships = buildRelationships(graph, canonicalId);
  const facts = subject.facts ?? [];

  return {
    subject,
    level: levelForSubject(subject),
    identity: { kind: subject.kind, title: subject.title, descriptor: subject.descriptor },
    metadata: facts.length > 0 ? present(facts) : unavailable("NO_METADATA_PROJECTED"),
    work,
    evidence,
    relationships,
    actions: buildActions(subject, roles, work, evidence),
    sectionOrder: prioritiseSections(mode),
  };
}
