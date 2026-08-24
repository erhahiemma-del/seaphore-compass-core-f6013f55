/**
 * Port Call Lifecycle — NPA schedule fused with AIS.
 *
 *   EXPECTED ─▶ APPROACHING ─▶ ARRIVED ─▶ AWAITING BERTH ─▶ AT BERTH ─▶ DEPARTED
 *     NPA          AIS           AIS+NPA       NPA             NPA        NPA+AIS
 *
 * ## Neither source owns the stage
 *
 * NPA is authoritative for port operational state: it alone knows a
 * vessel is alongside berth 4. AIS is authoritative for position: it
 * alone knows the vessel is 18 nm out. Neither can determine the stage by
 * itself, and the interesting cases are precisely where they disagree —
 * a vessel NPA still lists as expected which AIS shows alongside, or one
 * NPA shows at berth which AIS shows at sea.
 *
 * So the engine derives the stage from both and records which sources
 * supported the transition. It never overwrites either source's claim.
 *
 * ## Conflicting ETAs are kept, all of them
 *
 * Per the brief, §18: NPA 16:30, SeaVantage 15:47, Datalastic 16:10 are
 * three observations, not a disagreement to resolve. `EtaObservation[]`
 * holds them all with their authority, and the intelligence layer decides
 * what to show. Collapsing them to one number here would discard the
 * evidence an officer needs to judge which to trust.
 */
import { haversineM } from "@/services/eo";

import { sourceAuthority } from "../authority";
import type {
  EtaObservation,
  PortCall,
  PortCallStage,
  PortCallTransition,
  PortSchedule,
} from "./models";

/** A position observation from an AIS provider. */
export interface AisPosition {
  readonly mmsi: string | null;
  readonly imo: string | null;
  readonly name: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKnots: number | null;
  readonly courseDeg: number | null;
  readonly reportedAt: string;
  readonly source: string;
  /** Provider ETA, when the provider offers one. */
  readonly eta?: string | null;
}

/** A port's position, for range calculations. */
export interface PortAnchor {
  readonly portId: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

const NM = 1852;

/**
 * Inside this range of the port, a vessel is *approaching* rather than
 * merely at sea. 50 nm is roughly a half-day's steaming for a laden
 * merchant vessel — far enough out to give an officer warning, close
 * enough that the vessel is committed to the approach.
 */
export const APPROACH_RANGE_M = 50 * NM;

/** Inside this range, the vessel has effectively arrived at the port area. */
export const ARRIVAL_RANGE_M = 5 * NM;

/** At or below this speed a vessel is not making passage. */
export const STATIONARY_SPEED_KN = 0.5;

/**
 * Match an AIS position to a schedule entry.
 *
 * IMO first, then MMSI. Name is used only when it is an exact,
 * case-insensitive match AND no identifier was available on either side —
 * per §17, never a fuzzy merge, because two vessels sharing a common name
 * merged into one call would put the wrong ship at the wrong berth.
 */
export function matchAisToSchedule(
  schedule: PortSchedule,
  positions: readonly AisPosition[],
): { position: AisPosition; method: string; confidence: number } | null {
  const { imo, mmsi, name } = schedule.vessel;

  if (imo) {
    const byImo = positions.find((p) => p.imo && p.imo === imo);
    if (byImo) return { position: byImo, method: "imo", confidence: 0.99 };
  }

  if (mmsi) {
    const byMmsi = positions.find((p) => p.mmsi && p.mmsi === mmsi);
    if (byMmsi) return { position: byMmsi, method: "mmsi", confidence: 0.95 };
  }

  const normalized = name.trim().toLowerCase();
  const byName = positions.filter(
    (p) => p.name && p.name.trim().toLowerCase() === normalized && !p.imo,
  );
  // Exactly one unidentified candidate, or it is not a match. Two vessels
  // of the same name is a reason to abstain, not to pick one.
  if (byName.length === 1 && !imo) {
    return { position: byName[0], method: "exact-name", confidence: 0.55 };
  }

  return null;
}

/**
 * Derive the lifecycle stage from the NPA row and any AIS position.
 *
 * NPA's operational stages are taken at face value — it is authoritative
 * for them. AIS only refines `EXPECTED`, which is the one stage that is a
 * prediction rather than an observation, and therefore the one AIS can
 * legitimately improve on.
 */
export function deriveStage(
  schedule: PortSchedule,
  position: AisPosition | null,
  port: PortAnchor | null,
): { stage: PortCallStage; rationale: string; sources: string[] } {
  const sources = [schedule.source];

  // NPA is authoritative for berth and departure state.
  if (schedule.stage === "AT_BERTH" || schedule.stage === "DEPARTED") {
    return {
      stage: schedule.stage,
      rationale: `NPA reports the vessel as ${schedule.stage.replace("_", " ").toLowerCase()}; NPA is authoritative for port operational state.`,
      sources,
    };
  }

  if (schedule.stage === "AWAITING_BERTH") {
    return {
      stage: "AWAITING_BERTH",
      rationale: "NPA lists the vessel as awaiting berth.",
      sources,
    };
  }

  // EXPECTED — a prediction. AIS can sharpen it.
  if (!position || !port) {
    return {
      stage: "EXPECTED",
      rationale: position
        ? "AIS position available but the port has no anchor coordinates, so range to port could not be computed."
        : "No AIS position matched this schedule entry, so the vessel's progress toward the port is unknown.",
      sources,
    };
  }

  sources.push(position.source);
  const distanceM = haversineM(
    { latitude: position.latitude, longitude: position.longitude },
    { latitude: port.latitude, longitude: port.longitude },
  );
  const nm = Math.round(distanceM / NM);

  if (distanceM <= ARRIVAL_RANGE_M) {
    const stationary = position.speedKnots !== null && position.speedKnots <= STATIONARY_SPEED_KN;
    return {
      stage: "ARRIVED",
      rationale: `AIS places the vessel ${nm} nm from ${port.name}${stationary ? ", stationary" : ""}. NPA still lists it as expected; the port has not yet recorded an arrival.`,
      sources,
    };
  }

  if (distanceM <= APPROACH_RANGE_M) {
    return {
      stage: "APPROACHING",
      rationale: `AIS places the vessel ${nm} nm from ${port.name}, inside the ${APPROACH_RANGE_M / NM} nm approach range.`,
      sources,
    };
  }

  return {
    stage: "EXPECTED",
    rationale: `NPA expects the vessel at ${schedule.terminalName ?? port.name}; AIS places it ${nm} nm out, beyond the approach range.`,
    sources,
  };
}

/** Collect every ETA offered, with the authority of the source offering it. */
export function collectEtas(
  schedule: PortSchedule,
  positions: readonly AisPosition[],
  now: number,
): readonly EtaObservation[] {
  const observations: EtaObservation[] = [];
  const observedAt = new Date(now).toISOString();

  if (schedule.eta) {
    observations.push({
      source: schedule.source,
      eta: schedule.eta,
      observedAt: schedule.retrievedAt,
      authority: sourceAuthority(schedule.source, "port-schedule"),
    });
  }

  for (const position of positions) {
    if (!position.eta) continue;
    observations.push({
      source: position.source,
      eta: position.eta,
      observedAt,
      authority: sourceAuthority(position.source, "port-schedule"),
    });
  }

  // Most authoritative first. Ordering is not resolution — every
  // observation is retained.
  return observations.sort((a, b) => b.authority - a.authority);
}

/**
 * Build a port call from one schedule entry and the AIS picture.
 *
 * One call per schedule entry, not per vessel: a vessel rotating between
 * two terminals has two calls, and merging them would lose the rotation
 * the brief asks to preserve.
 */
export function buildPortCall(
  schedule: PortSchedule,
  positions: readonly AisPosition[],
  port: PortAnchor | null,
  now: number = Date.now(),
): PortCall {
  const match = matchAisToSchedule(schedule, positions);
  const matchedPositions = match ? [match.position] : [];
  const derived = deriveStage(schedule, match?.position ?? null, port);

  const transition: PortCallTransition = {
    from: schedule.stage === derived.stage ? null : schedule.stage,
    to: derived.stage,
    at: new Date(now).toISOString(),
    rationale: derived.rationale,
    sources: derived.sources,
  };

  return {
    id: `call:${schedule.id}`,
    vessel: schedule.vessel,
    portId: schedule.portId ?? port?.portId ?? null,
    portName: schedule.portName ?? port?.name ?? null,
    terminalName: schedule.terminalName,
    stage: derived.stage,
    stageRationale: derived.rationale,
    history: [transition],
    scheduleObservations: [schedule],
    etaObservations: collectEtas(schedule, matchedPositions, now),
    firstSeenAt: schedule.retrievedAt,
    lastUpdatedAt: new Date(now).toISOString(),
  };
}

/**
 * Vessels NPA expected that have not appeared.
 *
 * One of the Copilot questions in the brief. "Not arrived" means NPA
 * still lists it as expected and its ETA has passed — a schedule that has
 * gone stale, which is operationally interesting whether the vessel is
 * late or the schedule is wrong.
 */
export function expectedNotArrived(
  calls: readonly PortCall[],
  now: number = Date.now(),
): readonly PortCall[] {
  return calls.filter((call) => {
    if (call.stage !== "EXPECTED" && call.stage !== "APPROACHING") return false;
    const eta = call.etaObservations[0]?.eta;
    return Boolean(eta) && Date.parse(eta!) < now;
  });
}

/**
 * Vessels that arrived without appearing on the expected schedule.
 *
 * The complement, and the more interesting direction: an arrival with no
 * prior schedule entry. Note this is only meaningful when the schedule
 * was actually retrieved — with no NPA access, every AIS arrival would
 * appear unscheduled, which is why the caller must pass a non-empty
 * schedule set for the answer to mean anything.
 */
export function arrivedUnscheduled(
  positions: readonly AisPosition[],
  schedules: readonly PortSchedule[],
  port: PortAnchor,
): readonly AisPosition[] {
  if (schedules.length === 0) return [];

  return positions.filter((position) => {
    const distanceM = haversineM(
      { latitude: position.latitude, longitude: position.longitude },
      { latitude: port.latitude, longitude: port.longitude },
    );
    if (distanceM > ARRIVAL_RANGE_M) return false;
    return !schedules.some((schedule) => {
      const match = matchAisToSchedule(schedule, [position]);
      return match !== null;
    });
  });
}
