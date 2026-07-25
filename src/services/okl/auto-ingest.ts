/**
 * OKL → Investigation Workspace auto-ingest.
 *
 * Pulls newly detected Operational Knowledge patterns into every ACTIVE /
 * MONITORING investigation whose subject overlaps the pattern. Every ingested
 * artifact is evidence-backed and idempotent — re-running the ingest never
 * duplicates evidence, tasks, or links. Officer decides on every
 * approval-gated recommendation.
 *
 * Golden Rule compliance: patterns are surfaced through existing workspace
 * primitives (evidence, tasks, timeline, stage history, oklPatternIds). Every
 * write is traceable back to the pattern id and the supporting evidence ids
 * from the Unified Intelligence Package.
 */

import type {
  OperationalKnowledgePackage,
  OperationalPattern,
} from "./types";
import { useWorkspaceStore, type InvestigationWorkspace, type WorkspacePriority } from "@/stores/workspace.store";

export interface OklAutoIngestResult {
  readonly ingestedAt: string;
  readonly packageId: string;
  readonly perInvestigation: Array<{
    readonly investigationId: string;
    readonly matchedPatternIds: string[];
    readonly linkedPatterns: number;
    readonly evidenceAdded: number;
    readonly tasksAdded: number;
    readonly conflictsRecorded: number;
    readonly stageAdvanced: boolean;
  }>;
}

function urgencyToPriority(u: OperationalPattern["recommendations"][number]["urgency"]): WorkspacePriority {
  if (u === "IMMEDIATE") return "CRITICAL";
  if (u === "PRIORITY") return "HIGH";
  return "MEDIUM";
}

function patternMatchesInvestigation(
  pattern: OperationalPattern,
  inv: InvestigationWorkspace,
): boolean {
  if (pattern.investigationIds?.includes(inv.id)) return true;
  const entityIds = new Set<string>();
  if (inv.subjectId) entityIds.add(inv.subjectId);
  for (const e of inv.entities) entityIds.add(e.id);
  for (const pe of pattern.entities) {
    if (entityIds.has(pe.id)) return true;
  }
  if (inv.subjectName) {
    const subj = inv.subjectName.toLowerCase();
    for (const pe of pattern.entities) {
      if (pe.label && pe.label.toLowerCase() === subj) return true;
    }
  }
  return false;
}

/**
 * Ingest an Operational Knowledge Package into all active investigations.
 * Returns a per-investigation summary describing what was linked/added.
 */
export function autoIngestOklIntoInvestigations(
  pkg: OperationalKnowledgePackage,
): OklAutoIngestResult {
  const state = useWorkspaceStore.getState();
  const {
    investigations,
    linkOklPattern,
    addEvidence,
    addTask,
    addTimelineEvent,
    advanceStage,
  } = state;

  const result: OklAutoIngestResult = {
    ingestedAt: new Date().toISOString(),
    packageId: pkg.id,
    perInvestigation: [],
  };

  for (const inv of Object.values(investigations)) {
    if (inv.status !== "ACTIVE" && inv.status !== "MONITORING") continue;

    const matched = pkg.patterns.filter((p) => patternMatchesInvestigation(p, inv));
    if (matched.length === 0) continue;

    let linked = 0;
    let evidenceAdded = 0;
    let tasksAdded = 0;
    let conflictsRecorded = 0;
    let stageAdvanced = false;

    for (const pattern of matched) {
      const before = useWorkspaceStore.getState().investigations[inv.id];
      const already = (before?.oklPatternIds ?? []).includes(pattern.id);
      linkOklPattern(inv.id, pattern.id, `${pattern.name} — ${pattern.riskLevel}`);
      if (!already) linked += 1;

      // Synthesise an evidence entry anchored to this pattern (idempotent via
      // hash on pattern.id). Category COLLECTED because the pattern is
      // fusion-derived from already-collected evidence.
      const evTitle = `OKL pattern: ${pattern.name}`;
      const evSource = `OKL/${pattern.provenance.detector}`;
      const before2 = useWorkspaceStore.getState().investigations[inv.id];
      const hadEv = before2?.evidence.some(
        (e) => e.hash === `okl:${pattern.id}` || (e.title === evTitle && e.source === evSource),
      );
      if (!hadEv) {
        addEvidence(inv.id, {
          title: evTitle,
          source: evSource,
          category: "COLLECTED",
          summary: pattern.operationalImpact,
          entityId: pattern.entities[0]?.id,
          entityName: pattern.entities[0]?.label,
          grade: pattern.confidence.tier,
          hash: `okl:${pattern.id}`,
        });
        evidenceAdded += 1;
      }

      // Officer-approval-gated recommendations become tasks (dedup by title).
      for (const rec of pattern.recommendations) {
        const before3 = useWorkspaceStore.getState().investigations[inv.id];
        const dup = before3?.tasks.some(
          (t) => t.title === rec.label && t.status !== "COMPLETED",
        );
        if (dup) continue;
        addTask(inv.id, {
          title: rec.label,
          priority: urgencyToPriority(rec.urgency),
          sourceCommand: `okl:${pattern.id}`,
        });
        tasksAdded += 1;
      }

      // Record any contradictions on the case timeline.
      for (const cid of pattern.contradictoryEvidenceIds ?? []) {
        addTimelineEvent(inv.id, {
          kind: "conflict",
          label: `OKL conflict: ${pattern.name}`,
          detail: `Contradictory evidence ${cid}`,
          refId: pattern.id,
        });
        conflictsRecorded += 1;
      }

      // Auto-advance intake cases to ANALYSIS on high/critical patterns.
      const current = useWorkspaceStore.getState().investigations[inv.id];
      if (
        current &&
        (pattern.riskLevel === "HIGH" || pattern.riskLevel === "CRITICAL") &&
        (current.stage ?? "INTAKE") === "INTAKE"
      ) {
        advanceStage(inv.id, "ANALYSIS", `Auto-advanced by OKL pattern ${pattern.name}`);
        stageAdvanced = true;
      }
    }

    result.perInvestigation.push({
      investigationId: inv.id,
      matchedPatternIds: matched.map((p) => p.id),
      linkedPatterns: linked,
      evidenceAdded,
      tasksAdded,
      conflictsRecorded,
      stageAdvanced,
    });
  }

  return result;
}
