import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getIntelligenceCoverage } from "@/lib/intelligence-coverage.functions";
import { IntelligenceReadinessCard } from "@/components/intelligence/IntelligenceReadinessCard";
import { KpiCoverageCard } from "@/components/intelligence/KpiCoverageCard";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  ChevronRight,
  Container,
  FileText,
  History,
  Info,
  Landmark,
  Radar,
  Ship,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { PanelCard } from "@/components/panel-card";
import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { ConfidenceLegend } from "@/components/confidence-legend";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { GulfOfGuineaMap } from "@/components/gulf-of-guinea-map";
import { MissionCommandBar } from "@/components/mission-command-bar";
import { useHandoffNavigate } from "@/lib/nav-context";
import { useRenderTrace } from "@/lib/perf/hooks";
import { cn } from "@/lib/utils";
import {
  COMPLIANCE_METRICS,
  INTELLIGENCE_FEED,
  MAP_VESSELS,
  PORT_CONGESTION,
  RECENT_BRIEFINGS,
  RIBBON_KPIS,
  TODAYS_PRIORITIES,
  type FeedRow,
  type PortCongestion,
  type Priority,
} from "@/lib/mission-control-data";
import { useUipStore } from "@/stores/uip.store";
import { scanForLeakage } from "@/services/revenue-leakage";
import {
  projectManifestIntelligence,
  projectRevenueIntelligence,
} from "@/lib/intelligence/dashboard-projection";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";
import { useCargoWorkspaceProjections } from "@/features/cargo-workspace/use-cargo-projection";
import { CargoCentreStateChip } from "@/features/cargo-workspace/CargoCentreView";

/** One shared coverage read for every Mission Control surface. */
function useCoverage() {
  return useQuery({
    queryKey: ["intelligence-coverage"],
    queryFn: () => getIntelligenceCoverage(),
    staleTime: 60_000,
  });
}

/** The Canonical UIP this session is projecting from. */
function useLatestUip() {
  return useUipStore((s) => {
    const id = s.order[0];
    return id ? s.byId[id] : undefined;
  });
}

function coverageFor(
  kpis: ReadonlyArray<KpiCoverage> | undefined,
  key: string,
): KpiCoverage | undefined {
  return (kpis ?? []).find((k) => k.key === key);
}

/** Officer-facing capability routes reused by the ribbon (no duplicates). */
const KPI_HANDOFF_OVERRIDE: Record<string, string> = {
  "revenue-intelligence": "/revenue-leakage",
  "risk-intelligence": "/national-risk",
};

const RIBBON_ICONS: Record<string, LucideIcon> = {
  "manifest-intelligence": FileText,
  "vessel-intelligence": Ship,
  "container-intelligence": Container,
  "revenue-intelligence": Landmark,
  "risk-intelligence": Target,
  "historical-intelligence": History,
};

export function MissionControl() {
  return (
    <AppShell title="Mission Control" subtitle="National maritime operating picture" mode="light">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-5">
        <MissionCommandBar />
        <Ribbon />
        <ConfidenceLegend />

        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <LiveMapPanel />
          <IntelligenceFeedPanel />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RevenueAssurancePanel />
          <ManifestIntelligencePanel />
          <ComplianceWatchlistPanel />
          <PortOperationsPanel />
        </div>

        <CargoWorkspaceStrip />

        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <TodaysPrioritiesPanel />
          <RecentBriefingsPanel />
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------- Ribbon ---------------- */

function Ribbon() {
  const handoff = useHandoffNavigate();
  const { data: coverage } = useCoverage();

  const kpiByKey = new Map((coverage?.kpis ?? []).map((k) => [k.key, k]));
  return (
    <div className="flex flex-col gap-3">
      {coverage ? (
        <IntelligenceReadinessCard
          readiness={coverage.readiness}
          generatedAt={coverage.generatedAt}
          report={coverage}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {RIBBON_KPIS.map((kpi) => {
          const Icon = RIBBON_ICONS[kpi.key] ?? Activity;
          const cov = kpiByKey.get(kpi.metricKey);
          if (cov) {
            return (
              <KpiCoverageCard
                key={kpi.key}
                kpi={cov}
                icon={Icon}
                onOpen={() =>
                  handoff({
                    target: KPI_HANDOFF_OVERRIDE[kpi.key] ?? kpi.handoff,

                    context: { fromStage: "Monitor", fromRoute: "/" },
                  })
                }
              />
            );
          }
          return (
            <button
              key={kpi.key}
              type="button"
              onClick={() =>
                handoff({
                  target: kpi.handoff,
                  context: { fromStage: "Monitor", fromRoute: "/" },
                })
              }
              className="group flex flex-col rounded-lg border border-line bg-surface p-3 text-left shadow-card motion-fast hover:border-[color:var(--color-teal)] hover:shadow-pop"
              title={kpi.hint}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="type-label text-slate">{kpi.title}</span>
              </div>
              <div className="mt-2 type-mono text-[22px] font-bold text-foreground tabular-nums">
                Checking coverage…
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate">{kpi.descriptor}</div>
              <div className="mt-2">
                <ConfidenceChip tier={kpi.confidence} size={9} />
              </div>
            </button>
          );
        })}

        <Link
          to="/detect"
          className="group flex flex-col items-start justify-between rounded-lg border border-dashed border-[color:var(--color-teal)]/60 bg-[color:var(--color-teal)]/5 p-3 motion-fast hover:bg-[color:var(--color-teal)]/10"
        >
          <span className="type-label text-[color:var(--color-teal)]">Intelligence Feed</span>
          <span className="mt-2 type-h1 text-foreground">View full feed</span>
          <span className="type-small text-slate">Continuous signals across every centre</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--color-teal)]">
            Open Detect <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Live Map Panel ---------------- */

function LiveMapPanel() {
  const navigate = useNavigate();
  return (
    <PanelCard variant="edge" className="flex h-[520px] flex-col">
      <PanelHeader
        title="Live Maritime Picture"
        subtitle="Gulf of Guinea · vessel positions coloured by risk"
        to="/vessel"
        toLabel="Open Vessel Intelligence"
      />
      <div className="flex-1 p-4 pt-0">
        <GulfOfGuineaMap
          vessels={MAP_VESSELS}
          live
          onVesselClick={(v) =>
            navigate({
              to: "/entity/$id",
              params: { id: v.id },
              search: {
                entityId: v.id,
                fromStage: "Monitor",
                fromRoute: "/",
              },
            })
          }
        />
      </div>
    </PanelCard>
  );
}

/* ---------------- Intelligence Feed Panel ---------------- */

function IntelligenceFeedPanel() {
  useRenderTrace("feed.render", { surface: "mission-control" });
  const handoff = useHandoffNavigate();
  return (
    <PanelCard variant="edge" className="flex h-[520px] flex-col">
      <PanelHeader
        title="Intelligence Feed"
        subtitle="Observed signals — not findings"
        to="/detect"
        toLabel="Open Detect"
      />
      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-line">
          {INTELLIGENCE_FEED.map((row) => (
            <li key={row.id}>
              <FeedItem
                row={row}
                onClick={() =>
                  handoff({
                    target: row.investigationId
                      ? `/investigate/${row.investigationId}`
                      : `/entity/${row.entityId}`,
                    context: {
                      entityId: row.entityId,
                      voyageId: row.voyageId,
                      signalId: row.id,
                      investigationId: row.investigationId,
                      confidence: row.confidence.toUpperCase() as
                        | "VERIFIED"
                        | "OBSERVED"
                        | "INFERRED"
                        | "UNCONFIRMED",
                      fromStage: "Detect",
                      fromRoute: "/",
                    },
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line px-4 py-2 italic type-small text-slate">
        Observations, not findings. Click any item to view evidence.
      </div>
    </PanelCard>
  );
}

const SEVERITY_ICON: Record<FeedRow["severity"], LucideIcon> = {
  high: AlertTriangle,
  medium: BellRing,
  low: Info,
  info: Info,
};

const SEVERITY_COLOR: Record<FeedRow["severity"], string> = {
  high: "text-[color:var(--color-red)]",
  medium: "text-[color:var(--color-amber)]",
  low: "text-[color:var(--color-blue)]",
  info: "text-slate",
};

function FeedItem({ row, onClick }: { row: FeedRow; onClick: () => void }) {
  const Icon = SEVERITY_ICON[row.severity];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3 text-left motion-fast hover:bg-surface-2"
    >
      <span className={cn("mt-0.5 shrink-0", SEVERITY_COLOR[row.severity])}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="type-h2 truncate text-foreground">{row.title}</span>
          <span className="type-mono text-[11px] text-slate">{row.time}</span>
        </span>
        <span className="mt-0.5 block truncate type-small text-slate">{row.subtitle}</span>
        <span className="mt-1.5 flex items-center gap-2">
          <RiskPill level={row.risk} />
          <ConfidenceChip tier={row.confidence} size={9} />
        </span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate" />
    </button>
  );
}

/* ---------------- Cargo Intelligence Workspace (CAP-02) ---------------- */

function CargoWorkspaceStrip() {
  const { projections } = useCargoWorkspaceProjections();
  return (
    <PanelCard>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="type-h6 font-semibold text-foreground">Cargo Intelligence Workspace</h2>
          <p className="type-small text-slate">
            CAPABILITY.CARGO · six centres projected from the Canonical UIP
          </p>
        </div>
        <Link
          to="/cargo-workspace"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--color-blue)] hover:underline"
        >
          Open workspace <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {projections.map((p) => (
          <Link
            key={p.centre.id}
            to="/cargo-workspace/$centre"
            params={{ centre: p.centre.slug }}
            className="rounded-md border border-line bg-surface-2 p-2.5 motion-fast hover:border-[color:var(--color-blue)]/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate type-small font-semibold text-foreground">
                {p.centre.title}
              </span>
              <CargoCentreStateChip projection={p} />
            </div>
            <p className="mt-1 line-clamp-2 type-small text-slate">
              {p.data
                ? `${p.data.evidenceCount} evidence record${p.data.evidenceCount === 1 ? "" : "s"} projected.`
                : p.stateDetail}
            </p>
          </Link>
        ))}
      </div>
    </PanelCard>
  );
}

/* ---------------- Revenue Assurance ---------------- */

function fmtMoney(n: number, currency: string): string {
  const abs = Math.abs(n);
  const unit =
    abs >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : `${n}`;
  return `${unit} ${currency}`;
}

function RevenueAssurancePanel() {
  const handoff = useHandoffNavigate();
  const { data: coverage } = useCoverage();
  const uip = useLatestUip();
  // Reuses capability.revenue-leakage-detection — no duplicated business logic.
  const findings = useMemo(
    () => (uip && uip.rawEvidence.length > 0 ? scanForLeakage(uip.rawEvidence) : []),
    [uip],
  );
  const projection = projectRevenueIntelligence({
    uipId: uip?.id ?? null,
    findings,
    coverage: coverageFor(coverage?.kpis, "revenue"),
  });
  const data = projection.data;
  const openRevenue = () =>
    handoff({ target: "/revenue-leakage", context: { fromStage: "Monitor", fromRoute: "/" } });

  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Revenue Assurance"
        subtitle="Canonical UIP · revenue leakage detection"
        to="/revenue"
        toLabel="Go to Revenue"
        compact
      />
      {!data ? (
        <PanelStateNotice
          state={projection.state}
          detail={projection.stateDetail}
          href={projection.capabilityHref}
          hrefLabel="Open Revenue Leakage"
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MicroStat label="Findings" value={`${data.findings}`} tier={data.confidence} />
            <MicroStat
              label="High / Critical"
              value={`${data.criticalOrHigh}`}
              tier={data.confidence}
            />
            <MicroStat label="Officer approved" value={`${data.approved}`} tier="verified" />
          </div>

          <button
            type="button"
            onClick={openRevenue}
            className="mt-3 rounded-md border border-line bg-surface-2 p-3 text-left motion-fast hover:border-[color:var(--color-red)]/40 hover:bg-[color:var(--color-red)]/5"
          >
            <div className="type-label text-slate">Estimated leakage at risk</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="type-mono text-[22px] font-bold text-[color:var(--color-red)]">
                {fmtMoney(data.estimatedLeakage, data.currency)}
              </span>
            </div>
            <div className="mt-1.5">
              <ConfidenceChip tier={data.confidence} size={9} />
            </div>
          </button>

          <div className="mt-3">
            <div className="type-label text-slate">Top Risk Drivers</div>
            <ul className="mt-1.5 divide-y divide-line">
              {data.drivers.map((d) => (
                <li key={d.name} className="flex items-center justify-between py-1.5">
                  <span className="truncate pr-2 type-small text-foreground/85">{d.name}</span>
                  <span className="type-mono text-[12px] font-semibold text-foreground tabular-nums">
                    {fmtMoney(d.amount, data.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </PanelCard>
  );
}

/* ---------------- Manifest Intelligence ---------------- */

function ManifestIntelligencePanel() {
  const { data: coverage } = useCoverage();
  const uip = useLatestUip();
  const projection = projectManifestIntelligence({
    uipId: uip?.id ?? null,
    evidence: uip?.rawEvidence ?? [],
    coverage: coverageFor(coverage?.kpis, "manifest"),
  });
  const data = projection.data;
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Manifest Intelligence"
        subtitle="Canonical UIP · declared vs actual"
        to="/manifest"
        toLabel="Go to Manifest"
        compact
      />
      {!data ? (
        <PanelStateNotice
          state={projection.state}
          detail={projection.stateDetail}
          href="/admin/provider-health"
          hrefLabel="Inspect provider coverage"
        />
      ) : (
        <ul className="divide-y divide-line">
          {data.metrics.map((m) => (
            <li key={m.key} className="flex items-center justify-between py-2.5">
              <span className="type-small text-foreground/85">{m.label}</span>
              <span className="flex items-center gap-2">
                <span className="type-mono text-[14px] font-bold text-foreground tabular-nums">
                  {m.value}
                </span>
                <ConfidenceChip tier={m.confidence} size={9} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/* ---------------- Compliance & Watchlist ---------------- */

function ComplianceWatchlistPanel() {
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Compliance & Watchlist"
        subtitle="Sanctions and obligations"
        to="/compliance"
        toLabel="Go to Compliance"
        compact
      />
      <ul className="divide-y divide-line">
        {COMPLIANCE_METRICS.map((m) => (
          <li key={m.key} className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 type-small text-foreground/85">
              <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
              {m.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="type-mono text-[14px] font-bold text-foreground tabular-nums">
                {m.value}
              </span>
              <ConfidenceChip tier={m.confidence} size={9} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-sm bg-surface-2 px-2 py-1.5 italic type-small text-slate">
        Sanctions and watchlist rows are VERIFIED only. Non-verified compliance metrics are
        INFERRED.
      </div>
    </PanelCard>
  );
}

/* ---------------- Port Operations ---------------- */

function PortOperationsPanel() {
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Port Operations"
        subtitle="Congestion index · Nigerian ports"
        to="/ports"
        toLabel="Go to Ports"
        compact
      />
      <ul className="flex flex-col gap-3">
        {PORT_CONGESTION.map((p) => (
          <li key={p.key}>
            <PortBar port={p} />
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

function PortBar({ port }: { port: PortCongestion }) {
  const levelColor: Record<PortCongestion["level"], string> = {
    Critical: "var(--color-red)",
    Elevated: "var(--color-amber)",
    Normal: "var(--color-green)",
    Low: "var(--color-blue)",
  };
  const color = levelColor[port.level];
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="type-small font-semibold text-foreground">{port.name}</span>
        <span className="flex items-center gap-2">
          <span className="type-mono text-[12px] font-semibold text-foreground tabular-nums">
            {port.index}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color }}>
            {port.level}
          </span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full motion-slow"
          style={{ width: `${port.index}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1">
        <ConfidenceChip tier={port.confidence} size={9} />
      </div>
    </div>
  );
}

/* ---------------- Today's Priorities ---------------- */

const TAG_STYLE: Record<Priority["tag"], string> = {
  "HIGH RISK": "bg-[color:var(--color-red)]/10 text-[color:var(--color-red)]",
  "NETWORK EXPANSION": "bg-[color:var(--color-purple)]/10 text-[color:var(--color-purple)]",
  "SANCTION MATCH": "bg-[color:var(--color-navy)]/10 text-[color:var(--color-navy)]",
  DISCREPANCY: "bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)]",
};

function TodaysPrioritiesPanel() {
  const handoff = useHandoffNavigate();
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Today's Priorities"
        subtitle="Officer queue · observed conditions"
        to="/investigate"
        toLabel="Open Investigate"
        compact
      />
      <ul className="flex flex-col gap-2.5">
        {TODAYS_PRIORITIES.map((p) => (
          <li key={p.investigationId}>
            <button
              type="button"
              onClick={() =>
                handoff({
                  target: `/investigate/${p.investigationId}`,
                  context: {
                    investigationId: p.investigationId,
                    entityId: p.entityId,
                    confidence: p.confidence.toUpperCase() as
                      | "VERIFIED"
                      | "OBSERVED"
                      | "INFERRED"
                      | "UNCONFIRMED",
                    fromStage: "Monitor",
                    fromRoute: "/",
                  },
                })
              }
              className="w-full rounded-md border border-line bg-surface p-3 text-left motion-fast hover:border-[color:var(--color-teal)] hover:shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="type-h2 block truncate text-foreground">{p.entityName}</span>
                  <span className="type-mono text-[11px] text-slate">{p.investigationId}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]",
                    TAG_STYLE[p.tag],
                  )}
                >
                  {p.tag}
                </span>
              </div>
              <p className="mt-1.5 type-small text-foreground/80">{p.note}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="type-small text-slate">
                  {p.assignee} · {p.updated}
                </span>
                <ConfidenceChip tier={p.confidence} size={9} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

/* ---------------- Recent Briefings ---------------- */

function RecentBriefingsPanel() {
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Recent Intelligence Briefings"
        subtitle="Officer-authored and AI-drafted"
        to="/share"
        toLabel="Open Share"
        compact
      />
      <ul className="divide-y divide-line">
        {RECENT_BRIEFINGS.map((b) => (
          <li key={b.id}>
            <div className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-slate">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="type-h2 block truncate text-foreground">{b.title}</span>
                <span className="type-small block truncate text-slate">
                  {b.date} · by {b.author}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-slate">
                  {b.format}
                </span>
                <ConfidenceChip tier={b.confidence} size={9} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

/* ---------------- Shared bits ---------------- */

function PanelHeader({
  title,
  subtitle,
  to,
  toLabel,
  compact,
}: {
  title: string;
  subtitle?: string;
  to:
    | "/detect"
    | "/investigate"
    | "/decide"
    | "/share"
    | "/memory"
    | "/manifest"
    | "/cargo"
    | "/revenue"
    | "/vessel"
    | "/ports"
    | "/ownership"
    | "/compliance"
    | "/evidence"
    | "/alerts"
    | "/admin";
  toLabel: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 border-b border-line",
        compact ? "pb-2 mb-2" : "px-4 py-3",
      )}
    >
      <div className="min-w-0">
        <h2 className="type-h1 text-foreground">{title}</h2>
        {subtitle && <div className="type-small text-slate">{subtitle}</div>}
      </div>
      <Link
        to={to}
        className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[color:var(--color-blue)] hover:underline motion-fast"
      >
        {toLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function MicroStat({ label, value, tier }: { label: string; value: string; tier: ConfidenceTier }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 p-2">
      <div className="type-label text-slate">{label}</div>
      <div className="mt-1 type-mono text-[14px] font-bold text-foreground tabular-nums">
        {value}
      </div>
      <div className="mt-1">
        <ConfidenceChip tier={tier} size={9} />
      </div>
    </div>
  );
}
