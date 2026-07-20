/**
 * adapt-briefing — maps the orchestration `Briefing` (server contract) to
 * the `AdaptiveBriefing` UI contract consumed by the Sprint 3 renderer.
 *
 * The orchestration Engine returns a section-list keyed by `kind`; the
 * Adaptive Briefing Renderer takes a flattened, UI-oriented object. This
 * adapter walks the sections once, extracts the payloads it recognises,
 * and returns a `AdaptiveBriefingData` ready to render.
 */
import type {
  AdaptiveBriefingData,
  EvidenceCardData,
  CriticalFinding,
  EvidenceGrade,
} from "@/components/copilot/briefing";
import type { BriefingSection, EvidenceItem } from "@/services/orchestration";

export interface CopilotQueryResponse {
  briefing_id: string;
  classification: {
    typeBadge: string;
    matrix: { tier: "low" | "medium" | "high"; composite: number };
    evidenceStrength: "weak" | "moderate" | "strong";
  };
  sections: BriefingSection[];
  intelligence_status: "complete" | "partial" | "insufficient";
  sources_queried: number;
  sources_responded: number;
  sources_corroborated: number;
  mode: string;
  latency_ms?: number;
}

function findSection(sections: BriefingSection[], kind: BriefingSection["kind"]) {
  // BriefingSection is a discriminated union; the caller narrows via `kind`
  // and reads `payload` with the shape it expects for that section.
  return sections.find((s) => s.kind === kind) as
    | { kind: typeof kind; title: string; payload: any } // eslint-disable-line @typescript-eslint/no-explicit-any
    | undefined;
}

function evidenceItemToCard(item: EvidenceItem): EvidenceCardData {
  return {
    id: item.id,
    grade: item.grade as EvidenceGrade,
    title: item.content.slice(0, 96),
    source: item.source_system,
    observedAt: item.collected_at,
    summary: item.content,
    hash: item.hash_sha256,
  };
}

export function adaptBriefing(
  response: CopilotQueryResponse,
  query: string,
  extras?: { evidence?: EvidenceItem[] },
): AdaptiveBriefingData {
  const s = response.sections;

  const executive = findSection(s, "executive");
  const critical = findSection(s, "critical_findings");
  const patterns = findSection(s, "observed_patterns");
  const analytical = findSection(s, "analytical_assessment");
  const why = findSection(s, "explainability_chain") ?? findSection(s, "why_this_matters");
  const counter = findSection(s, "counter_hypotheses");
  const gaps = findSection(s, "intelligence_gaps");
  const impact = findSection(s, "decision_impact");
  const required = findSection(s, "decision_required");
  const actions = findSection(s, "officer_actions");
  const sources = findSection(s, "evidence_sources");
  const next = findSection(s, "next_questions");

  const criticalFindings: CriticalFinding[] | undefined = critical
    ? critical.payload.findings.map((f: { priority: string; title: string; grade: string; source: string }, i: number) => ({
        id: `${response.briefing_id}-cf-${i}`,
        priority: (f.priority as CriticalFinding["priority"]) ?? "monitor",
        title: f.title,
        grade: f.grade as EvidenceGrade,
        source: f.source,
      }))
    : undefined;

  return {
    id: response.briefing_id,
    query,
    classification: {
      typeBadge: response.classification.typeBadge,
      tier: response.classification.matrix.tier,
      compositeConfidence: response.classification.matrix.composite,
      evidenceStrength: response.classification.evidenceStrength,
      latencyMs: response.latency_ms,
      model: "lovable-ai:gemini",
    },
    executive: executive ? { text: executive.payload.text } : undefined,
    criticalFindings,
    evidence: extras?.evidence?.map(evidenceItemToCard),
    patterns: patterns
      ? patterns.payload.patterns.map((p: { pattern: string; caseRefs: string[] }, i: number) => ({
          id: `${response.briefing_id}-p-${i}`,
          pattern: p.pattern,
          significance: "notable" as const,
          caseRefs: p.caseRefs,
        }))
      : undefined,
    analytical: analytical ? { text: analytical.payload.text } : undefined,
    whyChain: why?.payload.chain,
    counterHypotheses: counter?.payload.list,
    intelligenceGaps: gaps?.payload.list,
    decisionImpact: impact?.payload,
    decisionRequired: required?.payload,
    officerActions: actions?.payload.actions.map((a: { id: string; label: string }) => ({ id: a.id, label: a.label })),
    evidenceSources: sources
      ? {
          queried: sources.payload.queried,
          responded: sources.payload.responded,
          corroborated: sources.payload.corroborated,
        }
      : {
          queried: response.sources_queried,
          responded: response.sources_responded,
          corroborated: response.sources_corroborated,
        },
    nextQuestions: next?.payload.questions,
  };
}
