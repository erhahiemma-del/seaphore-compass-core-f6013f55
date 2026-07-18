import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Columns3, Download, LineChart } from "lucide-react";

import {
  CheckList, FilterBlock, FilterSearch, IntelCentreShell, SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge, TimelineStrip, type Column } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import {
  CARGO, CARGO_TYPE_MIX, PORTS, VESSELS, fmtTime, naira, portByCode, sparkSeries, vesselById,
  type CargoItem,
} from "@/lib/intel-centre-data";



const KPIS: KpiSpec[] = [
  { label: "High Risk Cargo",     value: "18",       delta: "+4",     trend: "up",   confidence: "observed", series: sparkSeries(41), emphasis: "risk" },
  { label: "Dangerous Goods",     value: "6",        delta: "+1",     trend: "up",   confidence: "verified", series: sparkSeries(43), emphasis: "warn" },
  { label: "Revenue Exposure",    value: "₦3.4B",    delta: "+₦280M", trend: "up",   confidence: "inferred", series: sparkSeries(47), emphasis: "risk" },
  { label: "Misclassified Cargo", value: "9",        delta: "+2",     trend: "up",   confidence: "observed", series: sparkSeries(53) },
  { label: "Confidence Score",    value: "78%",      delta: "-0.6%",  trend: "down", confidence: "observed", series: sparkSeries(59), emphasis: "ok" },
  { label: "Open Investigations", value: "8",        delta: "+2",     trend: "up",   confidence: "verified", series: sparkSeries(61) },
  { label: "Alerts",              value: "12",       delta: "+3",     trend: "up",   confidence: "verified", series: sparkSeries(67), emphasis: "risk" },
];

const ORIGINS = [
  { country: "Netherlands", risk: "medium" },
  { country: "China",       risk: "high"   },
  { country: "Brazil",      risk: "low"    },
  { country: "India",       risk: "medium" },
  { country: "UAE",         risk: "high"   },
  { country: "Germany",     risk: "low"    },
  { country: "Belgium",     risk: "low"    },
  { country: "Russia",      risk: "high"   },
  { country: "Greece",      risk: "low"    },
] as const;

export function CargoCentre() {
  const [tab, setTab] = useState("workspace");
  const [selectedContainer, setSelectedContainer] = useState<string>(CARGO[0]!.containerNo);
  const top = [...CARGO].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);

  const timeline = CARGO.map((c) => {
    const v = vesselById(c.vesselId)!;
    return {
      id: c.containerNo,
      time: fmtTime(v.etaISO),
      title: `${c.containerNo} · ${c.description}`,
      subtitle: `${v.name} · ${naira(c.declaredValueNGN)} · ${c.weightMT} MT`,
      tone: c.riskLevel === "high" ? "risk" as const : c.riskLevel === "medium" ? "warn" as const : "ok" as const,
    };
  });

  return (
    <IntelCentreShell
      title="Cargo Intelligence"
      subtitle="Everything inside every ship. Know your cargo. Protect revenue."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "cargo",     label: "Cargo", count: CARGO.length },
        { key: "hs",        label: "HS Codes" },
        { key: "dg",        label: "Dangerous Goods", count: CARGO.filter((c) => c.dangerousGoods).length },
        { key: "analytics", label: "Analytics" },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      tabTrailing={
        <>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><LineChart className="h-3 w-3" /> Analytics</button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Download className="h-3 w-3" /> Export</button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Columns3 className="h-3 w-3" /> Columns</button>
        </>
      }
      filters={
        <>
          <FilterSearch placeholder="Search container, HS, description…" />
          <FilterBlock label="Saved views"><SavedViewList views={["High risk cargo", "DG inbound", "Misclassified"]} /></FilterBlock>
          <FilterBlock label="Time range"><CheckList options={["Last 24h", "Last 7d", "Last 30d"]} defaultChecked={["Last 24h"]} /></FilterBlock>
          <FilterBlock label="Origin country"><CheckList options={["China", "Netherlands", "UAE", "Russia", "India"]} defaultChecked={["China", "UAE"]} /></FilterBlock>
          <FilterBlock label="Destination port"><CheckList options={PORTS.map((p) => p.name)} defaultChecked={["Apapa Port"]} /></FilterBlock>
          <FilterBlock label="Cargo type"><CheckList options={CARGO_TYPE_MIX.map((t) => t.type)} /></FilterBlock>
          <FilterBlock label="Risk"><CheckList options={["High", "Medium", "Low"]} defaultChecked={["High"]} /></FilterBlock>
          <FilterBlock label="Watchlists"><CheckList options={["Dangerous Goods", "Sanctioned Consignees"]} /></FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {/* Flow map + summary (CAR-2, CAR-3) */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Section title="Cargo Flow · Origin → Nigeria">
              <CargoFlowMap origins={ORIGINS} />
            </Section>
            <Section title="Cargo Summary">
              <CargoSummary />
            </Section>
          </div>

          {/* Donut + top-risk table */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Section title="Cargo by Type">
              <CargoDonut />
            </Section>

            <Section title="Top High-Risk Cargo">
              <DataTable<CargoItem>
                columns={cargoCols(selectedContainer)}
                rows={top}
                rowKey={(r) => r.containerNo}
                onRowClick={(r) => setSelectedContainer(r.containerNo)}
                compact
              />
            </Section>
          </div>

          <Section title="Cargo Discharges · Today (CAR-6)">
            <TimelineStrip items={timeline} selectedId={selectedContainer} onSelect={setSelectedContainer} />
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Cargo Truth Engine"
          instance="cargo"
          observed={[
            { title: "HS-code drift on mobile phones",       detail: "Observed 8517.12 vs 8471.30 across 4 containers ex-China.", confidence: "observed" },
            { title: "Weight-value ratio anomaly",           detail: "Container MSCU7811203 declared 40% below HS-code median.",  confidence: "inferred" },
            { title: "Recurring consignee address",          detail: "3 shipments to same address under different importers.",   confidence: "observed" },
          ]}
          recommendations={[
            { title: "Hold MSCU7811203 for physical inspection", detail: "Confidence 82 · duty exposure ₦88M.",  confidence: "inferred" },
            { title: "Re-verify HS 8517.12 declarations",         detail: "Cross-check with WCO reference values.", confidence: "observed" },
            { title: "Flag HLXU3320041 for DG audit",              detail: "IMDG Class 3 flammable observed on general-cargo manifest.", confidence: "observed" },
          ]}
          historical={[
            { title: "Container CMAU9982017 · Q3 2025", detail: "Similar mobile-phone under-declaration → ₦210M recovery.", similarity: 79 },
            { title: "HLXU3320041 · Feb 2026",           detail: "Chemical mis-classification pattern matched HS-2933.99.",  similarity: 64 },
          ]}
          related={[
            { ref: "INV-2412-02", title: "Mobile phone under-declaration", status: "Open" },
            { ref: "INV-2412-04", title: "IMDG Class 3 mislabelling",       status: "Open" },
            { ref: "INV-2411-18", title: "Rice weight audit",                status: "Closed" },
          ]}
        />
      }
    />
  );
}

function CargoFlowMap({ origins }: { origins: readonly { country: string; risk: string }[] }) {
  const W = 720, H = 320;
  const dest = { x: W * 0.75, y: H * 0.62 };
  return (
    <div className="relative overflow-hidden rounded border border-line/60 bg-[#0A1524]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[320px] w-full">
        <rect width={W} height={H} fill="#0A1524" />
        {/* schematic globe stripes */}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1="0" y1={(i + 1) * (H / 9)} x2={W} y2={(i + 1) * (H / 9)} stroke="#132032" strokeWidth="0.5" />
        ))}
        {/* Nigeria dot */}
        <circle cx={dest.x} cy={dest.y} r="7" fill="#2563EB" />
        <text x={dest.x + 10} y={dest.y + 4} fill="#8DA5C7" fontSize="11" fontWeight={600}>Nigeria</text>

        {origins.map((o, i) => {
          const x = ((i + 1) / (origins.length + 1)) * W * 0.7;
          const y = 40 + (i % 3) * 80;
          const colour = o.risk === "high" ? "#C0392B" : o.risk === "medium" ? "#B06A00" : "#1E6B3A";
          return (
            <g key={o.country}>
              <path
                d={`M ${x} ${y} Q ${(x + dest.x) / 2} ${(y + dest.y) / 2 - 40}, ${dest.x} ${dest.y}`}
                fill="none" stroke={colour} strokeWidth="1.25" strokeDasharray="4 3" opacity="0.75"
              />
              <circle cx={x} cy={y} r="4" fill={colour} />
              <text x={x + 7} y={y + 4} fill="#8DA5C7" fontSize="10">{o.country}</text>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded border border-line/40 bg-[#0A1524]/80 px-2 py-1 text-[10px] text-slate/80">
        <Legend colour="#C0392B" label="High" />
        <Legend colour="#B06A00" label="Medium" />
        <Legend colour="#1E6B3A" label="Low" />
        <Legend colour="#5A6B7B" label="Unknown" />
        <span className="mx-1 text-slate/50">·</span>
        <Legend colour="#2563EB" label="Import" />
        <Legend colour="#7C3AED" label="Transshipment" />
      </div>
    </div>
  );
}
function Legend({ colour, label }: { colour: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: colour }} />{label}</span>;
}

function CargoSummary() {
  const items = CARGO.length;
  const containers = new Set(CARGO.map((c) => c.containerNo)).size;
  const weight = CARGO.reduce((a, b) => a + b.weightMT, 0);
  const value = CARGO.reduce((a, b) => a + b.declaredValueNGN, 0);
  const highRisk = CARGO.filter((c) => c.riskLevel === "high").length;
  const misclass = CARGO.filter((c) => c.misclassified).length;
  const exposure = CARGO.filter((c) => c.riskLevel !== "low").reduce((a, b) => a + b.declaredValueNGN * 0.06, 0);
  const rows = [
    ["Total Cargo Items",      String(items),      "verified"],
    ["Total Containers",       String(containers), "verified"],
    ["Total Weight (MT)",      weight.toLocaleString(), "observed"],
    ["Declared Value",         naira(value),       "observed"],
    ["High Risk Cargo",        String(highRisk),   "observed"],
    ["Misclassified",          String(misclass),   "inferred"],
    ["Revenue Exposure",       naira(exposure),    "inferred"],
  ] as const;
  return (
    <dl className="space-y-1.5 text-[12px]">
      {rows.map(([k, v, c]) => (
        <div key={k} className="flex items-center justify-between gap-2 border-b border-line/40 py-1 last:border-b-0">
          <dt className="text-slate">{k}</dt>
          <dd className="flex items-center gap-2 font-semibold text-foreground">
            {v}
            <ConfidenceChip tier={c as "verified" | "observed" | "inferred"} size={9} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CargoDonut() {
  const R = 68, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 180 180" className="h-[180px] w-[180px]">
        <g transform="translate(90 90) rotate(-90)">
          <circle r={R} fill="none" stroke="#132032" strokeWidth={22} />
          {CARGO_TYPE_MIX.map((s) => {
            const len = (s.pct / 100) * C;
            const el = (
              <circle
                key={s.type}
                r={R}
                fill="none"
                stroke={s.colour}
                strokeWidth={22}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="90" y="88" textAnchor="middle" fill="#E4E8EC" fontSize="18" fontWeight={700}>{CARGO.length}</text>
        <text x="90" y="104" textAnchor="middle" fill="#5A6B7B" fontSize="10">items</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-[11.5px]">
        {CARGO_TYPE_MIX.map((s) => (
          <li key={s.type} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-foreground/90">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.colour }} />
              {s.type}
            </span>
            <span className="font-semibold text-foreground">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cargoCols(selected: string): Column<CargoItem>[] {
  return [
    { key: "cn", label: "Container", render: (r) => <span className={`font-mono text-[11.5px] ${r.containerNo === selected ? "text-[color:var(--color-blue)]" : ""}`}>{r.containerNo}</span> },
    { key: "vy", label: "Voyage", render: (r) => r.voyage },
    { key: "vs", label: "Vessel", render: (r) => vesselById(r.vesselId)?.name ?? "—" },
    { key: "hs", label: "HS", render: (r) => <span className="font-mono text-[11.5px]">{r.hsCode}</span> },
    { key: "de", label: "Description", render: (r) => <span className="truncate">{r.description}</span> },
    { key: "or", label: "Origin", render: (r) => r.origin },
    { key: "dt", label: "Dest.", render: (r) => portByCode(r.destination)?.name.replace(" Port", "") },
    { key: "vl", label: "Declared", align: "right", render: (r) => naira(r.declaredValueNGN) },
    { key: "wt", label: "MT", align: "right", render: (r) => r.weightMT.toLocaleString() },
    { key: "rk", label: "Risk", render: (r) => <StatusBadge label={r.riskLevel.toUpperCase()} tone={r.riskLevel === "high" ? "risk" : r.riskLevel === "medium" ? "warn" : "ok"} /> },
    { key: "sc", label: "Score", align: "right", render: (r) => <span className="font-semibold">{r.riskScore}</span> },
    { key: "st", label: "Status", render: (r) => <StatusBadge label={r.status} tone={r.status === "Held" || r.status === "Discrepancy" ? "risk" : r.status === "Inspection" ? "warn" : "ok"} /> },
  ];
}
