import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Columns3, Download, FileText, Upload } from "lucide-react";

import {
  CheckList, FilterBlock, FilterSearch, IntelCentreShell, SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/confidence-chip";
import { EVIDENCE, fmtTime, sparkSeries, vesselById } from "@/lib/intel-centre-data";

export const Route = createFileRoute("/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence Library · Seaphore" },
      { name: "description", content: "Document vault with audit-linked evidence for every investigation." },
    ],
  }),
  component: EvidenceCentre,
});

const KPIS: KpiSpec[] = [
  { label: "Items Total",           value: String(EVIDENCE.length), delta: "+2", trend: "up", confidence: "verified", series: sparkSeries(3) },
  { label: "Verified",              value: String(EVIDENCE.filter((e) => e.confidence === "verified").length), delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(6), emphasis: "ok" },
  { label: "Observed",              value: String(EVIDENCE.filter((e) => e.confidence === "observed").length), delta: "+1", trend: "up", confidence: "observed", series: sparkSeries(9) },
  { label: "Investigations Linked", value: String(new Set(EVIDENCE.map((e) => e.linkedInvestigation)).size), delta: "0", trend: "flat", confidence: "verified", series: sparkSeries(12) },
  { label: "Chain-of-Custody OK",   value: "100%", delta: "0", trend: "flat", confidence: "verified", series: sparkSeries(15), emphasis: "ok" },
  { label: "Storage Used",          value: "512 MB", delta: "+18MB", trend: "up", confidence: "verified", series: sparkSeries(18) },
  { label: "Confidence Score",      value: "91%", delta: "+0.4%", trend: "up", confidence: "verified", series: sparkSeries(21), emphasis: "ok" },
];

function EvidenceCentre() {
  const [tab, setTab] = useState("workspace");
  const [selectedId, setSelectedId] = useState<string>(EVIDENCE[0]!.id);
  const selected = EVIDENCE.find((e) => e.id === selectedId)!;
  const vessel = selected.linkedVesselId ? vesselById(selected.linkedVesselId) : undefined;

  return (
    <IntelCentreShell
      title="Evidence Library"
      subtitle="Document vault, linked to investigations, chain-of-custody preserved."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "documents", label: "Documents", count: EVIDENCE.length },
        { key: "audit",     label: "Chain of Custody" },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      tabTrailing={
        <>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Upload className="h-3 w-3" /> Upload</button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Download className="h-3 w-3" /> Export</button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Columns3 className="h-3 w-3" /> Columns</button>
        </>
      }
      filters={
        <>
          <FilterSearch placeholder="Search reference, vessel, uploader…" />
          <FilterBlock label="Kind"><CheckList options={["Bill of Lading", "Manifest", "Invoice", "Cargo Declaration", "Inspection Report", "Photo", "AIS Snapshot", "Certificate", "Payment Receipt", "Container List"]} /></FilterBlock>
          <FilterBlock label="Format"><CheckList options={["PDF", "XML", "CSV", "JSON", "JPG", "PNG"]} /></FilterBlock>
          <FilterBlock label="Confidence"><CheckList options={["Verified", "Observed", "Inferred"]} defaultChecked={["Verified", "Observed"]} /></FilterBlock>
          <FilterBlock label="Saved views"><SavedViewList views={["My uploads", "Today", "Verified only"]} /></FilterBlock>
        </>
      }
      main={
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {/* EVI-1 grid of thumbnails */}
            <Section title="Evidence Grid (EVI-1)">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                {EVIDENCE.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={
                      "group flex flex-col rounded-md border p-2 text-left transition-colors " +
                      (e.id === selectedId
                        ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10"
                        : "border-line/60 bg-surface/50 hover:bg-surface/70")
                    }
                  >
                    <div className="flex h-16 items-center justify-center rounded bg-surface-2/40 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate">
                      {e.format}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.06em] text-slate">
                      <FileText className="h-3 w-3" /> {e.kind}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] font-semibold text-foreground">{e.refNumber}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-slate">{fmtTime(e.uploadedAt)}</span>
                      <ConfidenceChip tier={e.confidence} size={9} />
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Document Table (EVI-2)">
              <DataTable
                columns={[
                  { key: "r", label: "Reference", render: (r: typeof EVIDENCE[number]) => <span className="font-mono text-[11.5px]">{r.refNumber}</span> },
                  { key: "k", label: "Kind",      render: (r) => r.kind },
                  { key: "f", label: "Format",    render: (r) => <StatusBadge label={r.format} tone="info" /> },
                  { key: "v", label: "Vessel",    render: (r) => r.linkedVesselId ? vesselById(r.linkedVesselId)?.name : "—" },
                  { key: "u", label: "Uploaded",  render: (r) => fmtTime(r.uploadedAt) },
                  { key: "b", label: "By",        render: (r) => r.uploadedBy },
                  { key: "i", label: "Case",      render: (r) => <span className="font-mono text-[11px]">{r.linkedInvestigation ?? "—"}</span> },
                  { key: "c", label: "Confidence", align: "right", render: (r) => <ConfidenceChip tier={r.confidence} size={9} /> },
                ]}
                rows={EVIDENCE}
                rowKey={(r) => r.id}
                onRowClick={(r) => setSelectedId(r.id)}
                compact
              />
            </Section>
          </div>

          {/* EVI-3 detail + custody */}
          <Section title="Evidence Detail">
            <div className="mb-2 text-[13px] font-semibold text-foreground">{selected.refNumber}</div>
            <div className="text-[11px] text-slate">{selected.kind} · {selected.format} · {selected.sizeKb} KB</div>
            <div className="mt-3 space-y-1.5 text-[11.5px]">
              <RowKV k="Vessel"        v={vessel?.name ?? "—"} />
              <RowKV k="Investigation" v={selected.linkedInvestigation ?? "—"} />
              <RowKV k="Uploaded"      v={fmtTime(selected.uploadedAt)} />
              <RowKV k="Uploaded by"   v={selected.uploadedBy} />
              <div className="flex items-center justify-between">
                <span className="text-slate">Confidence</span>
                <ConfidenceChip tier={selected.confidence} size={11} />
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-[10.5px] uppercase tracking-[0.06em] text-slate">Chain of Custody</div>
              <ol className="space-y-1.5">
                {[
                  { at: fmtTime(selected.uploadedAt), by: selected.uploadedBy, action: "Uploaded" },
                  { at: fmtTime(selected.uploadedAt), by: "System",            action: "SHA-256 recorded" },
                  { at: fmtTime(selected.uploadedAt), by: "System",            action: "Linked to " + (selected.linkedInvestigation ?? "n/a") },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-2 rounded border border-line/50 bg-surface/50 p-1.5 text-[11px]">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-blue)]" />
                    <div>
                      <div className="text-foreground/90">{s.action}</div>
                      <div className="text-[10px] text-slate">{s.at} · {s.by}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Evidence Copilot"
          observed={[
            { title: "Manifest + BOL agree",  detail: "MSC-OP-2412-01 hashes align across submissions.", confidence: "verified" },
            { title: "Photo metadata intact", detail: "IMG-DS-1907-A EXIF preserved, no re-encode observed.", confidence: "observed" },
          ]}
          recommendations={[
            { title: "Request additional PSC certificate", detail: "For MT Gulf Trader before berth allocation.", confidence: "observed" },
          ]}
          historical={[
            { title: "Similar bundle · Q1 2026", detail: "Same evidence pattern supported clean clearance.", similarity: 66 },
          ]}
          related={[
            { ref: "INV-2412-01", title: "Ocean Pearl duty variance", status: "Open" },
          ]}
        />
      }
    />
  );
}

function RowKV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate">{k}</span>
      <span className="text-right text-foreground/90">{v}</span>
    </div>
  );
}
