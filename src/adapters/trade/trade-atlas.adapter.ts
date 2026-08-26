/**
 * Trade Atlas — import/export flows and trade relationships. Status: PLANNED.
 *
 * The second trade intelligence provider, alongside Volza. Deliberately
 * not a replacement for it and not a fallback behind it: both are
 * registered under the `trade` kind, both may contribute evidence for
 * the same claim, and which one wins a given contradiction is decided
 * per-claim in the fusion layer by freshness and grade. They sit at
 * equal weight in `ATTRIBUTE_AUTHORITY` under `trade.flow`.
 *
 * That equality is a design decision, not an oversight. Encoding a
 * primary/backup relationship in the adapter or the authority table
 * would bake a commercial choice into the scoring layer, where it would
 * be invisible at the point an officer reads a number.
 *
 * PLANNED, so every method throws `PlannedSourceError` rather than
 * returning an empty result that a caller could not distinguish from
 * "Trade Atlas looked and found no shipments".
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

/**
 * A trade flow record, in Seaphore's vocabulary.
 *
 * Field names are ours, not any provider's. The whole reason adapters
 * exist is that a `TradeAtlasResponse` must never reach feature code —
 * see the module note in `adapters/types.ts`.
 */
export interface TradeFlowRecord {
  /** Shipper or exporter, as recorded. */
  shipper: string | null;
  /** Consignee or importer, as recorded. */
  consignee: string | null;
  /** HS commodity code, when the source carries one. */
  hsCode: string | null;
  /** Origin and destination as UN/LOCODE where resolvable. */
  originLocode: string | null;
  destinationLocode: string | null;
  /** ISO-8601 date of the movement. */
  movementDate: string;
}

export class TradeAtlasAdapter extends BaseAdapter {
  constructor() {
    super("trade_atlas");
  }

  /**
   * Trade records associated with an entity.
   *
   * Named `lookup` to match the vocabulary the matrix contract test
   * already probes for on trade adapters, rather than inventing a
   * method name that the registry's conformance checks would not find.
   */
  async lookup(_entity: string): Promise<SourcedResult<TradeFlowRecord[]>> {
    this.assertUsable(); // throws PlannedSourceError
    return this.envelope<TradeFlowRecord[]>(null, new Date().toISOString());
  }

  async healthCheck(): Promise<HealthReport> {
    return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
  }
}

export const tradeAtlas = new TradeAtlasAdapter();
