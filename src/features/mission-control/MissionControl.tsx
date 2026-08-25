import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getIntelligenceCoverage } from "@/lib/intelligence-coverage.functions";
import { Radio } from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { useFocusSubjectStore } from "@/stores/focus-subject.store";

import { PanelCard } from "@/components/panel-card";
import { MapCanvas, type VesselFeedState } from "@/features/maritime/MapCanvas";
import { resolveMapDataState, type MapDataStateResult, type Vessel } from "@/services/geospatial";
import { MissionCommandBar, MissionModeBar } from "@/components/mission-command-bar";
import type { EntityType } from "@/lib/command-dispatch";
import { DEFAULT_MODE } from "@/lib/intelligence-modes";
import { useHandoffNavigate } from "@/lib/nav-context";
import { cn } from "@/lib/utils";
import { useUipStore } from "@/stores/uip.store";
import { scanForLeakage } from "@/services/revenue-leakage";
import {
  projectIntelligenceFeed,
  projectTodaysPriorities,
} from "@/lib/intelligence/dashboard-projection";
import { QuickActions } from "@/features/mission-control/quick-actions";
import { NextBestAction } from "@/features/mission-control/next-best-action";
import { PriorityQueuePanel } from "@/features/mission-control/priority-queue";
import { KpiRibbon } from "@/features/mission-control/kpi-ribbon";
import { MyWorkspacePanel } from "@/features/mission-control/my-workspace";
import { IntelligenceEventsStrip } from "@/features/mission-control/intelligence-events";
import { FocusWorkspaceOverlay } from "@/features/mission-control/focus-workspace-overlay";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";

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

/**
 * Mission Control — the national maritime operating picture.
 *
 * Composition, top to bottom: Maritime Command bar, Mission Mode,
 * Next Best Action, National Maritime Picture beside the Priority Queue,
 * operational KPI signals, one consolidated My Workspace, one
 * Intelligence Events strip. Nothing else.
 *
 * Capabilities that used to occupy permanent space here (Intelligence
 * Feed, Today's Priorities, Recent Briefings, Revenue Assurance, Manifest
 * Intelligence, Compliance & Watchlist, Port Operations, Cargo
 * Intelligence Workspace, Confidence Ladder) remain fully available on
 * their own routes — they are simply not part of the operating picture.
 */
export function MissionControl() {
  const navigate = useNavigate();
  const handoff = useHandoffNavigate();
  const focused = useFocusSubjectStore((s) => s.subject);
  const recede = focused ? "is-receded" : undefined;

  /**
   * The mission mode the officer pinned. Local presentation state so the
   * selector can render as its own band while the command bar keeps
   * owning the search behaviour — no new global store.
   */
  const [pinnedMode, setPinnedMode] = useState<EntityType | null>(null);
  const modeKey = pinnedMode ?? DEFAULT_MODE;

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

  const openEntity = useCallback(
    (id: string) =>
      handoff({
        target: `/entity/${id}`,
        context: { entityId: id, fromStage: "Monitor", fromRoute: "/" },
      }),
    [handoff],
  );

  return (
    <AppShell title="Mission Control" subtitle="National maritime operating picture" mode="light">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-3.5 px-5 py-4">
        {/* MARITIME COMMAND BAR — search dominant, quick actions beside it. */}
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
          <MissionCommandBar
            fromRoute="/"
            pinnedMode={pinnedMode}
            onPinnedModeChange={setPinnedMode}
            hideModeChips
          />
          <div className={recede}>
            <QuickActions />
          </div>
        </div>

        {/* MISSION MODE — the existing intelligence-mode engine, own band. */}
        <div className={cn("rounded-lg border border-line bg-surface px-3.5 py-2.5 elev-1", recede)}>
          <MissionModeBar
            modeKey={modeKey}
            onSelect={(next) => setPinnedMode(next)}
          />
        </div>

        {/* NEXT BEST ACTION — the strongest decision surface. */}
        <NextBestAction projection={prioritiesProjection} onAct={openEntity} />

        {/* NATIONAL MARITIME PICTURE + PRIORITY QUEUE — the map is the anchor. */}
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,3.2fr)_minmax(0,1fr)]">
          <MaritimePicturePanel />
          <PriorityQueuePanel
            projection={prioritiesProjection}
            onOpen={openEntity}
            className="h-[620px]"
          />
        </div>

        {/* OPERATIONAL KPI SIGNALS — tiered emphasis by active mission mode. */}
        <div className={recede}>
          <KpiRibbon
            coverage={coverage}
            mode={modeKey}
            onOpen={(target) =>
              handoff({ target, context: { fromStage: "Monitor", fromRoute: "/" } })
            }
          />
        </div>

        {/* MY WORKSPACE — one consolidated officer surface. */}
        <div className={recede}>
          <MyWorkspacePanel />
        </div>

        {/* INTELLIGENCE EVENTS — one compact timeline strip. */}
        <div className={recede}>
          <IntelligenceEventsStrip
            projection={feedProjection}
            onOpen={(subjectId, signalId) =>
              handoff({
                target: `/entity/${subjectId}`,
                context: {
                  entityId: subjectId,
                  signalId,
                  fromStage: "Detect",
                  fromRoute: "/",
                },
              })
            }
          />
        </div>
      </div>

      {/* FOCUS — the existing focus-subject model, as a contextual layer. */}
      <FocusWorkspaceOverlay
        onOpen={(id) =>
          void navigate({
            to: "/entity/$id",
            params: { id },
            search: { entityId: id, fromStage: "Monitor", fromRoute: "/" },
          })
        }
      />
    </AppShell>
  );
}

/* ---------------- National Maritime Picture ---------------- */

/**
 * Mission Control's geographic overview — the visual anchor of the page.
 *
 * Mounts the canonical `MapCanvas` in overview mode, so the geography is
 * real even when the vessel feed is not, and the live badge is *derived*
 * from the feed rather than asserted by a prop. When nothing is connected
 * the map still draws Nigeria's EEZ and ports — verified static geography
 * — and says plainly that no vessel source is connected.
 *
 * Deliberately no drawer, no layer panel, no timeline, no mode bar.
 * Selection still flows through the shared `sgs` singleton, so a vessel
 * chosen here is the same selection `/maritime` will open with.
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
    <PanelCard variant="edge" className="flex h-[620px] flex-col elev-2">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="type-label text-slate">National Maritime Picture</h2>
          <span className="truncate text-[11px] text-slate">Nigerian EEZ and approaches</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DataStateBadge state={dataState} />
        </div>
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
      className="pointer-events-none absolute bottom-3 left-3 max-w-[300px] rounded-lg border border-border/60 bg-background/92 p-2.5 shadow-card backdrop-blur-sm"
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
      title={state.reason}
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
