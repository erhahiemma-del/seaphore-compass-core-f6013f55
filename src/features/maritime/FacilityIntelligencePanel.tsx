/**
 * A facility from the registry, opened from its marker.
 *
 * Until now the 71 located facilities were drawn and nothing more —
 * clicking one did nothing, so the layer decorated the map rather than
 * making it navigable. This is the other half: marker → canonical record
 * → every field the registry actually holds, and nothing it does not.
 *
 * ## It shows what exists, and says why the rest is absent
 *
 * The registry writes `NOT VERIFIED` rather than leaving cells blank, and
 * the ingest turns that into null. So a missing draft here is not an
 * oversight — it is the registry declining to state one, and the row says
 * so. Every absent field carries its reason through the same `Datum`
 * model the vessel drawer uses.
 *
 * ## Position is described, never implied
 *
 * A facility drawn on the map has a coordinate the registry vouched for,
 * but "vouched for" spans an exact survey and an offshore estimate that
 * MAP CONFIG excludes from distance calculations. The precision is stated
 * in the registry's own words rather than reduced to a marker style the
 * officer has to interpret.
 */
import { useMemo } from "react";

import type { FacilityKind } from "@/services/registry/facility-features";
import type { FacilityRegistry } from "@/services/registry/registry-ingest";

import {
  FACILITY_KIND_LABELS,
  isJettyRecord as isJetty,
  isOffshoreRecord as isOffshore,
  isTerminalRecord as isTerminal,
  type FacilityRecord,
} from "./facility-presentation";
import { Card, DatumRow } from "./VesselIntelligenceSections";
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

/**
 * A field the registry declined to state.
 *
 * One sentence, used everywhere, because the reason is always the same
 * and always worth repeating: the registry does not guess to make a row
 * look complete.
 */
const NOT_STATED = "The registry records no value for this. It does not guess to complete a row.";

export interface FacilityIntelligencePanelProps {
  readonly record: FacilityRecord;
  readonly kind: FacilityKind;
  readonly registry: FacilityRegistry | null;
  /** Opens the parent port, when the facility names one Seaphore holds. */
  readonly onOpenPort?: (locode: string) => void;
}

export function FacilityIntelligencePanel({
  record,
  kind,
  registry,
  onOpenPort,
}: FacilityIntelligencePanelProps) {
  /*
   * The operator's own company record and the concession governing the
   * facility, resolved through the registry's ids rather than by name.
   * Both are absent for most facilities, which is stated rather than
   * hidden.
   */
  const company = useMemo(() => {
    const companyId = isTerminal(record) ? record.companyId : null;
    return companyId ? (registry?.companies.find((c) => c.id === companyId) ?? null) : null;
  }, [record, registry]);

  const concession = useMemo(() => {
    const concessionId = isTerminal(record) ? record.concessionId : null;
    return concessionId ? (registry?.concessions.find((c) => c.id === concessionId) ?? null) : null;
  }, [record, registry]);

  const parentPort = useMemo(() => {
    const portId = "portId" in record ? record.portId : null;
    return portId ? (registry?.ports.find((p) => p.id === portId) ?? null) : null;
  }, [record, registry]);

  const identity: readonly Datum[] = [
    available("Facility", record.name),
    available("Type", FACILITY_KIND_LABELS[kind]),
    available("Registry ID", record.id, { mono: true }),
    record.presentation.mapCategory
      ? available("Category", record.presentation.mapCategory)
      : missing("Category", NOT_STATED),
    parentPort
      ? available("Parent port", parentPort.name, {
          provenance: parentPort.unlocode ? `UN/LOCODE ${parentPort.unlocode}` : undefined,
        })
      : missing("Parent port", "This facility is not attributed to a port in the registry."),
  ];

  /*
   * Position, stated in the registry's own precision vocabulary. A
   * facility on the map has a coordinate the registry vouched for, but an
   * exact survey and an offshore estimate are different claims and the
   * officer is told which they are looking at.
   */
  const position: readonly Datum[] = [
    record.point.lat !== null && record.point.lon !== null
      ? available(
          "Coordinates",
          `${record.point.lat.toFixed(5)}°, ${record.point.lon.toFixed(5)}°`,
          { mono: true, provenance: record.point.note },
        )
      : missing("Coordinates", record.point.note),
    available("Location precision", record.point.precision.replace(/_/g, " ").toLowerCase(), {
      provenance: record.point.note,
    }),
    available("Data state", record.dataState.replace(/_/g, " ").toLowerCase(), {
      provenance: "Field-level confidence as the registry assigns it.",
    }),
  ];

  const operations: readonly Datum[] = [
    isTerminal(record) || isJetty(record)
      ? record.operator
        ? available("Operator", record.operator)
        : missing("Operator", NOT_STATED)
      : isOffshore(record)
        ? record.operator
          ? available("Operator", record.operator)
          : missing("Operator", NOT_STATED)
        : missing("Operator", "A port complex has no single operator in the registry."),
    isTerminal(record)
      ? record.primaryCargo
        ? available("Primary cargo", record.primaryCargo)
        : missing("Primary cargo", NOT_STATED)
      : isJetty(record)
        ? record.cargoFunction
          ? available("Cargo / function", record.cargoFunction)
          : missing("Cargo / function", NOT_STATED)
        : isOffshore(record)
          ? record.product
            ? available("Product", record.product)
            : missing("Product", NOT_STATED)
          : missing("Cargo", NOT_STATED),
    isTerminal(record)
      ? record.berthDesignations
        ? available("Berths", record.berthDesignations, {
            mono: true,
            /*
             * Designations, not a count. The column reads as a number on
             * the rows where a terminal happens to have one berth, and
             * totalling it would mix tallies with names.
             */
            provenance: "Berth designations as the registry lists them, not a count.",
          })
        : missing("Berths", NOT_STATED)
      : missing("Berths", "The registry lists berths only for concessioned terminals."),
    isTerminal(record)
      ? record.quayLengthM !== null
        ? available("Quay length", `${record.quayLengthM} m`, { mono: true })
        : missing("Quay length", NOT_STATED)
      : missing("Quay length", NOT_STATED),
    maxDraftRow(record),
    isTerminal(record)
      ? record.annualCapacity
        ? available("Annual capacity", record.annualCapacity)
        : missing("Annual capacity", NOT_STATED)
      : missing("Annual capacity", NOT_STATED),
    isJetty(record)
      ? record.status
        ? available("Status", record.status)
        : missing("Status", NOT_STATED)
      : isOffshore(record)
        ? record.loadingSystem
          ? available("Loading system", record.loadingSystem)
          : missing("Loading system", NOT_STATED)
        : missing("Status", NOT_STATED),
  ];

  const brief = record.brief;

  return (
    <div className="space-y-2.5 p-3">
      <Card title="Facility identity">
        {identity.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
        {parentPort?.unlocode && onOpenPort ? (
          <button
            type="button"
            onClick={() => onOpenPort(parentPort.unlocode!)}
            className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            Open {parentPort.name} &rarr;
          </button>
        ) : null}
      </Card>

      <Card title="Position">
        {position.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      <Card title="Operations">
        {operations.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      {company ? (
        <Card title="Operator">
          <DatumRow datum={available("Company", company.name)} />
          <DatumRow
            datum={
              company.parent ? available("Parent", company.parent) : missing("Parent", NOT_STATED)
            }
          />
          <DatumRow
            datum={company.role ? available("Role", company.role) : missing("Role", NOT_STATED)}
          />
          <DatumRow
            datum={
              company.nigerianEntry
                ? available("Nigerian commencement", company.nigerianEntry)
                : missing("Nigerian commencement", NOT_STATED)
            }
          />
          {/*
            Founding year is absent for most operators and the registry is
            explicit that it must not be inferred from a concession date.
          */}
          <DatumRow
            datum={
              company.founded
                ? available("Founded", company.founded)
                : missing(
                    "Founded",
                    "Not documented — the registry warns against inferring it from the concession date.",
                  )
            }
          />
        </Card>
      ) : null}

      {concession ? (
        <Card title="Concession">
          <DatumRow
            datum={available("Concessionaire", concession.concessionaire ?? concession.id)}
          />
          <DatumRow
            datum={
              concession.commencement
                ? available("Commencement", concession.commencement)
                : missing("Commencement", NOT_STATED)
            }
          />
          <DatumRow
            datum={
              concession.originalTerm
                ? available("Original term", concession.originalTerm)
                : missing("Original term", NOT_STATED)
            }
          />
          <DatumRow
            datum={
              concession.originalExpiry
                ? available("Original expiry", concession.originalExpiry)
                : missing("Original expiry", NOT_STATED)
            }
          />
          <DatumRow
            datum={
              concession.currentStatus
                ? available("Current status", concession.currentStatus)
                : missing("Current status", NOT_STATED)
            }
          />
          <DatumRow
            datum={
              concession.sourceAuthority
                ? available("Source", concession.sourceAuthority)
                : missing("Source", NOT_STATED)
            }
          />
        </Card>
      ) : null}

      {brief ? (
        <Card title="Industry brief">
          {/*
            The registry's own researched description, shown verbatim. It
            is long-form prose written from documented sources, and
            summarising it here would put Seaphore's words in place of the
            source's.
          */}
          <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
            {brief}
          </p>
        </Card>
      ) : null}

      <Card title="Provenance">
        <DatumRow datum={available("Source", record.source.file)} />
        <DatumRow
          datum={available("Sheet / row", `${record.source.sheet} · row ${record.source.row}`, {
            mono: true,
          })}
        />
        <DatumRow
          datum={
            record.source.importRunId
              ? available("Import run", record.source.importRunId, { mono: true })
              : missing("Import run", "This record predates run tracking.")
          }
        />
      </Card>
    </div>
  );
}

/** Draft, which several record types carry under different names. */
function maxDraftRow(record: FacilityRecord): Datum {
  const draft = isTerminal(record) || isJetty(record) ? record.maxDraftM : null;
  return draft !== null
    ? available("Maximum draft", `${draft} m`, { mono: true })
    : missing("Maximum draft", NOT_STATED);
}
