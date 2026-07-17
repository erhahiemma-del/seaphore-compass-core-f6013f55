import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Columns3, Download } from "lucide-react";

import {
  CheckList, FilterBlock, FilterSearch, IntelCentreShell, SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/confidence-chip";
import { ALERTS, fmtTime, sparkSeries, vesselById, type AlertItem, type AlertStatus } from "@/lib/intel-centre-data";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts Center · Seaphore" },
      { name: "description", content: "Live intelligence alerts across every centre." },
    ],
  }),
  component: AlertsCentre,
});

const KPIS: KpiSpec[] = [
  { label: "Live Alerts",       value: String(ALERTS.length), delta: "+2", trend: "up", confidence: "verified", series: sparkSeries(2) },
  { label: "New",               value: String(ALERTS.filter((a) => a.status === "NEW").length), delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(5), emphasis: "risk" },
  { label: "Acknowledged",      value: String(ALERTS.filter((a) => a.status === "ACK").length), delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(8) },
  { label: "Resolved (24h)",    value: String(ALERTS.filter((a) => a.status === "RESOLVED").length), delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(11), emphasis: "ok" },
  { label: "High Severity",     value: String(ALERTS.filter((a) => a.severity === "high").length), delta: "+1", trend: "up", confidence: "observed", series: sparkSeries(14), emphasis: "risk" },
  { label: "Median Time to Ack",value: "6m", delta: "-1m", trend: "down", confidence: "observed", series: sparkSeries(17), emphasis: "ok" },
  { label: "Confidence Score",  value: "89%", delta: "+0.3%", trend: "up", confidence: "verified", series: sparkSeries(20), emphasis: "ok" },
];

function AlertsCentre() {
  const [tab, setTab] = useState("workspace");
  const [filterStatus, setFilterStatus] = useState<AlertStatus | "ALL">("ALL");
  const [ackMap, setAckMap] = useState<Record<string, AlertStatus>>({});

  const decorated = useMemo<AlertItem[]>(
    () => ALERTS.map((a) => ({ ...a, status: ackMap[a.id] ?? a.status })),
    [ackMap],
  );
  const shown = decorated.filter((a) => filterStatus === "ALL" || a.status === filterStatus);

  const setStatus = (id: string, s: AlertStatus) =>
    setAckMap((prev) => ({ ...prev, [id]: s }));

  return (
    <IntelCentreShell
      title="Alerts Center"
      subtitle="Live intelligence alerts across every centre."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "new",       label: "New",          count: decorated.filter((a) => a.status === "NEW").length },
        { key: "ack",       label: "Acknowledged", count: decorated.filter((a) => a.status === "ACK").length },
        { key: "resolved",  label: "Resolved",     count: decorated.filter((a) => a.status === "RESOLVED").length },
      ]}
      activeTab={tab}
      onTabChange={(k) => {
        setTab(k);
        setFilterStatus(k === "new" ? "NEW" : k === "ack" ? "ACK" : k === "resolved" ? "RESOLVED" : "ALL");
      }}
      tabTrailing={
        <>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Download className="h-3 w-3" /> Export</button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Columns3 className="h-3 w-3" /> Columns</button>
        </>
      }
      filters={
        <>
          <FilterSearch placeholder="Search alert, vessel, type…" />
          <FilterBlock label="Severity"><CheckList options={["High", "Medium", "Low", "Info"]} defaultChecked={["High", "Medium"]} /></FilterBlock>
          <FilterBlock label="Type"><CheckList options={["High Risk Arrival", "AIS Blackout Observed", "Duplicate Manifest Observed", "Revenue Discrepancy Observed", "Watchlist Match", "Dangerous Goods", "Late Submission"]} /></FilterBlock>
          <FilterBlock label="Confidence"><CheckList options={["Verified", "Observed", "Inferred"]} defaultChecked={["Verified", "Observed"]} /></FilterBlock>
          <FilterBlock label="Saved views"><SavedViewList views={["My queue", "Sanctions matches", "Overdue > 30m"]} /></FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {/* ALE-1 live feed */}
          <Section title="Live Feed (ALE-1)">
            <ul className="space-y-1.5">
              {shown.map((a) => {
                const vessel = a.vesselId ? vesselById(a.vesselId) : undefined;
                const tone = a.severity === "high" ? "risk" : a.severity === "medium" ? "warn" : a.severity === "low" ? "ok" : "info";
                return (
                  <li key={a.id} className="rounded-md border border-line/60 bg-surface/50 p-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <StatusBadge label={a.severity.toUpperCase()} tone={tone} />
                          <StatusBadge label={a.status} tone={a.status === "NEW" ? "risk" : a.status === "ACK" ? "warn" : "ok"} />
                          <span className="text-[10.5px] uppercase tracking-[0.06em] text-slate">{a.type}</span>
                        </div>
                        <div className="truncate text-[13px] font-semibold text-foreground">{a.title}</div>
                        <div className="truncate text-[11.5px] text-foreground/80">{a.detail}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10.5px] text-slate">
                          <span>{fmtTime(a.timeISO)}</span>
                          {vessel && <span>· {vessel.name} · IMO {vessel.imo}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <ConfidenceChip tier={a.confidence} size={9} />
                        <div className="flex gap-1">
                          {a.status === "NEW" && (
                            <button
                              onClick={() => setStatus(a.id, "ACK")}
                              className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-2/40 px-1.5 py-0.5 text-[10.5px] text-foreground/85 hover:bg-surface-2/60"
                            >
                              <Bell className="h-2.5 w-2.5" /> Acknowledge
                            </button>
                          )}
                          {a.status !== "RESOLVED" && (
                            <button
                              onClick={() => setStatus(a.id, "RESOLVED")}
                              className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-2/40 px-1.5 py-0.5 text-[10.5px] text-foreground/85 hover:bg-surface-2/60"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5" /> Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="rounded border border-line/60 bg-surface/40 p-6 text-center text-[12px] text-slate">
                  No alerts in this view.
                </li>
              )}
            </ul>
          </Section>

          {/* ALE-2 severity breakdown */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Section title="Severity Breakdown (ALE-2)">
              <SeverityBars items={decorated} />
            </Section>
            <Section title="Alert Table (ALE-3)">
              <DataTable
                columns={[
                  { key: "t", label: "Time", render: (r: AlertItem) => fmtTime(r.timeISO) },
                  { key: "y", label: "Type", render: (r) => r.type },
                  { key: "n", label: "Title", render: (r) => r.title },
                  { key: "s", label: "Severity", render: (r) => <StatusBadge label={r.severity.toUpperCase()} tone={r.severity === "high" ? "risk" : r.severity === "medium" ? "warn" : "ok"} /> },
                  { key: "st", label: "Status", render: (r) => <StatusBadge label={r.status} tone={r.status === "NEW" ? "risk" : r.status === "ACK" ? "warn" : "ok"} /> },
                  { key: "c", label: "Confidence", align: "right", render: (r) => <ConfidenceChip tier={r.confidence} size={9} /> },
                ]}
                rows={decorated}
                rowKey={(r) => r.id}
                compact
              />
            </Section>
          </div>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Alerts Copilot"
          observed={[
            { title: "3 high-severity NEW",      detail: "Sanctions, duplicate manifest and revenue gap open in parallel.", confidence: "verified" },
            { title: "Median ack time down 1m",  detail: "Officer response improving vs last shift.",                        confidence: "observed" },
            { title: "AIS blackouts clustered",  detail: "2 vessels in Gulf of Guinea show gaps > 6h today.",                confidence: "observed" },
          ]}
          recommendations={[
            { title: "Prioritise MT Niger Runner alert", detail: "Verified sanctions match · escalate to Compliance.", confidence: "verified" },
            { title: "Batch-acknowledge Late Submission alerts", detail: "3 low-severity items · officer sign-off required.", confidence: "observed" },
          ]}
          historical={[
            { title: "Same alert cluster · Q4 2025", detail: "Officer investigation yielded ₦640M recovered.", similarity: 71 },
          ]}
          related={[
            { ref: "INV-2412-03", title: "Niger Runner sanctions review", status: "Escalated" },
            { ref: "INV-2412-01", title: "Ocean Pearl duty variance",     status: "Open" },
          ]}
        />
      }
    />
  );
}

function SeverityBars({ items }: { items: AlertItem[] }) {
  const buckets: { label: string; count: number; colour: string }[] = [
    { label: "High",   count: items.filter((a) => a.severity === "high").length,   colour: "#C0392B" },
    { label: "Medium", count: items.filter((a) => a.severity === "medium").length, colour: "#B06A00" },
    { label: "Low",    count: items.filter((a) => a.severity === "low").length,    colour: "#1E6B3A" },
    { label: "Info",   count: items.filter((a) => a.severity === "info").length,   colour: "#2563EB" },
  ];
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="space-y-2">
      {buckets.map((b) => (
        <div key={b.label}>
          <div className="mb-0.5 flex items-center justify-between text-[11px]">
            <span className="text-foreground/90">{b.label}</span>
            <span className="font-semibold text-foreground">{b.count}</span>
          </div>
          <div className="h-4 overflow-hidden rounded bg-surface-2/40">
            <div style={{ width: `${(b.count / max) * 100}%`, background: b.colour, height: "100%" }} />
          </div>
        </div>
      ))}
      <div className="pt-1 text-[10.5px] text-slate">
        <AlertTriangle className="mr-1 inline h-2.5 w-2.5 text-[color:var(--color-amber)]" />
        System-observed signals only. Officer sign-off required for action.
      </div>
    </div>
  );
}
