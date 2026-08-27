/**
 * Demonstration traffic, generated here and never mistaken for reports.
 *
 * Every vessel-facing capability Seaphore has built — selection, the
 * drawer, filters, trails, replay — is unreachable without vessels, and
 * no AIS provider is connected. So the choice is between a map that
 * cannot demonstrate any of it and traffic Seaphore makes up. This is the
 * second, built so the first thing anyone can learn about it is that it
 * is made up.
 *
 * ## Why this is dangerous, and what makes it safe
 *
 * Synthetic traffic that moves coherently along real shipping lanes is
 * indistinguishable from the real thing by eye. That is the point of it
 * and also the whole risk: an officer who mistakes this for the live
 * picture would be making operational judgements about ships that do not
 * exist.
 *
 * Three things stop that, and none of them is a comment.
 *
 * 1. The source declares itself `SIMULATED`, a first-class source type.
 *    `mayClaimLive` returns false for it, so no status vocabulary can
 *    render it as live — a contract test enforces that officer-facing
 *    status text and this source never coexist with "live".
 * 2. Identifiers cannot collide with real ones. A real IMO is seven
 *    digits and a real MMSI is nine; every identity here is prefixed
 *    `SIM-`, so a synthetic vessel can never be looked up as, confused
 *    with, or cited as a real ship.
 * 3. The names are invented and marked. No hull afloat is called this.
 *
 * ## Determinism, and why motion carries no randomness
 *
 * The fleet is built from a seed, so the same seed gives the same ships
 * in the same places on every reload and in every test. Motion contains
 * no randomness at all: a position is a pure function of a route and a
 * time. That is what lets a test assert that a vessel did not teleport,
 * and it is why replaying a period reproduces exactly what was drawn.
 *
 * ## Provenance is used properly, not stamped OBSERVED
 *
 * A real provider reports at intervals and says nothing in between. This
 * imitates that rather than pretending to a continuous truth no AIS feed
 * has: positions on the reporting tick are `OBSERVED`, and positions
 * between two ticks are `DISPLAY_INTERPOLATED`. Marking everything
 * `OBSERVED` would have made the provenance model decorative on the only
 * source that exercises it.
 */
import type { PositionKind } from "../position-provenance";
import type { LonLat, VesselType } from "../types";
import type { Vessel, VesselPosition } from "../vessel";
import type { VesselHistory, VesselHistoryQuery, VesselTrackPoint } from "../vessel-history";
import {
  registerVesselSource,
  type DescribableVesselSource,
  type SourceHealthReport,
  type VesselQuery,
  type VesselSourceDescriptor,
} from "../vessel-source";

/**
 * How often the simulated provider "reports".
 *
 * Real feeds are periodic. Between two reports nobody knows where the
 * ship is, and the interface draws an interpolation clearly labelled as
 * one. Sixty seconds is brisk enough to see movement in a demonstration
 * and slow enough that the interpolated segments are real segments.
 */
const REPORT_INTERVAL_MS = 60_000;

/** Nautical miles per degree of latitude. Close enough for demonstration. */
const NM_PER_DEGREE = 60;

/**
 * A small, fast, seedable generator.
 *
 * Used only to build the fleet — to choose which class of ship runs which
 * route, and its speed. Never called while the simulation is running,
 * because a position that depends on when you asked cannot be replayed
 * or tested.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An ordered path a simulated vessel runs, and what to call it. */
interface SimRoute {
  readonly id: string;
  readonly label: string;
  /** Where the route ends, for the destination field. */
  readonly destination: string;
  readonly waypoints: readonly LonLat[];
}

/*
 * Routes drawn along the approaches Seaphore actually watches.
 *
 * Deliberately coarse. These are plausible tracks for a demonstration,
 * not surveyed shipping lanes, and treating them as navigational
 * information would be a category error — which is another reason the
 * source that serves them is typed `SIMULATED`.
 */
const ROUTES: readonly SimRoute[] = [
  {
    id: "lagos-approach",
    label: "Lagos approach",
    destination: "NGAPP",
    waypoints: [
      [3.05, 6.15],
      [3.2, 6.28],
      [3.34, 6.38],
      [3.4, 6.43],
    ],
  },
  {
    id: "tincan-approach",
    label: "Tin Can approach",
    destination: "NGTIN",
    waypoints: [
      [2.95, 6.05],
      [3.15, 6.22],
      [3.3, 6.35],
      [3.342, 6.428],
    ],
  },
  {
    id: "lekki-approach",
    label: "Lekki approach",
    destination: "NGLKK",
    waypoints: [
      [4.3, 6.1],
      [4.15, 6.25],
      [4.05, 6.35],
      [4.017, 6.417],
    ],
  },
  {
    id: "onne-approach",
    label: "Onne approach",
    destination: "NGONN",
    waypoints: [
      [7.4, 4.2],
      [7.3, 4.4],
      [7.2, 4.6],
      [7.15, 4.717],
    ],
  },
  {
    id: "calabar-approach",
    label: "Calabar approach",
    destination: "NGCBQ",
    waypoints: [
      [8.5, 4.4],
      [8.42, 4.6],
      [8.35, 4.8],
      [8.316, 4.952],
    ],
  },
  {
    id: "warri-approach",
    label: "Warri approach",
    destination: "NGWAR",
    waypoints: [
      [5.4, 5.1],
      [5.55, 5.28],
      [5.68, 5.42],
      [5.75, 5.517],
    ],
  },
  {
    id: "gog-transit-east",
    label: "Gulf of Guinea transit",
    destination: "NGONN",
    waypoints: [
      [1.5, 4.0],
      [3.5, 3.6],
      [5.5, 3.4],
      [7.0, 3.8],
    ],
  },
  {
    id: "gog-transit-west",
    label: "Gulf of Guinea transit",
    destination: "NGAPP",
    waypoints: [
      [7.5, 3.2],
      [5.5, 2.9],
      [3.5, 3.1],
      [1.8, 3.6],
    ],
  },
];

/** Classes the existing taxonomy can actually draw. */
const CLASSES: readonly VesselType[] = ["CONTAINER", "TANKER", "BULK", "VEHICLE", "OTHER"];

/*
 * Invented names, and invented on purpose.
 *
 * Each is a word pair no operator uses, so a search for any of these
 * finds nothing afloat. Prefixed `SIM` on the identity as well, so the
 * name alone is never the only thing marking a vessel as synthetic.
 */
const NAME_PARTS_A = [
  "Harmattan",
  "Bight",
  "Sapele",
  "Escravos",
  "Bonny",
  "Forcados",
  "Qua",
  "Brass",
  "Andoni",
  "Opobo",
];
const NAME_PARTS_B = [
  "Voyager",
  "Endeavour",
  "Meridian",
  "Sentinel",
  "Horizon",
  "Mariner",
  "Pioneer",
  "Guardian",
];

interface SimVessel {
  readonly index: number;
  readonly imo: string;
  readonly name: string;
  readonly type: VesselType;
  readonly route: SimRoute;
  /** Knots. Constant per vessel, which keeps motion reproducible. */
  readonly speed: number;
  /** Seconds into the route at simulation time zero. */
  readonly offsetSeconds: number;
}

/** Great-circle-ish distance in nautical miles. Flat enough at this scale. */
function distanceNm(a: LonLat, b: LonLat): number {
  const dLat = b[1] - a[1];
  // Longitude degrees shrink with latitude; near the equator this is ~1.
  const dLon = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon) * NM_PER_DEGREE;
}

/** Bearing from a to b, degrees true. */
function bearing(a: LonLat, b: LonLat): number {
  const dLon = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dLat = b[1] - a[1];
  const deg = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

interface RouteFix {
  readonly position: LonLat;
  readonly heading: number;
}

/**
 * Where a vessel is after running its route for `seconds`.
 *
 * Pure, and deliberately so: no clock read, no randomness, no state. The
 * same arguments always give the same answer, which is what makes
 * "did it teleport" and "does replay reproduce the picture" testable
 * questions rather than observations about a running system.
 *
 * The route reverses at each end rather than looping, so a vessel never
 * jumps from the last waypoint back to the first — a teleport is exactly
 * the artefact this must not produce.
 */
export function fixOnRoute(route: SimRoute, speedKnots: number, seconds: number): RouteFix {
  const legs = route.waypoints.slice(0, -1).map((from, i) => {
    const to = route.waypoints[i + 1]!;
    return { from, to, nm: distanceNm(from, to) };
  });
  const totalNm = legs.reduce((sum, leg) => sum + leg.nm, 0);
  if (totalNm === 0) {
    return { position: route.waypoints[0]!, heading: 0 };
  }

  const travelled = (speedKnots * Math.max(0, seconds)) / 3600;

  /*
   * Fold the distance into a there-and-back cycle.
   *
   * Twice the route length is one round trip. Past the halfway mark the
   * vessel is on the return leg, which is expressed by measuring from
   * the far end rather than by reversing the leg list.
   */
  const cycle = totalNm * 2;
  const withinCycle = travelled % cycle;
  const outbound = withinCycle <= totalNm;
  let remaining = outbound ? withinCycle : cycle - withinCycle;

  for (const leg of legs) {
    if (remaining <= leg.nm || leg === legs[legs.length - 1]) {
      const fraction = leg.nm === 0 ? 0 : Math.min(1, remaining / leg.nm);
      const position: LonLat = [
        leg.from[0] + (leg.to[0] - leg.from[0]) * fraction,
        leg.from[1] + (leg.to[1] - leg.from[1]) * fraction,
      ];
      const course = bearing(leg.from, leg.to);
      return { position, heading: outbound ? course : (course + 180) % 360 };
    }
    remaining -= leg.nm;
  }

  const last = route.waypoints[route.waypoints.length - 1]!;
  return { position: last, heading: 0 };
}

/**
 * Whether a moment is a reporting tick or the gap between two.
 *
 * The whole provenance distinction, in one function. A real feed reports
 * periodically and is silent in between; drawing the silence as though
 * it were reported is the claim this exists to avoid making.
 */
export function kindForMoment(elapsedMs: number): PositionKind {
  return elapsedMs % REPORT_INTERVAL_MS === 0 ? "OBSERVED" : "DISPLAY_INTERPOLATED";
}

export interface SimulatedVesselSourceOptions {
  /** Same seed, same fleet — on every reload and in every test. */
  readonly seed?: number;
  readonly fleetSize?: number;
  /**
   * Simulation time zero. Defaults to construction time.
   *
   * Injectable so a test can ask where the fleet is at a stated moment
   * rather than racing a wall clock.
   */
  readonly epoch?: number;
  /** Clock, injectable for the same reason. */
  readonly now?: () => number;
  /**
   * How often a display position is pushed.
   *
   * Distinct from {@link REPORT_INTERVAL_MS}, which is how often the
   * simulation *reports*. Short enough that a vessel glides rather than
   * jumping a minute of travel at a time.
   */
  readonly pushIntervalMs?: number;
  /**
   * Simulation seconds per real second. Default 1.
   *
   * A ship makes 6–18 knots, which at a port-scale zoom is roughly three
   * pixels of screen travel in thirty seconds — real movement that is
   * impossible to watch and impossible to verify by looking. Rather than
   * inflate the vessels' stated speeds, which would make the readout
   * lie, the clock runs faster and the speeds stay honest.
   *
   * It multiplies inside `secondsFor` alone, so an accelerated track is
   * still deterministic and still reproducible for the same scale.
   */
  readonly timeScale?: number;
}

/** Default display cadence. Smooth to watch, cheap to compute. */
const DEFAULT_PUSH_INTERVAL_MS = 3_000;

export class SimulatedVesselSource implements DescribableVesselSource {
  readonly id = "simulated";
  private readonly fleet: readonly SimVessel[];
  private readonly epoch: number;
  private readonly now: () => number;
  private readonly pushIntervalMs: number;
  private readonly timeScale: number;
  private readonly listeners = new Set<(vessel: Vessel) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Queries served, so the health report counts rather than guesses. */
  private requests = 0;
  private lastCheckedAt: string | null = null;

  private readonly descriptor: VesselSourceDescriptor = {
    id: "simulated",
    label: "Simulation",
    type: "SIMULATED",
    description: "Demonstration vessel traffic generated by Seaphore.",
    /*
     * The caveat is rendered wherever the provider is, so the limitation
     * cannot be lost between here and the screen.
     */
    caveat:
      "These vessels do not exist. Positions, names and identifiers are generated for demonstration and must never be treated as observations.",
    /*
     * Off unless asked for. An empty map is the truthful default when no
     * provider is connected, and a demonstration that switches itself on
     * is a demonstration someone will eventually mistake for the picture.
     */
    defaultEnabled: false,
  };

  constructor(options: SimulatedVesselSourceOptions = {}) {
    const seed = options.seed ?? 20260827;
    const size = options.fleetSize ?? 32;
    this.now = options.now ?? (() => Date.now());
    this.epoch = options.epoch ?? this.now();
    this.pushIntervalMs = options.pushIntervalMs ?? DEFAULT_PUSH_INTERVAL_MS;
    /*
     * Never below real time. A stopped or reversed clock demonstrates
     * nothing and would make the archive `history` returns nonsensical.
     */
    this.timeScale = Math.max(1, options.timeScale ?? 1);

    const random = mulberry32(seed);
    const fleet: SimVessel[] = [];
    for (let index = 0; index < size; index++) {
      const route = ROUTES[Math.floor(random() * ROUTES.length)]!;
      const type = CLASSES[Math.floor(random() * CLASSES.length)]!;
      const nameA = NAME_PARTS_A[Math.floor(random() * NAME_PARTS_A.length)]!;
      const nameB = NAME_PARTS_B[Math.floor(random() * NAME_PARTS_B.length)]!;
      fleet.push({
        index,
        // `SIM-` prefixed: a real IMO is seven digits, so this can never
        // be looked up as, or confused with, a real vessel.
        imo: `SIM-${String(index + 1).padStart(4, "0")}`,
        name: `${nameA} ${nameB}`,
        type,
        route,
        // 6–18 knots: plausible for the mix, and fast enough to see.
        speed: 6 + Math.floor(random() * 12),
        // Spread along the route so they do not sail in formation.
        offsetSeconds: Math.floor(random() * 20000),
      });
    }
    this.fleet = fleet;
  }

  /**
   * Simulation seconds elapsed for a vessel at a given wall-clock moment.
   *
   * `timeScale` multiplies here and nowhere else, which is what keeps
   * accelerated time deterministic: a position is still a pure function
   * of the route and the elapsed simulation time, and the same scale
   * always produces the same track.
   */
  private secondsFor(vessel: SimVessel, at: number): number {
    return vessel.offsetSeconds + ((at - this.epoch) / 1000) * this.timeScale;
  }

  private vesselAt(sim: SimVessel, at: number, forcedKind?: PositionKind): Vessel {
    const fix = fixOnRoute(sim.route, sim.speed, this.secondsFor(sim, at));
    const elapsed = at - this.epoch;
    const kind = forcedKind ?? kindForMoment(elapsed);

    const position: VesselPosition = {
      lon: fix.position[0],
      lat: fix.position[1],
      heading: fix.heading,
      // A route has a direction, so the course here is genuinely known —
      // which keeps the heading-honesty invariant meaningful rather than
      // trivially satisfied.
      headingReported: true,
      speed: sim.speed,
      timestamp: new Date(at).toISOString(),
      destination: sim.route.destination,
      kind,
    };

    return {
      identity: {
        imo: sim.imo,
        name: sim.name,
        type: sim.type,
        flag: "NG",
      },
      position,
      // Nothing here assesses risk. A simulation inventing risk bands
      // would be fabricating intelligence, which is a different and
      // worse thing than fabricating traffic.
      riskLevel: "UNKNOWN",
      attentionScore: 0,
      provenance: {
        source: this.id,
        provider: "Seaphore simulation",
        retrievedAt: new Date(at).toISOString(),
        observedAt: new Date(at).toISOString(),
      },
    };
  }

  describe(): VesselSourceDescriptor {
    return this.descriptor;
  }

  /**
   * Health, reported honestly for something that cannot be unhealthy.
   *
   * A generator has no upstream to fail, so most of the diagnostic
   * surface is `null` rather than a flattering zero. `confidence` is null
   * for the same reason: a made-up position has no confidence to state,
   * and putting a number there would be the simulation's first lie.
   */
  report(): SourceHealthReport {
    return {
      sourceId: this.id,
      status: "ok",
      connected: true,
      message: "Demonstration traffic. These vessels do not exist.",
      lastCheckedAt: this.lastCheckedAt,
      lastLatencyMs: 0,
      recordCount: this.fleet.length,
      confidence: null,
      confidenceLevel: null,
      freshnessMs: 0,
      requestCount: this.requests,
      failureCount: 0,
      successRate: this.requests === 0 ? null : 1,
      averageLatencyMs: this.requests === 0 ? null : 0,
      cacheState: "unknown",
      lastSuccessfulSync: this.lastCheckedAt,
      warnedCount: 0,
      rejectedCount: 0,
    };
  }

  list(query?: VesselQuery): Promise<readonly Vessel[]> {
    const at = this.now();
    this.requests += 1;
    this.lastCheckedAt = new Date(at).toISOString();
    let result = this.fleet.map((sim) => this.vesselAt(sim, at));

    if (query?.bbox) {
      const [west, south, east, north] = query.bbox;
      result = result.filter(
        (vessel) =>
          vessel.position.lon >= west &&
          vessel.position.lon <= east &&
          vessel.position.lat >= south &&
          vessel.position.lat <= north,
      );
    }
    if (query?.destination) {
      result = result.filter((vessel) => vessel.position.destination === query.destination);
    }
    if (typeof query?.limit === "number") result = result.slice(0, query.limit);
    return Promise.resolve(result);
  }

  /**
   * Push a display position often; report an observation rarely.
   *
   * These were one cadence, and both were 60 s. The vessel therefore
   * jumped a full minute of travel at a time — impossible to watch, and
   * visually a teleport, which is the one artefact this source is
   * supposed to prove it does not produce.
   *
   * They are two different things and now run at two rates. A *report*
   * is the simulation's imitation of a feed saying "the vessel was here
   * at this time", and stays on {@link REPORT_INTERVAL_MS} because that
   * is what makes the archive plausible and what `history` returns. A
   * *display position* is the interface keeping the glyph continuous
   * between two reports, several times a second's worth, and is marked
   * `DISPLAY_INTERPOLATED` exactly because nobody observed it.
   *
   * This is what the provenance model was built for. Before the split
   * every push was a report, which made the interpolated kind almost
   * unreachable on the only source that exercises it.
   */
  subscribe(onVessel: (vessel: Vessel) => void): () => void {
    this.listeners.add(onVessel);
    if (!this.timer) {
      /*
       * The reporting bucket each vessel was last seen in.
       *
       * When a push crosses into a new bucket, that push carries the
       * report; every push in between carries an interpolation. Tracking
       * the bucket rather than testing the timestamp is what makes this
       * correct at arbitrary push times — an exact modulo hit would
       * essentially never occur, so every position would have been
       * classified as interpolated and the source would never have
       * reported anything at all.
       */
      let lastBucket = -1;
      this.timer = setInterval(() => {
        const at = this.now();
        const bucket = Math.floor((at - this.epoch) / REPORT_INTERVAL_MS);
        const reporting = bucket !== lastBucket;
        if (reporting) lastBucket = bucket;
        for (const sim of this.fleet) {
          const vessel = this.vesselAt(sim, at, reporting ? "OBSERVED" : "DISPLAY_INTERPOLATED");
          for (const listener of [...this.listeners]) listener(vessel);
        }
      }, this.pushIntervalMs);
    }
    return () => {
      this.listeners.delete(onVessel);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /**
   * The reporting ticks over a window — the simulation's own archive.
   *
   * Only ticks, never the interpolated moments between them. A history
   * that returned every instant would be claiming a continuous record no
   * feed produces, and it is precisely the archive an officer would cite.
   */
  history(imo: string, query?: VesselHistoryQuery): Promise<VesselHistory> {
    const sim = this.fleet.find((vessel) => vessel.imo === imo);
    if (!sim) {
      return Promise.resolve({
        status: "unavailable",
        reason: "No movement history is held for this vessel.",
      });
    }

    const to = query?.to ? Date.parse(query.to) : this.now();
    const from = query?.from ? Date.parse(query.from) : to - 6 * 60 * 60 * 1000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return Promise.resolve({
        status: "unavailable",
        reason: "That period could not be read.",
      });
    }

    // Walk whole reporting ticks so every point is one the provider
    // would actually have reported.
    const first = Math.ceil(from / REPORT_INTERVAL_MS) * REPORT_INTERVAL_MS;
    const track: VesselTrackPoint[] = [];
    for (let at = first; at <= to; at += REPORT_INTERVAL_MS) {
      const fix = fixOnRoute(sim.route, sim.speed, this.secondsFor(sim, at));
      track.push({
        position: fix.position,
        timestamp: new Date(at).toISOString(),
        heading: fix.heading,
        speed: sim.speed,
        kind: "OBSERVED",
      });
      if (query?.limit && track.length >= query.limit) break;
    }

    return Promise.resolve({
      status: "available",
      track,
      // No events. Deriving loitering or an AIS gap from a track this
      // source generated would be inventing intelligence about a vessel
      // that was itself invented.
      events: [],
      from: new Date(first).toISOString(),
      to: new Date(to).toISOString(),
    });
  }
}

/**
 * Register the simulation.
 *
 * Idempotent, like the live provider's registration: `registerVesselSource`
 * replaces by id.
 */
export function registerSimulatedVesselSource(
  options: SimulatedVesselSourceOptions = {},
): () => void {
  return registerVesselSource(new SimulatedVesselSource(options));
}
