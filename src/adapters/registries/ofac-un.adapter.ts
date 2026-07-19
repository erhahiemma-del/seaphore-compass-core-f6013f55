/**
 * OFAC SDN + UN Consolidated — sanctions screening. Status: ACTIVE.
 * Wraps the existing OpenSanctions mock adapter but declares itself against
 * the matrix entry `sanctions` so status chips, citations and audit logs
 * come from a single source of truth.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";
import { openSanctions } from "../osint/opensanctions.adapter";

export interface ScreeningHit {
  matchedName: string;
  listName: string;
  program?: string;
  score: number;
  reference?: string;
}

export class OfacUnAdapter extends BaseAdapter {
  constructor() {
    super("sanctions");
  }
  async screen(name: string): Promise<SourcedResult<ScreeningHit[]>> {
    this.assertUsable();
    const t0 = performance.now();
    const hits = await openSanctions.screen(name);
    return this.envelope<ScreeningHit[]>(
      hits.map((h) => ({
        matchedName: h.matchedName,
        listName: h.listName,
        program: h.program,
        score: h.score,
        reference: h.reference,
      })),
      new Date().toISOString(),
      { degradedReason: `screening completed in ${Math.round(performance.now() - t0)}ms` },
    );
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const ofacUn = new OfacUnAdapter();
