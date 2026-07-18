import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Columns3, Download, LineChart } from "lucide-react";

import {
  CheckList, FilterBlock, FilterSearch, IntelCentreShell, SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { OwnershipGraph } from "@/components/intel-centre/ownership-graph";
import { COMPANIES, OWNERSHIP_EDGES, VESSELS, companyById, sparkSeries } from "@/lib/intel-centre-data";



const KPIS: KpiSpec[] = [
  { label: "Entities Tracked",       value: String(COMPANIES.length + VESSELS.length), delta: "+3", trend: "up", confidence: "verified", series: sparkSeries(5) },
  { label: "Beneficial-Owner Chains",value: String(OWNERSHIP_EDGES.filter((e) => e.label === "beneficial-owner").length), delta: "+1", trend: "up", confidence: "inferred", series: sparkSeries(8), emphasis: "warn" },
  { label: "Inferred Links",         value: String(OWNERSHIP_EDGES.filter((e) => e.confidence === "inferred").length), delta: "+2", trend: "up", confidence: "inferred", series: sparkSeries(11) },
  { label: "Sanctions Overlap",      value: "2", delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(14), emphasis: "risk" },
  { label: "Verified Owners",        value: String(OWNERSHIP_EDGES.filter((e) => e.confidence === "verified").length), delta: "0", trend: "flat", confidence: "verified", series: sparkSeries(17), emphasis: "ok" },
  { label: "Confidence Score",       value: "78%", delta: "-0.4%", trend: "down", confidence: "observed", series: sparkSeries(20) },
  { label: "Open Investigations",    value: "5", delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(23) },
];

export function OwnershipCentre() {
  const [tab, setTab] = useState("workspace");
  const [selectedId, setSelectedId] = useState<string>("co-trident");
  const centered = companyById(selectedId);

  const entities = [...COMPANIES.map((c) => ({ id: c.id, name: c.name, kind: "Company" as const, meta: c.role, verified: c.verified })),
                    ...VESSELS.map((v)   => ({ id: v.id, name: v.name, kind: "Vessel" as const,  meta: v.type, verified: "verified" as const }))];

  return (
    <IntelCentreShell
      title="Ownership Intelligence"
      subtitle="Beneficial ownership, corporate tree and inferred links."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "chains",    label: "Chains",   count: OWNERSHIP_EDGES.length },
        { key: "corporate", label: "Corporate Tree" },
        { key: "resolution", label: "Entity Resolution" },
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
          <FilterSearch placeholder="Search entity, IMO, RC number…" />
          <FilterBlock label="Entity">
            <ul className="scrollbar-thin max-h-[240px] space-y-0.5 overflow-y-auto">
              {entities.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setSelectedId(e.id)}
                    className={
                      "flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[12px] " +
                      (e.id === selectedId ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]" : "text-foreground/80 hover:bg-surface-2/50")
                    }
                  >
                    <span className="truncate">{e.name}</span>
                    <span className="ml-2 text-[9.5px] uppercase text-slate">{e.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </FilterBlock>
          <FilterBlock label="Edge type"><CheckList options={["owns", "operates", "manages", "insures", "beneficial-owner", "agent-of", "subsidiary-of", "associated-with"]} defaultChecked={["owns", "beneficial-owner"]} /></FilterBlock>
          <FilterBlock label="Confidence"><CheckList options={["Verified", "Observed", "Inferred", "Unconfirmed"]} defaultChecked={["Verified", "Observed"]} /></FilterBlock>
          <FilterBlock label="Saved views"><SavedViewList views={["High-risk chains", "Cross-jurisdiction", "Repeat beneficial owners"]} /></FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          <Section title={`Ownership Chain (OWN-1) · centered on ${centered?.name ?? "—"}`}>
            <OwnershipGraph centerId={selectedId} edges={OWNERSHIP_EDGES} height={340} />
          </Section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Section title="Corporate Profile">
              {centered ? (
                <>
                  <div className="mb-2 text-[14px] font-semibold text-foreground">{centered.name}</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
                    {[
                      ["Role", centered.role],
                      ["Country", centered.country],
                      ["RC Number", centered.cacNumber ?? "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate">{k}</dt>
                        <dd className="flex items-center justify-end gap-1.5 text-right text-foreground/90">
                          {v} <ConfidenceChip tier={centered.verified} size={9} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <div className="text-[12px] text-slate">Vessel selected — see Vessel Intelligence for full profile.</div>
              )}
            </Section>

            <Section title="Edge Summary">
              <DataTable
                columns={[
                  { key: "l", label: "Edge",     render: (r: typeof OWNERSHIP_EDGES[number]) => r.label },
                  { key: "s", label: "Source",   render: (r) => r.sourceNote },
                  { key: "c", label: "Confidence", align: "right", render: (r) => <ConfidenceChip tier={r.confidence} size={9} /> },
                ]}
                rows={OWNERSHIP_EDGES.filter((e) => e.fromId === selectedId || e.toId === selectedId)}
                rowKey={(r, i) => `${r.fromId}-${r.toId}-${i}`}
                compact
                emptyLabel="No edges for this entity."
              />
            </Section>
          </div>

          <Section title="All Ownership Edges (OWN-2)">
            <DataTable
              columns={[
                { key: "f", label: "From", render: (r: typeof OWNERSHIP_EDGES[number]) => nameOf(r.fromId) },
                { key: "e", label: "Edge", render: (r) => <StatusBadge label={r.label} tone={r.label === "beneficial-owner" ? "warn" : r.label === "owns" ? "info" : "neutral"} /> },
                { key: "t", label: "To",   render: (r) => nameOf(r.toId) },
                { key: "s", label: "Source", render: (r) => r.sourceNote },
                { key: "c", label: "Confidence", align: "right", render: (r) => <ConfidenceChip tier={r.confidence} size={9} /> },
              ]}
              rows={OWNERSHIP_EDGES}
              rowKey={(r, i) => `${r.fromId}-${r.toId}-${i}`}
              compact
            />
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Ownership Copilot"
          observed={[
            { title: "Beneficial-owner overlap",   detail: "Trident Maritime linked to 3 apparently-independent entities.", confidence: "inferred" },
            { title: "Sanctions overlap",          detail: "1 sanctioned vessel shares director pattern with clean fleet.", confidence: "verified" },
            { title: "Cross-jurisdiction cluster", detail: "PA + CY + AE nodes cluster around 2 shared PO Box addresses.",  confidence: "inferred" },
          ]}
          recommendations={[
            { title: "Escalate to Compliance Centre", detail: "Verified sanctions overlap detected.",             confidence: "verified" },
            { title: "Request CAC extract on Delta Freight", detail: "Cross-check director list vs public filings.", confidence: "observed" },
          ]}
          historical={[
            { title: "Trident cluster · 2024", detail: "Similar pattern led to freeze on 2 subsidiaries.", similarity: 82 },
          ]}
          related={[
            { ref: "INV-2412-03", title: "Niger Runner sanctions review", status: "Escalated" },
          ]}
        />
      }
    />
  );
}

function nameOf(id: string) {
  return companyById(id)?.name ?? VESSELS.find((v) => v.id === id)?.name ?? id;
}
