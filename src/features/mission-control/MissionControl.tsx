import { useCallback, useMemo, useState } from "react";
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
  Radio,
  Ship,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ContextRail } from "@/components/layout/ContextRail";
import { FocusWorkspaceHost } from "@/features/focus-workspace/FocusWorkspaceHost";
import { useMapFocusBridge } from "@/features/focus-workspace/map-bridge";
import { useFocusSubjectStore } from "@/stores/focus-subject.store";

import { PanelCard } from "@/components/panel-card";
import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { ConfidenceLegend } from "@/components/confidence-legend";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { MapCanvas, type VesselFeedState } from "@/features/maritime/MapCanvas";
import { resolveMapDataState, type MapDataStateResult, type Vessel } from "@/services/geospatial";
import { CommandSurfaceHost } from "@/features/command/CommandSurfaceHost";
import { useHandoffNavigate } from "@/lib/nav-context";
import { useRenderTrace } from "@/lib/perf/hooks";
import { cn } from "@/lib/utils";
// Only the ribbon's static labels, icons and handoff targets remain —
// UI copy, not intelligence. Every value beside them comes from coverage.
import { RIBBON_KPIS } from "@/lib/mission-control-data";
import { tierKpis } from "./hierarchy";
import { SupportingIntelligence } from "./SupportingIntelligence";
import { useMissionMode } from "./useMissionMode";
import { MapRecommendationNotice } from "./MapRecommendationNotice";
import { useCopilotContextBinding } from "./useCopilotContextBinding";
import { MyWorkspaceSummary } from "./MyWorkspaceSummary";
import { OperationalOrientation } from "./OperationalOrientation";
import { RecommendedNextActionPanel } from "./RecommendedNextActionPanel";
import { useUipStore } from "@/stores/uip.store";
import { scanForLeakage } from "@/services/revenue-leakage";
import {
  projectComplianceWatchlist,
  projectIntelligenceFeed,
  projectManifestIntelligence,
  projectPortOperations,
  projectRecentBriefings,
  projectRevenueIntelligence,
  projectTodaysPriorities,
  type FeedPanelData,
  type FeedSignal,
  type PanelProjection,
  type PrioritiesPanelData,
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
  const focused = useFocusSubjectStore((s) => s.subject);
  const workspaceOpen = useFocusSubjectStore((s) => s.workspaceOpen);
  const recede = focused ? "is-receded" : undefined;

  /*
   * Selecting on the map establishes focus and opens the workspace.
   *
   * Mission Control rendered a focus rail from the day the store was
   * written, but nothing here ever called `setSubject` — the only caller
   * in the application was `useCentreFocus`, so this page could never
   * enter the focused state it was already styled for. This is the
   * connection that was missing.
   */
  useMapFocusBridge();

  // One scan, projected two ways. Both panels read the findings the
  // detection capability actually produced — neither computes its own.
  const uip = useLatestUip();
  const { data: coverage } = useCoverage();
  const findings = useMemo(
    () => (uip && uip.rawEvidence.length > 0 ? scanForLeakage(uip.rawEvidence) : []),
    [uip],
  );
  const feedProjection = projectIntelligenceFeed({
    uipId: uip?.id ?? null,
    findings,
    coverage: coverageFor(coverage?.kpis, "risk"),
  });
  const prioritiesProjection = projectTodaysPriorities({
    uipId: uip?.id ?? null,
    findings,
    coverage: coverageFor(coverage?.kpis, "risk"),
  });
  // Three panels whose providers are not connected. Each states why rather
  // than rendering the invented numbers these cards used to carry.
  // The active lens, shared with the ribbon through the mode store.
  const { mode } = useMissionMode();
  // Tell the Copilot what the officer is looking at, so it opens
  // knowing the lens and the subject rather than asking them to
  // re-explain their own screen.
  useCopilotContextBinding();
  const uipId = uip?.id ?? null;
  const portsProjection = projectPortOperations({ uipId });
  const complianceProjection = projectComplianceWatchlist({ uipId });
  const briefingsProjection = projectRecentBriefings({ uipId });

  return (
    <AppShell title="Mission Control" subtitle="National maritime operating picture" mode="light">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-5">
        {/*
          The command surface. Replaces the previous command bar, whose
          search dispatched to routes that never read the query and whose
          eight chips were an entity-type vocabulary competing visually
          with the Mission Mode selector below. Search now resolves
          against the entity registry and selecting a result establishes
          focus, converging with the map on one focus subject.
        */}
        <CommandSurfaceHost />

        {/*
          Layer 1 — orientation. Where the officer is, in one quiet band:
          the lens, what it is for, the subject in hand, and how complete
          the intelligence behind it is. Deliberately not a hero section;
          the emphasis budget belongs to the layers beneath it.
        */}
        <OperationalOrientation readiness={coverage?.readiness} />

        {/*
          Layer 2 — the single next action, derived from observable state
          rather than generated. A blocked dependency outranks the lens's
          standing advice, because sending an officer to a panel that
          cannot answer teaches them the recommendation is decorative.
        */}
        <RecommendedNextActionPanel mode={mode} kpis={coverage?.kpis} />

        {/*
          Lovable's adaptive focus layout, driving Claude's projection
          panels. The grid narrows and swaps the feed for the FocusRail
          when a subject is focused; the map and feed themselves remain
          the truth-layer versions, so what the layout reveals is still
          only what a provider actually reported.
        */}
        <div
          className={cn(
            "grid gap-4",
            focused ? "xl:grid-cols-[1.5fr_320px]" : "lg:grid-cols-[1.55fr_1fr]",
          )}
        >
          <div className="flex min-w-0 flex-col gap-2">
            {/*
              Advisory only, and beside the surface it affects. Appears
              when this lens would show layers the officer does not have
              on; applying is additive and explicit, and switching mode
              never changes their configuration.
            */}
            <MapRecommendationNotice mode={mode} />
            <MaritimePicturePanel />
          </div>
          {/*
            Three states, in order of how much the officer has asked for.
            The workspace is the contextual bridge and takes the slot
            while it is open; dismissing it falls back to the rail, which
            keeps the subject in view without occupying the officer; with
            no subject at all the priority feed returns. Nothing is
            removed — the feed is one dismissal away throughout.
          */}
          {workspaceOpen ? (
            <FocusWorkspaceHost />
          ) : focused ? (
            <FocusRail />
          ) : (
            <IntelligenceFeedPanel projection={feedProjection} />
          )}
        </div>

        {/*
          Layer 4 — supporting intelligence. The KPI ribbon and the
          confidence legend are reference material rather than the
          headline, so they sit beneath the map and the priority feed
          instead of above them. The ribbon still orders by lens.
        */}
        <div className={recede}>
          <Ribbon />
        </div>
        <div className={recede}>
          <ConfidenceLegend />
        </div>

        {/*
          Supporting intelligence, one panel at a time.

          Four stacked panels cost four panels of vertical space to show
          one panel of attention. The lens picks which opens; the other
          three are one click away. Nothing blocking is behind a tab —
          orientation, the recommended action, priority intelligence and
          the map all stay permanently above this.
        */}
        <div className={recede}>
          <SupportingIntelligence
            mode={mode}
            panels={{
              "revenue-assurance": <RevenueAssurancePanel />,
              "manifest-intelligence": <ManifestIntelligencePanel />,
              "compliance-watchlist": (
                <ComplianceWatchlistPanel projection={complianceProjection} />
              ),
              "port-operations": <PortOperationsPanel projection={portsProjection} />,
            }}
          />
        </div>

        <div className={recede}>
          <CargoWorkspaceStrip />
        </div>

        <div className={cn("grid gap-4 lg:grid-cols-[1fr_1.3fr]", recede)}>
          <TodaysPrioritiesPanel projection={prioritiesProjection} />
          <RecentBriefingsPanel projection={briefingsProjection} />
        </div>

        {/*
          What this officer owns, read-only, over stores that already
          exist. Placed last: personalisation changes emphasis and must
          never precede the institutional picture.
        */}
        <div className={recede}>
          <MyWorkspaceSummary />
        </div>
      </div>
    </AppShell>
  );
}

/**
 * A panel with nothing to report.
 *
 * Deliberately not styled as an error. "Nothing was observed" is a
 * finding in its own right, and an officer who sees a warning icon every
 * time a queue is clear learns to ignore warning icons.
 */
function EmptyPanelNote({ headline, detail }: { headline: string; detail: string }) {
  return (
    <div
      data-testid="empty-panel-note"
      className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center"
    >
      <ShieldCheck className="mb-2 h-5 w-5 text-slate/60" aria-hidden />
      <p className="type-h2 text-foreground">{headline}</p>
      <p className="mt-1 max-w-[36ch] type-small leading-relaxed text-slate">{detail}</p>
    </div>
  );
}

/** How current the feed is, and whether it covers everything asked. */
const FRESHNESS_COPY: Record<string, string> = {
  fresh: "Current",
  recent: "Delayed — newest signal is not from the last few minutes",
  ageing: "Delayed — newest signal is several hours old",
  stale: "Stale — nothing recent has been observed",
  unknown: "Currency unknown — no usable timestamp on the newest signal",
};

/**
 * A one-line currency statement above the feed.
 *
 * Separate from the panel's availability state: a reporting capability can
 * still be reporting old news, and collapsing the two would hide exactly
 * that case. Deliberately text, not a badge — a coloured pill here would
 * compete with the confidence chips on every row.
 */
function FeedCurrencyLine({ data }: { data: FeedPanelData | null }) {
  if (!data) return null;
  return (
    <p
      data-testid="feed-currency"
      data-freshness={data.freshness}
      className="border-b border-line px-4 pb-2 type-small text-slate"
    >
      {FRESHNESS_COPY[data.freshness] ?? FRESHNESS_COPY.unknown}
      {data.partial ? " · partial — some signals could not be graded" : ""}
    </p>
  );
}

/** One observed signal, rendered from a real finding. */
function SignalItem({ signal, onClick }: { signal: FeedSignal; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1 px-4 py-3 text-left motion-fast hover:bg-surface"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="type-h2 min-w-0 truncate text-foreground">{signal.title}</span>
        <ConfidenceChip tier={signal.confidence} size={9} />
      </div>
      <span className="type-small leading-relaxed text-slate">{signal.subtitle}</span>
    </button>
  );
}

/* ---------------- Ribbon ---------------- */

function Ribbon() {
  const handoff = useHandoffNavigate();
  const { data: coverage } = useCoverage();
  /*
   * The active lens.
   *
   * Local to Mission Control on purpose: a mode is a way of looking at
   * this surface, not a property of the map or of the shared geospatial
   * state, and putting it in a global store would make an unrelated
   * surface able to change what an officer is reading here.
   */
  const { mode } = useMissionMode();

  const kpiByKey = new Map((coverage?.kpis ?? []).map((k) => [k.key, k]));

  /*
   * Reordered, never filtered.
   *
   * `orderKpis` ranks the domains this lens leads with and appends the
   * rest — so an officer in Revenue Assurance still sees that the vessel
   * feed is down, which is the reason half their revenue picture is
   * unverifiable. Every card keeps whatever state and root cause the
   * coverage model gave it; the lens only decides reading order.
   */
  const tiered = useMemo(() => tierKpis(mode, RIBBON_KPIS, (k) => k.metricKey), [mode]);

  return (
    <div className="flex flex-col gap-3">
      {coverage ? (
        <IntelligenceReadinessCard
          readiness={coverage.readiness}
          generatedAt={coverage.generatedAt}
          report={coverage}
        />
      ) : null}
      {/*
        Recommended next steps for this lens. Every one names a route
        that exists — asserted by test — so an action can never be a
        dead end. What a lens is *for* does not change with the data,
        which is why these are configuration rather than derived: an
        officer whose AIS feed is down must not also lose the action
        telling them to go and check provider health.
      */}
      <div
        data-testid="mission-recommended-actions"
        className="flex flex-wrap items-center gap-1.5"
      >
        {mode.actions.map((action) => (
          <Link
            key={action.id}
            to={action.href}
            title={action.rationale}
            data-testid={`mission-action-${action.id}`}
            className="rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {action.label}
          </Link>
        ))}
      </div>
      {/*
        Tiered rather than seven equal cards.

        The lens's leading domain spans two columns and the rest recede,
        so an officer reads which domain this perspective is about
        before reading any individual number. Every KPI is still
        rendered — a demoted card keeps whatever state and root cause
        the coverage model gave it, because a blocked provider must stay
        visible even when the lens does not lead with it.
      */}
      <div
        data-testid="mission-kpi-ribbon"
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
      >
        {tiered.map(({ item: kpi, tier }) => {
          const Icon = RIBBON_ICONS[kpi.key] ?? Activity;
          const cov = kpiByKey.get(kpi.metricKey);
          // Lead takes two columns; everything else takes one and the
          // background tier dims slightly. Emphasis by size and weight,
          // not by adding colour to a card.
          const span = tier === "lead" ? "md:col-span-2 xl:col-span-3" : "xl:col-span-1";
          const dim = tier === "background" ? "opacity-[0.72]" : undefined;
          if (cov) {
            return (
              <div
                key={kpi.key}
                data-testid={`kpi-${kpi.metricKey}`}
                data-tier={tier}
                className={cn(span, dim)}
              >
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
              </div>
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
              {/*
                No confidence chip here. Coverage has not resolved, so there
                is no value yet — and a tier rendered beside "Checking
                coverage…" would assert certainty about a number that does
                not exist. The chip returns with the value, from
                KpiCoverageCard above.
              */}
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

/* ---------------- Focus rail ---------------- */

/** Context Rail bound to Mission Control's entity route contract. */
function FocusRail() {
  const navigate = useNavigate();
  return (
    <ContextRail
      onOpen={(id) =>
        void navigate({
          to: "/entity/$id",
          params: { id },
          search: { entityId: id, fromStage: "Monitor", fromRoute: "/" },
        })
      }
    />
  );
}

/* ---------------- Maritime Picture Panel ---------------- */

/**
 * Mission Control's geographic overview.
 *
 * ## What changed and why
 *
 * This panel previously rendered a hand-drawn SVG over a hardcoded
 * `MAP_VESSELS` array, under a pulsing "LIVE" badge whose `live` prop
 * defaulted to `true`. Officers were shown fabricated vessels —
 * MV Ocean Pearl among them, at `x`/`y` percentages rather than
 * coordinates — presented as current maritime intelligence.
 *
 * It now mounts the canonical `MapCanvas`, so the geography is real even
 * when the vessel feed is not, and the badge is *derived* from the feed
 * rather than asserted by a prop. When nothing is connected the map still
 * draws Nigeria's EEZ and ports — verified static geography — and says
 * plainly that no vessel source is connected.
 *
 * ## Not a second Maritime Command
 *
 * Deliberately no drawer, no layer panel, no timeline, no mode bar. This
 * is a dashboard-level situational overview with one call to action:
 * open the full environment. Selection still flows through the shared
 * `sgs` singleton, so a vessel chosen here is the same selection
 * `/maritime` will open with.
 */
function MaritimePicturePanel() {
  const [vessels, setVessels] = useState<readonly Vessel[]>([]);
  const [feed, setFeed] = useState<VesselFeedState>({
    loading: true,
    error: null,
    sourceId: null,
    lastAppliedAt: null,
  });

  const handleVessels = useCallback((next: readonly Vessel[], nextFeed: VesselFeedState) => {
    setVessels(next);
    setFeed(nextFeed);
  }, []);

  // The claim is computed from the feed, never asserted by this component.
  const dataState = resolveMapDataState({
    loading: feed.loading,
    error: feed.error,
    sourceId: feed.sourceId,
    lastAppliedAt: feed.lastAppliedAt,
    recordCount: vessels.length,
  });

  return (
    <PanelCard variant="edge" className="flex h-[520px] flex-col">
      <PanelHeader
        title="Maritime Picture"
        subtitle="Nigerian EEZ and approaches"
        to="/maritime"
        toLabel="Open Maritime Command"
      />

      <div className="flex items-center gap-2 px-4 pb-2">
        <DataStateBadge state={dataState} />
        <span className="text-[11px] text-muted-foreground">{dataState.reason}</span>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-b-[inherit]">
        {/*
          Overview mode: the same engine, same service, same layers as
          /maritime — less chrome. Selection writes to the shared `sgs`
          singleton, so a vessel chosen here is already selected when the
          officer opens Maritime Command.
        */}
        <MapCanvas mode="overview" onVesselsChanged={handleVessels} />
        {dataState.state !== "LIVE" ? <MaritimeDataNotice state={dataState} /> : null}
      </div>
    </PanelCard>
  );
}

/**
 * Status when vessel intelligence is not live.
 *
 * Deliberately a small corner card, not a takeover. The map stays fully
 * visible and usable underneath: the EEZ, coastline and ports are
 * verified geography that remain true whether or not a vessel feed is
 * connected, and hiding them would discard real intelligence because a
 * different layer is missing.
 *
 * `pointer-events-none` so the officer can still pan and zoom through it.
 */
function MaritimeDataNotice({ state }: { state: MapDataStateResult }) {
  return (
    <div
      data-testid="maritime-data-notice"
      className="pointer-events-none absolute bottom-3 left-3 max-w-[300px] rounded border border-border/60 bg-background/92 p-2.5 shadow-sm backdrop-blur-sm"
    >
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Maritime data
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-foreground">{state.label}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{state.reason}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Geographic and verified intelligence layers remain accessible.
      </p>
    </div>
  );
}

/**
 * The data-state badge.
 *
 * Only `LIVE` animates. The pulse is a claim about currency, so it is
 * bound to the one state entitled to make it.
 */
function DataStateBadge({ state }: { state: MapDataStateResult }) {
  const tone: Record<MapDataStateResult["state"], string> = {
    LIVE: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700",
    DELAYED: "border-amber-600/40 bg-amber-600/10 text-amber-700",
    DATA_UNAVAILABLE: "border-slate-500/40 bg-slate-500/10 text-slate-600",
    DEMO: "border-violet-600/40 bg-violet-600/10 text-violet-700",
  };

  return (
    <span
      data-testid="map-data-state"
      data-state={state.state}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
        tone[state.state],
      )}
    >
      <Radio className={cn("h-3 w-3", state.isLive && "animate-pulse")} aria-hidden />
      {state.label}
    </span>
  );
}

/* ---------------- Intelligence Feed Panel ---------------- */

function IntelligenceFeedPanel({ projection }: { projection: PanelProjection<FeedPanelData> }) {
  useRenderTrace("feed.render", { surface: "mission-control" });
  const handoff = useHandoffNavigate();
  const signals = projection.data?.signals ?? [];

  return (
    <PanelCard variant="edge" className="flex h-[520px] flex-col">
      <PanelHeader
        title="Intelligence Feed"
        subtitle="Observed signals — not findings"
        to="/detect"
        toLabel="Open Detect"
      />
      {projection.state === "ACTIVE" && signals.length > 0 ? (
        <FeedCurrencyLine data={projection.data} />
      ) : null}
      <div className="flex-1 overflow-y-auto">
        {projection.state !== "ACTIVE" ? (
          <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
        ) : signals.length === 0 ? (
          <EmptyPanelNote
            headline="No verified intelligence findings"
            detail="Nothing has been observed for the current operating picture. This is a complete answer, not a missing one."
          />
        ) : (
          <ul className="divide-y divide-line">
            {signals.map((signal) => (
              <li key={signal.id}>
                <SignalItem
                  signal={signal}
                  onClick={() =>
                    handoff({
                      target: `/entity/${signal.subjectId}`,
                      context: {
                        entityId: signal.subjectId,
                        signalId: signal.id,
                        confidence: signal.confidence.toUpperCase() as
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
        )}
      </div>
      <div className="border-t border-line px-4 py-2 italic type-small text-slate">
        Observations, not findings. Click any item to view evidence.
      </div>
    </PanelCard>
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

function ComplianceWatchlistPanel({ projection }: { projection: PanelProjection<never> }) {
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Compliance & Watchlist"
        subtitle="Sanctions and obligations"
        to="/compliance"
        toLabel="Go to Compliance"
        compact
      />
      <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
    </PanelCard>
  );
}

/* ---------------- Port Operations ---------------- */

function PortOperationsPanel({ projection }: { projection: PanelProjection<never> }) {
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Port Operations"
        subtitle="Congestion index · Nigerian ports"
        to="/ports"
        toLabel="Go to Ports"
        compact
      />
      <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
    </PanelCard>
  );
}

/* ---------------- Today's Priorities ---------------- */

function TodaysPrioritiesPanel({
  projection,
}: {
  projection: PanelProjection<PrioritiesPanelData>;
}) {
  const handoff = useHandoffNavigate();
  const items = projection.data?.items ?? [];

  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Today's Priorities"
        subtitle="Officer queue · observed conditions"
        to="/investigate"
        toLabel="Open Investigate"
        compact
      />
      {projection.state !== "ACTIVE" ? (
        <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
      ) : items.length === 0 ? (
        <EmptyPanelNote
          headline="No high-priority actions require attention"
          detail="The detection capability ran and surfaced nothing critical or high. This is a healthy queue, not an empty one."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() =>
                  handoff({
                    target: `/entity/${item.id}`,
                    context: {
                      entityId: item.id,
                      confidence: item.confidence.toUpperCase() as
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
                    <span className="type-h2 block truncate text-foreground">
                      {item.entityName}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-foreground">
                    {item.priority}
                  </span>
                </div>
                <p className="mt-1.5 type-small text-foreground/80">{item.rationale}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="type-small text-slate">
                    {item.approved ? "Officer approved" : "Awaiting officer decision"}
                  </span>
                  <ConfidenceChip tier={item.confidence} size={9} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
/* ---------------- Recent Briefings ---------------- */

function RecentBriefingsPanel({ projection }: { projection: PanelProjection<never> }) {
  return (
    <PanelCard className="flex flex-col">
      <PanelHeader
        title="Recent Intelligence Briefings"
        subtitle="Officer-authored and AI-drafted"
        to="/share"
        toLabel="Open Share"
        compact
      />
      <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
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
    | "/maritime"
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
