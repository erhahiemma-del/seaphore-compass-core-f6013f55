/**
 * Executive Briefing renderer.
 *
 * Presentation-only. Consumes the synthesized ExecutiveBrief and renders
 * the 9-section executive layout defined in the sprint spec. No inference
 * happens here — every value is computed by the synthesizer.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type {
  ExecutiveBrief,
  EvidenceGroup,
  KpiCard,
  TimelineEvent,
  IdentityResolutionSection,
  AisContinuitySection,
  AisInterruptionTimelineItem,
} from "@/lib/copilot/executive-brief/synthesize";
import type { EvidenceCardData } from "@/components/copilot/briefing/types";
import {
  AlertTriangle,
  Anchor,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Fingerprint,
  FileText,
  Gauge,
  Info,
  Lightbulb,
  MapPin,
  Radio,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Sparkles,
  User2,
  Workflow,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/copilot/executive-brief/sanitize";
import { OperationalInsights } from "@/components/intelligence/OperationalInsights";
import { Brain } from "lucide-react";

const TONE_BG: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  neutral: "bg-slate-50 text-slate-700 ring-slate-200",
};

const TONE_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
  neutral: "bg-slate-400",
};

function Section({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-slate-800">
          <Icon className="h-4 w-4 text-[#2563EB]" />
          <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
        </div>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function KpiTile({ kpi }: { kpi: KpiCard }) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 ring-1 shadow-sm",
        TONE_BG[kpi.tone] ?? TONE_BG.neutral,
      )}
    >
      <div className="text-[11px] uppercase tracking-wide opacity-70">{kpi.label}</div>
      <div className="mt-1 text-lg font-semibold leading-tight">{kpi.value}</div>
      {kpi.hint ? <div className="mt-0.5 text-[11px] opacity-70">{kpi.hint}</div> : null}
    </div>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.66 ? "bg-emerald-500" : value >= 0.33 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-600">
        <span>{label}</span>
        <span className="font-semibold text-slate-800">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const NODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  vessel: Ship,
  agent: User2,
  operator: Building2,
  parent: Building2,
  director: User2,
  "beneficial-owner": User2,
  port: Anchor,
  cargo: FileText,
  case: ShieldAlert,
  other: Circle,
};

const EVENT_ICON: Record<TimelineEvent["kind"], React.ComponentType<{ className?: string }>> = {
  arrival: Anchor,
  departure: Ship,
  manifest: FileText,
  inspection: ClipboardCheck,
  revenue: Gauge,
  detention: ShieldAlert,
  cargo: FileText,
  ownership: Building2,
  compliance: ShieldCheck,
  sanction: ShieldAlert,
  signal: Radio,
  other: Circle,
};

function EvidenceRow({ item }: { item: EvidenceCardData }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-slate-800">{item.title}</div>
        {item.summary ? (
          <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{item.summary}</div>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
          <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
            {item.source}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
            {item.grade}
          </span>
          {item.observedAt ? <span>{formatWhen(item.observedAt)}</span> : null}
        </div>
      </div>
    </div>
  );
}

function DisclosureGroup({ group }: { group: EvidenceGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-[12px] font-medium text-slate-800 hover:bg-slate-100"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {group.label}
        </span>
        <span className="text-[11px] text-slate-500">{group.items.length}</span>
      </button>
      {open ? (
        <div className="space-y-2 bg-white p-3">
          {group.items.map((it) => (
            <EvidenceRow key={it.id} item={it} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const TIER_TONE: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  OBSERVED: "bg-sky-50 text-sky-700 ring-sky-200",
  INFERRED: "bg-amber-50 text-amber-700 ring-amber-200",
  UNCONFIRMED: "bg-rose-50 text-rose-700 ring-rose-200",
};

function IdentityResolutionCard({ data }: { data: IdentityResolutionSection }) {
  return (
    <Section title="Identity Resolution" icon={Fingerprint}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-slate-900">{data.selectedLabel}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            {data.imo ? <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">IMO {data.imo}</span> : null}
            {data.mmsi ? <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">MMSI {data.mmsi}</span> : null}
            {data.callSign ? <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">Call {data.callSign}</span> : null}
            {data.flag ? <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">Flag {data.flag}</span> : null}
          </div>
        </div>
        <div className={cn("rounded-2xl px-3 py-2 text-right ring-1", TIER_TONE[data.tier] ?? TIER_TONE.UNCONFIRMED)}>
          <div className="text-[10px] uppercase tracking-wide opacity-70">Confidence</div>
          <div className="text-lg font-semibold leading-tight">{data.confidenceScore}/100</div>
          <div className="text-[10px] font-medium">{data.tier}</div>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-slate-700">{data.selectionReason}</p>
      {data.requiresConfirmation ? (
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
          Officer confirmation required — the resolver did not auto-select this candidate.
        </div>
      ) : null}
      {data.matchingCriteria.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Matching criteria</div>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {data.matchingCriteria.map((m) => (
              <li key={m.label} className="flex items-start gap-2 rounded-xl bg-emerald-50/60 px-3 py-1.5 text-[12px] text-emerald-800 ring-1 ring-emerald-200">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" />
                <span className="min-w-0">
                  <span className="font-medium">{m.label}</span>{" "}
                  <span className="text-emerald-700/80">({m.points})</span>
                  <span className="mt-0.5 block text-[11px] text-emerald-900/70">{m.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.rejectedCandidates.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Rejected candidates</div>
          <ul className="mt-2 space-y-1.5">
            {data.rejectedCandidates.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-xl bg-rose-50/60 px-3 py-1.5 text-[12px] text-rose-800 ring-1 ring-rose-200">
                <XCircle className="mt-0.5 h-3.5 w-3.5" />
                <span className="min-w-0">
                  <span className="font-medium">{r.label}</span>{" "}
                  <span className="text-rose-700/80">({r.score}/100)</span>
                  <span className="mt-0.5 block text-[11px] text-rose-900/70">{r.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.alternates.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Also considered</div>
          <ul className="mt-2 space-y-1.5">
            {data.alternates.map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700 ring-1 ring-slate-200">
                <Circle className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                <span className="min-w-0">
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-slate-500">({a.score}/100)</span>
                  <span className="mt-0.5 block text-[11px] text-slate-600">{a.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

/* ─────────── AIS Continuity (Sprint 1D-AIS: voyage-based segmentation) ─────────── */

const AIS_PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-50 text-rose-700 ring-rose-200",
  act: "bg-amber-50 text-amber-700 ring-amber-200",
  monitor: "bg-sky-50 text-sky-700 ring-sky-200",
  watch: "bg-slate-50 text-slate-700 ring-slate-200",
};

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(0)}h`;
  const days = h / 24;
  return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
}

function TimelineRow({ ev }: { ev: AisInterruptionTimelineItem }) {
  const isDisabling = ev.kind === "disabling";
  const tone = ev.priority ? AIS_PRIORITY_TONE[ev.priority] : AIS_PRIORITY_TONE.watch;
  return (
    <li className="relative flex gap-3 pl-5">
      <span
        className={cn(
          "absolute left-1 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-white",
          isDisabling ? "bg-rose-500" : "bg-slate-300",
        )}
      />
      <div className="min-w-0 flex-1 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-900">
            <Radio className="h-3.5 w-3.5 text-rose-500" />
            {isDisabling ? "AIS disabling" : "Coverage-uncertain span"}
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{formatHours(ev.durationHours)}</span>
          </div>
          {ev.priority ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1", tone)}>
              {ev.priority}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span>{formatWhen(ev.startAt)}</span>
          <ChevronRight className="h-3 w-3" />
          <span>{formatWhen(ev.endAt)}</span>
          {ev.startLabel ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {ev.startLabel}
            </span>
          ) : null}
          {ev.endLabel && ev.endLabel !== ev.startLabel ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              → {ev.endLabel}
            </span>
          ) : null}
          <span className="text-slate-400">confidence {Math.round(ev.confidence * 100)}%</span>
        </div>
        <p className="mt-2 text-[12px] text-slate-700">{ev.explanation}</p>
        {ev.rationale ? (
          <p className="mt-1 text-[11px] italic text-slate-500">OSAE: {ev.rationale}</p>
        ) : null}
      </div>
    </li>
  );
}

function AisContinuityCard({ data }: { data: AisContinuitySection }) {
  const disablingCount = data.timeline.filter((t) => t.kind === "disabling").length;
  return (
    <Section title="AIS Continuity" icon={Radio}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total interruptions</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900">{data.totalInterruptions}</div>
          <div className="text-[10px] text-slate-500">discrete disabling events</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Longest interruption</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900">
            {data.longestInterruptionHours > 0 ? formatHours(data.longestInterruptionHours) : "—"}
          </div>
          <div className="text-[10px] text-slate-500">continuous dark span</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Coverage-uncertain</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900">{data.coverageUncertainCount}</div>
          <div className="text-[10px] text-slate-500">not counted as interruptions</div>
        </div>
        <div className={cn("rounded-xl p-3 ring-1", data.overallPriority ? AIS_PRIORITY_TONE[data.overallPriority] : AIS_PRIORITY_TONE.watch)}>
          <div className="text-[10px] uppercase tracking-wide opacity-70">OSAE priority</div>
          <div className="mt-0.5 text-lg font-semibold uppercase">{data.overallPriority ?? "—"}</div>
          <div className="text-[10px] opacity-70">overall assessment</div>
        </div>
      </div>
      {data.overallSummary ? (
        <p className="mt-3 text-[12px] text-slate-700">{data.overallSummary}</p>
      ) : null}

      {data.patterns.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Pattern analysis</div>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {data.patterns.map((p) => (
              <li
                key={p.code}
                className="flex items-start gap-2 rounded-xl bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                <span className="min-w-0">
                  <span className="font-medium">{p.label}</span>{" "}
                  <span className="text-amber-700/80">
                    ({p.occurrences} occurrence{p.occurrences === 1 ? "" : "s"}, conf {Math.round(p.confidence * 100)}%)
                  </span>
                  <span className="mt-0.5 block text-[11px] text-amber-900/80">{p.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.timeline.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Timeline of discrete AIS events{" "}
            <span className="text-slate-400">
              ({disablingCount} disabling
              {data.coverageUncertainCount ? `, ${data.coverageUncertainCount} coverage-uncertain` : ""})
            </span>
          </div>
          <ol className="mt-2 space-y-2 border-l border-slate-200 pl-1">
            {data.timeline.map((t) => (
              <TimelineRow key={`${t.startAt}-${t.endAt}`} ev={t} />
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-[12px] italic text-slate-500">
          No AIS interruptions observed across the window.
        </p>
      )}

      <p className="mt-3 text-[11px] italic text-slate-500">
        Evidence: {data.evidenceCitation}. Every interruption is traceable to Global Fishing Watch AIS events.
      </p>
    </Section>
  );
}

export interface ExecutiveBriefingProps {
  brief: ExecutiveBrief;
  isAdmin?: boolean;
  onFollowUp?: (question: string) => void;
}

export function ExecutiveBriefing({ brief, isAdmin, onFollowUp }: ExecutiveBriefingProps) {
  const {
    executiveSummary,
    confidence,
    kpis,
    keyFacts,
    identityResolution,
    aisContinuity,
    relationships,
    timeline,
    risks,
    insights,
    recommendations,
    evidenceGroups,
    followUps,
    operationalKnowledge,
  } = brief;

  const firedRisks = risks.filter((r) => r.fired);

  const subject = identityResolution?.selectedLabel;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 text-slate-900">
      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
        <Link
          to="/intelligence-evidence"
          search={subject ? { entity: subject } : {}}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <FileText className="h-3 w-3" />
          Explore all evidence
        </Link>
      </div>
      {/* Section 1 — Executive Summary */}
      <Section title="Executive Summary" icon={Sparkles}>
        <p className="text-[14px] leading-relaxed text-slate-800">{executiveSummary}</p>
        <p className="mt-3 text-[12px] italic text-slate-500">{confidence.headline}</p>
      </Section>


      {/* Section 2 — Intelligence Assessment */}
      <Section title="Intelligence Assessment" icon={Gauge}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100 md:grid-cols-5">
          <Bar value={confidence.dataCompleteness} label="Data Completeness" />
          <Bar value={confidence.relationshipConfidence} label="Relationship Confidence" />
          <Bar value={confidence.evidenceQuality} label="Evidence Quality" />
          <Bar value={confidence.recency} label="Recency" />
          <Bar value={confidence.operationalConfidence} label="Operational Confidence" />
        </div>
      </Section>

      {/* Section 3 — Key Facts */}
      {keyFacts.length ? (
        <Section title="Key Facts" icon={Info}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {keyFacts.map((f, i) => (
              <div key={i} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                <dt className="text-[12px] text-slate-500">{f.label}</dt>
                <dd className="text-[12px] font-medium text-slate-800">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {/* Section 3.5 — Identity Resolution (Sprint 1C.1) */}
      {identityResolution ? <IdentityResolutionCard data={identityResolution} /> : null}

      {/* Section 3.6 — AIS Continuity (Sprint 1D-AIS) */}
      {aisContinuity ? <AisContinuityCard data={aisContinuity} /> : null}

      {/* Section 4 — Relationship Intelligence */}
      {relationships.length ? (
        <Section title="Relationship Intelligence" icon={Workflow}>
          <div className="flex flex-wrap items-center gap-2">
            {relationships.map((n) => {
              const Icon = NODE_ICON[n.kind] ?? Circle;
              return (
                <div
                  key={n.id}
                  className="group flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-[12px] text-slate-800 ring-1 ring-slate-200 hover:bg-white"
                  title={n.hint}
                >
                  <Icon className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span className="font-medium">{n.label}</span>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                    {n.kind.replace("-", " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {/* Section 5 — Timeline Intelligence */}
      {timeline.length ? (
        <Section title="Timeline Intelligence" icon={CalendarClock}>
          <ol className="relative border-l border-slate-200 pl-5">
            {timeline.map((ev) => {
              const Icon = EVENT_ICON[ev.kind] ?? Circle;
              return (
                <li key={ev.id} className="mb-4 last:mb-0">
                  <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                    <Icon className="h-2.5 w-2.5 text-[#2563EB]" />
                  </span>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[13px] font-medium text-slate-800">{ev.title}</div>
                    <div className="whitespace-nowrap text-[11px] text-slate-500">
                      {ev.whenISO ? formatWhen(ev.whenISO) : ev.when}
                    </div>
                  </div>
                  {ev.detail ? (
                    <div className="mt-0.5 text-[12px] text-slate-600">{ev.detail}</div>
                  ) : null}
                  {ev.source ? (
                    <div className="mt-1 inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                      {ev.source}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Section>
      ) : null}

      {/* Section 6 — Risk & Compliance */}
      <Section title="Risk & Compliance Analysis" icon={ShieldAlert}>
        {firedRisks.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div>
              <div className="text-[13px] font-semibold text-emerald-800">
                No significant risks identified
              </div>
              <div className="mt-0.5 text-[12px] text-emerald-700">
                All monitored risk vectors returned clear against the current evidence.
              </div>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {risks.map((r) => (
              <li
                key={r.key}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ring-1",
                  r.fired
                    ? "bg-rose-50 text-rose-700 ring-rose-200"
                    : "bg-slate-50 text-slate-600 ring-slate-200",
                )}
              >
                {r.fired ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span className={r.fired ? "font-medium" : ""}>{r.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Section 7 — AI Intelligence Insights */}
      {insights.length ? (
        <Section title="Intelligence Insights" icon={Lightbulb}>
          <ul className="space-y-2">
            {insights.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-800 ring-1 ring-slate-100"
              >
                <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full", TONE_DOT.warning)} />
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Section 7.5 — Operational Knowledge Layer */}
      {operationalKnowledge && operationalKnowledge.patterns.length ? (
        <Section
          title="Operational Knowledge"
          icon={Brain}
          action={
            <Link
              to="/operational-knowledge"
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Open OKL
            </Link>
          }
        >
          <OperationalInsights package={operationalKnowledge} />
        </Section>
      ) : null}


      {/* Section 8 — Recommendations */}
      {recommendations.length ? (
        <Section title="Recommended Next Steps" icon={Scale}>
          <ol className="space-y-2">
            {recommendations.map((r, idx) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-xl px-3 py-2 ring-1",
                  r.priority === "primary"
                    ? "bg-[#2563EB]/5 ring-[#2563EB]/30"
                    : "bg-slate-50 ring-slate-200",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      r.priority === "primary"
                        ? "bg-[#2563EB] text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-200",
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-slate-900">{r.text}</div>
                    {r.rationale ? (
                      <div className="mt-0.5 text-[12px] text-slate-600">{r.rationale}</div>
                    ) : null}
                    {r.confidence ? (
                      <span className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                        {r.confidence}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {/* Section 9 — Supporting Evidence */}
      {evidenceGroups.length ? (
        <Section title="Supporting Evidence" icon={FileText}>
          <div className="space-y-2">
            {evidenceGroups.map((g) => (
              <DisclosureGroup key={g.key} group={g} />
            ))}
          </div>
          {isAdmin ? (
            <details className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 ring-1 ring-slate-200">
              <summary className="cursor-pointer font-medium text-slate-700">
                Raw evidence records (Admin)
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-white p-2 text-[10px] text-slate-700 ring-1 ring-slate-200">
{JSON.stringify(
  evidenceGroups.flatMap((g) => g.items),
  null,
  2,
)}
              </pre>
            </details>
          ) : null}
        </Section>
      ) : null}

      {/* Follow-ups */}
      {followUps.length ? (
        <div className="flex flex-wrap gap-2">
          {followUps.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onFollowUp?.(q)}
              className="rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-[#2563EB]/40"
            >
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-[#2563EB]" />
                {q}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ExecutiveBriefing;
