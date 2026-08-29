/**
 * Maritime — Live Command Map shell.
 *
 * Composes the toolbar, canvas, layer panel, intelligence card, and status
 * strip. View-mode labels follow the Command Edition (R7): officers choose an
 * operational purpose ("Operational View", "Terrain Perspective"), never a
 * rendering engine.
 *
 * Every toolbar action writes to SGS rather than reaching into the renderer, so
 * the camera has exactly one owner and the URL stays in step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Maximize2,
  Minus,
  Orbit,
  Plus,
  RotateCcw,
  Ruler,
  Camera as ScreenshotIcon,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useMapFocusBridge } from "@/features/focus-workspace/map-bridge";

import { Button } from "@/components/ui/button";
import {
  MAP_DEFAULTS,
  MAP_SCOPES,
  getVesselSource,
  resolveMapDataState,
  mapEventBus,
  type MapScopeId,
  sgs,
  useMapSelector,
  useMapSessionStore,
  type ReplaySink,
  type Vessel,
  type ViewMode,
} from "@/services/geospatial";
import type { IntelligenceMapPlan } from "@/services/orchestration";

import { cn } from "@/lib/utils";

import { ContextDrawer } from "./ContextDrawer";
import { ControlRail } from "./ControlRail";
import { SpatialTrail } from "./SpatialTrail";
import { CoordinateHud } from "./CoordinateHud";
import { DataProvenanceNotice } from "./DataProvenanceNotice";
import { VoiceCommand } from "./VoiceCommand";
import { MAP_ZONE } from "./map-zones";
import { useVoyages, type VoyageFeed } from "./useVoyages";
import { MapCanvas, type VesselFeedState } from "./MapCanvas";
import { useReplayTimeline } from "./useReplayTimeline";
import { useVesselCamera } from "./useVesselCamera";
import { OperationalLegend } from "./OperationalLegend";
import { MaritimeSearch } from "./MaritimeSearch";
import { OperatingModeBar } from "./OperatingModeBar";
import { TimelineBar } from "./TimelineBar";
import { replayPresentation } from "./replay-presentation";
import { displayOwner, replayOwnsDisplay, DISPLAY_OWNER_LABEL } from "./replay-ownership";
import { useArrivalAlerts } from "./useArrivalAlerts";
import { useIntelligenceFindings } from "./useIntelligenceFindings";
import { openInvestigationForFinding } from "@/lib/findings.functions";
import type { IntelligenceFinding } from "@/services/findings/finding";
import { AttentionCentre } from "./AttentionCentre";
import { framingCentreFor } from "./selected-vessel-framing";
import { useVesselTrack } from "./useVesselTrack";
import { REQUESTED_SELECTION, resolveRequestedVessel } from "./deterministic-selection";
import { toTrackCollection } from "@/services/geospatial/vessel-track";
import { navigateToCoordinates } from "@/services/geospatial/navigation";
import { hasHistory } from "@/services/geospatial/vessel-source";
import { eezRingIfLoaded } from "@/services/geospatial/eez-ring";
import { transitionAlert } from "@/services/alerts";

/**
 * The three perspectives, named for what an officer is looking at.
 *
 * Globe was added to the engine and to Mission Control's cycling control
 * without reaching this one, so Maritime Command — the surface that owns
 * the full map — was the only place the projection could not be chosen.
 * Worse than absent: switching to Globe elsewhere left every button here
 * unpressed, because the mode the map was in had no entry to match.
 *
 * Labels follow the Command Edition rule that officers choose a purpose,
 * never a rendering engine.
 */
const VIEW_MODES: ReadonlyArray<{ mode: ViewMode; label: string; title: string }> = [
  { mode: "2D", label: "Operational View", title: "Overhead national picture" },
  {
    mode: "3D",
    label: "Terrain Perspective",
    title: "Terrain-level view — port approach, berth layout, vessel proximity",
  },
  {
    mode: "GLOBE",
    label: "Global View",
    title: "Whole-earth projection — ocean basins, distant voyages and approaches",
  },
];

/**
 * Pitch belongs to the tilt, not to the projection.
 *
 * The same rule the perspective control on the compact map applies: 3D
 * asks for real camera pitch, while 2D and the globe both sit level, so
 * an officer spinning out to the globe does not find the world tilted as
 * well.
 */
function pitchForView(mode: ViewMode): number {
  return mode === "3D" ? 50 : 0;
}

/**
 * Width the rail and the context column occupy on the left.
 *
 * The rail is 44px at left-3 and the context column beside it is 19rem;
 * together they cover roughly this much of the map. Declared here rather
 * than measured because both are fixed by the zone table.
 */
const LEFT_CONTEXT_WIDTH_PX = 360;

/**
 * Who an officer action is attributed to, until sign-in reaches this surface.
 *
 * A single named placeholder rather than a string repeated at each call
 * site, so the day real identity arrives there is one place to change and
 * no risk of half the actions still being attributed to a literal. It is
 * deliberately not a person's name: an unattributed action is better than
 * a misattributed one.
 */
const OFFICER_ACTOR = "officer";

/** Centre and zoom that frame Nigeria and its maritime approaches. */
const NIGERIA_VIEW = { center: [5.7, 4.35] as const, zoom: 6 };

export function MaritimeCommand() {
  /*
   * Selecting on the full map establishes focus.
   *
   * Until now this environment wrote only to `MapSelection`, so an
   * officer who clicked a vessel here had selected it on the map and
   * nowhere else: the Context Rail, the Copilot and every environment
   * hand-off still believed nothing was in hand. Mission Control had the
   * bridge mounted and the map environment did not, which meant the same
   * click meant two different things depending on which screen it
   * happened on.
   *
   * `focus-only` because this surface is map-dominant: the Focus
   * Workspace drawer would cover the thing the officer came for. The
   * subject is established all the same, which is what the rest of the
   * application reads.
   */
  useMapFocusBridge(undefined, "focus-only");

  const viewMode = useMapSelector((state) => state.viewMode);
  const presentationMode = useMapSelector((state) => state.presentationMode);
  const operatingMode = useMapSelector((state) => state.operatingMode);
  const selection = useMapSelector((state) => state.selection);
  const enabledCsv = useMapSelector((state) => state.enabledSources.join(","));

  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  /*
   * Scope lives in shared state, not here.
   *
   * It was local `useState`, which meant only this surface could leave
   * the West African bounds and the choice vanished on any remount,
   * route change or reload. Reading it from SGS makes one selection
   * govern every map surface and survive a pasted link.
   */
  /*
   * Whether the active vessel source keeps an archive.
   *
   * Resolved through the same registry `MapCanvas` reads, so the answer
   * describes the provider actually feeding the map rather than one this
   * component assumed.
   */
  const sourceSupportsHistory = useMemo(
    () =>
      enabledCsv
        .split(",")
        .filter(Boolean)
        .some((id) => {
          const source = getVesselSource(id);
          return source ? hasHistory(source) : false;
        }),
    [enabledCsv],
  );

  /*
   * The selected vessel's recorded movement.
   *
   * Asked of the active source once per selection, and handed to the map
   * as an already-resolved collection — deciding what a track is belongs
   * to the domain layer, not to the renderer.
   */
  const selectedImo = selection?.kind === "vessel" ? selection.id : null;
  const { track: vesselTrack } = useVesselTrack(
    selectedImo,
    useMemo(() => enabledCsv.split(",").filter(Boolean), [enabledCsv]),
  );
  const trackCollection = useMemo(
    () => (vesselTrack ? toTrackCollection(vesselTrack) : undefined),
    [vesselTrack],
  );

  const scope = useMapSelector((state) => state.scope);
  const setScope = useCallback((next: MapScopeId) => sgs.setScope(next), []);
  const voyageFeed = useVoyages();
  /*
   * The selected voyage is resolved from the feed, never carried on the
   * selection — the same rule as vessels. `undefined` while the feed is
   * still loading is meaningful: it renders "loading", not "not found".
   */
  const selectedVoyage = useMemo(() => {
    if (selection?.kind !== "voyage") return null;
    if (voyageFeed.status === "loading") return undefined;
    return voyageFeed.voyages.find((voyage) => voyage.id === selection.id) ?? null;
  }, [selection, voyageFeed]);
  const [lastPlan, setLastPlan] = useState<IntelligenceMapPlan | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // ── Canonical vessel feed ──────────────────────────────────────
  // These come from VesselUpdateEngine.snapshot() via MapCanvas, so the
  // panel counts exactly the objects the map drew.
  const [vessels, setVessels] = useState<readonly Vessel[]>([]);
  /**
   * The fleet as the provider last reported it.
   *
   * Equal to `vessels` except during replay, when the map is showing
   * historical frames and this is still the present.
   */
  const [liveVessels, setLiveVessels] = useState<readonly Vessel[]>([]);
  const [feed, setFeed] = useState<VesselFeedState>({
    loading: true,
    error: null,
    sourceId: null,
    lastAppliedAt: null,
  });
  /*
   * Two sets, and the distinction is load-bearing.
   *
   * `vessels` is what the map is drawing, which during replay is
   * historical — the drawer and the search read it so they agree with the
   * picture. `liveVessels` is what the provider last reported, and is the
   * only set anything reasoning about the present may use. Measured
   * before they were separated: an alert's current assessment was derived
   * from a frame observed at 16:03:02 and stamped assessedAt 16:05:09, a
   * lag of 126 seconds, because replay frames reached the approach
   * engine as though they were the live fleet.
   */
  const handleVessels = useCallback(
    (next: readonly Vessel[], nextFeed: VesselFeedState, live: readonly Vessel[]) => {
      setVessels(next);
      setLiveVessels(live);
      setFeed(nextFeed);
    },
    [],
  );

  // ── Canonical replay ───────────────────────────────────────────
  // The sink is the engine MapCanvas draws from, so replaying moves the
  // vessels on screen rather than a private copy.
  const engineRef = useRef<ReplaySink | null>(null);
  const replay = useReplayTimeline({
    sink: engineRef.current,
    feedLoading: feed.loading,
    feedError: feed.error,
  });
  /*
   * Who owns the displayed position, derived from the player's own state
   * rather than tracked separately — a second replay-mode flag could
   * disagree with the player and would eventually be the thing that says
   * LIVE over a historical picture.
   */
  const replayOwner = displayOwner(replay.status);

  /*
   * Continuous approach assessment.
   *
   * The alert domain existed and produced nothing because nothing ran
   * it: approach was assessed only when an officer asked a question. One
   * interval, the canonical engine, the same boundary ring the map draws.
   */
  const alerts = useArrivalAlerts({
    // The live fleet, never the replayed one.
    vessels: liveVessels,
    boundaryRing: eezRingIfLoaded(),
    sourceId: feed.sourceId ?? "unknown",
  });

  /*
   * An alert leads to the same selection every other route leads to.
   *
   * Through `sgs.select`, so there is no alert-specific selected vessel
   * and no second drawer. The camera is left to the existing selection
   * framing rather than moved from here.
   */
  const viewAlertVessel = useCallback((imo: string) => {
    sgs.select({ kind: "vessel", id: imo, imo });
  }, []);

  /*
   * Findings from the other intelligence domains, read from what they
   * already stored. Nothing is screened here and no provider is called.
   */
  const findings = useIntelligenceFindings();

  /*
   * A finding leads to the same canonical context as everything else.
   * Only vessel subjects can be selected on the map; any other subject
   * is left to its own surface rather than mapped to a hull we do not have.
   */
  const openFinding = useCallback((finding: IntelligenceFinding) => {
    if (finding.subjectType !== "vessel") return;
    sgs.select({ kind: "vessel", id: finding.subjectId, imo: finding.subjectId });
  }, []);

  /*
   * The officer attaches a finding to a case. The subject and evidence
   * reference travel as typed fields, so the case carries a real
   * relationship rather than an IMO buried in a description.
   */
  const linkFinding = useCallback(
    async (finding: IntelligenceFinding) => {
      try {
        const result = await openInvestigationForFinding({
          data: {
            findingId: finding.id,
            findingType: finding.findingType,
            subjectType: finding.subjectType,
            subjectId: finding.subjectId,
            subjectLabel: finding.subjectLabel,
            source: finding.source,
            sourceRecordId: finding.sourceRecordId ?? undefined,
            summary: finding.summary,
            evidenceRef: finding.evidenceRef ?? undefined,
          },
        });
        toast.success(
          result.created
            ? `Case ${result.caseNumber} opened from this finding.`
            : `Finding attached to case ${result.caseNumber}.`,
        );
      } catch (error) {
        // A failed link is reported, never presented as done.
        toast.error(
          error instanceof Error
            ? `Could not attach this finding to a case: ${error.message}`
            : "Could not attach this finding to a case.",
        );
      }
    },
    [],
  );

  const acknowledgeAlert = useCallback(
    async (alertId: string) => {
      const alert = await alerts.repository.getAlert(alertId);
      if (!alert) return;
      const outcome = transitionAlert({
        alertId,
        from: alert.state,
        to: "ACKNOWLEDGED",
        actor: OFFICER_ACTOR,
      });
      // The lifecycle table decides. A refusal is left standing rather
      // than forced through, so the interface cannot outrank the domain.
      if (!outcome.ok) return;
      /*
       * The version the read returned is asserted by the write. If
       * another session moved this alert in between, the repository
       * refuses and the next refresh shows what actually happened
       * instead of quietly overwriting someone else's decision.
       */
      await alerts.repository.applyTransition({
        alertId,
        expectedVersion: alert.version,
        event: outcome.event,
        officerId: OFFICER_ACTOR,
      });
      alerts.refresh();
    },
    [alerts],
  );

  // Hydrate shared state from the URL so a pasted link restores the view.
  useEffect(() => {
    sgs.loadFromURL();
  }, []);

  /*
   * Deterministic selection for verification.
   *
   * Simulated vessels move, so verifying anything about a selected
   * vessel by clicking one meant the vessel had moved before the click
   * landed. A `select` query parameter names it instead, and then goes
   * through the same `service.select` a click uses — a parallel path
   * would prove something about itself rather than about the product.
   *
   * Latched: it fires once, when the named vessel first appears in the
   * feed, and never again. Re-applying it would fight an officer who
   * selected something else.
   */
  const requestedSelection = useRef<string | null>(REQUESTED_SELECTION);
  useEffect(() => {
    const wanted = requestedSelection.current;
    if (!wanted || vessels.length === 0) return;
    const imo = resolveRequestedVessel(wanted, vessels);
    // Consumed either way: an unresolvable name should not retry on
    // every feed update, and leaves selection exactly as it was.
    requestedSelection.current = null;
    if (!imo) return;
    sgs.select({ kind: "vessel", id: imo, imo });
    setSelectedVessel(vessels.find((vessel) => vessel.identity.imo === imo) ?? null);
  }, [vessels]);

  /*
   * One camera for Centre and Follow, measuring the drawer and the left
   * rail once so the two controls cannot disagree about where the usable
   * map ends.
   */
  const camera = useVesselCamera({
    position: selectedVessel ? [selectedVessel.position.lon, selectedVessel.position.lat] : null,
    vesselId: selectedVessel?.identity.imo ?? null,
    leftInsetPx: LEFT_CONTEXT_WIDTH_PX,
  });

  const handleSelected = useCallback((vessel: Vessel | null) => {
    setSelectedVessel(vessel);
  }, []);

  /*
   * The panel follows the shared selection, not just the map click.
   *
   * `selectedVessel` used to be set only where a click happened, which
   * quietly made it a second selection state: a vessel chosen from
   * search or by the Copilot went through `sgs.select` and never
   * reached here, so the drawer opened on the right IMO and reported it
   * as "not loaded" while the vessel sat in the feed. Measured in the
   * browser — one drawer, correct identifier, no panel.
   *
   * Deriving it from the shared selection means every route in resolves
   * the same way, which is what having one selection model is for.
   */
  useEffect(() => {
    if (selection?.kind !== "vessel") {
      setSelectedVessel(null);
      return;
    }
    const found = vessels.find((vessel) => vessel.identity.imo === selection.imo);
    // Absent means the feed has not caught up; the drawer's own
    // "not loaded" state is the honest answer until it does.
    if (found) setSelectedVessel(found);
  }, [selection, vessels]);

  /*
   * Keep the chosen vessel where the officer can see it.
   *
   * Selecting opens a 380px drawer. The camera does not change, so the
   * canvas is the same size and the *visible* map is narrower — a vessel
   * that was in view can end up behind the panel describing it, leaving
   * the officer reading intelligence about a ship they cannot see.
   *
   * Keyed on the selected vessel's id, not on its position, so this fires
   * once per selection. Keying it on position would re-centre on every
   * update and take the map away from an officer who had panned
   * deliberately — a camera that fights its user.
   *
   * `framingCentreFor` returns null when the vessel is already
   * comfortably visible, so an unnecessary jump never happens, and the
   * move goes through `navigateToCoordinates` like every other camera
   * change rather than reaching for the renderer.
   */
  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    const imo = selection?.kind === "vessel" ? selection.id : null;
    if (!imo || !selectedVessel || selectedVessel.identity.imo !== imo) {
      if (!imo) framedFor.current = null;
      return;
    }
    if (framedFor.current === imo) return;
    framedFor.current = imo;

    /*
     * Measured after the drawer has laid out, not before.
     *
     * Reading the container in the same tick returns the pre-drawer
     * width, which is precisely the stale geometry that would compute a
     * correction for a map that no longer exists.
     */
    const frame = requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(".maplibregl-map");
      const drawer = document.querySelector<HTMLElement>("[data-testid='context-drawer']");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const camera = sgs.get();
      const centre = framingCentreFor(
        [selectedVessel.position.lon, selectedVessel.position.lat],
        { center: camera.center, zoom: camera.zoom, width: rect.width, height: rect.height },
        {
          // The drawer sits beside the map rather than over it on this
          // surface, so it is only an obstruction when it overlaps.
          right: drawer ? Math.max(0, rect.right - drawer.getBoundingClientRect().left) : 0,
          left: LEFT_CONTEXT_WIDTH_PX,
          top: 0,
          bottom: 0,
        },
      );
      if (centre) navigateToCoordinates(centre, { zoom: camera.zoom, source: "selection" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection, selectedVessel]);

  const closeCard = useCallback(() => {
    sgs.clearSelection();
    setSelectedVessel(null);
  }, []);

  return (
    /*
     * Chromeless: the shell keeps navigation and the top bar, and hands
     * the rest of the area to the map.
     *
     * Maritime Command was the one environment with no shell at all — it
     * drew its own full-viewport layout, so an officer here had no
     * sidebar and no way back except the browser. It takes the shell now
     * without giving up the map: `chromeless` drops the footer and the
     * scroll container, which is what would otherwise cost the map the
     * space it exists to fill.
     */
    /*
     * The shell is lit the same way as the map.
     *
     * Presentation mode was a map-only decision, which produced two
     * disconnected products on one screen: a light institutional map
     * under dark application chrome, or the reverse. An officer choosing
     * Institutional is choosing how Maritime Command looks, not how its
     * basemap looks.
     *
     * `mode` is the environment's default, and the officer's own theme
     * toggle still overrides it — the same precedence every other
     * environment already follows.
     */
    <AppShell
      capabilities={{ chromeless: true }}
      mode={presentationMode === "institutional" ? "light" : "dark"}
    >
      {/*
       * `min-h-0 flex-1`, not `h-dvh`.
       *
       * The height problem this replaces is worth keeping in view: `h-full`
       * resolved against a <body> with no viewport-bound height, so the
       * shell grew to content height and the map rendered as a tall narrow
       * sliver — a vertical strip of ocean with the coastline off-frame,
       * which reads as "the basemap is broken" when the basemap is fine.
       * `h-dvh` fixed that by pinning to the viewport, which is now wrong
       * for the opposite reason: inside the shell the viewport is no longer
       * this element's box, and pinning to it would push the map down past
       * the bottom edge by exactly the height of the top bar. Filling the
       * shell's flex area is the same fix expressed against the right
       * parent.
       */}
      <div ref={shellRef} className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {/* ── TOP COMMAND BAR ─────────────────────────────────────── */}
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
          {/*
            No product name here any more — the shell's top bar names the
            screen from the navigation model. What stays is what acts on
            the map.
          */}
          <MaritimeSearch onApplied={setLastPlan} vessels={vessels} className="w-full max-w-md" />

          {/*
            The attention count sits in the command bar rather than in a
            map zone, and its position is a collision decision rather than
            a stylistic one. Opening it on the right would drop a 320px
            panel over the top of the context drawer — precisely the
            vessel identity an officer opened the drawer to read. Anchored
            here, the panel falls between the left context column (which
            ends around 368px) and the drawer, over map the officer is not
            reading a value from.
          */}
          <AttentionCentre
            alerts={alerts.alerts}
            counts={alerts.counts}
            assessable={alerts.assessable}
            unassessableCount={alerts.unassessableCount}
            durable={alerts.durable}
            onView={viewAlertVessel}
            onAcknowledge={acknowledgeAlert}
            findings={findings.findings}
            onOpenFinding={openFinding}
            onLinkFinding={linkFinding}
            findingsUnavailableReason={findings.unavailableReason}
          />

          <OperatingModeBar />

          <CommandToolbar
            shellRef={shellRef}
            hasSelection={selectedVessel !== null}
            onFitSelection={() => {
              if (!selectedVessel) return;
              sgs.setCamera({
                center: [selectedVessel.position.lon, selectedVessel.position.lat],
                zoom: 10,
              });
            }}
            onClearSelection={closeCard}
          />

          <div
            role="group"
            aria-label="View mode"
            className="flex shrink-0 items-center gap-1 rounded-md bg-muted p-1"
          >
            {VIEW_MODES.map(({ mode, label, title }) => (
              <Button
                key={mode}
                size="sm"
                variant={viewMode === mode ? "default" : "ghost"}
                title={title}
                aria-pressed={viewMode === mode}
                onClick={() => {
                  sgs.switchView(mode);
                  sgs.setCamera({ pitch: pitchForView(mode) });
                }}
                className="h-7 text-xs"
              >
                {label}
              </Button>
            ))}
          </div>
        </header>

        {/* One quiet line saying what a search just did. Not a toast: the
          officer should be able to read it at leisure, or ignore it. */}
        {lastPlan ? (
          <div
            data-testid="map-explanation"
            className="shrink-0 border-b border-border/60 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground"
          >
            {lastPlan.explanation}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          {/*
            No permanent layer panel.

            It held 300px of application width open for a configuration
            surface an officer touches occasionally, which made the map —
            the thing they came for — the smaller half of the screen.
            The same panel now opens from the rail as a drawer over the
            map, so the width is borrowed for as long as it is being used
            and returned afterwards.
          */}
          {/* ── MAP CANVAS — the dominant surface ─────────────────── */}
          <main className="relative min-w-0 flex-1">
            {/*
             * One map instance, whatever the projection.
             *
             * This used to render the canvas only in 2D and a "delivered
             * in G7" placeholder otherwise, which was honest when neither
             * the tilt nor the globe existed. Both do now: 3D is the
             * renderer's own camera pitch and Globe is a MapLibre
             * projection set on the mounted map, so switching perspective
             * is one call on the live instance rather than a different
             * screen.
             *
             * Unmounting the canvas to change projection would also throw
             * away the thing the officer came for — selection, camera and
             * focus all live on that instance, and a remount loses every
             * one of them.
             */}
            {
              <MapCanvas
                scope={scope}
                voyages={voyageFeed.voyages}
                onVesselSelected={handleSelected}
                onVesselsChanged={handleVessels}
                onRecorderReady={replay.attachRecorder}
                vesselTrack={trackCollection}
                onEngineReady={(engine) => {
                  engineRef.current = engine;
                }}
                replayOwnsDisplay={replayOwnsDisplay(replayOwner)}
              />
            }

            {/*
            Legend overlays the map rather than taking a panel slot, and
            starts collapsed so it costs nothing until asked for. It reads
            the same visual config and layer registry the renderer uses.
          */}
            <div className={cn(MAP_ZONE.BOTTOM_RIGHT, "flex justify-end")}>
              <OperationalLegend />
            </div>

            {/*
            Scope control and the voyage feed's own state, together.

            They belong side by side: switching to the global scope is
            what makes a voyage between two continents visible at all,
            and the feed note is what explains an empty world map.
          */}
            {/*
              The officer's instrument for the map, on the map.

              Right-hand side because the left already carries scope and
              the voyage feed's own state, and because a rail an officer
              reaches for repeatedly belongs under the hand rather than
              across the panel they are reading.
            */}
            <ControlRail className={MAP_ZONE.LEFT_RAIL} fullscreenTarget={shellRef} />

            {/*
              Spatial reading. Renders the guides and the readout; it
              reads the camera and never drives it.
            */}
            <CoordinateHud />

            {/*
              Voice, on the map rather than behind a menu. The officer
              speaks a place, a position or the global view; every
              outcome goes through the same navigation path a click does.
            */}
            <VoiceCommand vessels={vessels} fleet={vessels} />

            <div
              className={cn(
                MAP_ZONE.LEFT_CONTEXT,
                "flex w-[19rem] max-w-[calc(100%-5.5rem)] flex-col items-start gap-1.5",
              )}
            >
              {/*
                Orientation above the scope control: where the officer is
                now, and every step back out. Derived from the camera, so
                it follows a hand-pan as readily as a control.
              */}
              <SpatialTrail />
              {/*
                What kind of data is on the map, when that needs saying.
                It lives in this column because the zone already owns
                explanations of the current picture, which means it costs
                no new position and cannot collide with anything.
              */}
              <DataProvenanceNotice />
              <ScopeToggle scope={scope} onChange={setScope} />
              {/*
                Why the fleet is what it is. A provider can answer
                without failing and still return nothing — a plan that
                does not cover the data, a missing credential, an
                unreachable upstream — and each of those arrives as an
                empty list. Saying so here is what stops an officer
                reading a collection gap as an empty sea.
              */}
              <VesselFeedNotice feed={feed} count={liveVessels.length} />
              <VoyageFeedNotice feed={voyageFeed} />
            </div>
          </main>

          {/* ── RIGHT CONTEXT DRAWER ──────────────────────────────── */}
          <ContextDrawer
            selection={selection}
            vessel={selectedVessel}
            voyage={selectedVoyage}
            sourceSupportsHistory={sourceSupportsHistory}
            vesselTrack={vesselTrack}
            camera={camera}
            // Replay is the existing session recorder, reached from the
            // Voyage tab rather than rebuilt there. Offered only when the
            // recorder actually holds something to play.
            onReplay={replay.play}
            replayAvailable={replay.availability === "READY"}
            /*
              Told, rather than left to infer. The drawer showed a
              replayed coordinate under a live freshness chip because
              nothing had ever informed it that a recording was playing.
              Derived from the player's own state, so the drawer and the
              timeline bar cannot disagree about which instant is on
              screen.
            */
            replayContext={
              replay.status
                ? {
                    owner: replayOwner,
                    playheadIso: new Date(replay.status.position).toISOString(),
                  }
                : null
            }
            onClose={closeCard}
          />
        </div>

        {/* ── TIMELINE / REPLAY ─────────────────────────────────── */}
        <TimelineBar
          status={replay.status}
          unavailableReason={replay.unavailableReason}
          /*
            Which shape the bar takes. Derived from state the application
            already owns — selection, the feed's availability, the
            player's status — so replay gains no second source of truth.
          */
          presentation={replayPresentation({
            selection,
            availability: replay.availability,
            status: replay.status,
            unavailableReason: replay.unavailableReason,
            /*
              Asked of the source, not assumed from a selection existing.
              Without this the bar told an officer that a source holding a
              full archive had no history for the vessel they had open.
            */
            sourceSupportsHistory,
          })}
          onAction={(action) => {
            /*
              Both offered actions are about the vessel already selected,
              so both go through the canonical camera path rather than
              moving it here.
            */
            if (action === "view-position" && selectedVessel) {
              navigateToCoordinates([selectedVessel.position.lon, selectedVessel.position.lat], {
                source: "selection",
              });
            }
          }}
          /*
            Named from the player, so a paused or playing recording can
            never be captioned LIVE. "historical" was also the wrong word
            for it: nothing here came from a provider's archive, and this
            says only what it is — observations this session collected.
          */
          windowLabel={
            replayOwner === "LIVE" && operatingMode !== "HISTORY"
              ? DISPLAY_OWNER_LABEL.LIVE
              : replayOwner === "LIVE"
                ? "HISTORICAL"
                : DISPLAY_OWNER_LABEL[replayOwner]
          }
          onPlay={replay.play}
          onPause={replay.pause}
          onStep={replay.step}
          onRestart={replay.restart}
          onSpeed={replay.setSpeed}
          onScrub={replay.scrub}
        />

        <MapStatusBar />
      </div>
    </AppShell>
  );
}

interface CommandToolbarProps {
  readonly shellRef: React.RefObject<HTMLDivElement | null>;
  readonly hasSelection: boolean;
  readonly onFitSelection: () => void;
  readonly onClearSelection: () => void;
}

function CommandToolbar({
  shellRef,
  hasSelection,
  onFitSelection,
  onClearSelection,
}: CommandToolbarProps) {
  const zoom = useMapSelector((state) => state.zoom);
  /*
   * Zoom limits follow the active scope, not a fixed constant.
   *
   * These buttons clamped to `MAP_DEFAULTS` (4–18), which is the
   * regional range. In global scope that disabled zoom-out below 4 —
   * the officer could scroll past it but the control refused, so the
   * toolbar contradicted the map.
   */
  const scope = useMapSelector((state) => state.scope);
  const limits = MAP_SCOPES[scope];

  /*
   * Whether the officer has taken pitch over from the automatic policy.
   *
   * Tracked here rather than in SGS because it is a property of the
   * *renderer's* camera controller, not of the shared map state — two
   * surfaces reading the same SGS could not sensibly share one latch.
   * The bus already carries the change, so this is a mirror, never a
   * second source of truth.
   */
  const [pitchManual, setPitchManual] = useState(false);
  useEffect(
    () => mapEventBus.on("map:perspective", ({ owner }) => setPitchManual(owner === "manual")),
    [],
  );

  const toggleFullscreen = useCallback(() => {
    const element = shellRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.();
  }, [shellRef]);

  return (
    <div role="toolbar" aria-label="Map commands" className="flex items-center gap-0.5">
      <ToolButton
        label="Zoom in"
        disabled={zoom >= limits.maxZoom}
        onClick={() => sgs.setCamera({ zoom: Math.min(limits.maxZoom, zoom + 1) })}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton
        label="Zoom out"
        disabled={zoom <= limits.minZoom}
        onClick={() => sgs.setCamera({ zoom: Math.max(limits.minZoom, zoom - 1) })}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton
        label="Locate Nigeria"
        onClick={() =>
          sgs.setCamera({
            center: [NIGERIA_VIEW.center[0], NIGERIA_VIEW.center[1]],
            zoom: NIGERIA_VIEW.zoom,
          })
        }
      >
        <Crosshair className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Fit to selection" disabled={!hasSelection} onClick={onFitSelection}>
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Clear selection" disabled={!hasSelection} onClick={onClearSelection}>
        <XCircle className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      {/*
        Only while the officer owns pitch.
        A permanently visible reset would be a control for a state the
        map is not in; appearing when the latch engages is what makes it
        legible without a panel or a caption explaining the model.
      */}
      {pitchManual ? (
        <ToolButton
          label="Reset perspective — return tilt to automatic"
          onClick={() => mapEventBus.emit("perspective:reset", {})}
        >
          <Orbit className="h-3.5 w-3.5" aria-hidden />
        </ToolButton>
      ) : null}
      <ToolButton label="Reset view" onClick={() => sgs.reset()}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Fullscreen" onClick={toggleFullscreen}>
        <Maximize2 className="h-3.5 w-3.5 rotate-90" aria-hidden />
      </ToolButton>
      {/* Measure and screenshot are declared but not yet implemented; they are
          disabled with an explanation rather than shown as working controls. */}
      <ToolButton label="Measure distance — not yet available" disabled>
        <Ruler className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
      <ToolButton label="Screenshot — not yet available" disabled>
        <ScreenshotIcon className="h-3.5 w-3.5" aria-hidden />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function MapStatusBar() {
  const vesselCount = useMapSessionStore((s) => s.vesselCount);
  const rendererId = useMapSessionStore((s) => s.rendererId);
  const rendererStatus = useMapSessionStore((s) => s.rendererStatus);
  const fps = useMapSessionStore((s) => s.fps);
  const lastError = useMapSessionStore((s) => s.lastError);
  const activeLayerCount = useMapSelector((state) => state.activeLayers.length);

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
      <Stat label="vessels" value={String(vesselCount)} />
      <Stat label="layers" value={String(activeLayerCount)} />
      <Stat label="fps" value={fps === null ? "—" : String(fps)} />
      <span className="ml-auto font-mono">
        {rendererId ?? "no renderer"} · {rendererStatus}
      </span>
      {lastError ? (
        <span className="max-w-xs truncate text-destructive" title={lastError}>
          {lastError}
        </span>
      ) : null}
    </footer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}

/**
 * Regional / global scope switch.
 *
 * Remounts the map, because bounds and zoom limits are constructor
 * arguments in MapLibre. That is why this is a deliberate two-state
 * control rather than something the camera drifts into.
 */
function ScopeToggle({
  scope,
  onChange,
}: {
  scope: MapScopeId;
  onChange: (next: MapScopeId) => void;
}) {
  return (
    <div
      data-testid="map-scope-toggle"
      className="pointer-events-auto flex items-center gap-0.5 rounded-md border border-border/60 bg-background/92 p-0.5 backdrop-blur-sm"
    >
      {(Object.keys(MAP_SCOPES) as MapScopeId[]).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={scope === id}
          onClick={() => onChange(id)}
          className={cn(
            "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
            scope === id
              ? "bg-[color:var(--color-teal)]/15 text-[color:var(--color-teal)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {MAP_SCOPES[id].label}
        </button>
      ))}
    </div>
  );
}

/**
 * What the voyage overlay is currently showing, and why.
 *
 * Rendered whenever the feed is anything but a fully mapped set. An
 * empty map with no explanation is the failure this whole sprint has
 * been guarding against: the officer cannot tell "no voyages held" from
 * "could not read the register" from "voyages held, ports unresolvable",
 * and those are three different operational situations.
 */
/**
 * What the vessel feed itself claims, in an officer's terms.
 *
 * Derived from the canonical `resolveMapDataState` rather than a local
 * judgement, so the map cannot say LIVE while the drawer says stale.
 * Silent only when the picture is genuinely live and populated.
 */
function VesselFeedNotice({ feed, count }: { feed: VesselFeedState; count: number }) {
  const state = resolveMapDataState({
    loading: feed.loading,
    error: feed.error,
    sourceId: feed.sourceId,
    lastAppliedAt: feed.lastAppliedAt,
    recordCount: count,
  });
  if (state.isLive && count > 0) return null;

  return (
    <div
      data-testid="vessel-feed-notice"
      data-feed-state={state.state}
      className="pointer-events-auto w-full rounded-md border border-border/60 bg-background/92 px-2.5 py-1.5 backdrop-blur-sm"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Vessels · {state.label}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{state.reason}</p>
    </div>
  );
}

function VoyageFeedNotice({ feed }: { feed: VoyageFeed }) {
  const { status, coverage, note } = feed;
  const unmappable = coverage.oneResolved + coverage.neitherResolved;
  if (status === "ready" && unmappable === 0 && !note) return null;

  return (
    <div
      data-testid="voyage-feed-notice"
      data-voyage-status={status}
      className="pointer-events-auto w-full rounded-md border border-border/60 bg-background/92 px-2.5 py-1.5 backdrop-blur-sm"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Voyages
      </div>
      {status === "ready" ? (
        <p className="text-[11px] leading-relaxed text-foreground">
          {coverage.voyages} held · {coverage.bothResolved} with both ports mapped
          {unmappable > 0 ? (
            <span className="text-muted-foreground">
              {" "}
              · {unmappable} not mappable (port position unavailable, not a missing voyage)
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p>
      )}
    </div>
  );
}
