/**
 * Nigerian Ports Authority (NPA) adapter — Sprint EP-GOV-01.
 *
 * Authority of record for port clearance and terminal container events.
 * Mapping only — no interpretation, no risk scoring.
 */
import { compact, createRestGovernmentAdapter, iso, num, str } from "./rest";

export const npaAdapter = createRestGovernmentAdapter({
  agency: "NPA",
  agencyName: "Nigerian Ports Authority",
  baseUrlEnv: ["NPA_API_BASE_URL"],
  credentialEnv: ["NPA_API_TOKEN"],
  trustWeight: 0.95,
  healthPath: "/health",
  endpoints: [
    {
      recordType: "port-clearance",
      path: "/clearances",
      termParam: "q",
      map: (row, ctx) => {
        const id = str(row, "clearance_id", "reference", "id");
        if (!id) return null;
        const occurredAt = iso(row, "cleared_at", "clearance_date", "date");
        return {
          agency: ctx.agency,
          agencyName: ctx.agencyName,
          recordType: ctx.recordType,
          recordId: `npa:clearance:${id}`,
          label: `NPA clearance ${id}`,
          ...(occurredAt ? { occurredAt } : {}),
          fields: compact({
            clearanceStatus: str(row, "status", "clearance_status"),
            terminalName: str(row, "terminal", "terminal_name"),
            berthName: str(row, "berth", "berth_name"),
            portCode: str(row, "port_code", "unlocode"),
            vesselName: str(row, "vessel_name"),
            arrivalAt: iso(row, "arrival_at", "ata"),
            departureAt: iso(row, "departure_at", "atd"),
          }),
          links: { vesselImo: str(row, "vessel_imo", "imo") },
          excerpt: `NPA port clearance ${id}`,
          raw: row,
        };
      },
    },
    {
      recordType: "container-event",
      path: "/container-events",
      termParam: "q",
      map: (row, ctx) => {
        const container = str(row, "container_number", "container", "unit_number");
        const event = str(row, "event_type", "event", "status");
        if (!container) return null;
        const occurredAt = iso(row, "event_at", "occurred_at", "timestamp", "date");
        return {
          agency: ctx.agency,
          agencyName: ctx.agencyName,
          recordType: ctx.recordType,
          recordId: `npa:container-event:${container}:${event ?? "event"}:${occurredAt ?? "unknown"}`,
          label: `${container} ${event ?? "event"}`,
          ...(occurredAt ? { occurredAt } : {}),
          fields: compact({
            containerNumber: container,
            eventType: event,
            terminalName: str(row, "terminal", "terminal_name"),
            portCode: str(row, "port_code", "unlocode"),
            grossMassKg: num(row, "gross_mass_kg", "gross_weight"),
            sealNumber: str(row, "seal_number", "seal"),
            containerSizeType: str(row, "size_type", "iso_size_type"),
          }),
          links: { billOfLading: str(row, "bill_of_lading", "bl_number") },
          units: { grossMassKg: "kg" },
          excerpt: `NPA container event ${container}${event ? ` · ${event}` : ""}`,
          raw: row,
        };
      },
    },
  ],
});
