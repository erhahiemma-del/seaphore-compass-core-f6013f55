/**
 * Where Seaphore looks for vessels, and how much it may spend looking.
 *
 * Datalastic's area endpoint answers a circle of at most 50km and bills
 * per vessel returned. Those two facts together decide the shape of this
 * file: coverage is a list of small circles rather than one large one,
 * and the list is ordered by how much each circle is worth.
 *
 * ## Why zones rather than a bounding box
 *
 * The Nigerian EEZ is roughly a 493km circle. Asking for it in one
 * request is not merely expensive — the provider refuses it outright,
 * which is how the map came to show an empty sea while the credential,
 * the account and the data were all fine. Nigeria is covered instead by
 * the places vessels actually are: the port approaches, the oil
 * terminals, and the water between them.
 *
 * ## Why the cap is asserted rather than trusted
 *
 * The server already clamps to 50km, so a zone declaring 200 would be
 * silently reduced and quietly cover a quarter of what its name claims.
 * A zone that lies about its own extent is worse than one that fails, so
 * an over-radius zone is rejected at construction.
 *
 * ## Priority is a budget instrument
 *
 * Every zone costs credits on every refresh. When the budget runs short
 * the low-priority zones stop first and say so, rather than the whole
 * picture degrading evenly into something an officer cannot characterise.
 */

/** The provider's hard ceiling. Not a preference. */
export const MAX_ZONE_RADIUS_KM = 50;

export interface CoverageZone {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** Kilometres. Must not exceed {@link MAX_ZONE_RADIUS_KM}. */
  readonly radiusKm: number;
  /**
   * 1 is highest. Decides who keeps running when the budget tightens.
   *
   * Ports outrank open water because that is where an officer's
   * decisions are made, not because there are more vessels there.
   */
  readonly priority: number;
  readonly enabled: boolean;
  /**
   * Shortest gap between refreshes of this zone, milliseconds.
   *
   * A busy terminal changes minute to minute; an offshore corridor does
   * not. Refreshing both at the terminal's cadence spends most of the
   * budget re-reading water nobody is waiting on.
   */
  readonly refreshIntervalMs: number;
  /**
   * Maximum requests this zone may spend per budget window.
   *
   * Named per zone rather than globally so one busy area cannot consume
   * the allowance the rest of the coast depends on.
   */
  readonly creditBudget: number;
}

const MINUTE = 60_000;

/**
 * Nigeria, as the places that generate operational decisions.
 *
 * Centres are the approaches and terminals themselves; radii are sized
 * to the traffic each holds rather than set uniformly, so an anchorage
 * does not cost the same as a river mouth. Every one is at or under the
 * provider ceiling.
 */
export const NIGERIA_COVERAGE_ZONES: readonly CoverageZone[] = [
  {
    id: "lagos-apapa",
    name: "Lagos — Apapa",
    lat: 6.44,
    lon: 3.36,
    radiusKm: 50,
    priority: 1,
    enabled: true,
    refreshIntervalMs: 3 * MINUTE,
    creditBudget: 40,
  },
  {
    id: "lagos-tincan",
    name: "Lagos — Tin Can",
    lat: 6.43,
    lon: 3.32,
    radiusKm: 30,
    priority: 2,
    enabled: true,
    refreshIntervalMs: 3 * MINUTE,
    creditBudget: 30,
  },
  {
    id: "lekki",
    name: "Lekki Deep Sea",
    lat: 6.42,
    lon: 4.02,
    radiusKm: 40,
    priority: 3,
    enabled: true,
    refreshIntervalMs: 5 * MINUTE,
    creditBudget: 24,
  },
  {
    id: "lagos-offshore",
    name: "Lagos approaches",
    lat: 6.1,
    lon: 3.3,
    radiusKm: 50,
    priority: 4,
    enabled: true,
    refreshIntervalMs: 10 * MINUTE,
    creditBudget: 16,
  },
  {
    id: "warri",
    name: "Warri",
    lat: 5.52,
    lon: 5.75,
    radiusKm: 45,
    priority: 4,
    enabled: true,
    refreshIntervalMs: 5 * MINUTE,
    creditBudget: 24,
  },
  {
    id: "escravos",
    name: "Escravos",
    lat: 5.6,
    lon: 5.2,
    radiusKm: 40,
    priority: 4,
    enabled: true,
    refreshIntervalMs: 5 * MINUTE,
    creditBudget: 20,
  },
  {
    id: "forcados",
    name: "Forcados",
    lat: 5.35,
    lon: 5.35,
    radiusKm: 40,
    priority: 5,
    enabled: true,
    refreshIntervalMs: 10 * MINUTE,
    creditBudget: 16,
  },
  {
    id: "bonny",
    name: "Bonny",
    lat: 4.42,
    lon: 7.16,
    radiusKm: 45,
    priority: 5,
    enabled: true,
    refreshIntervalMs: 5 * MINUTE,
    creditBudget: 24,
  },
  {
    id: "onne",
    name: "Onne",
    lat: 4.72,
    lon: 7.15,
    radiusKm: 30,
    priority: 5,
    enabled: true,
    refreshIntervalMs: 5 * MINUTE,
    creditBudget: 20,
  },
  {
    id: "port-harcourt",
    name: "Port Harcourt",
    lat: 4.78,
    lon: 7.0,
    radiusKm: 30,
    priority: 6,
    enabled: true,
    refreshIntervalMs: 10 * MINUTE,
    creditBudget: 16,
  },
  {
    id: "calabar",
    name: "Calabar",
    lat: 4.75,
    lon: 8.32,
    radiusKm: 50,
    priority: 6,
    enabled: true,
    refreshIntervalMs: 10 * MINUTE,
    creditBudget: 16,
  },
  {
    id: "nigeria-offshore",
    name: "Nigeria offshore approaches",
    lat: 4.3,
    lon: 5.6,
    radiusKm: 50,
    priority: 7,
    enabled: true,
    refreshIntervalMs: 15 * MINUTE,
    creditBudget: 12,
  },
];

export class ZoneRadiusError extends Error {
  constructor(zoneId: string, radiusKm: number) {
    super(
      `Coverage zone "${zoneId}" declares ${radiusKm}km; Datalastic accepts at most ${MAX_ZONE_RADIUS_KM}km.`,
    );
    this.name = "ZoneRadiusError";
  }
}

/**
 * Reject a zone the provider would refuse, or silently shrink.
 *
 * Throwing is deliberate. The server clamps, so an over-radius zone
 * would still return vessels — just from a quarter of the area its name
 * promises, with nothing anywhere saying so. A zone that misrepresents
 * its own coverage is the kind of quiet wrongness this codebase exists
 * to avoid, and it is cheaper to fail at startup than to explain later.
 */
export function assertZoneRadius(zone: CoverageZone): void {
  if (!(zone.radiusKm > 0) || zone.radiusKm > MAX_ZONE_RADIUS_KM) {
    throw new ZoneRadiusError(zone.id, zone.radiusKm);
  }
}

/** Enabled zones, most important first. Ties keep declaration order. */
export function activeZones(
  zones: readonly CoverageZone[] = NIGERIA_COVERAGE_ZONES,
): readonly CoverageZone[] {
  const enabled = zones.filter((zone) => zone.enabled);
  for (const zone of enabled) assertZoneRadius(zone);
  return [...enabled].sort((a, b) => a.priority - b.priority);
}

/**
 * The zones affordable within a request budget, in priority order.
 *
 * Truncates rather than scaling everything down: half the coast covered
 * properly is an answerable picture, whereas every zone refreshed at a
 * fraction of its cadence is a picture nobody can date.
 */
export function zonesWithinBudget(
  zones: readonly CoverageZone[],
  requestBudget: number,
): readonly CoverageZone[] {
  const affordable: CoverageZone[] = [];
  let spent = 0;
  for (const zone of zones) {
    if (spent + 1 > requestBudget) break;
    affordable.push(zone);
    spent += 1;
  }
  return affordable;
}
