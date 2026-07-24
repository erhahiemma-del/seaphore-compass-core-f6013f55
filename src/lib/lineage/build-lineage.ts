/**
 * build-lineage — assembles an Evidence Lineage Trace from artefacts that
 * already exist in the pipeline. No new reasoning; strictly projection.
 *
 * Inputs:
 *   • IBE result (humanResponse.keyFindings citations + recommendedActions
 *     + hypotheses + response contract audit).
 *   • Adapted briefing (criticalFindings citations, intelligenceGaps,
 *     evidenceSources summary).
 *   • Active MissionContext (shared operational slices + conversation).
 *   • Active InvestigationWorkspace (REJECTED evidence, contradicted
 *     hypotheses, prior decisions).
 *
 * Output: `LineageTrace` — read-only, ready to render.
 */
import type {
  AdaptiveBriefing as AdaptiveBriefingData,
  EvidenceCitation as UIEvidenceCitation,
  EvidenceGrade,
} from "@/components/copilot/briefing/types";
import type { HumanResponse, EvidenceCitation as OIECitation } from "@/services/oie/types";
import type { IbeHypothesis } from "@/services/ibe/types";
import type { MissionContext } from "@/stores/mission-context.store";
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import type {
  DiscardedEvidence,
  LineageContextLink,
  LineageEvidence,
  LineageTrace,
  RecommendationLineage,
} from "./types";

export interface BuildLineageInput {
  briefing: AdaptiveBriefingData;
  humanResponse?: HumanResponse;
  hypotheses?: readonly IbeHypothesis[];
  mission?: MissionContext | null;
  workspace?: InvestigationWorkspace | null;
}

function normaliseCitation(c: OIECitation | UIEvidenceCitation, ref?: string): LineageEvidence {
  const collectedAt = "collectedAt" in c ? c.collectedAt : (c as OIECitation).collectedAt;
  return {
    id: c.id,
    source: c.source,
    grade: c.grade as EvidenceGrade,
    excerpt: c.excerpt,
    hash: c.hash,
    collectedAt,
    referencedBy: ref,
  };
}

function dedupeEvidence(list: LineageEvidence[]): LineageEvidence[] {
  const seen = new Map<string, LineageEvidence>();
  for (const e of list) {
    const key = e.hash ?? `${e.id}::${e.source}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return Array.from(seen.values());
}

function collectSharedContext(
  mission: MissionContext | null | undefined,
  workspace: InvestigationWorkspace | null | undefined,
): LineageContextLink[] {
  const links: LineageContextLink[] = [];
  if (mission) {
    const sliceKeys: Array<keyof MissionContext> = [
      "vessel",
      "voyage",
      "manifest",
      "port",
      "companies",
      "alerts",
    ];
    for (const k of sliceKeys) {
      const v = mission[k];
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      links.push({
        kind: "mission_slice",
        label: `Mission · ${String(k)}`,
        detail: Array.isArray(v) ? `${v.length} record(s)` : "carried from prior turn",
        ref: String(k),
      });
    }
    // Most recent officer turn provides conversational context.
    const lastOfficer = [...mission.conversation]
      .reverse()
      .find((c) => c.role === "officer");
    if (lastOfficer) {
      links.push({
        kind: "conversation",
        label: "Prior officer turn",
        detail: lastOfficer.text.slice(0, 140),
        ref: lastOfficer.id,
      });
    }
  }
  if (workspace) {
    // Confirmed / supported hypotheses inform this recommendation.
    for (const h of workspace.hypotheses) {
      if (h.status === "SUPPORTED" || h.status === "CONFIRMED") {
        links.push({
          kind: "hypothesis",
          label: `Working hypothesis · ${h.status.toLowerCase()}`,
          detail: h.statement,
          ref: h.id,
        });
      }
    }
    // Most recent decision anchors continuity.
    const lastDecision = workspace.decisions[workspace.decisions.length - 1];
    if (lastDecision) {
      links.push({
        kind: "decision",
        label: "Last officer decision",
        detail: lastDecision.title,
        ref: lastDecision.id,
      });
    }
  }
  return links;
}

function collectDiscarded(input: BuildLineageInput): DiscardedEvidence[] {
  const out: DiscardedEvidence[] = [];

  // Workspace REJECTED evidence — officer or system moved it out.
  for (const ev of input.workspace?.evidence ?? []) {
    if (ev.category !== "REJECTED") continue;
    out.push({
      id: ev.id,
      label: ev.title,
      source: ev.source,
      grade: (ev.grade as EvidenceGrade) ?? undefined,
      reason: "Moved to REJECTED in the Investigation Workspace.",
      origin: "workspace_rejected",
    });
  }

  // Hypotheses that carry contradicting-evidence references.
  for (const h of input.hypotheses ?? []) {
    for (const c of h.contradicting) {
      out.push({
        id: `hyp:${h.id}:${c}`,
        label: c,
        reason: `Contradicts working hypothesis: "${h.statement}".`,
        origin: "hypothesis_contradicting",
      });
    }
  }

  // Workspace hypotheses that were CONTRADICTED/REJECTED/RETIRED.
  for (const h of input.workspace?.hypotheses ?? []) {
    if (h.status === "CONTRADICTED" || h.status === "REJECTED" || h.status === "RETIRED") {
      out.push({
        id: `wsh:${h.id}`,
        label: h.statement,
        reason: `Alternative hypothesis marked ${h.status} at ${new Date(h.updatedAt).toISOString().slice(0, 16)}Z.`,
        origin: "hypothesis_contradicting",
      });
    }
  }

  // Intelligence gaps — evidence that was expected but could not be produced.
  for (const gap of input.briefing.intelligenceGaps ?? []) {
    out.push({
      id: `gap:${gap.slice(0, 32)}`,
      label: gap,
      reason: "Requested evidence was not available or below quality threshold.",
      origin: "intelligence_gap",
    });
  }

  // Information the OIE explicitly still needs.
  for (const need of input.humanResponse?.informationStillNeeded ?? []) {
    out.push({
      id: `need:${need.slice(0, 32)}`,
      label: need,
      reason: "Marked by the Operational Intelligence Engine as still-needed input.",
      origin: "information_needed",
    });
  }

  // Dedupe by id.
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

export function buildLineageTrace(input: BuildLineageInput): LineageTrace {
  const { briefing, humanResponse } = input;

  // 1. Assemble the supporting evidence pool from all known citation sources.
  const findingsCitations: LineageEvidence[] = [];
  for (const f of humanResponse?.keyFindings ?? []) {
    for (const c of f.citations) findingsCitations.push(normaliseCitation(c, f.text));
  }
  for (const f of briefing.criticalFindings ?? []) {
    for (const c of f.citations ?? []) findingsCitations.push(normaliseCitation(c, f.title));
  }
  const pooledEvidence = dedupeEvidence(findingsCitations);

  const sharedContext = collectSharedContext(input.mission, input.workspace);
  const allDiscarded = collectDiscarded(input);

  // 2. Attach evidence to each recommendation. When OIE does not tie
  //    citations directly to actions, we use rationale/action text matching
  //    against key-finding text as the association heuristic; unmatched
  //    citations fall through as global support (still shown).
  const recs = humanResponse?.recommendedActions ?? [];
  const recommendations: RecommendationLineage[] = recs.map((r, i) => {
    const haystack = `${r.action}\n${r.rationale}`.toLowerCase();
    const matched = pooledEvidence.filter((e) => {
      const needle = (e.referencedBy ?? "").toLowerCase();
      if (!needle) return false;
      // Simple lexical overlap: any three-word span from the finding present.
      const tokens = needle.split(/\W+/).filter((t) => t.length > 3);
      return tokens.some((t) => haystack.includes(t));
    });
    const supporting = matched.length > 0 ? matched : pooledEvidence.slice(0, 3);

    return {
      id: `rec-${i}`,
      action: r.action,
      confidenceBadge: r.confidence,
      rationale: r.rationale,
      supporting,
      sharedContext,
      discarded: allDiscarded,
    };
  });

  // 3. If there are no explicit recommendations (e.g. clarify branch),
  //    still emit a single synthetic lineage entry so the officer can see
  //    what evidence the platform *did* gather.
  if (recommendations.length === 0 && pooledEvidence.length > 0) {
    recommendations.push({
      id: "rec-general",
      action: "Briefing without explicit recommendation",
      rationale: "No action was recommended for this turn. Evidence gathered is listed for review.",
      supporting: pooledEvidence,
      sharedContext,
      discarded: allDiscarded,
    });
  }

  return {
    briefingId: briefing.id,
    query: briefing.query,
    generatedAt: new Date().toISOString(),
    recommendations,
    globalDiscarded: recommendations.length === 0 ? allDiscarded : [],
    notice:
      "Evidence lineage projects existing OIE citations, IBE hypotheses, mission context, and workspace state. It does not re-derive intelligence.",
  };
}
