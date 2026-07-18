import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Download, LineChart, Minus } from "lucide-react";

import {
  CheckList, FilterBlock, FilterSearch, IntelCentreShell, SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, Sparkline, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, TimelineStrip } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { NigeriaMap } from "@/components/intel-centre/nigeria-map";
import {
  PORTS, REVENUE_BY_TYPE, REVENUE_FUNNEL, REVENUE_WATERFALL,
  TOP_COMPANIES_AT_RISK, TOP_RISK_PORTS, VESSELS, fmtTime, naira, sparkSeries,
} from "@/lib/intel-centre-data";

export const Route = createFileRoute("/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue Intelligence · Seaphore" },
      { name: "description", content: "Protect government revenue. Monitor, analyse and act." },
    ],
  }),
  component: RevenueCentre,
});

const KPIS: KpiSpec[] = [
  { label: "Revenue at Risk",       value: "₦6.8B",  delta: "+₦420M", trend: "up",   confidence: "inferred", series: sparkSeries(71), emphasis: "risk" },
  { label: "Recovered Today",       value: "₦280M",  delta: "+₦42M",  trend: "up",   confidence: "verified", series: sparkSeries(73), emphasis: "ok" },
  { label: "Pending Assessment",    value: "34",     delta: "+7",     trend: "up",   confidence: "observed", series: sparkSeries(79), emphasis: "warn" },
  { label: "3% Levy Expected",      value: "₦4.95B", delta: "+₦88M",  trend: "up",   confidence: "inferred", series: sparkSeries(83) },
  { label: "Confidence Score",      value: "80%",    delta: "+0.4%",  trend: "up",   confidence: "observed", series: sparkSeries(89), emphasis: "ok" },
  { label: "Open Investigations",   value: "16",     delta: "+2",     trend: "up",   confidence: "verified", series: sparkSeries(91) },
  { label: "Alerts",                value: "9",      delta: "+3",     trend: "up",   confidence: "verified", series: sparkSeries(97), emphasis: "risk" },
];

const HEADLINE = [
  { label: "Expected Revenue",  value: 44_200_000_000, delta: "+3.4%",  trend: "up"   as const, series: sparkSeries(11) },
  { label: "Actual Revenue",    value: 34_600_000_000, delta: "+1.2%",  trend: "up"   as const, series: sparkSeries(13) },
  { label: "Revenue Leakage",   value:  6_400_000_000, delta: "+2.1%",  trend: "up"   as const, series: sparkSeries(17) },
  { label: "Outstanding",       value:  6_800_000_000, delta: "-1.0%",  trend: "down" as const, series: sparkSeries(19) },
  { label: "3% Levy Collected", value:  4_950_000_000, delta: "+4.7%",  trend: "up"   as const, series: sparkSeries(23) },
];

function RevenueCentre() {
  const [tab, setTab] = useState("workspace");

  const timeline = VESSELS.slice(0, 8).map((v) => ({
    id: v.id,
    time: fmtTime(v.etaISO),
    title: v.name,
    subtitle: `Assessed ${naira(2_400_000 + parseInt(v.mmsi.slice(-4)))} · ${v.voyage}`,
    tone: v.riskLevel === "high" ? "risk" as const : v.riskLevel === "medium" ? "warn" as const : "ok" as const,
  }));

  return (
    <IntelCentreShell
      title="Revenue Intelligence"
      subtitle="Protect government revenue. Monitor, analyse and act."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "assessments", label: "Assessments", count: 34 },
        { key: "leakage",   label: "Leakage" },
        { key: "levy",      label: "3% Levy" },
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
          <FilterSearch placeholder="Search company, port, voyage…" />
          <FilterBlock label="Saved views"><SavedViewList views={["Top leakage ports", "3% Levy audit", "Repeat under-declare"]} /></FilterBlock>
          <FilterBlock label="Time range"><CheckList options={["Today", "Last 7d", "Last 30d", "FY 2026"]} defaultChecked={["Today"]} /></FilterBlock>
          <FilterBlock label="Port"><CheckList options={PORTS.map((p) => p.name)} defaultChecked={["Apapa Port"]} /></FilterBlock>
          <FilterBlock label="Revenue type"><CheckList options={REVENUE_BY_TYPE.map((r) => r.type)} /></FilterBlock>
          <FilterBlock label="Risk"><CheckList options={["High", "Medium", "Low"]} defaultChecked={["High"]} /></FilterBlock>
          <FilterBlock label="Agency"><CheckList options={["NCS", "FIRS", "NIMASA"]} /></FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {/* REV-2 headline strip */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {HEADLINE.map((h) => (
              <div key={h.label} className="rounded-lg border border-line/60 bg-surface/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-slate">{h.label}</span>
                  <ConfidenceChip tier="inferred" size={9} />
                </div>
                <div className="mt-1 text-[18px] font-semibold text-foreground">{naira(h.value)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className={
                    "inline-flex items-center gap-0.5 text-[10.5px] font-medium " +
                    (h.trend === "up" ? "text-[color:var(--color-red)]" : h.trend === "down" ? "text-[color:var(--color-green)]" : "text-slate")
                  }>
                    {h.trend === "up" ? <ArrowUp className="h-2.5 w-2.5" /> : h.trend === "down" ? <ArrowDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                    {h.delta}
                  </span>
                  <Sparkline data={h.series} trend={h.trend} />
                </div>
              </div>
            ))}
          </div>

          {/* Funnel + Waterfall + Donut */}
          <div className="grid gap-3 xl:grid-cols-3">
            <Section title="Revenue Funnel"><RevenueFunnel /></Section>
            <Section title="Revenue Waterfall"><RevenueWaterfall /></Section>
            <Section title="Revenue by Type"><RevenueDonut /></Section>
          </div>

          {/* Leakage heatmap + tables */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Section title="Revenue Leakage Heatmap">
              <div className="h-[280px]"><NigeriaMap variant="heatmap" className="h-full" /></div>
            </Section>
            <Section title="Top Risk Ports">
              <DataTable
                columns={[
                  { key: "p", label: "Port", render: (r: typeof TOP_RISK_PORTS[number]) => r.port },
                  { key: "r", label: "Revenue at Risk", align: "right", render: (r) => naira(r.revenueAtRiskNGN) },
                  { key: "c", label: "%", align: "right", render: (r) => `${r.contributionPct}%` },
                  { key: "t", label: "Trend", align: "center", render: (r) => <TrendCell trend={r.trend} /> },
                ]}
                rows={TOP_RISK_PORTS}
                rowKey={(r) => r.code}
                compact
              />
            </Section>
          </div>

          <Section title="Top Companies by Revenue at Risk">
            <DataTable
              columns={[
                { key: "c", label: "Company", render: (r: typeof TOP_COMPANIES_AT_RISK[number]) => <span className="font-semibold text-foreground">{r.company}</span> },
                { key: "r", label: "Revenue at Risk", align: "right", render: (r) => naira(r.revenueAtRiskNGN) },
                { key: "s", label: "Risk Score", align: "right", render: (r) => <span className="font-semibold">{r.riskScore}</span> },
                { key: "t", label: "Trend", align: "center", render: (r) => <TrendCell trend={r.trend} /> },
                { key: "co", label: "Confidence", align: "right", render: () => <ConfidenceChip tier="inferred" size={9} /> },
              ]}
              rows={TOP_COMPANIES_AT_RISK}
              rowKey={(r) => r.company}
              compact
            />
          </Section>

          <Section title="Revenue Events · Today (REV-9)">
            <TimelineStrip items={timeline} />
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Revenue Assurance Copilot"
          instance="revenue"
          observed={[
            { title: "Leakage concentrated at Apapa", detail: "Observed 38% of at-risk revenue attributed to Apapa Port.",     confidence: "observed" },
            { title: "3% Levy shortfall on tankers",   detail: "Assessed vs expected variance ↑ 4.7% on Tanker class.",         confidence: "inferred" },
            { title: "Repeat under-declaration",       detail: "Trident Maritime Group crossed 3-strike threshold this month.", confidence: "observed" },
          ]}
          recommendations={[
            { title: "Trigger valuation review — MSCU7811203", detail: "Duty exposure ₦88M · confidence 82.",                    confidence: "inferred" },
            { title: "Audit Trident Maritime FY assessments",   detail: "5 open exceptions over ₦100M threshold.",               confidence: "observed" },
            { title: "Recovery action on outstanding ₦6.8B",    detail: "Officer sign-off required.",                            confidence: "verified" },
          ]}
          historical={[
            { title: "Delta Freight · Nov 2025", detail: "Under-declaration pattern → ₦412M recovered post-review.", similarity: 74 },
            { title: "Sahara Cargo · Q1 2026",   detail: "3% Levy shortfall → officer decision restored ₦140M.",     similarity: 61 },
          ]}
          related={[
            { ref: "INV-2412-01", title: "Ocean Pearl duty variance", status: "Open" },
            { ref: "INV-2411-22", title: "Delta Freight repeat under-declare", status: "Open" },
          ]}
        />
      }
    />
  );
}

function TrendCell({ trend }: { trend: "up" | "down" | "flat" }) {
  const Icon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const colour = trend === "up" ? "text-[color:var(--color-red)]" : trend === "down" ? "text-[color:var(--color-green)]" : "text-slate";
  return <Icon className={`inline h-3 w-3 ${colour}`} />;
}

function RevenueFunnel() {
  const max = Math.max(...REVENUE_FUNNEL.map((r) => r.valueNGN));
  return (
    <div className="space-y-2">
      {REVENUE_FUNNEL.map((r, i) => {
        const pct = (r.valueNGN / max) * 100;
        const conv = i > 0 ? ((r.valueNGN / REVENUE_FUNNEL[i - 1]!.valueNGN) * 100).toFixed(0) : "100";
        return (
          <div key={r.stage}>
            <div className="mb-0.5 flex items-center justify-between text-[11px]">
              <span className="text-foreground/90">{r.stage}</span>
              <span className="font-semibold text-foreground">{naira(r.valueNGN)}</span>
            </div>
            <div className="h-6 overflow-hidden rounded bg-surface-2/40">
              <div className="flex h-full items-center justify-end pr-2 text-[10px] font-semibold text-white"
                style={{ width: `${pct}%`, background: "linear-gradient(90deg, #2563EB, #1E6B3A)" }}>
                {conv}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RevenueWaterfall() {
  const max = 46_000_000_000;
  const leakage = REVENUE_WATERFALL.find((r) => r.kind === "leak")!;
  const leakPct = ((Math.abs(leakage.valueNGN) / 44_200_000_000) * 100).toFixed(1);
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold text-[color:var(--color-red)]">{leakPct}%</span>
        <span className="text-[11px] text-slate">Leakage rate</span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 160 }}>
        {REVENUE_WATERFALL.map((r) => {
          const h = (Math.abs(r.valueNGN) / max) * 100;
          const colour =
            r.kind === "start" || r.kind === "end" ? "#2563EB" :
            r.kind === "pos" ? "#1E6B3A" :
            r.kind === "leak" ? "#C0392B" :
            "#B06A00";
          return (
            <div key={r.stage} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t" style={{ height: `${h}%`, background: colour, opacity: r.kind === "start" || r.kind === "end" ? 1 : 0.85 }} />
              <div className="text-[9.5px] text-slate">{r.stage}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevenueDonut() {
  const R = 60, C = 2 * Math.PI * R;
  const total = REVENUE_BY_TYPE.reduce((a, b) => a + b.amountNGN, 0);
  let offset = 0;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 160 160" className="h-[160px] w-[160px]">
        <g transform="translate(80 80) rotate(-90)">
          <circle r={R} fill="none" stroke="#132032" strokeWidth={22} />
          {REVENUE_BY_TYPE.map((s) => {
            const pct = s.amountNGN / total;
            const len = pct * C;
            const el = <circle key={s.type} r={R} fill="none" stroke={s.colour} strokeWidth={22} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </g>
        <text x="80" y="78" textAnchor="middle" fill="#E4E8EC" fontSize="14" fontWeight={700}>{naira(total)}</text>
        <text x="80" y="94" textAnchor="middle" fill="#5A6B7B" fontSize="9">collected</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-[11px]">
        {REVENUE_BY_TYPE.map((s) => (
          <li key={s.type} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-foreground/90">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.colour }} />
              {s.type}
            </span>
            <span className="font-semibold text-foreground">
              {naira(s.amountNGN)} · {((s.amountNGN / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
