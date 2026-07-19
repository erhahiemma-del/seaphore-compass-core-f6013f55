import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Columns3, Download, LineChart } from "lucide-react";

import {
  CheckList,
  FilterBlock,
  FilterSearch,
  IntelCentreShell,
  SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { NigeriaMap } from "@/components/intel-centre/nigeria-map";
import {
  DataTable,
  Section,
  StatusBadge,
  TimelineStrip,
  type Column,
} from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import {
  EVIDENCE,
  VESSELS,
  companyById,
  fmtTime,
  portByCode,
  sparkSeries,
  type Vessel,
} from "@/lib/intel-centre-data";

const KPIS: KpiSpec[] = [
  {
    label: "Today's Manifests",
    value: "148",
    delta: "+12",
    trend: "up",
    confidence: "verified",
    series: sparkSeries(3),
    emphasis: "risk",
  },
  {
    label: "Pending Validation",
    value: "34",
    delta: "+6",
    trend: "up",
    confidence: "observed",
    series: sparkSeries(7),
    emphasis: "warn",
  },
  {
    label: "Duplicates Detected",
    value: "5",
    delta: "+2",
    trend: "up",
    confidence: "observed",
    series: sparkSeries(11),
  },
  {
    label: "Revenue at Risk",
    value: "₦2.14B",
    delta: "+₦120M",
    trend: "up",
    confidence: "inferred",
    series: sparkSeries(19),
    emphasis: "risk",
  },
  {
    label: "Confidence Score",
    value: "82%",
    delta: "+1.4%",
    trend: "up",
    confidence: "observed",
    series: sparkSeries(23),
    emphasis: "ok",
  },
  {
    label: "Open Investigations",
    value: "12",
    delta: "+3",
    trend: "up",
    confidence: "verified",
    series: sparkSeries(29),
  },
  {
    label: "High Alerts",
    value: "5",
    delta: "+1",
    trend: "up",
    confidence: "verified",
    series: sparkSeries(31),
    emphasis: "risk",
  },
  {
    label: "Medium / Low Alerts",
    value: "2 / 1",
    trend: "flat",
    confidence: "observed",
    series: sparkSeries(37),
  },
];

const STATUS_TABS = [
  { key: "all", label: "All Arrivals" },
  { key: "validated", label: "Validated" },
  { key: "pending", label: "Pending" },
  { key: "duplicate", label: "Duplicate" },
  { key: "amended", label: "Amended" },
];

export function ManifestCentre() {
  const [tab, setTab] = useState("all");
  const [statusTab, setStatusTab] = useState("all");
  const [selectedId, setSelectedId] = useState<string>("v-ocean-pearl");

  const filtered = useMemo(() => {
    if (statusTab === "all") return VESSELS;
    return VESSELS.filter((v) => v.status === statusTab);
  }, [statusTab]);

  const selected = VESSELS.find((v) => v.id === selectedId);
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: VESSELS.length };
    for (const s of ["validated", "pending", "duplicate", "amended"]) {
      counts[s] = VESSELS.filter((v) => v.status === s).length;
    }
    return counts;
  }, []);

  const timelineItems = filtered.map((v) => ({
    id: v.id,
    time: fmtTime(v.etaISO),
    title: v.name,
    subtitle: `${v.voyage} · ${portByCode(v.destinationPort)!.name}`,
    tone:
      v.riskLevel === "high"
        ? ("risk" as const)
        : v.riskLevel === "medium"
          ? ("warn" as const)
          : v.riskLevel === "low"
            ? ("ok" as const)
            : ("info" as const),
  }));

  return (
    <IntelCentreShell
      title="Manifest Intelligence"
      subtitle="Everything entering Nigeria. Monitor, analyse and act."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "arrivals", label: "Arrivals", count: VESSELS.length },
        { key: "validations", label: "Validations", count: 34 },
        { key: "duplicates", label: "Duplicates", count: 5 },
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
          <FilterSearch placeholder="Search vessel, IMO, agent…" />
          <FilterBlock label="Saved views">
            <SavedViewList
              views={["High risk arrivals", "Duplicates today", "Amended manifests"]}
            />
          </FilterBlock>
          <FilterBlock label="Time range">
            <CheckList
              options={["Last 24h", "Last 7d", "Last 30d"]}
              defaultChecked={["Last 24h"]}
            />
          </FilterBlock>
          <FilterBlock label="Port">
            <CheckList
              options={["Apapa", "Tin Can", "Onne", "Port Harcourt", "Calabar"]}
              defaultChecked={["Apapa", "Tin Can"]}
            />
          </FilterBlock>
          <FilterBlock label="Status">
            <CheckList options={["Validated", "Pending", "Duplicate", "Amended"]} />
          </FilterBlock>
          <FilterBlock label="Risk">
            <CheckList options={["High", "Medium", "Low"]} defaultChecked={["High", "Medium"]} />
          </FilterBlock>
          <FilterBlock label="Agency">
            <CheckList options={["NCS", "NPA", "NIMASA"]} />
          </FilterBlock>
          <FilterBlock label="Watchlists">
            <CheckList options={["High Risk Vessels", "Sanctioned Entities", "Repeat Offenders"]} />
          </FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {/* Status filter tabs (MAN-3) */}
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_TABS.map((t) => {
              const active = t.key === statusTab;
              const count = statusCounts[t.key] ?? 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setStatusTab(t.key)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium " +
                    (active
                      ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]"
                      : "border-line/60 bg-surface/50 text-slate hover:text-foreground")
                  }
                >
                  {t.label}
                  <span className="rounded bg-surface-2/60 px-1.5 py-0.5 text-[10px] text-slate">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Map + detail (MAN-2) */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="h-[380px]">
              <NigeriaMap
                vessels={filtered}
                selectedVesselId={selectedId}
                onSelectVessel={(v) => setSelectedId(v.id)}
                className="h-full"
              />
            </div>
            {selected && <VesselDetailPanel v={selected} />}
          </div>

          {/* Timeline (MAN-4) */}
          <Section title="Arrivals Timeline · Today">
            <TimelineStrip items={timelineItems} selectedId={selectedId} onSelect={setSelectedId} />
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Manifest Copilot"
          instance="manifest"
          observed={[
            {
              title: "Spike in high-risk manifests from Apapa Port",
              detail: "Observed +28% vs 7-day rolling average.",
              confidence: "observed",
            },
            {
              title: "AIS blackout observed on MT Niger Runner",
              detail: "18.7h gap prior to Calabar approach.",
              confidence: "observed",
            },
            {
              title: "Repeated agent: Sahara Cargo Nigeria",
              detail: "6 of 10 pending manifests use same agent.",
              confidence: "observed",
            },
          ]}
          recommendations={[
            {
              title: "Prioritise Ocean Pearl for manifest review",
              detail: "Risk 78 · pending validation · ETA 09:22 UTC.",
              confidence: "inferred",
            },
            {
              title: "Cross-check Delta Star duplicate BOLs",
              detail: "3 containers listed under two BOLs (DS-1904 / DS-1907).",
              confidence: "observed",
            },
            {
              title: "Escalate Niger Runner to compliance",
              detail: "OFAC SDN watchlist match observed on beneficial owner.",
              confidence: "verified",
            },
          ]}
          historical={[
            {
              title: "Ocean Pearl · Q4 2025",
              detail: "Similar risk profile → misclassification confirmed after inspection.",
              similarity: 84,
            },
            {
              title: "Delta Star · Aug 2025",
              detail: "Duplicate BOL pattern → ₦96M under-declaration recovered.",
              similarity: 71,
            },
          ]}
          related={[
            { ref: "INV-2412-01", title: "Ocean Pearl duty variance", status: "Open" },
            { ref: "INV-2412-03", title: "Niger Runner sanctions review", status: "Escalated" },
            { ref: "INV-2411-22", title: "Delta Freight repeat under-declare", status: "Open" },
          ]}
        />
      }
      evidenceBody={<EvidenceStrip />}
    />
  );
}

function VesselDetailPanel({ v }: { v: Vessel }) {
  const port = portByCode(v.destinationPort)!;
  return (
    <div className="rounded-lg border border-line/60 bg-surface/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-foreground">{v.name}</div>
          <div className="text-[11px] text-slate">
            {v.voyage} · IMO {v.imo} · MMSI {v.mmsi}
          </div>
        </div>
        <StatusBadge
          label={v.status.toUpperCase()}
          tone={v.status === "duplicate" ? "risk" : v.status === "pending" ? "warn" : "ok"}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        <Row k="Flag" v={v.flag} />
        <Row k="Agent" v={v.agent} />
        <Row k="Port" v={port.name} />
        <Row k="ETA" v={fmtTime(v.etaISO)} />
        <Row k="Owner" v={companyById(v.ownerId)?.name ?? "—"} />
        <Row k="Operator" v={companyById(v.operatorId)?.name ?? "—"} />
      </dl>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] text-slate">Risk</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-2/60">
          <div
            className="h-full"
            style={{
              width: `${v.riskScore}%`,
              background: v.riskScore >= 70 ? "#C0392B" : v.riskScore >= 40 ? "#B06A00" : "#1E6B3A",
            }}
          />
        </div>
        <span className="w-8 text-right text-[11px] font-semibold text-foreground">
          {v.riskScore}
        </span>
        <ConfidenceChip tier="observed" size={9} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <QuickAction label="Investigate" href={`/investigate/${v.id}`} />
        <QuickAction label="Entity Profile" href={`/entity/${v.id}`} />
        <QuickAction label="View Manifest" />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-slate">{k}</dt>
      <dd className="text-right text-foreground/90">{v}</dd>
    </>
  );
}

function QuickAction({ label, href }: { label: string; href?: string }) {
  const Cmp: React.ElementType = href ? "a" : "button";
  return (
    <Cmp
      href={href}
      className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-2/40 px-2 py-1 text-[11px] font-medium text-foreground/90 hover:bg-surface-2/70"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Cmp>
  );
}

/** Evidence panel (MAN-5) rendered in the shell's bottom evidence tab body. */
function EvidenceStrip() {
  const cols: Column<(typeof EVIDENCE)[number]>[] = [
    {
      key: "kind",
      label: "Document",
      render: (r) => <span className="font-semibold text-foreground">{r.kind}</span>,
    },
    {
      key: "ref",
      label: "Ref #",
      render: (r) => <span className="font-mono text-[11.5px]">{r.refNumber}</span>,
    },
    { key: "fmt", label: "Format", render: (r) => <StatusBadge label={r.format} tone="info" /> },
    { key: "up", label: "Uploaded", render: (r) => fmtTime(r.uploadedAt) },
    { key: "by", label: "By", render: (r) => r.uploadedBy },
    {
      key: "conf",
      label: "Confidence",
      align: "right",
      render: (r) => <ConfidenceChip tier={r.confidence} size={9} />,
    },
  ];
  return <DataTable columns={cols} rows={EVIDENCE.slice(0, 6)} rowKey={(r) => r.id} compact />;
}
