import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Columns3, Download, LineChart, ShieldCheck } from "lucide-react";

import {
  CheckList,
  FilterBlock,
  FilterSearch,
  IntelCentreShell,
  SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge } from "@/components/intel-centre/primitives";
import { SubjectHeader } from "@/components/intel-centre/subject-header";
import { useCentreFocus } from "@/components/intel-centre/use-centre-focus";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { NigeriaMap } from "@/components/intel-centre/nigeria-map";
import { OwnershipGraph } from "@/components/intel-centre/ownership-graph";
import {
  OWNERSHIP_EDGES,
  VESSELS,
  companyById,
  fmtTime,
  portByCode,
  sparkSeries,
  vesselById,
} from "@/lib/intel-centre-data";

const KPIS: KpiSpec[] = [
  {
    label: "Vessels Tracked",
    value: String(VESSELS.length),
    delta: "+2",
    trend: "up",
    confidence: "verified",
    series: sparkSeries(2),
  },
  {
    label: "High Risk",
    value: String(VESSELS.filter((v) => v.riskLevel === "high").length),
    delta: "+1",
    trend: "up",
    confidence: "observed",
    series: sparkSeries(4),
    emphasis: "risk",
  },
  {
    label: "Sanctions Hits",
    value: String(VESSELS.filter((v) => v.sanctionsHit).length),
    delta: "0",
    trend: "flat",
    confidence: "verified",
    series: sparkSeries(8),
    emphasis: "risk",
  },
  {
    label: "AIS Blackouts (24h)",
    value: String(VESSELS.filter((v) => v.aisBlackoutHours > 4).length),
    delta: "+1",
    trend: "up",
    confidence: "observed",
    series: sparkSeries(12),
    emphasis: "warn",
  },
  {
    label: "PSC Detentions (30d)",
    value: "2",
    delta: "+1",
    trend: "up",
    confidence: "verified",
    series: sparkSeries(16),
  },
  {
    label: "Confidence Score",
    value: "84%",
    delta: "+0.9%",
    trend: "up",
    confidence: "observed",
    series: sparkSeries(22),
    emphasis: "ok",
  },
  {
    label: "Open Investigations",
    value: "9",
    delta: "+2",
    trend: "up",
    confidence: "verified",
    series: sparkSeries(26),
  },
];

export function VesselCentre() {
  const [tab, setTab] = useState("workspace");
  const [selectedId, setSelectedId] = useState<string>("v-ocean-pearl");
  const v = vesselById(selectedId)!;

  // VES-2 mock voyage history for the selected vessel
  const history = Array.from({ length: 8 }).map((_, i) => {
    const port = ["APP", "TCT", "ONN", "PHC", "CAL"][i % 5] as "APP";
    return {
      voyage: `${v.voyage.slice(0, 2)}-${1000 + i * 37}`,
      date: new Date(Date.now() - i * 22 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      port,
      cargo: ["Consumer Goods", "Chemicals", "Machinery", "Raw Materials", "Fuel & Energy"][i % 5]!,
      revenueNGN: 120_000_000 + i * 41_000_000,
      risk: (i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low") as "high" | "medium" | "low",
    };
  });

  return (
    <IntelCentreShell
      title="Vessel Intelligence"
      subtitle="Vessel identity, behaviour, ownership and compliance."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "profile", label: "Profile" },
        { key: "history", label: "Voyage History" },
        { key: "ownership", label: "Ownership" },
        { key: "compliance", label: "Compliance" },
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
          <FilterSearch placeholder="Search vessel, IMO, MMSI…" />
          <FilterBlock label="Fleet">
            <ul className="space-y-0.5">
              {VESSELS.map((vv) => (
                <li key={vv.id}>
                  <button
                    onClick={() => setSelectedId(vv.id)}
                    className={
                      "flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[12px] " +
                      (vv.id === selectedId
                        ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]"
                        : "text-foreground/80 hover:bg-surface-2/50")
                    }
                  >
                    <span className="truncate">{vv.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate">{vv.imo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </FilterBlock>
          <FilterBlock label="Vessel type">
            <CheckList options={["Container", "Tanker", "Bulk Carrier", "General Cargo", "RoRo"]} />
          </FilterBlock>
          <FilterBlock label="Flag">
            <CheckList options={["Panama", "Liberia", "Marshall Islands", "Nigeria", "Greece"]} />
          </FilterBlock>
          <FilterBlock label="Watchlists">
            <CheckList options={["High Risk Vessels", "Sanctioned Entities", "Repeat Offenders"]} />
          </FilterBlock>
          <FilterBlock label="Saved views">
            <SavedViewList views={["High risk fleet", "Sanctioned vessels", "AIS gaps 24h"]} />
          </FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {/* Map + profile */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="h-[340px]">
              <NigeriaMap
                vessels={VESSELS}
                selectedVesselId={selectedId}
                onSelectVessel={(vv) => setSelectedId(vv.id)}
                className="h-full"
              />
            </div>
            <Section title="Vessel Profile (VES-1)">
              <div className="mb-3">
                <div className="text-[15px] font-semibold text-foreground">{v.name}</div>
                <div className="text-[11px] text-slate">
                  {v.type} · {v.flag} · Built {v.yearBuilt}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
                {[
                  ["IMO", v.imo, "verified"],
                  ["MMSI", v.mmsi, "verified"],
                  ["Class", v.classSociety, "verified"],
                  ["GT", v.gt.toLocaleString(), "verified"],
                  ["DWT", v.dwt.toLocaleString(), "verified"],
                  ["Owner", companyById(v.ownerId)?.name ?? "—", "verified"],
                  ["Operator", companyById(v.operatorId)?.name ?? "—", "verified"],
                  ["Manager", companyById(v.managerId)?.name ?? "—", "observed"],
                  [
                    "Insurer",
                    v.insurerId ? (companyById(v.insurerId)?.name ?? "—") : "—",
                    "inferred",
                  ],
                  ["ETA", fmtTime(v.etaISO), "observed"],
                ].map(([k, val, c]) => (
                  <div key={k as string} className="contents">
                    <dt className="text-slate">{k}</dt>
                    <dd className="flex items-center justify-end gap-1.5 text-right text-foreground/90">
                      {val}{" "}
                      <ConfidenceChip tier={c as "verified" | "observed" | "inferred"} size={9} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>

          {/* Voyage history */}
          <Section title="Voyage History (VES-2)">
            <DataTable
              columns={[
                {
                  key: "vy",
                  label: "Voyage",
                  render: (r: (typeof history)[number]) => (
                    <span className="font-mono text-[11.5px]">{r.voyage}</span>
                  ),
                },
                { key: "dt", label: "Date", render: (r) => r.date },
                { key: "pt", label: "Port", render: (r) => portByCode(r.port)?.name },
                { key: "cg", label: "Cargo", render: (r) => r.cargo },
                {
                  key: "rv",
                  label: "Revenue",
                  align: "right",
                  render: (r) => `₦${(r.revenueNGN / 1_000_000).toFixed(0)}M`,
                },
                {
                  key: "rk",
                  label: "Risk",
                  render: (r) => (
                    <StatusBadge
                      label={r.risk.toUpperCase()}
                      tone={r.risk === "high" ? "risk" : r.risk === "medium" ? "warn" : "ok"}
                    />
                  ),
                },
              ]}
              rows={history}
              rowKey={(r) => r.voyage}
              compact
            />
          </Section>

          {/* Ownership graph (VES-3) */}
          <Section title="Ownership Graph (VES-3)">
            <OwnershipGraph centerId={v.id} edges={OWNERSHIP_EDGES} height={280} />
          </Section>

          {/* Compliance (VES-4) */}
          <Section title="Compliance">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-line/60 bg-surface/50 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                  <ShieldCheck className="h-3 w-3 text-[color:var(--color-blue)]" /> Sanctions
                </div>
                {v.sanctionsHit ? (
                  <div className="text-[11.5px] text-[color:var(--color-red)]">
                    Match observed against OFAC SDN &amp; UN consolidated list.
                  </div>
                ) : (
                  <div className="text-[11.5px] text-[color:var(--color-green)]">
                    No hits · verified against OFAC / UN / EU lists.
                  </div>
                )}
                <div className="mt-1">
                  <ConfidenceChip tier="verified" size={9} />
                </div>
              </div>

              <div className="rounded-md border border-line/60 bg-surface/50 p-2.5">
                <div className="mb-1 text-[11px] font-semibold text-foreground">
                  PSC Inspections
                </div>
                {v.pscInspections.length === 0 ? (
                  <div className="text-[11.5px] text-slate">No PSC record in last 12 months.</div>
                ) : (
                  <ul className="space-y-1 text-[11.5px]">
                    {v.pscInspections.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="text-foreground/90">
                          {p.date} · {p.port}
                        </span>
                        <StatusBadge
                          label={p.result}
                          tone={
                            p.result === "Detained"
                              ? "risk"
                              : p.result === "Deficiencies"
                                ? "warn"
                                : "ok"
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-1">
                  <ConfidenceChip tier="verified" size={9} />
                </div>
              </div>

              <div className="rounded-md border border-line/60 bg-surface/50 p-2.5">
                <div className="mb-1 text-[11px] font-semibold text-foreground">
                  Class &amp; Flag State
                </div>
                <div className="text-[11.5px] text-foreground/90">
                  Class: {v.classSociety} · Status: In Class
                </div>
                <div className="text-[11.5px] text-foreground/90">Flag: {v.flag}</div>
                <div className="mt-1">
                  <ConfidenceChip tier="verified" size={9} />
                </div>
              </div>
            </div>
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Vessel Copilot"
          observed={[
            {
              title: "AIS blackout observed",
              detail: `${v.name}: ${v.aisBlackoutHours}h gap in last 24h.`,
              confidence: "observed",
            },
            {
              title: "Sister vessels under same manager",
              detail: "3 vessels managed by GulfMarine Holdings show similar risk pattern.",
              confidence: "observed",
            },
            {
              title: "Class deficiency trend",
              detail: "PSC deficiency count up 2 vs 6-month baseline.",
              confidence: "inferred",
            },
          ]}
          recommendations={[
            {
              title: "Request MMSI validation from NIMASA",
              detail: "Confirm identity before berth allocation.",
              confidence: "observed",
            },
            {
              title: "Escalate to Compliance Centre",
              detail: "If sanctions match verified, freeze clearance.",
              confidence: "verified",
            },
          ]}
          historical={[
            {
              title: "Same-fleet vessel · Q3 2025",
              detail: "AIS gap → 62% correlation with under-declaration incidents.",
              similarity: 68,
            },
          ]}
          related={[
            { ref: "INV-2412-03", title: "Niger Runner sanctions review", status: "Escalated" },
            { ref: "INV-2412-01", title: "Ocean Pearl duty variance", status: "Open" },
          ]}
        />
      }
    />
  );
}
