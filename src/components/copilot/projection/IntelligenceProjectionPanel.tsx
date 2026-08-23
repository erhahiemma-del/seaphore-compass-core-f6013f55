/**
 * Intelligence Projection Panel (Sprint UX-007 / IPF).
 *
 * Officer-facing projection of the Intelligence Behaviour Engine's internal
 * state. Nothing important happens silently — every backend intelligence
 * capability that IBE produces is projected here into readable, actionable
 * UI without exposing chain-of-thought or implementation detail.
 *
 * Composed of:
 *   1. Investigation Status  — mission / stage / progress / confidence / next
 *   2. Proactive Discoveries — IBE nudges surfaced immediately
 *   3. Reasoning Summary     — considered / sources / uncertainties / why
 *   4. Working Hypotheses    — IBE hypothesis ledger, one line each
 *   5. Recommendation        — the operational next action
 *   6. Live Timeline         — mission start, evidence, hypothesis updates
 *
 * Renders inline above the Adaptive Briefing. Purely projection: it reads
 * from the passed IbeResult, mission context, and workspace store. No
 * backend logic is changed here.
 */
import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Compass,
  Gauge,
  Lightbulb,
  Timer,
  Sparkles,
  ListChecks,
} from "lucide-react";
import type { IbeResult } from "@/services/ibe/types";
import type { HumanResponse } from "@/services/oie/types";
import type { MissionWorkspaceState } from "@/stores/mission-workspace.store";
import { useWorkspaceStore } from "@/stores/workspace.store";

/* ── STAGE COPY ─────────────────────────────────────────────────────────── */

const STAGE_LABEL: Record<string, string> = {
  planning: "Planning",
  collecting: "Collecting evidence",
  correlating: "Correlating evidence",
  validating: "Validating findings",
  reviewing: "Reviewing assessment",
  decision_support: "Decision support",
  completed: "Completed",
};

const STAGE_ORDER = [
  "planning",
  "collecting",
  "correlating",
  "validating",
  "reviewing",
  "decision_support",
  "completed",
] as const;

function stageProgress(stage: string | undefined): number {
  if (!stage) return 0;
  const idx = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

function nextMilestone(stage: string | undefined): string {
  const idx = stage ? STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) : -1;
  if (idx < 0) return "Establish operational objective";
  const next = STAGE_ORDER[idx + 1];
  if (!next) return "Investigation complete — brief the decision-maker";
  return STAGE_LABEL[next] ?? "Advance the investigation";
}

/* ── ROOT ───────────────────────────────────────────────────────────────── */

export interface IntelligenceProjectionPanelProps {
  ibe: IbeResult["ibe"] | null | undefined;
  humanResponse: HumanResponse | null | undefined;
  mission: MissionWorkspaceState | null | undefined;
  briefingId?: string;
  className?: string;
}

export function IntelligenceProjectionPanel({
  ibe,
  humanResponse,
  mission,
  briefingId,
  className,
}: IntelligenceProjectionPanelProps) {
  const wsCount = useWorkspaceStore((s) => {
    const id = s.activeId;
    if (!id) return 0;
    const inv = s.investigations[id];
    return inv?.evidence?.length ?? 0;
  });

  // Nothing to project yet — remain silent, per Golden Rule (silence is
  // acceptable only when there is no backend intelligence to surface).
  if (!ibe && !humanResponse && !mission) return null;

  return (
    <section
      aria-label="Intelligence projection panel"
      className={`mb-3 space-y-3 ${className ?? ""}`}
    >
      <InvestigationStatusCard
        ibe={ibe}
        mission={mission}
        humanResponse={humanResponse}
        workspaceArtefactCount={wsCount}
      />
      {ibe?.nudges?.length ? <ProactiveDiscoveriesCard nudges={ibe.nudges} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <ReasoningSummaryCard ibe={ibe} humanResponse={humanResponse} />
        <RecommendationCard ibe={ibe} humanResponse={humanResponse} />
      </div>
      {ibe?.hypotheses?.length ? <WorkingHypothesesCard hypotheses={ibe.hypotheses} /> : null}
      <LiveInvestigationTimelineCard
        ibe={ibe}
        mission={mission}
        briefingId={briefingId}
        workspaceArtefactCount={wsCount}
      />
    </section>
  );
}

/* ── CARDS ──────────────────────────────────────────────────────────────── */

function CardShell({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-[#FAFBFC] p-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h3>
        {hint ? <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span> : null}
      </header>
      {children}
    </div>
  );
}

function InvestigationStatusCard({
  ibe,
  mission,
  humanResponse,
  workspaceArtefactCount,
}: {
  ibe: IbeResult["ibe"] | null | undefined;
  mission: MissionWorkspaceState | null | undefined;
  humanResponse: HumanResponse | null | undefined;
  workspaceArtefactCount: number;
}) {
  const stage = ibe?.stage ?? "planning";
  const progress = stageProgress(stage);
  const outstanding = humanResponse?.informationStillNeeded ?? [];
  const confidence = humanResponse?.confidenceAssessment?.badge ?? "Insufficient Evidence";
  const missionTitle = mission?.title ?? "Ambient investigation";

  return (
    <CardShell
      icon={<Compass className="h-3.5 w-3.5" />}
      title="Investigation status"
      hint={ibe?.persona ? `Style · ${ibe.persona}` : undefined}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Stat label="Mission" value={missionTitle} />
        <Stat label="Stage" value={STAGE_LABEL[stage] ?? stage} />
        <Stat label="Confidence" value={confidence} />
        <Stat label="Evidence in workspace" value={String(workspaceArtefactCount)} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Next milestone
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-foreground">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            {nextMilestone(stage)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Outstanding evidence
          </div>
          {outstanding.length === 0 ? (
            <div className="mt-0.5 inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> None open
            </div>
          ) : (
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-foreground">
              {outstanding.slice(0, 3).map((g, i) => (
                <li key={i}>{g}</li>
              ))}
              {outstanding.length > 3 ? (
                <li className="text-muted-foreground">+{outstanding.length - 3} more</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </CardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}

function ProactiveDiscoveriesCard({ nudges }: { nudges: NonNullable<IbeResult["ibe"]>["nudges"] }) {
  const critical = nudges.filter((n) => n.priority === "critical");
  const high = nudges.filter((n) => n.priority === "high");
  const monitor = nudges.filter((n) => n.priority === "monitor");
  const ordered = [...critical, ...high, ...monitor];

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-700">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
          While investigating, Seaphore noticed…
        </h3>
        <span className="ml-auto text-[10px] text-amber-800/70">
          {ordered.length} discover{ordered.length === 1 ? "y" : "ies"}
        </span>
      </header>
      <ul className="space-y-1.5">
        {ordered.map((n) => (
          <li key={n.id} className="flex items-start gap-2 text-xs">
            <PriorityDot priority={n.priority} />
            <div>
              <div className="text-foreground">{n.text}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {n.origin} · {n.priority}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriorityDot({ priority }: { priority: "critical" | "high" | "monitor" }) {
  const tone =
    priority === "critical"
      ? "bg-destructive"
      : priority === "high"
        ? "bg-amber-500"
        : "bg-muted-foreground/60";
  return <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${tone}`} aria-hidden />;
}

function ReasoningSummaryCard({
  ibe,
  humanResponse,
}: {
  ibe: IbeResult["ibe"] | null | undefined;
  humanResponse: HumanResponse | null | undefined;
}) {
  // Officer-safe reasoning summary. We deliberately do NOT surface the
  // internal `thought.objective` verbatim (that is chain-of-thought).
  // We surface: what was considered, which sources informed the
  // assessment, what uncertainties remain, and why the recommendation
  // follows.
  const considered = ibe?.thought?.known ?? [];
  const uncertainties = ibe?.thought?.missing ?? humanResponse?.informationStillNeeded ?? [];
  const rationale =
    humanResponse?.recommendedActions?.[0]?.rationale ??
    humanResponse?.confidenceAssessment?.explanation ??
    "Assessment follows from the evidence considered above.";
  const contract = ibe?.contract;

  return (
    <CardShell
      icon={<Brain className="h-3.5 w-3.5" />}
      title="Reasoning summary"
      hint={
        contract ? `${contract.checks.filter((c) => c.satisfied).length}/9 contract` : undefined
      }
    >
      <div className="space-y-2 text-xs">
        <ReasoningLine
          label="Considered"
          items={
            considered.length ? considered.slice(0, 4) : ["Mission context and prior findings"]
          }
        />
        <ReasoningLine
          label="Uncertainties"
          items={uncertainties.length ? uncertainties.slice(0, 3) : ["None material"]}
          tone={uncertainties.length ? "warning" : "muted"}
        />
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Why the recommendation follows
          </div>
          <p className="mt-0.5 text-foreground">{rationale}</p>
        </div>
      </div>
    </CardShell>
  );
}

function ReasoningLine({
  label,
  items,
  tone = "default",
}: {
  label: string;
  items: string[];
  tone?: "default" | "warning" | "muted";
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-800"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className={`mt-0.5 list-disc space-y-0.5 pl-4 ${toneClass}`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationCard({
  ibe,
  humanResponse,
}: {
  ibe: IbeResult["ibe"] | null | undefined;
  humanResponse: HumanResponse | null | undefined;
}) {
  const primary = humanResponse?.recommendedActions?.[0];
  const nextFromIbe = ibe?.thought?.nextRecommendation;
  const action = primary?.action ?? nextFromIbe ?? "Continue collecting evidence for this mission.";
  const confidence = primary?.confidence ?? "Insufficient Evidence";
  const alternatives = humanResponse?.recommendedActions?.slice(1) ?? [];

  return (
    <CardShell
      icon={<Lightbulb className="h-3.5 w-3.5" />}
      title="Recommended next action"
      hint="System recommends — Officer decides"
    >
      <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
        <div className="text-foreground">{action}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {confidence}
          </span>
          {primary?.rationale ? (
            <span className="truncate text-[10px] text-muted-foreground" title={primary.rationale}>
              {primary.rationale}
            </span>
          ) : null}
        </div>
      </div>
      {alternatives.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Alternative actions
          </div>
          <ul className="mt-0.5 space-y-1 text-xs">
            {alternatives.slice(0, 2).map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <ChevronRight className="mt-0.5 h-3 w-3 text-muted-foreground" />
                <span className="text-foreground">{a.action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CardShell>
  );
}

function WorkingHypothesesCard({
  hypotheses,
}: {
  hypotheses: NonNullable<IbeResult["ibe"]>["hypotheses"];
}) {
  const CONF_TONE: Record<string, string> = {
    leading: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
    credible: "border-blue-500/40 bg-blue-500/10 text-blue-800",
    possible: "border-amber-500/40 bg-amber-500/10 text-amber-800",
    weak: "border-muted-foreground/30 bg-muted text-muted-foreground",
  };
  return (
    <CardShell
      icon={<ListChecks className="h-3.5 w-3.5" />}
      title="Working hypotheses"
      hint={`${hypotheses.length} tracked`}
    >
      <ul className="space-y-2">
        {hypotheses.slice(0, 4).map((h) => (
          <li key={h.id} className="rounded-md border border-border/60 bg-white p-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-foreground">{h.statement}</div>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                  CONF_TONE[h.confidence] ?? CONF_TONE.weak
                }`}
              >
                {h.confidence}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{h.domain}</span>
              <span className="text-emerald-700">+{h.supporting.length} supporting</span>
              <span className="text-destructive/80">−{h.contradicting.length} contradicting</span>
              {h.nextEvidenceNeeded.length ? (
                <span className="text-muted-foreground">needs · {h.nextEvidenceNeeded[0]}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ── TIMELINE ───────────────────────────────────────────────────────────── */

type TimelineEvent = {
  ts: number;
  kind: "mission" | "evidence" | "hypothesis" | "recommendation" | "discovery" | "decision";
  label: string;
  detail?: string;
};

function LiveInvestigationTimelineCard({
  ibe,
  mission,
  briefingId,
  workspaceArtefactCount,
}: {
  ibe: IbeResult["ibe"] | null | undefined;
  mission: MissionWorkspaceState | null | undefined;
  briefingId?: string;
  workspaceArtefactCount: number;
}) {
  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = [];
    if (mission?.updatedAt) {
      out.push({
        ts: mission.updatedAt,
        kind: "mission",
        label: `Mission active · ${mission.title ?? mission.investigationId}`,
      });
    }
    const conv = mission?.conversation ?? [];
    for (const c of conv.slice(-4)) {
      out.push({
        ts: c.ts,
        kind: c.role === "officer" ? "decision" : "recommendation",
        label: c.role === "officer" ? `Officer prompt` : "Copilot briefing delivered",
        detail:
          typeof (c as unknown as { text?: string }).text === "string"
            ? (c as unknown as { text?: string }).text!.slice(0, 90)
            : undefined,
      });
    }
    if (workspaceArtefactCount > 0) {
      out.push({
        ts: Date.now() - 1,
        kind: "evidence",
        label: `${workspaceArtefactCount} evidence artefact${workspaceArtefactCount === 1 ? "" : "s"} in workspace`,
      });
    }
    for (const h of ibe?.hypotheses ?? []) {
      out.push({
        ts: h.updatedAt,
        kind: "hypothesis",
        label: `Hypothesis · ${h.statement}`,
        detail: `${h.confidence} · +${h.supporting.length}/−${h.contradicting.length}`,
      });
    }
    for (const n of ibe?.nudges ?? []) {
      out.push({
        ts: Date.now(),
        kind: "discovery",
        label: n.text,
        detail: `${n.origin} · ${n.priority}`,
      });
    }
    if (briefingId) {
      out.push({
        ts: Date.now(),
        kind: "recommendation",
        label: "Recommendation issued",
        detail: briefingId,
      });
    }
    return out.sort((a, b) => a.ts - b.ts).slice(-8);
  }, [ibe, mission, briefingId, workspaceArtefactCount]);

  if (!events.length) return null;

  return (
    <CardShell
      icon={<Activity className="h-3.5 w-3.5" />}
      title="Live investigation timeline"
      hint={`${events.length} events`}
    >
      <ol className="relative space-y-2 border-l border-border/60 pl-3">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span
              className={`absolute -left-[15px] top-1 h-2 w-2 rounded-full ${kindTone(e.kind)}`}
              aria-hidden
            />
            <div className="text-xs text-foreground">{e.label}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {e.kind}
              {e.detail ? ` · ${e.detail}` : ""}
            </div>
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

function kindTone(k: TimelineEvent["kind"]): string {
  switch (k) {
    case "mission":
      return "bg-primary";
    case "evidence":
      return "bg-blue-500";
    case "hypothesis":
      return "bg-emerald-500";
    case "discovery":
      return "bg-amber-500";
    case "decision":
      return "bg-foreground";
    case "recommendation":
      return "bg-primary/60";
    default:
      return "bg-muted-foreground";
  }
}

/* ── Named icon re-exports for parity with the projection contract ─────── */
export const projectionPanelIcons = {
  Gauge,
  Timer,
  AlertTriangle,
  ClipboardList,
};
