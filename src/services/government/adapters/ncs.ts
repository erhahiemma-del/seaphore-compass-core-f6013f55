/**
 * Nigeria Customs Service (NCS) adapter — Sprint EP-GOV-01.
 *
 * Authority of record for customs declarations (SAD), cargo declarations,
 * manifest returns and duty assessments served by NICIS II.
 * Mapping only: no scoring, no risk, no interpretation.
 */
import { compact, createRestGovernmentAdapter, iso, num, str } from "./rest";
import type { AgencyRow, MapContext } from "./rest";
import type { GovernmentEvidenceRecord } from "../types";

function base(
  row: AgencyRow,
  ctx: MapContext,
  recordId: string,
  label: string | null,
): Pick<GovernmentEvidenceRecord, "agency" | "agencyName" | "recordType" | "recordId"> & {
  label?: string;
  occurredAt?: string;
  updatedAt?: string;
} {
  const occurredAt = iso(row, "declaration_date", "registered_at", "date", "occurred_at");
  const updatedAt = iso(row, "amended_at", "updated_at", "last_modified");
  return {
    agency: ctx.agency,
    agencyName: ctx.agencyName,
    recordType: ctx.recordType,
    recordId,
    ...(label ? { label } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export const ncsAdapter = createRestGovernmentAdapter({
  agency: "NCS",
  agencyName: "Nigeria Customs Service (NICIS II)",
  baseUrlEnv: ["NCS_CUSTOMS_API_BASE_URL", "NCS_API_BASE_URL"],
  credentialEnv: ["NCS_CUSTOMS_API_TOKEN", "NCS_API_TOKEN"],
  trustWeight: 1,
  healthPath: "/health",
  endpoints: [
    {
      recordType: "customs-declaration",
      path: "/declarations",
      termParam: "q",
      map: (row, ctx) => {
        const sad = str(row, "sad_number", "declaration_number", "reference");
        if (!sad) return null;
        return {
          ...base(row, ctx, `ncs:sad:${sad}`, `SAD ${sad}`),
          fields: compact({
            declarationNumber: sad,
            declarationType: str(row, "declaration_type", "regime"),
            declarationStatus: str(row, "status", "declaration_status"),
            customsOffice: str(row, "office_code", "customs_office"),
            portCode: str(row, "port_code", "unlocode"),
            importerName: str(row, "importer_name", "consignee_name"),
            importerTin: str(row, "importer_tin", "tin"),
            declarantName: str(row, "declarant_name", "agent_name"),
            countryOfOrigin: str(row, "country_of_origin", "origin_country"),
            countryOfDestination: str(row, "country_of_destination"),
            grossMassKg: num(row, "gross_mass_kg", "gross_weight"),
            packageCount: num(row, "package_count", "packages"),
            invoiceValue: num(row, "invoice_value", "cif_value"),
            invoiceCurrency: str(row, "invoice_currency", "currency"),
          }),
          links: {
            manifest: str(row, "manifest_number", "manifest_id"),
            billOfLading: str(row, "bill_of_lading", "bl_number"),
            vesselImo: str(row, "vessel_imo", "imo"),
          },
          units: { grossMassKg: "kg" },
          excerpt: `NCS customs declaration ${sad}${
            str(row, "status") ? ` · ${str(row, "status")}` : ""
          }`,
          raw: row,
        };
      },
    },
    {
      recordType: "cargo-declaration",
      path: "/cargo-declarations",
      termParam: "q",
      map: (row, ctx) => {
        const id = str(row, "cargo_declaration_id", "id", "reference");
        if (!id) return null;
        return {
          ...base(row, ctx, `ncs:cargo:${id}`, `Cargo declaration ${id}`),
          fields: compact({
            cargoDescription: str(row, "cargo_description", "description", "goods_description"),
            hsCode: str(row, "hs_code", "tariff_code"),
            cargoType: str(row, "cargo_type"),
            grossMassKg: num(row, "gross_mass_kg", "gross_weight"),
            netMassKg: num(row, "net_mass_kg", "net_weight"),
            quantity: num(row, "quantity", "qty"),
            quantityUnit: str(row, "quantity_unit", "uom"),
            containerCount: num(row, "container_count", "containers"),
            portOfLoading: str(row, "port_of_loading", "pol"),
            portOfDischarge: str(row, "port_of_discharge", "pod"),
          }),
          links: {
            billOfLading: str(row, "bill_of_lading", "bl_number"),
            manifest: str(row, "manifest_number"),
            container: str(row, "container_number"),
          },
          units: { grossMassKg: "kg", netMassKg: "kg" },
          excerpt: `NCS cargo declaration ${id}`,
          raw: row,
        };
      },
    },
    {
      recordType: "manifest-return",
      path: "/manifests",
      termParam: "q",
      map: (row, ctx) => {
        const manifest = str(row, "manifest_number", "manifest_id", "reference");
        if (!manifest) return null;
        return {
          ...base(row, ctx, `ncs:manifest:${manifest}`, `Manifest ${manifest}`),
          fields: compact({
            manifestNumber: manifest,
            manifestStatus: str(row, "status", "manifest_status"),
            carrierName: str(row, "carrier_name", "shipping_line"),
            vesselName: str(row, "vessel_name"),
            voyageNumber: str(row, "voyage_number", "voyage"),
            portOfDischarge: str(row, "port_of_discharge", "pod"),
            arrivalDate: iso(row, "arrival_date", "eta"),
            billCount: num(row, "bill_count", "bills_of_lading"),
            totalPackages: num(row, "total_packages", "packages"),
            totalGrossMassKg: num(row, "total_gross_mass_kg", "total_gross_weight"),
          }),
          links: { vesselImo: str(row, "vessel_imo", "imo") },
          units: { totalGrossMassKg: "kg" },
          excerpt: `NCS manifest return ${manifest}`,
          raw: row,
        };
      },
    },
    {
      recordType: "revenue-assessment",
      path: "/assessments",
      termParam: "q",
      map: (row, ctx) => {
        const id = str(row, "assessment_number", "assessment_id", "id");
        if (!id) return null;
        return {
          ...base(row, ctx, `ncs:assessment:${id}`, `Assessment ${id}`),
          fields: compact({
            assessmentNumber: id,
            assessmentStatus: str(row, "status", "payment_status"),
            dutyAmount: num(row, "duty_amount", "duty"),
            vatAmount: num(row, "vat_amount", "vat"),
            leviesAmount: num(row, "levies_amount", "levies"),
            totalPayable: num(row, "total_payable", "total_amount"),
            currency: str(row, "currency") ?? "NGN",
            paidAt: iso(row, "paid_at", "payment_date"),
          }),
          links: { declaration: str(row, "sad_number", "declaration_number") },
          excerpt: `NCS duty assessment ${id}`,
          raw: row,
        };
      },
    },
  ],
});
