import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Anchor, Columns3, Download, LineChart } from "lucide-react";

import {
  CheckList,
  FilterBlock,
  FilterSearch,
  IntelCentreShell,
  SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, Sparkline, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge } from "@/components/intel-centre/primitives";
import { SubjectHeader } from "@/components/intel-centre/subject-header";
import { useCentreFocus } from "@/components/intel-centre/use-centre-focus";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { MapCanvas } from "@/features/maritime/MapCanvas";
import {
  NIGERIAN_PORT_LIST,
  canonicalPortId,
  findNigerianPort,
  hasDrawablePosition,
  positionUnavailableReason,
  sgs,
  useMapSelector,
} from "@/services/geospatial";
import { PORTS, VESSELS, sparkSeries, type Port } from "@/lib/intel-centre-data";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

const KPIS: KpiSpec[] = [
  {
    label: "Ports Live",
    value: String(PORTS.length),
    delta: "0",
    trend: "flat",
    confidence: "unconfirmed",
    series: sparkSeries(3),
  },
  {
    label: "Avg Congestion",
    value: `${Math.round(PORTS.reduce((a, p) => a + p.congestionIndex, 0) / PORTS.length)}%`,
    delta: "+3.2%",
    trend: "up",
    confidence: "unconfirmed",
    series: sparkSeries(6),
    emphasis: "warn",
  },
  {
    label: "Avg Wait Time",
    value: `${Math.round(PORTS.reduce((a, p) => a + p.avgWaitHours, 0) / PORTS.length)}h`,
    delta: "+1.4h",
    trend: "up",
    confidence: "unconfirmed",
    series: sparkSeries(9),
    emphasis: "warn",
  },
  {
    label: "Berths Occupied",
    value: "31/44",
    delta: "+2",
    trend: "up",
    confidence: "unconfirmed",
    series: sparkSeries(12),
  },
  {
    label: "Arrivals Today",
    value: String(PORTS.reduce((a, p) => a + p.todaysEta, 0)),
    delta: "+4",
    trend: "up",
    confidence: "unconfirmed",
    series: sparkSeries(15),
  },
  {
    label: "Confidence Score",
    value: "86%",
    delta: "+0.2%",
    trend: "up",
    confidence: "unconfirmed",
    series: sparkSeries(18),
    emphasis: "ok",
  },
  {
    label: "Alerts",
    value: "5",
    delta: "+1",
    trend: "up",
    confidence: "unconfirmed",
    series: sparkSeries(21),
    emphasis: "risk",
  },
];

export function PortOpsCentre() {
  const [tab, setTab] = useState("workspace");
  /*
   * Port selection lives in SGS, not here.
   *
   * It was `useState<Port["code"]>("APP")`, keyed by a three-letter code
   * nothing outside this file recognised — so clicking a card and
   * clicking the map marker for the same quay produced two unrelated
   * selections, and neither could see the other. The map embedded below
   * is the same MapCanvas every other surface uses; reading the shared
   * selection is what makes the two one system.
   *
   * Canonical identity is UN/LOCODE. `canonicalPortId` maps the legacy
   * card codes onto it, so the demo rows keep working without becoming
   * a competing identity namespace.
   */
  const selection = useMapSelector((state) => state.selection);
  const selectedLocode =
    selection?.kind === "port" ? canonicalPortId(selection.id) : canonicalPortId("NGAPAPA");
  const selectPort = useCallback((locode: string) => {
    const canonical = findNigerianPort(locode);
    if (!canonical) return;
    /*
     * A focus point only when one genuinely exists.
     *
     * Rivers Port has no published coordinate, so its selection carries
     * no focus and `planCameraMove` leaves the viewport alone — rather
     * than flying to a fallback, a guessed point, or 0,0.
     */
    sgs.select({
      kind: "port",
      id: canonical.locode,
      ...(hasDrawablePosition(canonical) ? { focus: canonical.position } : {}),
    });
  }, []);

  /** The demo metrics row for the selected port, when one exists. */
  const port = PORTS.find((p) => canonicalPortId(p.code) === selectedLocode) ?? PORTS[0];
  const canonical = findNigerianPort(selectedLocode) ?? NIGERIAN_PORT_LIST[0];
  const arrivals = VESSELS.filter((v) => v.destinationPort === port.code);

  const { focused, dismiss, isReceded } = useCentreFocus(
    useMemo(
      () => ({
        kind: "port" as const,
        // Canonical identity, so the focus banner, the map marker and
        // the context drawer are all describing the same record.
        id: `port-${canonical.locode}`,
        title: canonical.name,
        descriptor: `${canonical.locode} · ${port.city}`,
        facts: [
          {
            label: "Congestion",
            value: `${port.congestionIndex}%`,
            confidence: "unconfirmed",
          },
          { label: "Avg wait", value: `${port.avgWaitHours}h`, confidence: "unconfirmed" },
          { label: "Arrivals today", value: String(port.todaysEta), confidence: "unconfirmed" },
        ],
      }),
      [canonical, port],
    ),
  );

  return (
    <>
      <DemoDataNotice surface="Port Intelligence" className="mb-3" />
      <IntelCentreShell
        title="Port Operations"
        subtitle="Live congestion, berth status and forecast across Nigerian ports."
        kpiRibbon={<KpiRibbon items={KPIS} />}
        tabs={[
          { key: "workspace", label: "Workspace" },
          { key: "berths", label: "Berths" },
          { key: "forecast", label: "Forecast" },
          { key: "analytics", label: "Analytics" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        tabTrailing={
          <>
            <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50">
              <LineChart className="h-3 w-3" /> Analytics
            </button>
            <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50">
              <Download className="h-3 w-3" /> Export
            </button>
            <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50">
              <Columns3 className="h-3 w-3" /> Columns
            </button>
          </>
        }
        filters={
          <>
            <FilterSearch placeholder="Search port, berth, vessel…" />
            <FilterBlock label="Ports">
              {/*
                Driven by the canonical model, not by the demo rows.
                All seven of Nigeria's ports belong on this list —
                including Rivers, which has no coordinate and so appears
                on no map. Listing only the ports the map can draw would
                let an officer read "not on the map" as "not a port".
              */}
              <ul className="space-y-0.5" data-testid="port-locations-list">
                {NIGERIAN_PORT_LIST.map((p) => {
                  const isSelected = p.locode === selectedLocode;
                  const positioned = hasDrawablePosition(p);
                  return (
                    <li key={p.locode}>
                      <button
                        data-testid={`port-card-${p.locode}`}
                        aria-pressed={isSelected}
                        onClick={() => selectPort(p.locode)}
                        className={
                          "flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[12px] " +
                          (isSelected
                            ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]"
                            : "text-foreground/80 hover:bg-surface-2/50")
                        }
                      >
                        <span className="truncate">{p.name}</span>
                        {/*
                          Says why a port is absent from the map, in the
                          place the officer would otherwise wonder.
                          Never a congestion figure — those are demo
                          values and are stated as such elsewhere.
                        */}
                        {!positioned ? (
                          <span
                            className="ml-2 shrink-0 text-[9.5px] text-amber-400/80"
                            title={positionUnavailableReason(p)}
                          >
                            no position
                          </span>
                        ) : p.precision === "degree-minute" ? (
                          <span
                            className="ml-2 shrink-0 text-[9.5px] text-slate"
                            title={p.provenance.note}
                          >
                            ±1 km
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </FilterBlock>
            <FilterBlock label="Saved views">
              <SavedViewList
                views={["Congestion > 70", "Anchorage waits > 24h", "Berth turnover"]}
              />
            </FilterBlock>
            <FilterBlock label="Time range">
              <CheckList
                options={["Live", "Last 24h", "Last 7d", "Last 30d"]}
                defaultChecked={["Live"]}
              />
            </FilterBlock>
            <FilterBlock label="Vessel type">
              <CheckList
                options={["Container", "Tanker", "Bulk Carrier", "General Cargo", "RoRo"]}
              />
            </FilterBlock>
          </>
        }
        main={
          <div className="space-y-4">
            {focused && (
              <SubjectHeader
                kind="port"
                title={port.name}
                descriptor={`${port.code} · ${port.city}`}
                /*
                 * `unconfirmed`: this header describes a port from the
                 * fixture layer, and the congestion, wait and arrival rows
                 * directly beneath it already say so. Claiming `verified`
                 * above them asserted an authoritative source that does
                 * not exist — Ports has no provider-backed path at all.
                 */
                confidence="unconfirmed"
                evidence={[
                  {
                    label: "Congestion",
                    value: `${port.congestionIndex}%`,
                    confidence: "unconfirmed",
                  },
                  { label: "Avg wait", value: `${port.avgWaitHours}h`, confidence: "unconfirmed" },
                  { label: "Arrivals", value: String(port.todaysEta), confidence: "unconfirmed" },
                ]}
                onDismiss={dismiss}
              />
            )}

            {/*
              The shared MapLibre engine under a ports lens, replacing a
              mock-provider map. Port and anchorage positions come from the
              single geospatial asset registry; selection flows through the
              same SGS as every other surface.
            */}
            <Section title="Port Estate & Approaches (POR-1)">
              <div className="relative h-[340px] overflow-hidden rounded-lg border border-line">
                <MapCanvas mode="context" domain="ports" />
                <PortMapCoverageNote />
              </div>
            </Section>

            {/* Port summary + berth grid */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Section title={`${port.name} · Summary`}>
                <div className="mb-2 flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-[color:var(--color-blue)]" />
                  <div className="text-[13px] font-semibold text-foreground">{port.name}</div>
                  <ConfidenceChip tier="unconfirmed" size={9} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
                  {[
                    ["Congestion Index", `${port.congestionIndex}%`],
                    ["Avg Wait", `${port.avgWaitHours}h`],
                    ["Avg Clearance", `${port.avgClearanceHours}h`],
                    ["ETAs Today", String(port.todaysEta)],
                    ["Departures Today", String(port.todaysDeparture)],
                    ["Berth Utilisation", `${Math.round(60 + port.congestionIndex * 0.3)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate">{k}</dt>
                      <dd className="text-right font-semibold text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3">
                  <div className="mb-1 text-[10.5px] uppercase tracking-[0.06em] text-slate">
                    Congestion trend · 24h
                  </div>
                  <div className="h-10">
                    <Sparkline
                      data={sparkSeries(port.congestionIndex)}
                      trend={port.congestionIndex > 60 ? "up" : "flat"}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Berth Status (POR-2)">
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const state =
                      i < Math.round(port.congestionIndex / 10)
                        ? "occupied"
                        : i < 10
                          ? "available"
                          : "maintenance";
                    const colour =
                      state === "occupied"
                        ? "#C0392B"
                        : state === "available"
                          ? "#1E6B3A"
                          : "#5A6B7B";
                    return (
                      <div
                        key={i}
                        className="rounded border border-line/60 bg-surface/50 p-2 text-center"
                      >
                        <div className="text-[10px] text-slate">Berth {i + 1}</div>
                        <div
                          className="mx-auto mt-1 h-3 w-3 rounded-sm"
                          style={{ background: colour }}
                        />
                        <div className="mt-1 text-[9.5px] capitalize text-foreground/80">
                          {state}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10.5px] text-slate">
                  <LegendDot colour="#C0392B" label="Occupied" />
                  <LegendDot colour="#1E6B3A" label="Available" />
                  <LegendDot colour="#5A6B7B" label="Maintenance" />
                </div>
              </Section>
            </div>

            <Section title="Arrivals · Selected Port" receded={isReceded(["port", "vessel"])}>
              <DataTable
                columns={[
                  {
                    key: "n",
                    label: "Vessel",
                    render: (r: (typeof arrivals)[number]) => (
                      <span className="font-semibold text-foreground">{r.name}</span>
                    ),
                  },
                  { key: "t", label: "Type", render: (r) => r.type },
                  {
                    key: "v",
                    label: "Voyage",
                    render: (r) => <span className="font-mono text-[11.5px]">{r.voyage}</span>,
                  },
                  {
                    key: "e",
                    label: "ETA",
                    render: (r) =>
                      new Date(r.etaISO).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      }) + " UTC",
                  },
                  {
                    key: "r",
                    label: "Risk",
                    render: (r) => (
                      <StatusBadge
                        label={r.riskLevel.toUpperCase()}
                        tone={
                          r.riskLevel === "high" ? "risk" : r.riskLevel === "medium" ? "warn" : "ok"
                        }
                      />
                    ),
                  },
                  {
                    key: "c",
                    label: "Confidence",
                    align: "right",
                    render: () => <ConfidenceChip tier="unconfirmed" size={9} />,
                  },
                ]}
                rows={arrivals}
                rowKey={(r) => r.id}
                compact
                emptyLabel="No vessels inbound to this port."
              />
            </Section>

            <Section title="Forecast · Next 24h (POR-3)">
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => {
                  const hour = (new Date().getUTCHours() + (i + 1) * 4) % 24;
                  const load = Math.max(20, Math.min(95, port.congestionIndex + Math.sin(i) * 12));
                  return (
                    <div key={i} className="rounded border border-line/60 bg-surface/50 p-2">
                      <div className="text-[10px] text-slate">
                        +{(i + 1) * 4}h · {String(hour).padStart(2, "0")}:00 UTC
                      </div>
                      <div className="mt-1 text-[16px] font-semibold text-foreground">
                        {Math.round(load)}%
                      </div>
                      <div className="mt-1 h-1 w-full rounded bg-surface-2/50">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${load}%`,
                            background: load > 70 ? "#C0392B" : load > 50 ? "#B06A00" : "#1E6B3A",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        }
        copilot={
          <CentreCopilot
            name="Port Ops Copilot"
            observed={[
              {
                title: "Apapa congestion trending up",
                detail: "Observed +6pts in 6h · anchorage queue at 14 vessels.",
                confidence: "unconfirmed",
              },
              {
                title: "Berth 4 idle > 8h at Onne",
                detail: "No allocation logged since 02:14 UTC.",
                confidence: "unconfirmed",
              },
              {
                title: "Weather advisory · Bight",
                detail: "Wind advisory may delay pilotage after 18:00 UTC.",
                confidence: "inferred",
              },
            ]}
            recommendations={[
              {
                title: "Rebalance arrivals to Tin Can",
                detail: "3 general-cargo arrivals could be re-slotted.",
                confidence: "inferred",
              },
              {
                title: "Notify pilotage of MV Ocean Pearl priority",
                detail: "High risk, hold on validation.",
                confidence: "unconfirmed",
              },
            ]}
            historical={[
              {
                title: "Apapa peak · Nov 2025",
                detail: "Same profile → 42h avg wait for 4 days.",
                similarity: 71,
              },
            ]}
            related={[{ ref: "INV-2412-01", title: "Ocean Pearl berth clearance", status: "Open" }]}
          />
        }
      />
    </>
  );
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
}

/**
 * Geographic context, not port surveillance.
 *
 * Port positions and the EEZ come from verified geographic assets, and
 * vessels appear when a feed is connected. Berth occupancy, live
 * arrivals and congestion history are not collected, so nothing here
 * animates a working port — a busy-looking map with no berth data would
 * imply surveillance this system does not have.
 */
function PortMapCoverageNote() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 max-w-[300px] rounded border border-line/70 bg-surface/90 px-2.5 py-1.5 backdrop-blur-sm">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate">
        Port coverage
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate">
        Port locations and EEZ from verified geography. Berth occupancy, live arrivals and
        congestion history are not collected — their absence is a gap in coverage, not a quiet port.
      </p>
    </div>
  );
}
