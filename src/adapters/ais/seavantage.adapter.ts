/**
 * SeaVantage — vessel tracking and historical AIS. Status: PLANNED.
 *
 * Registered so the provider exists in the architecture; not connected,
 * because no credentials or official API documentation have arrived. The
 * AIS provider registry (`services/eo/ais-providers.ts`) already carries
 * SeaVantage as `PENDING_CREDENTIALS` with its capability matrix and
 * blockers — this adapter is the matrix-side counterpart, so the two
 * registries agree rather than one knowing about a provider the other
 * has never heard of.
 *
 * Every fetch method throws `PlannedSourceError`. That is the whole
 * point: a PLANNED source must be impossible to mistake for a connected
 * one, and returning an empty array or a null position would be exactly
 * that mistake — indistinguishable, at the call site, from "SeaVantage
 * looked and there is no vessel there".
 *
 * No credentials, no endpoints, no request shapes and no response types
 * are declared here. Guessing an undocumented API's schema would put
 * invented structure into the codebase that a future integration would
 * have to unpick.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

/** A position fix, in Seaphore's vocabulary rather than any provider's. */
export interface SeaVantageFix {
  mmsi: string;
  imo?: string;
  lat: number;
  lng: number;
  sog?: number;
  cog?: number;
  timestamp: string;
}

export class SeaVantageAdapter extends BaseAdapter {
  constructor() {
    super("seavantage");
  }

  async getLatestPosition(_mmsi: string): Promise<SourcedResult<SeaVantageFix>> {
    this.assertUsable(); // throws PlannedSourceError
    return this.envelope<SeaVantageFix>(null, new Date().toISOString());
  }

  /**
   * Historical track.
   *
   * Declared because historical movement is the capability SeaVantage is
   * being considered *for* — the AIS registry lists it under
   * `historicalPosition`. It throws like everything else until the
   * provider is contracted.
   */
  async getTrack(_mmsi: string, _sinceIso: string): Promise<SourcedResult<SeaVantageFix[]>> {
    this.assertUsable();
    return this.envelope<SeaVantageFix[]>(null, new Date().toISOString());
  }

  async healthCheck(): Promise<HealthReport> {
    // Not "DOWN": nothing is broken. There is simply nothing to check
    // until credentials exist, and reporting a failure would put a red
    // light against a provider that has never been switched on.
    return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
  }
}

export const seavantage = new SeaVantageAdapter();
