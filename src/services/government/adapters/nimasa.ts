/**
 * NIMASA adapter — Sprint EP-GOV-01.
 *
 * Nigerian Maritime Administration and Safety Agency: authority of record
 * for vessel inspection records, voyage reports and statutory returns.
 * Mapping only — no interpretation, no risk scoring.
 */
import { compact, createRestGovernmentAdapter, iso, num, str } from "./rest";

export const nimasaAdapter = createRestGovernmentAdapter({
  agency: "NIMASA",
  agencyName: "Nigerian Maritime Administration and Safety Agency",
  baseUrlEnv: ["NIMASA_API_BASE_URL"],
  credentialEnv: ["NIMASA_API_TOKEN"],
  trustWeight: 1,
  healthPath: "/health",
  endpoints: [
    {
      recordType: "inspection-record",
      path: "/inspections",
      termParam: "q",
      map: (row, ctx) => {
        const id = str(row, "inspection_id", "reference", "id");
        if (!id) return null;
        const occurredAt = iso(row, "inspection_date", "date", "occurred_at");
        const updatedAt = iso(row, "updated_at");
        return {
          agency: ctx.agency,
          agencyName: ctx.agencyName,
          recordType: ctx.recordType,
          recordId: `nimasa:inspection:${id}`,
          label: `NIMASA inspection ${id}`,
          ...(occurredAt ? { occurredAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
          fields: compact({
            inspectionType: str(row, "inspection_type", "type"),
            inspectionOutcome: str(row, "outcome", "result", "status"),
            inspectingOffice: str(row, "office", "zone"),
            deficiencyCount: num(row, "deficiency_count", "deficiencies"),
            detained: typeof row["detained"] === "boolean" ? (row["detained"] as boolean) : null,
            portCode: str(row, "port_code", "unlocode"),
            vesselName: str(row, "vessel_name"),
            flagState: str(row, "flag_state", "flag"),
          }),
          links: { vesselImo: str(row, "vessel_imo", "imo") },
          excerpt: `NIMASA inspection ${id}`,
          raw: row,
        };
      },
    },
    {
      recordType: "voyage-report",
      path: "/voyage-reports",
      termParam: "q",
      map: (row, ctx) => {
        const id = str(row, "report_id", "voyage_number", "id");
        if (!id) return null;
        const occurredAt = iso(row, "reported_at", "departure_date", "date");
        return {
          agency: ctx.agency,
          agencyName: ctx.agencyName,
          recordType: ctx.recordType,
          recordId: `nimasa:voyage:${id}`,
          label: `NIMASA voyage report ${id}`,
          ...(occurredAt ? { occurredAt } : {}),
          fields: compact({
            voyageNumber: str(row, "voyage_number", "voyage"),
            vesselName: str(row, "vessel_name"),
            portOfDeparture: str(row, "port_of_departure", "from_port"),
            portOfArrival: str(row, "port_of_arrival", "to_port"),
            cargoDescription: str(row, "cargo_description", "cargo"),
            cargoTonnes: num(row, "cargo_tonnes", "cargo_weight_tonnes"),
            crewCount: num(row, "crew_count", "crew"),
            clearanceStatus: str(row, "clearance_status", "status"),
          }),
          links: { vesselImo: str(row, "vessel_imo", "imo") },
          units: { cargoTonnes: "t" },
          excerpt: `NIMASA voyage report ${id}`,
          raw: row,
        };
      },
    },
  ],
});
