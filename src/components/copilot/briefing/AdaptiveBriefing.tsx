/**
 * SPRINT 3 — Adaptive Briefing Renderer (NIMASA Copilot).
 *
 * Consumes an `AdaptiveBriefing` JSON contract and assembles only the
 * sections whose payloads are present and non-empty. Every screen ends
 * with the immutable footer:
 *   "Evidence first. Explainable always. Officer decides."
 */
import { useMemo, useState } from "react";
import { EvidenceCard } from "./EvidenceCard";
import { EntityCard } from "./EntityCard";
import { PatternCard } from "./PatternCard";
import { SectionShell, TierBadge } from "./primitives";
import {
  AnalyticalAssessment,
  CounterHypotheses,
  CriticalFindings,
  DecisionImpact,
  DecisionRequired,
  EvidenceSourcesPanel,
  ExecutiveAssessment,
  HumanOverrideBar,
  IntelligenceGaps,
  NextQuestions,
  OfficerActions,
} from "./sections";
import type {
  AdaptiveBriefing as AdaptiveBriefingData,
  EntityCardData,
  EvidenceCardData,
  OverrideDecision,
  OverrideSubmission,
} from "./types";

export interface AdaptiveBriefingProps {
  briefing: AdaptiveBriefingData;
  onOverride?: (submission: OverrideSubmission) => void | Promise<void>;
  onEntityOpen?: (entity: EntityCardData) => void;
  onEvidenceOpen?: (evidence: EvidenceCardData) => void;
  onNextQuestion?: (question: string) => void;
  onGapRequest?: (gap: string) => void;
  className?: string;
}

function nonEmpty<T>(arr: T[] | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

export function AdaptiveBriefing({
  briefing,
  onOverride,
  onEntityOpen,
  onEvidenceOpen,
  onNextQuestion,
  onGapRequest,
  className,
}: AdaptiveBriefingProps) {
  const [override, setOverride] = useState<OverrideDecision | null>(null);
  const [justification, setJustification] = useState("");
  const [accepted, setAccepted] = useState<string[]>([]);

  const actionsEnabled = override === "agree" || override === "modify";

  function toggleAction(id: string, checked: boolean) {
    setAccepted((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  async function submitOverride(decision: OverrideDecision) {
    setOverride(decision);
    await onOverride?.({
      decision,
      justification: justification.trim() || undefined,
      actionsAccepted: decision === "agree" || decision === "modify" ? accepted : [],
    });
  }

  const hasEvidence = nonEmpty(briefing.evidence);
  const hasEntities = nonEmpty(briefing.entities);
  const hasPatterns = nonEmpty(briefing.patterns);
  const hasFindings = nonEmpty(briefing.criticalFindings);

  const showSources = useMemo(
    () => Boolean(briefing.evidenceSources && briefing.evidenceSources.queried > 0),
    [briefing.evidenceSources],
  );

  return (
    <article
      aria-label={`Briefing ${briefing.id}`}
      className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className ?? ""}`}
    >
      {/* Classification banner */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/30 px-6 py-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            {briefing.classification.typeBadge}
          </span>
          <TierBadge
            tier={briefing.classification.tier}
            value={briefing.classification.compositeConfidence}
          />
          <span className="rounded-md border px-2 py-1 text-xs capitalize text-muted-foreground">
            Evidence: {briefing.classification.evidenceStrength}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {briefing.classification.latencyMs != null && `${briefing.classification.latencyMs} ms`}
          {briefing.classification.model && ` · ${briefing.classification.model}`}
        </span>
      </header>

      <div className="space-y-6 p-6">
        {briefing.executive && <ExecutiveAssessment text={briefing.executive.text} />}

        {hasFindings && <CriticalFindings findings={briefing.criticalFindings!} />}

        {hasEvidence && (
          <SectionShell title="Evidence">
            <div className="grid gap-3 md:grid-cols-2">
              {briefing.evidence!.map((e) => (
                <EvidenceCard key={e.id} evidence={e} onOpen={onEvidenceOpen} />
              ))}
            </div>
          </SectionShell>
        )}

        {hasEntities && (
          <SectionShell title="Entities">
            <div className="grid gap-3 md:grid-cols-2">
              {briefing.entities!.map((e) => (
                <EntityCard key={e.id} entity={e} onOpen={onEntityOpen} />
              ))}
            </div>
          </SectionShell>
        )}

        {hasPatterns && (
          <SectionShell title="Observed Patterns">
            <div className="grid gap-3 md:grid-cols-2">
              {briefing.patterns!.map((p) => (
                <PatternCard key={p.id} pattern={p} />
              ))}
            </div>
          </SectionShell>
        )}

        {briefing.analytical && (
          <AnalyticalAssessment text={briefing.analytical.text} whyChain={briefing.whyChain} />
        )}

        {nonEmpty(briefing.counterHypotheses) && (
          <CounterHypotheses list={briefing.counterHypotheses!} />
        )}

        {nonEmpty(briefing.intelligenceGaps) && (
          <IntelligenceGaps gaps={briefing.intelligenceGaps!} onRequest={onGapRequest} />
        )}

        {briefing.decisionImpact && <DecisionImpact impact={briefing.decisionImpact} />}

        {briefing.decisionRequired && <DecisionRequired decision={briefing.decisionRequired} />}

        {nonEmpty(briefing.officerActions) && (
          <OfficerActions
            actions={briefing.officerActions!}
            enabled={actionsEnabled}
            accepted={accepted}
            onToggle={toggleAction}
          />
        )}

        <HumanOverrideBar
          value={override}
          onChange={submitOverride}
          justification={justification}
          onJustificationChange={setJustification}
        />

        {showSources && <EvidenceSourcesPanel sources={briefing.evidenceSources!} />}

        {nonEmpty(briefing.nextQuestions) && (
          <NextQuestions questions={briefing.nextQuestions!} onAsk={onNextQuestion} />
        )}
      </div>

      <footer className="border-t px-6 py-3 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </footer>
    </article>
  );
}
