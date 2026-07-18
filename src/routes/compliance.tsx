import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Columns3, Download, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  CheckList, FilterBlock, FilterSearch, IntelCentreShell, SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section, StatusBadge } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { ENTITY_DISAMBIGUATION, PEP_SCREEN, VESSELS, WATCHLISTS, sparkSeries } from "@/lib/intel-centre-data";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance Intelligence · Seaphore" },
      { name: "description", content: "Sanctions screening, PEP checks and entity resolution." },
    ],
  }),
  component: ComplianceCentre,
});

const KPIS: KpiSpec[] = [
  { label: "Screenings Today",      value: "142", delta: "+18", trend: "up", confidence: "verified", series: sparkSeries(4) },
  { label: "Sanctions Hits",        value: String(VESSELS.filter((v) => v.sanctionsHit).length), delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(7), emphasis: "risk" },
  { label: "PEP Hits",              value: String(PEP_SCREEN.filter((p) => p.hit).length), delta: "0", trend: "flat", confidence: "observed", series: sparkSeries(10), emphasis: "warn" },
  { label: "Entity Conflicts",      value: String(ENTITY_DISAMBIGUATION.length), delta: "+1", trend: "up", confidence: "observed", series: sparkSeries(13) },
  { label: "Confidence Score",      value: "88%", delta: "+0.6%", trend: "up", confidence: "verified", series: sparkSeries(16), emphasis: "ok" },
  { label: "Watchlists Active",     value: String(WATCHLISTS.length), delta: "0", trend: "flat", confidence: "verified", series: sparkSeries(19) },
  { label: "Open Investigations",   value: "6", delta: "+1", trend: "up", confidence: "verified", series: sparkSeries(22) },
];

function ComplianceCentre() {
  const [tab, setTab] = useState("workspace");

  return (
    <IntelCentreShell
      title="Compliance Intelligence"
      subtitle="Sanctions, PEP screening, watchlists and entity resolution."
      kpiRibbon={<KpiRibbon items={KPIS} />}
      tabs={[
        { key: "workspace",  label: "Workspace" },
        { key: "sanctions",  label: "Sanctions" },
        { key: "pep",        label: "PEP" },
        { key: "resolution", label: "Entity Resolution" },
        { key: "watchlists", label: "Watchlists", count: WATCHLISTS.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      tabTrailing={
        <>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Download className="h-3 w-3" /> Export</button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50"><Columns3 className="h-3 w-3" /> Columns</button>
        </>
      }
      filters={
        <>
          <FilterSearch placeholder="Search entity, name, alias…" />
          <FilterBlock label="Source lists"><CheckList options={["OFAC SDN", "UN Consolidated", "EU Sanctions", "UK OFSI", "NFIU PEP"]} defaultChecked={["OFAC SDN", "UN Consolidated"]} /></FilterBlock>
          <FilterBlock label="Match confidence"><CheckList options={["Verified", "Observed", "Inferred"]} defaultChecked={["Verified", "Observed"]} /></FilterBlock>
          <FilterBlock label="Entity kind"><CheckList options={["Vessel", "Company", "Person"]} /></FilterBlock>
          <FilterBlock label="Saved views"><SavedViewList views={["Today's sanctions hits", "PEP · beneficial owners", "Unresolved conflicts"]} /></FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {/* Sanctions screening */}
          <Section title="Sanctions Screening (COM-1)">
            <DataTable
              columns={[
                { key: "n",  label: "Vessel",     render: (r: typeof VESSELS[number]) => <span className="font-semibold text-foreground">{r.name}</span> },
                { key: "i",  label: "IMO",        render: (r) => <span className="font-mono text-[11.5px]">{r.imo}</span> },
                { key: "fl", label: "Flag",       render: (r) => r.flag },
                { key: "st", label: "Status",     render: (r) => r.sanctionsHit
                  ? <StatusBadge label="MATCH" tone="risk" />
                  : <StatusBadge label="CLEAR" tone="ok" /> },
                { key: "src", label: "Sources checked", render: () => <span className="text-slate">OFAC · UN · EU · UK</span> },
                { key: "c",  label: "Confidence", align: "right", render: () => <ConfidenceChip tier="verified" size={9} /> },
              ]}
              rows={VESSELS}
              rowKey={(r) => r.id}
              compact
            />
          </Section>

          {/* PEP + Entity Resolution */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Section title="PEP Screening (COM-2)">
              <DataTable
                columns={[
                  { key: "n", label: "Person",       render: (r: typeof PEP_SCREEN[number]) => <span className="font-semibold text-foreground">{r.name}</span> },
                  { key: "r", label: "Role / Link",  render: (r) => r.role },
                  { key: "s", label: "Status",       render: (r) => r.hit
                    ? <StatusBadge label="PEP MATCH" tone="warn" />
                    : <StatusBadge label="NO MATCH" tone="ok" /> },
                  { key: "c", label: "Confidence", align: "right", render: (r) => <ConfidenceChip tier={r.confidence} size={9} /> },
                ]}
                rows={PEP_SCREEN}
                rowKey={(r) => r.name}
                compact
              />
            </Section>

            <Section title="Entity Resolution (COM-3)">
              <ul className="space-y-2">
                {ENTITY_DISAMBIGUATION.map((e) => (
                  <li key={e.canonical} className="rounded-md border border-line/60 bg-surface/50 p-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-foreground">{e.canonical}</div>
                      <ConfidenceChip tier={e.confidence} size={9} />
                    </div>
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate">Candidates</div>
                    <ul className="mt-0.5 space-y-0.5 text-[11.5px]">
                      {e.candidates.map((c) => (
                        <li key={c} className="text-foreground/85">· {c}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          {/* Watchlists */}
          <Section title="Watchlists">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {WATCHLISTS.map((w) => (
                <div key={w.name} className="rounded-md border border-line/60 bg-surface/50 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground">
                    <ShieldCheck className="h-3 w-3 text-[color:var(--color-blue)]" />
                    {w.name}
                  </div>
                  <div className="text-[18px] font-semibold text-foreground">{w.count}</div>
                  <div className="text-[10.5px] text-slate">Updated {w.updated}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Screening Notes">
            <div className="flex items-start gap-2 rounded border border-line/50 bg-surface/50 p-2.5 text-[11.5px] text-foreground/85">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-[color:var(--color-amber)]" />
              System-generated matches are advisory. Verified hits require officer sign-off before clearance action.
            </div>
          </Section>
        </div>
      }
      copilot={
        <CentreCopilot
          name="Compliance Copilot"
          observed={[
            { title: "OFAC SDN match observed",        detail: "MT Niger Runner · 92% name similarity.",              confidence: "verified" },
            { title: "PEP match on director",           detail: "A. Chukwuma Okoro linked to Trident Maritime.",       confidence: "verified" },
            { title: "Alias cluster observed",          detail: "3 candidate spellings resolve to Delta Freight Ltd.", confidence: "observed" },
          ]}
          recommendations={[
            { title: "Escalate MT Niger Runner to Decision Support", detail: "Verified sanctions match · officer sign-off required.", confidence: "verified" },
            { title: "Confirm PEP status via NFIU",                    detail: "Cross-check against NFIU PEP register.",                confidence: "observed" },
          ]}
          historical={[
            { title: "OFAC match · Q4 2024", detail: "Similar profile → hold + investigation opened within 2h.", similarity: 84 },
          ]}
          related={[
            { ref: "INV-2412-03", title: "Niger Runner sanctions review", status: "Escalated" },
          ]}
        />
      }
    />
  );
}
