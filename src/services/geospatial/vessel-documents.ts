/**
 * What documentary record Seaphore can reach for a selected vessel.
 *
 * ## Why this is mostly a list of absences today, and says so precisely
 *
 * A manifest in Seaphore hangs off a voyage record, not off an IMO. The
 * voyage register is the authority for that link, and a vessel observed by
 * Datalastic has no register entry — Datalastic reports where a ship is and
 * what it declares, not what was filed about it. So for a live map vessel
 * there is usually no route from the marker to a manifest at all.
 *
 * That is worth stating carefully rather than leaving a section empty. "No
 * manifest" reads as a fact about the vessel — that nothing was filed,
 * which for a cargo ship arriving at Apapa would be a serious finding. What
 * is true is narrower and duller: Seaphore cannot connect this vessel to a
 * filing, because the link runs through a register it cannot read here.
 *
 * ## The rule
 *
 * A record is `AVAILABLE` only when something actually resolved it. Every
 * other state names what is missing — the source, the link, or the record —
 * and never implies the vessel is the reason.
 */
import type { Voyage } from "./voyage";

export type DocumentAvailability =
  /** A record resolved and can be opened. */
  | "AVAILABLE"
  /**
   * The source exists and holds nothing for this vessel.
   *
   * A statement about the vessel, and the only one of these that is.
   */
  | "NO_RECORD"
  /** No provider or store is connected for this kind of record at all. */
  | "NOT_CONNECTED"
  /**
   * A source exists, but nothing links this vessel to it.
   *
   * Distinct from `NO_RECORD`: filings may well exist and Seaphore cannot
   * tell which, if any, are this ship's.
   */
  | "NO_LINK"
  /** Resolved, but not yet checked against any external source. */
  | "NOT_VERIFIED";

export interface DocumentEntry {
  readonly kind: string;
  readonly availability: DocumentAvailability;
  /** Officer-facing sentence. Always set — a bare state explains nothing. */
  readonly note: string;
  /** Identifier of the resolved record, when there is one. */
  readonly recordId: string | null;
}

export interface VesselDocuments {
  readonly entries: ReadonlyArray<DocumentEntry>;
  /** True when at least one record can actually be opened. */
  readonly anyAvailable: boolean;
}

export interface VesselDocumentInput {
  /** The register voyage for this vessel, when one resolved. */
  readonly voyage?: Voyage | null;
  /**
   * Whether the voyage register could be read at all.
   *
   * Separates "this vessel has no filed voyage" from "Seaphore could not
   * ask" — the first is about the ship, the second about access, and an
   * officer needs to know which they are looking at.
   */
  readonly registerReadable?: boolean;
}

/**
 * Document availability for one vessel.
 *
 * Pure and synchronous: it reports what has already resolved rather than
 * fetching, so opening the drawer cannot become a burst of lookups for
 * records that mostly do not exist.
 */
export function vesselDocuments(input: VesselDocumentInput = {}): VesselDocuments {
  const { voyage = null, registerReadable = false } = input;

  const manifest: DocumentEntry = !registerReadable
    ? {
        kind: "Manifest",
        availability: "NOT_CONNECTED",
        note: "A manifest is filed against a voyage record, and Seaphore cannot read the voyage register here. This says nothing about whether a manifest was filed.",
        recordId: null,
      }
    : voyage
      ? {
          kind: "Manifest",
          availability: "NOT_VERIFIED",
          note: "A voyage record exists for this vessel. Any manifest filed against it has not been checked against an external source.",
          recordId: voyage.id,
        }
      : {
          kind: "Manifest",
          availability: "NO_LINK",
          note: "Seaphore holds no voyage record for this vessel, and a manifest is filed against a voyage. Filings may exist without Seaphore being able to attribute them here.",
          recordId: null,
        };

  /*
   * The remaining two have no connected source in this deployment at all,
   * which is a different sentence from having looked and found nothing.
   */
  const billOfLading: DocumentEntry = {
    kind: "Bill of lading",
    availability: "NOT_CONNECTED",
    note: "No bill-of-lading source is connected to this deployment.",
    recordId: null,
  };

  const tradeRecord: DocumentEntry = {
    kind: "Trade record",
    availability: "NOT_CONNECTED",
    note: "No trade-data provider is connected. TradeAtlas and Volza are registered but return no data.",
    recordId: null,
  };

  const entries = [manifest, billOfLading, tradeRecord];

  return {
    entries,
    anyAvailable: entries.some((entry) => entry.availability === "AVAILABLE"),
  };
}
