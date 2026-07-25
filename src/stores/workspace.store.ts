/**
 * workspace.store — Intelligence Investigation Workspace (IIW) persistence.
 *
 * Sprint UX-005. Presentation + persistence layer only. Does NOT touch OIE,
 * ICE, IAL, Connector Framework, Mission Builder, Capability Resolution,
 * Knowledge Graph, or Evidence Collection. Every Copilot briefing feeds this
 * store; the workspace surfaces read from it.
 *
 * Persistence: localStorage via zustand/persist. Officer returns tomorrow —
 * every investigation is restored exactly where it was left.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type WorkspaceStatus = "ACTIVE" | "MONITORING" | "SUSPENDED" | "CLOSED";
export type WorkspacePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ConfidenceTier = "LOW" | "MEDIUM" | "HIGH";
export type InvestigationStage =
  | "INTAKE"
  | "EVIDENCE"
  | "ANALYSIS"
  | "DECISION"
  | "REPORT"
  | "CLOSED";
export const INVESTIGATION_STAGES: InvestigationStage[] = [
  "INTAKE",
  "EVIDENCE",
  "ANALYSIS",
  "DECISION",
  "REPORT",
  "CLOSED",
];
export type InvestigationCaseType =
  | "VESSEL"
  | "COMPANY"
  | "CARGO"
  | "PERSON"
  | "SANCTIONS"
  | "COMPLIANCE"
  | "INCIDENT"
  | "REVENUE"
  | "GENERIC";

export type EvidenceCategory = "COLLECTED" | "PENDING" | "CONFLICTING" | "REJECTED";
export interface WorkspaceEvidence {
  id: string;
  title: string;
  source: string;
  category: EvidenceCategory;
  grade?: string;
  summary?: string;
  entityId?: string;
  entityName?: string;
  collectedAt: string;
  hash?: string;
}

export type HypothesisStatus =
  | "UNDER_REVIEW"
  | "SUPPORTED"
  | "CONTRADICTED"
  | "CONFIRMED"
  | "REJECTED"
  | "RETIRED";
export interface WorkspaceHypothesis {
  id: string;
  statement: string;
  status: HypothesisStatus;
  confidence: number; // 0..100
  supporting: string[]; // evidence ids
  contradicting: string[];
  history: Array<{ at: string; note: string; status: HypothesisStatus }>;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
export interface WorkspaceTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: WorkspacePriority;
  owner?: string;
  dependencies?: string[];
  due?: string;
  createdAt: string;
  completedAt?: string;
  sourceCommand?: string;
}

export interface WorkspaceDecision {
  id: string;
  at: string;
  title: string;
  detail?: string;
  officer?: string;
}

export type TimelineEventKind =
  | "question"
  | "briefing"
  | "evidence"
  | "connector"
  | "report"
  | "task"
  | "decision"
  | "recommendation"
  | "hypothesis"
  | "conflict";
export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineEventKind;
  label: string;
  detail?: string;
  refId?: string;
}

export interface WorkspaceEntity {
  id: string;
  name: string;
  type: string;
  role?: string;
  riskTier?: "low" | "medium" | "high" | "critical";
  confidence?: number;
  evidenceIds: string[];
  relatedTo: string[]; // entity ids
}

export interface WorkspaceRecommendation {
  id: string;
  label: string;
  rationale?: string;
  supportingEvidence?: string[];
}

// Investigation Notebook — support notes / findings / questions with
// markdown, version history, and audit trail. Hypotheses, recommendations,
// and tasks remain first-class panels but are also linkable from notebook
// entries by ref.
export type NotebookKind =
  | "NOTE"
  | "FINDING"
  | "HYPOTHESIS"
  | "RECOMMENDATION"
  | "QUESTION"
  | "TASK";
export interface NotebookVersion {
  at: string;
  body: string;
  officer?: string;
}
export interface NotebookEntry {
  id: string;
  kind: NotebookKind;
  title: string;
  body: string; // markdown
  officer?: string;
  createdAt: string;
  updatedAt: string;
  refId?: string; // link to hypothesis/task/recommendation id
  supportingEvidence?: string[];
  versions: NotebookVersion[]; // append-only history
}


export interface InvestigationWorkspace {
  id: string;
  title: string;
  missionType: string;
  priority: WorkspacePriority;
  status: WorkspaceStatus;
  officer: string;
  startedAt: string;
  updatedAt: string;
  lastBriefingId?: string;
  /**
   * Canonical UIP id that seeded this investigation. Every downstream
   * artifact (Mission Plan, MIBC report) traces back to this id so the
   * end-to-end pipeline (UIP → OSAE → Investigation → Mission → MIBC)
   * remains explainable. Set on creation from `recordBriefingToWorkspace`
   * and never mutated thereafter.
   */
  sourceUipId?: string;

  confidenceTier: ConfidenceTier;
  confidencePct: number;
  evidenceCompleteness: number; // 0..100
  progress: number; // 0..100

  evidence: WorkspaceEvidence[];
  hypotheses: WorkspaceHypothesis[];
  tasks: WorkspaceTask[];
  decisions: WorkspaceDecision[];
  timeline: TimelineEvent[];
  entities: WorkspaceEntity[];
  recommendation?: WorkspaceRecommendation;

  // Investigation Notebook.
  notebook?: NotebookEntry[];


  // MIW extensions (Sprint 1H — Maritime Investigation Workspace).
  stage?: InvestigationStage;
  caseType?: InvestigationCaseType;
  subjectId?: string;
  subjectName?: string;
  region?: string;
  tags?: string[];
  assignees?: string[];
  dueAt?: string;
  estimatedRevenueImpactUsd?: number;
  stageHistory?: Array<{ at: string; from: InvestigationStage | null; to: InvestigationStage; officer?: string; note?: string }>;

  // Operational Command integration — linked artifacts owned by other services.
  missionPlanIds?: string[];
  oklPatternIds?: string[];

  // Copilot conversation transcript pointer (Copilot store owns rendering).
  conversationTurns: Array<{ id: string; at: string; role: "officer" | "copilot"; text: string; briefingId?: string }>;
}

interface WorkspaceState {
  activeId: string | null;
  investigations: Record<string, InvestigationWorkspace>;

  createInvestigation: (input: {
    title: string;
    missionType?: string;
    priority?: WorkspacePriority;
    officer?: string;
    caseType?: InvestigationCaseType;
    subjectId?: string;
    subjectName?: string;
    region?: string;
    tags?: string[];
    assignees?: string[];
    dueAt?: string;
    estimatedRevenueImpactUsd?: number;
  }) => string;
  setActive: (id: string | null) => void;
  updateOverview: (id: string, patch: Partial<InvestigationWorkspace>) => void;
  advanceStage: (id: string, to: InvestigationStage, note?: string) => void;

  addEvidence: (id: string, ev: Omit<WorkspaceEvidence, "id" | "collectedAt"> & Partial<Pick<WorkspaceEvidence, "id" | "collectedAt">>) => void;
  moveEvidence: (id: string, evidenceId: string, category: EvidenceCategory) => void;

  addHypothesis: (id: string, statement: string) => string;
  updateHypothesis: (id: string, hypId: string, patch: Partial<WorkspaceHypothesis> & { note?: string }) => void;

  addTask: (id: string, task: Omit<WorkspaceTask, "id" | "createdAt" | "status"> & Partial<Pick<WorkspaceTask, "status">>) => string;
  updateTask: (id: string, taskId: string, patch: Partial<WorkspaceTask>) => void;

  addDecision: (id: string, dec: Omit<WorkspaceDecision, "id" | "at"> & Partial<Pick<WorkspaceDecision, "at">>) => void;

  addTimelineEvent: (id: string, ev: Omit<TimelineEvent, "id" | "at"> & Partial<Pick<TimelineEvent, "at">>) => void;

  upsertEntity: (id: string, ent: Omit<WorkspaceEntity, "evidenceIds" | "relatedTo"> & Partial<Pick<WorkspaceEntity, "evidenceIds" | "relatedTo">>) => void;

  setRecommendation: (id: string, rec: WorkspaceRecommendation | undefined) => void;

  appendConversation: (id: string, turn: { role: "officer" | "copilot"; text: string; briefingId?: string }) => void;

  addNotebookEntry: (
    id: string,
    entry: Omit<NotebookEntry, "id" | "createdAt" | "updatedAt" | "versions"> &
      Partial<Pick<NotebookEntry, "id" | "createdAt">>,
  ) => string;
  updateNotebookEntry: (
    id: string,
    entryId: string,
    patch: Partial<Pick<NotebookEntry, "title" | "body" | "supportingEvidence" | "refId">> & { officer?: string },
  ) => void;
  removeNotebookEntry: (id: string, entryId: string) => void;

  // Operational Command bridges.
  linkMission: (id: string, missionId: string, note?: string) => void;
  linkOklPattern: (id: string, patternId: string, note?: string) => void;


  removeInvestigation: (id: string) => void;
  exportInvestigation: (id: string) => InvestigationWorkspace | null;
}

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const now = () => new Date().toISOString();

function recalc(w: InvestigationWorkspace): InvestigationWorkspace {
  const collected = w.evidence.filter((e) => e.category === "COLLECTED").length;
  const pending = w.evidence.filter((e) => e.category === "PENDING").length;
  const totalEv = w.evidence.length || 1;
  const evidenceCompleteness = Math.round((collected / Math.max(collected + pending, 1)) * 100);
  const completedTasks = w.tasks.filter((t) => t.status === "COMPLETED").length;
  const totalTasks = w.tasks.length || 1;
  const progress = Math.round((completedTasks / totalTasks) * 100);

  // Confidence derived from evidence grade distribution + hypothesis avg.
  const gradeScore: Record<string, number> = {
    VERIFIED: 1,
    CORROBORATED: 0.85,
    OBSERVED: 0.7,
    REPORTED: 0.55,
    INFERRED: 0.35,
    UNKNOWN: 0.2,
  };
  const avgGrade =
    w.evidence
      .filter((e) => e.category === "COLLECTED")
      .reduce((s, e) => s + (gradeScore[e.grade ?? "UNKNOWN"] ?? 0.3), 0) /
    Math.max(collected, 1);
  const confidencePct = Math.round((avgGrade * 100 + evidenceCompleteness) / 2);
  const tier: ConfidenceTier =
    confidencePct >= 70 ? "HIGH" : confidencePct >= 40 ? "MEDIUM" : "LOW";

  return {
    ...w,
    evidenceCompleteness: totalEv === 0 ? 0 : evidenceCompleteness,
    progress,
    confidencePct,
    confidenceTier: tier,
    updatedAt: now(),
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      activeId: null,
      investigations: {},

      createInvestigation: ({
        title,
        missionType = "GENERIC",
        priority = "MEDIUM",
        officer = "Officer",
        caseType,
        subjectId,
        subjectName,
        region,
        tags,
        assignees,
        dueAt,
        estimatedRevenueImpactUsd,
      }) => {
        const id = uid("inv");
        const t = now();
        const wsp: InvestigationWorkspace = {
          id,
          title,
          missionType,
          priority,
          status: "ACTIVE",
          officer,
          startedAt: t,
          updatedAt: t,
          confidenceTier: "LOW",
          confidencePct: 0,
          evidenceCompleteness: 0,
          progress: 0,
          evidence: [],
          hypotheses: [],
          tasks: [],
          decisions: [
            { id: uid("dec"), at: t, title: "Investigation opened", detail: title, officer },
          ],
          timeline: [
            { id: uid("tl"), at: t, kind: "decision", label: "Investigation opened", detail: title },
          ],
          entities: [],
          conversationTurns: [],
          stage: "INTAKE",
          caseType,
          subjectId,
          subjectName,
          region,
          tags,
          assignees: assignees ?? [officer],
          dueAt,
          estimatedRevenueImpactUsd,
          stageHistory: [{ at: t, from: null, to: "INTAKE", officer, note: "Investigation opened" }],
          notebook: [],

        };
        set((s) => ({ investigations: { ...s.investigations, [id]: wsp }, activeId: id }));
        return id;
      },

      setActive: (id) => set({ activeId: id }),

      advanceStage: (id, to, note) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const from = w.stage ?? null;
          if (from === to) return s;
          const t = now();
          const stageHistory = [
            ...(w.stageHistory ?? []),
            { at: t, from, to, officer: w.officer, note },
          ];
          const tl: TimelineEvent = {
            id: uid("tl"),
            at: t,
            kind: "decision",
            label: `Stage: ${from ?? "—"} → ${to}`,
            detail: note,
          };
          const status: WorkspaceStatus = to === "CLOSED" ? "CLOSED" : w.status;
          return {
            investigations: {
              ...s.investigations,
              [id]: { ...w, stage: to, status, stageHistory, timeline: [...w.timeline, tl], updatedAt: t },
            },
          };
        }),

      updateOverview: (id, patch) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          return { investigations: { ...s.investigations, [id]: recalc({ ...w, ...patch }) } };
        }),

      addEvidence: (id, ev) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const item: WorkspaceEvidence = {
            id: ev.id ?? uid("ev"),
            collectedAt: ev.collectedAt ?? now(),
            ...ev,
          };
          // Dedupe by hash|title+source.
          const key = item.hash ?? `${item.title}::${item.source}`;
          if (w.evidence.some((e) => (e.hash ?? `${e.title}::${e.source}`) === key)) return s;
          const timeline: TimelineEvent = {
            id: uid("tl"),
            at: item.collectedAt,
            kind: "evidence",
            label: `Evidence: ${item.title}`,
            detail: item.source,
            refId: item.id,
          };
          return {
            investigations: {
              ...s.investigations,
              [id]: recalc({ ...w, evidence: [...w.evidence, item], timeline: [...w.timeline, timeline] }),
            },
          };
        }),

      moveEvidence: (id, evidenceId, category) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const evidence = w.evidence.map((e) => (e.id === evidenceId ? { ...e, category } : e));
          return { investigations: { ...s.investigations, [id]: recalc({ ...w, evidence }) } };
        }),

      addHypothesis: (id, statement) => {
        const hypId = uid("hyp");
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t = now();
          const h: WorkspaceHypothesis = {
            id: hypId,
            statement,
            status: "UNDER_REVIEW",
            confidence: 30,
            supporting: [],
            contradicting: [],
            history: [{ at: t, note: "Created", status: "UNDER_REVIEW" }],
            createdAt: t,
            updatedAt: t,
          };
          const tl: TimelineEvent = { id: uid("tl"), at: t, kind: "hypothesis", label: `Hypothesis: ${statement}`, refId: hypId };
          return {
            investigations: {
              ...s.investigations,
              [id]: recalc({ ...w, hypotheses: [...w.hypotheses, h], timeline: [...w.timeline, tl] }),
            },
          };
        });
        return hypId;
      },

      updateHypothesis: (id, hypId, patch) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t = now();
          const hypotheses = w.hypotheses.map((h) => {
            if (h.id !== hypId) return h;
            const nextStatus = patch.status ?? h.status;
            const history =
              patch.status && patch.status !== h.status
                ? [...h.history, { at: t, note: patch.note ?? `Status → ${patch.status}`, status: patch.status }]
                : h.history;
            return { ...h, ...patch, status: nextStatus, history, updatedAt: t };
          });
          return { investigations: { ...s.investigations, [id]: recalc({ ...w, hypotheses }) } };
        }),

      addTask: (id, task) => {
        const taskId = uid("task");
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t: WorkspaceTask = {
            id: taskId,
            createdAt: now(),
            status: task.status ?? "PENDING",
            ...task,
          };
          // dedupe by title
          if (w.tasks.some((x) => x.title === t.title && x.status !== "COMPLETED")) return s;
          const tl: TimelineEvent = { id: uid("tl"), at: t.createdAt, kind: "task", label: `Task: ${t.title}`, refId: taskId };
          return {
            investigations: {
              ...s.investigations,
              [id]: recalc({ ...w, tasks: [...w.tasks, t], timeline: [...w.timeline, tl] }),
            },
          };
        });
        return taskId;
      },

      updateTask: (id, taskId, patch) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const tasks = w.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  ...patch,
                  completedAt:
                    patch.status === "COMPLETED" ? patch.completedAt ?? now() : t.completedAt,
                }
              : t,
          );
          return { investigations: { ...s.investigations, [id]: recalc({ ...w, tasks }) } };
        }),

      addDecision: (id, dec) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const d: WorkspaceDecision = { id: uid("dec"), at: dec.at ?? now(), ...dec };
          const tl: TimelineEvent = { id: uid("tl"), at: d.at, kind: "decision", label: d.title, detail: d.detail, refId: d.id };
          return {
            investigations: {
              ...s.investigations,
              [id]: recalc({ ...w, decisions: [...w.decisions, d], timeline: [...w.timeline, tl] }),
            },
          };
        }),

      addTimelineEvent: (id, ev) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t: TimelineEvent = { id: uid("tl"), at: ev.at ?? now(), ...ev };
          return { investigations: { ...s.investigations, [id]: { ...w, timeline: [...w.timeline, t], updatedAt: now() } } };
        }),

      upsertEntity: (id, ent) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const existing = w.entities.find((e) => e.id === ent.id || e.name === ent.name);
          const merged: WorkspaceEntity = existing
            ? {
                ...existing,
                ...ent,
                evidenceIds: Array.from(new Set([...(existing.evidenceIds ?? []), ...(ent.evidenceIds ?? [])])),
                relatedTo: Array.from(new Set([...(existing.relatedTo ?? []), ...(ent.relatedTo ?? [])])),
              }
            : {
                evidenceIds: [],
                relatedTo: [],
                ...ent,
              };
          const entities = existing
            ? w.entities.map((e) => (e.id === existing.id ? merged : e))
            : [...w.entities, merged];
          return { investigations: { ...s.investigations, [id]: { ...w, entities, updatedAt: now() } } };
        }),

      setRecommendation: (id, rec) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          return { investigations: { ...s.investigations, [id]: { ...w, recommendation: rec, updatedAt: now() } } };
        }),

      appendConversation: (id, turn) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t: InvestigationWorkspace["conversationTurns"][number] = {
            id: uid("turn"),
            at: now(),
            ...turn,
          };
          const tl: TimelineEvent | null =
            turn.role === "officer"
              ? { id: uid("tl"), at: t.at, kind: "question", label: `Officer: ${turn.text}`.slice(0, 140) }
              : turn.briefingId
                ? { id: uid("tl"), at: t.at, kind: "briefing", label: "Briefing generated", refId: turn.briefingId }
                : null;
          return {
            investigations: {
              ...s.investigations,
              [id]: {
                ...w,
                conversationTurns: [...w.conversationTurns, t],
                timeline: tl ? [...w.timeline, tl] : w.timeline,
                updatedAt: now(),
              },
            },
          };
        }),

      removeInvestigation: (id) =>
        set((s) => {
          const next = { ...s.investigations };
          delete next[id];
          return { investigations: next, activeId: s.activeId === id ? null : s.activeId };
        }),

      exportInvestigation: (id) => get().investigations[id] ?? null,

      addNotebookEntry: (id, entry) => {
        const entryId = entry.id ?? uid("nb");
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t = now();
          const e: NotebookEntry = {
            id: entryId,
            createdAt: entry.createdAt ?? t,
            updatedAt: t,
            versions: [{ at: t, body: entry.body, officer: entry.officer }],
            ...entry,
          };
          const tl: TimelineEvent = {
            id: uid("tl"),
            at: t,
            kind: e.kind === "QUESTION" ? "question" : "briefing",
            label: `${e.kind}: ${e.title}`,
            refId: entryId,
          };
          return {
            investigations: {
              ...s.investigations,
              [id]: { ...w, notebook: [...(w.notebook ?? []), e], timeline: [...w.timeline, tl], updatedAt: t },
            },
          };
        });
        return entryId;
      },

      updateNotebookEntry: (id, entryId, patch) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const t = now();
          const notebook = (w.notebook ?? []).map((e) => {
            if (e.id !== entryId) return e;
            const bodyChanged = patch.body !== undefined && patch.body !== e.body;
            const versions = bodyChanged
              ? [...e.versions, { at: t, body: patch.body!, officer: patch.officer }]
              : e.versions;
            return { ...e, ...patch, versions, updatedAt: t };
          });
          return { investigations: { ...s.investigations, [id]: { ...w, notebook, updatedAt: t } } };
        }),

      removeNotebookEntry: (id, entryId) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          return {
            investigations: {
              ...s.investigations,
              [id]: { ...w, notebook: (w.notebook ?? []).filter((e) => e.id !== entryId), updatedAt: now() },
            },
          };
        }),

      linkMission: (id, missionId, note) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const existing = w.missionPlanIds ?? [];
          if (existing.includes(missionId)) return s;
          const t = now();
          const tl: TimelineEvent = {
            id: uid("tl"), at: t, kind: "decision",
            label: `Mission linked: ${missionId}`, detail: note, refId: missionId,
          };
          return {
            investigations: {
              ...s.investigations,
              [id]: { ...w, missionPlanIds: [...existing, missionId], timeline: [...w.timeline, tl], updatedAt: t },
            },
          };
        }),

      linkOklPattern: (id, patternId, note) =>
        set((s) => {
          const w = s.investigations[id];
          if (!w) return s;
          const existing = w.oklPatternIds ?? [];
          if (existing.includes(patternId)) return s;
          const t = now();
          const tl: TimelineEvent = {
            id: uid("tl"), at: t, kind: "recommendation",
            label: `OKL pattern linked: ${patternId}`, detail: note, refId: patternId,
          };
          return {
            investigations: {
              ...s.investigations,
              [id]: { ...w, oklPatternIds: [...existing, patternId], timeline: [...w.timeline, tl], updatedAt: t },
            },
          };
        }),

    }),
    {
      name: "seaphore.iiw.v1",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage))),
      partialize: (s) => ({ activeId: s.activeId, investigations: s.investigations }),
    },
  ),
);

export function useActiveInvestigation(): InvestigationWorkspace | null {
  return useWorkspaceStore((s) => (s.activeId ? s.investigations[s.activeId] ?? null : null));
}
