/**
 * SPRINT UX-004 — Adaptive Intelligence Briefing Engine (AIBE) renderer.
 *
 * Composes an executive briefing on top of the frozen `AdaptiveBriefing`
 * UI contract. Section order, KPIs, follow-up commands and the
 * Investigation Progress tracker are driven by a mission profile from
 * `./profiles`. No reasoning happens here — OIE / ICE / IAL / Mission
 * Builder / Connector Framework are untouched.
 *
 * Every screen ends with the immutable footer:
 *   "Evidence first. Explainable always. Officer decides."
 */
import { useMemo, useState } from "react";
import { EvidenceCard } from "./EvidenceCard";
import { EntityCard } from "./EntityCard";
import { OfficerDecisionHeader } from "./OfficerDecisionHeader";
import { PatternCard } from "./PatternCard";
import { SectionShell, TierBadge } from "./primitives";
import {
  AnalyticalAssessment,
  CounterHypotheses,
  CriticalFindings,
  DecisionImpact,
  DecisionRequired,
  EvidenceSourcesPanel,
  HumanOverrideBar,
  IntelligenceGaps,
  NextQuestions,
  OfficerActions,
} from "./sections";
import { detectMissionType, getProfile } from "./profiles";
import type {
  BriefingProfile,
  BriefingSlot,
  FollowUpCommand,
  KPI,
  MissionBriefingType,
} from "./profiles";
import type {
  AdaptiveBriefing as AdaptiveBriefingData,
  EntityCardData,
  EvidenceCardData,
  OverrideDecision,
  OverrideSubmission,
} from "./types";

export interface AdaptiveBriefingProps {
  briefing: AdaptiveBriefingData;
  /** Optional explicit profile override; auto-detected when omitted. */
  missionType?: MissionBriefingType;
  onOverride?: (submission: OverrideSubmission) => void | Promise<void>;
  onEntityOpen?: (entity: EntityCardData) => void;
  onEvidenceOpen?: (evidence: EvidenceCardData) => void;
  onNextQuestion?: (question: string) => void;
  onGapRequest?: (gap: string) => void;
  /** Executes a mission-specific follow-up command through the same pipeline. */
  onFollowUpCommand?: (query: string) => void;
  className?: string;
}

function nonEmpty<T>(arr: T[] | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

const KPI_TONE: Record<NonNullable<KPI["tone"]>, string> = {
  neutral: "border-border bg-muted/40 text-foreground",
  positive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  critical: "border-red-500/40 bg-red-500/10 text-red-800",
};

function KPIBanner({ profile, kpis }: { profile: BriefingProfile; kpis: KPI[] }) {
  if (kpis.length === 0) return null;
  return (
    <SectionShell title={`${profile.label} · Key Indicators`}>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {kpis.map((k, i) => (
          <div
            key={`${k.label}-${i}`}
            className={`rounded-md border p-3 ${KPI_TONE[k.tone ?? "neutral"]}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              {k.label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{k.value}</p>
            {k.hint && <p className="mt-1 text-[11px] opacity-70">{k.hint}</p>}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function FollowUpCommands({
  commands,
  onCommand,
}: {
  commands: FollowUpCommand[];
  onCommand?: (query: string) => void;
}) {
  if (commands.length === 0) return null;
  return (
    <SectionShell title="Follow-up Commands">
      <div className="flex flex-wrap gap-2">
        {commands.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onCommand?.(c.query)}
            className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {c.label}
          </button>
        ))}
      </div>
    </SectionShell>
  );
}

export function AdaptiveBriefing({
  briefing,
  missionType,
  onOverride,
  onEntityOpen,
  onEvidenceOpen,
  onNextQuestion,
  onGapRequest,
  onFollowUpCommand,
  className,
}: AdaptiveBriefingProps) {
  const [override, setOverride] = useState<OverrideDecision | null>(null);
  const [justification, setJustification] = useState("");
  const [accepted, setAccepted] = useState<string[]>([]);

  const detected = useMemo<MissionBriefingType>(
    () => missionType ?? detectMissionType(briefing),
    [missionType, briefing],
  );
  const profile = useMemo(() => getProfile(detected), [detected]);
  const kpis = useMemo(() => profile.computeKPIs(briefing), [profile, briefing]);
  const followUps = useMemo(() => profile.followUpCommands(briefing), [profile, briefing]);

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

  const showSources = Boolean(briefing.evidenceSources && briefing.evidenceSources.queried > 0);

  // Build the slot render map once so section ordering is trivial.
  const slots: Record<BriefingSlot, React.ReactNode> = {
    header: <OfficerDecisionHeader briefing={briefing} profile={profile} />,
    kpis: <KPIBanner profile={profile} kpis={kpis} />,
    gaps: nonEmpty(briefing.intelligenceGaps) ? (
      <IntelligenceGaps gaps={briefing.intelligenceGaps!} onRequest={onGapRequest} />
    ) : null,
    criticalFindings: nonEmpty(briefing.criticalFindings) ? (
      <CriticalFindings findings={briefing.criticalFindings!} />
    ) : null,
    evidence: nonEmpty(briefing.evidence) ? (
      <SectionShell title="Supporting Evidence">
        <div className="grid gap-3 md:grid-cols-2">
          {briefing.evidence!.map((e) => (
            <EvidenceCard key={e.id} evidence={e} onOpen={onEvidenceOpen} />
          ))}
        </div>
      </SectionShell>
    ) : null,
    entities: nonEmpty(briefing.entities) ? (
      <SectionShell title="Entities">
        <div className="grid gap-3 md:grid-cols-2">
          {briefing.entities!.map((e) => (
            <EntityCard key={e.id} entity={e} onOpen={onEntityOpen} />
          ))}
        </div>
      </SectionShell>
    ) : null,
    patterns: nonEmpty(briefing.patterns) ? (
      <SectionShell title="Observed Patterns">
        <div className="grid gap-3 md:grid-cols-2">
          {briefing.patterns!.map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}
        </div>
      </SectionShell>
    ) : null,
    analytical: briefing.analytical ? (
      <AnalyticalAssessment text={briefing.analytical.text} whyChain={briefing.whyChain} />
    ) : null,
    counterHypotheses: nonEmpty(briefing.counterHypotheses) ? (
      <CounterHypotheses list={briefing.counterHypotheses!} />
    ) : null,
    decisionImpact: briefing.decisionImpact ? (
      <DecisionImpact impact={briefing.decisionImpact} />
    ) : null,
    decisionRequired: briefing.decisionRequired ? (
      <DecisionRequired decision={briefing.decisionRequired} />
    ) : null,
    officerActions: nonEmpty(briefing.officerActions) ? (
      <OfficerActions
        actions={briefing.officerActions!}
        enabled={actionsEnabled}
        accepted={accepted}
        onToggle={toggleAction}
      />
    ) : null,
    override: (
      <HumanOverrideBar
        value={override}
        onChange={submitOverride}
        justification={justification}
        onJustificationChange={setJustification}
      />
    ),
    followUpCommands: (
      <FollowUpCommands commands={followUps} onCommand={onFollowUpCommand ?? onNextQuestion} />
    ),
    sources: showSources ? <EvidenceSourcesPanel sources={briefing.evidenceSources!} /> : null,
    nextQuestions: nonEmpty(briefing.nextQuestions) ? (
      <NextQuestions questions={briefing.nextQuestions!} onAsk={onNextQuestion} />
    ) : null,
  };

  return (
    <article
      aria-label={`Briefing ${briefing.id}`}
      data-mission-type={profile.id}
      className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className ?? ""}`}
    >
      {/* Classification banner — profile badge replaces generic typeBadge */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/30 px-6 py-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
            title={profile.purpose}
          >
            {profile.badge}
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
        {profile.sectionOrder.map((slot) => {
          const node = slots[slot];
          if (!node) return null;
          return <div key={slot}>{node}</div>;
        })}
      </div>

      <footer className="border-t px-6 py-3 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </footer>
    </article>
  );
}
