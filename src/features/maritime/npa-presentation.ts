/**
 * What the port authority says about a vessel, as drawer rows.
 *
 * Kept separate from `vessel-presentation` because the two describe
 * different things and must never blend. That file presents an
 * observation — where a source saw a hull, how fast, on what course. This
 * presents an administrative record: what NPA expects, has berthed, or
 * has released. An officer reading the drawer has to be able to tell
 * which of the two they are looking at, and the surest way to guarantee
 * that is for the sentences to be written in different places by
 * different rules.
 *
 * ## Nothing here is a manifest
 *
 * NPA's cargo column is what the port authority was told. A manifest is a
 * declaration with legal weight. Every cargo row below says "NPA cargo
 * evidence" and none says "manifest", because the workbook cannot
 * establish the second thing however plausible the first looks.
 */
import type { UnifiedVessel } from "@/services/government/npa/unified-fleet";
import type { NpaPortCall } from "@/services/government/npa/workbook-ingest";

import type { Datum } from "./vessel-presentation";

const available = (label: string, value: string, extra: Partial<Datum> = {}): Datum => ({
  label,
  value,
  availability: "AVAILABLE",
  ...extra,
});

const missing = (label: string, reason: string): Datum => ({
  label,
  availability: "UNAVAILABLE",
  reason,
});

/** The four states NPA publishes, in officer-facing words. */
export const NPA_STATUS_LABELS: Readonly<Record<string, string>> = {
  AT_BERTH: "At berth",
  AWAITING_BERTH: "Awaiting berth",
  EXPECTED: "Expected",
  DEPARTED: "Departed",
  UNKNOWN: "Not stated",
};

/**
 * What each state does and does not establish.
 *
 * Written out because the difference matters operationally and is easy to
 * lose: `EXPECTED` is a plan, not a presence, and an interface that drew
 * the two the same way would put ships in a port they have not reached.
 */
export const NPA_STATUS_DETAIL: Readonly<Record<string, string>> = {
  AT_BERTH:
    "NPA records this vessel as alongside. This is the port authority's account, not an AIS observation.",
  AWAITING_BERTH:
    "NPA records this vessel as arrived and waiting for a berth. No berth has been assigned.",
  EXPECTED:
    "NPA expects this vessel. It is not recorded as present, and nothing here establishes that it has arrived.",
  DEPARTED:
    "NPA records this vessel as departed. This is a historical record, not current activity.",
  UNKNOWN: "The source sheet did not state an operational status.",
};

function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function timeRow(label: string, iso: string | null, absent: string): Datum {
  const when = whenLabel(iso);
  return when
    ? available(label, `${when} UTC`, { mono: true, provenance: "NPA daily shipping schedule" })
    : missing(label, absent);
}

/** The operational state NPA reports, and where. */
export function npaOperationalRows(call: NpaPortCall): readonly Datum[] {
  return [
    available("Status", NPA_STATUS_LABELS[call.status] ?? call.status, {
      provenance: NPA_STATUS_DETAIL[call.status],
    }),
    call.portLabel
      ? available("Port", call.portLabel, {
          provenance: call.portLocode
            ? `Resolved to ${call.portLocode}`
            : "Recorded as written; not matched to Seaphore's port register",
        })
      : missing("Port", "The source sheet names no port."),
    /*
     * The terminal is only ever the code NPA prefixed to the berth, or
     * the free-text terminal column. Neither carries an operator, a
     * capacity or a position, and none is invented here.
     */
    call.terminalCode
      ? available("Terminal", call.terminalCode, {
          provenance: "Terminal code as NPA wrote it. No operator or capacity is published.",
        })
      : missing("Terminal", "NPA did not attribute this record to a terminal."),
    call.berthRaw
      ? available("Berth", call.berthRaw, { mono: true, provenance: "As written by NPA" })
      : missing(
          "Berth",
          call.status === "AWAITING_BERTH"
            ? "No berth has been assigned — the vessel is waiting for one."
            : "The source sheet names no berth.",
        ),
    call.agent
      ? available("Agent", call.agent, { provenance: "NPA daily shipping schedule" })
      : missing("Agent", "The source sheet names no agent."),
    call.rotation
      ? available("Rotation", call.rotation, { mono: true })
      : missing("Rotation", "No rotation number was recorded."),
  ];
}

/** NPA's schedule times, each absent for its own stated reason. */
export function npaScheduleRows(call: NpaPortCall): readonly Datum[] {
  return [
    timeRow("ETA", call.eta, "No estimated arrival was recorded."),
    timeRow("Arrival", call.arrivalAt, "No arrival time was recorded."),
    timeRow("Berthed", call.berthAt, "No berthing time was recorded."),
    timeRow("ETD", call.etd, "No estimated departure was recorded."),
    timeRow("Departed", call.departureAt, "No departure time was recorded."),
  ];
}

/**
 * Cargo as evidence, with its unit intact.
 *
 * The quantity is never reduced to a bare number: metric tons, vehicles
 * and container loads share one column in the source, and a figure
 * stripped of its unit could be totalled against a different one — or
 * charged a levy as though it were money.
 */
export function npaCargoRows(call: NpaPortCall): readonly Datum[] {
  const cargo = call.cargo;
  if (!cargo) {
    return [missing("Cargo", "The source sheet records no cargo for this call.")];
  }

  const direction =
    cargo.direction === "UNSPECIFIED"
      ? "Direction not stated by the source"
      : cargo.direction === "IMPORT"
        ? "Import"
        : "Export";

  return [
    available("Cargo", cargo.raw, { provenance: `NPA cargo evidence · ${direction}` }),
    cargo.quantity
      ? available("Quantity", cargo.quantity.raw, {
          mono: true,
          provenance: cargo.quantity.unit
            ? `As written by NPA, in ${cargo.quantity.unit}`
            : "As written by NPA. No unit was recorded, so this cannot be compared with figures that carry one.",
        })
      : missing("Quantity", "No quantity was recorded against this cargo."),
  ];
}

/** How the two sources relate, and what that does and does not prove. */
export function npaCorrelationRows(vessel: UnifiedVessel): readonly Datum[] {
  const label: Record<UnifiedVessel["correlation"], string> = {
    MATCHED: "Corroborated",
    NPA_ONLY: "NPA only",
    DATALASTIC_ONLY: "AIS only",
    AMBIGUOUS: "Source discrepancy",
  };

  return [
    available("Sources", label[vessel.correlation], { provenance: vessel.note }),
    vessel.aisVisible
      ? available("AIS", "Currently visible", {
          provenance: "A live position report was received for this hull.",
        })
      : missing(
          "AIS",
          "Not currently visible. This says nothing about where the vessel is — only that no connected source is reporting it.",
        ),
    vessel.position
      ? available(
          "Position basis",
          vessel.position.precision === "OBSERVED" ? "Observed" : "Place, not position",
          { provenance: vessel.position.basis },
        )
      : missing("Position basis", "Nothing establishes a place for this vessel."),
  ];
}

/** Every NPA call for a hull, newest-relevant first, as short lines. */
export function npaHistoryLines(vessel: UnifiedVessel): readonly string[] {
  return vessel.portCalls.map((call) => {
    const when = whenLabel(call.observedAt);
    const where = [call.portLabel, call.berthRaw].filter(Boolean).join(" · ");
    return [NPA_STATUS_LABELS[call.status] ?? call.status, where, when].filter(Boolean).join(" — ");
  });
}
