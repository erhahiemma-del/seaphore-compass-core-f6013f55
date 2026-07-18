import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  Clock,
  Download,
  FileClock,
  FilePlus,
  History,
  ListChecks,
  Printer,
  StickyNote,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { AuditTimeline } from "@/components/intelligence/AuditTimeline";
import { CaseProgressChecklist } from "@/components/case-progress-checklist";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { CopilotPanel } from "@/components/intelligence/CopilotPanel";
import { DomainFilterTabs } from "@/components/domain-filter-tabs";
import { EvidenceCard } from "@/components/intelligence/EvidenceCard";
import { KnowledgeGraph } from "@/components/intelligence/KnowledgeGraph";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { cn } from "@/lib/utils";
import {
  AI_FINDINGS,
  AUDIT_TRAIL,
  CASE_PROGRESS,
  COPILOT_RECOMMENDATIONS,
  EVIDENCE_ITEMS,
  GRAPH_EDGES,
  GRAPH_NODES,
  HISTORICAL_SIMILARITY,
  INV_BOTTOM_COUNTS,
  RELATED_INVESTIGATIONS,
  RULES_TRIGGERED,
  investigationById,
} from "@/lib/lifecycle-data";



export function InvestigateWorkspace() {
  const { id } = useParams({ from: "/investigate/$id" });
  const inv = investigationById(id);

  const [domain, setDomain] = useState("Overview");
  const [bottomTab, setBottomTab] = useState<
    "findings" | "rules" | "evidence" | "audit" | "downloads"
  >("findings");
  const [selectedFinding, setSelectedFinding] = useState<number>(
    AI_FINDINGS[0].id,
  );

  const domainTabs = [
    "Overview",
    "Manifest",
    "Cargo",
    "Revenue",
    "Vessel Movement",
    "Compliance",
    "Ownership",
    "Alerts",
    "All Data",
  ];

  const bottomTabs = [
    { key: "findings", label: `AI Findings (${INV_BOTTOM_COUNTS.findings})` },
    { key: "rules", label: `Rules Triggered (${INV_BOTTOM_COUNTS.rules})` },
    { key: "evidence", label: `Evidence (${INV_BOTTOM_COUNTS.evidence})` },
    { key: "audit", label: "Audit Trail" },
    { key: "downloads", label: "Downloads" },
  ] as const;

  const finding =
    AI_FINDINGS.find((f) => f.id === selectedFinding) ?? AI_FINDINGS[0];

  return (
    <AppShell title="Investigate" subtitle={inv.id} mode="light">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        {/* INV-1 Case Header Bar (full width) */}
        <CaseHeader inv={inv} />

        {/* INV-2 Domain tabs + Add Note */}
        <DomainFilterTabs
          active={domain}
          onChange={setDomain}
          tabs={domainTabs.map((d) => ({ key: d, label: d, count: 0 }))}
          trailing={
            <button className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-surface-2">
              <FilePlus className="h-3 w-3" /> Add Note
            </button>
          }
        />

        {/* INV-3 Left · INV-4 Centre KG · INV-6 Right Copilot */}
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
          <aside className="space-y-3">
            <PanelCard>
              <div className="type-label mb-2 text-slate">Case Panels</div>
              <ul className="space-y-1 text-[12px]">
                <LeftItem icon={Clock} label="Timeline" />
                <LeftItem icon={FileClock} label="Evidence" count={INV_BOTTOM_COUNTS.evidence} />
                <LeftItem icon={ListChecks} label="Documents" count={7} />
                <LeftItem icon={History} label="History" />
                <LeftItem icon={StickyNote} label="Officer Notes" count={3} />
              </ul>
            </PanelCard>
            <CaseProgressChecklist steps={CASE_PROGRESS} />
          </aside>

          <PanelCard variant="edge" className="overflow-hidden">
            <KnowledgeGraph nodes={GRAPH_NODES} edges={GRAPH_EDGES} height={520} />
          </PanelCard>

          <CopilotPanel
            recommendations={COPILOT_RECOMMENDATIONS}
            similarity={HISTORICAL_SIMILARITY}
            related={RELATED_INVESTIGATIONS}
            entitySummary={[
              { label: "Vessel", value: inv.vessel },
              { label: "IMO", value: inv.imo },
              { label: "Flag", value: inv.flag },
              { label: "Voyage", value: inv.voyage },
              { label: "Owner", value: "Blue Horizon Shipping" },
              { label: "Route", value: inv.route },
            ]}
          />
        </div>

        {/* INV-7 Bottom tabs */}
        <div className="rounded-lg border border-line bg-card shadow-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
            {bottomTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setBottomTab(t.key as typeof bottomTab)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-semibold motion-fast",
                  bottomTab === t.key
                    ? "bg-[color:var(--color-navy)] text-white"
                    : "text-foreground/75 hover:bg-surface-2",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-3">
            {bottomTab === "findings" && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                {/* INV-8 findings table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="type-label bg-surface-2 text-slate">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Finding</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-left">Confidence</th>
                        <th className="px-3 py-2 text-left">Evidence</th>
                        <th className="px-3 py-2 text-left">First Observed</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AI_FINDINGS.map((f) => (
                        <tr
                          key={f.id}
                          onClick={() => setSelectedFinding(f.id)}
                          className={cn(
                            "cursor-pointer border-t border-line hover:bg-surface-2/60",
                            selectedFinding === f.id && "bg-[color:var(--color-teal)]/5",
                          )}
                        >
                          <td className="px-3 py-2 type-mono text-slate">{f.id}</td>
                          <td className="px-3 py-2 font-semibold text-foreground">{f.title}</td>
                          <td className="px-3 py-2 text-foreground/80">{f.category}</td>
                          <td className="px-3 py-2 font-semibold text-foreground">{f.confidencePct}%</td>
                          <td className="px-3 py-2 text-slate">{f.evidenceCount}</td>
                          <td className="px-3 py-2 text-slate">{f.firstObserved}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              f.status === "NEW"
                                ? "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
                                : "bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)]"
                            }`}>
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* INV-9 finding detail panel */}
                <div className="rounded-lg border border-line bg-surface-2/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="type-label text-slate">Finding Detail</span>
                    <RiskPill level="HIGH" />
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-foreground">
                    {finding.title}
                  </div>
                  <p className="mt-1 text-[12px] text-foreground/80">
                    {finding.explanation}
                  </p>
                  <div className="mt-3">
                    <div className="type-label mb-1 text-slate">Key Indicators</div>
                    <ul className="space-y-1 text-[12px]">
                      {finding.keyIndicators.map((k) => (
                        <li key={k} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-teal)]" />
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
                    View Full Analysis →
                  </button>
                  <div className="mt-4">
                    <div className="type-label mb-1 text-slate">Evidence</div>
                    <div className="space-y-2">
                      {EVIDENCE_ITEMS.slice(0, 3).map((e) => (
                        <EvidenceCard key={e.id} item={e} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {bottomTab === "rules" && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {RULES_TRIGGERED.map((r) => (
                  <div key={r.id} className="rounded-md border border-line bg-surface-2/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="type-mono text-[11px] font-semibold">{r.id}</span>
                      <RiskPill level={r.impact} />
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-foreground">{r.title}</div>
                    <div className="mt-1 text-[11px] text-slate">Hits: {r.hits}</div>
                  </div>
                ))}
              </div>
            )}

            {bottomTab === "evidence" && (
              <div className="grid gap-2 md:grid-cols-2">
                {EVIDENCE_ITEMS.map((e) => (
                  <EvidenceCard key={e.id} item={e} />
                ))}
              </div>
            )}

            {bottomTab === "audit" && <AuditTimeline events={AUDIT_TRAIL} />}

            {bottomTab === "downloads" && (
              <div className="grid gap-2 sm:grid-cols-3">
                {["Case brief (PDF)", "Evidence pack (ZIP)", "Audit log (CSV)"].map((d) => (
                  <button
                    key={d}
                    className="flex items-center justify-between rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface-2"
                  >
                    <span>{d}</span>
                    <Download className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Handoff */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/decide/$id"
            params={{ id: inv.id }}
            search={{ entityId: inv.entityId, fromStage: "Investigate", fromRoute: `/investigate/${inv.id}` }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-navy)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90"
          >
            Hand off to Decision Support →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function LeftItem({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
}) {
  return (
    <li>
      <button className="flex w-full items-center gap-2 rounded px-2 py-1 text-[12px] font-medium text-foreground/85 motion-fast hover:bg-surface-2">
        <Icon className="h-3.5 w-3.5 text-slate" />
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && (
          <span className="rounded bg-surface-2 px-1.5 text-[10px] font-bold text-slate">
            {count}
          </span>
        )}
      </button>
    </li>
  );
}

function CaseHeader({ inv }: { inv: ReturnType<typeof investigationById> }) {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:gap-6">
        <div className="min-w-0">
          <div className="type-label text-slate">{inv.mission}</div>
          <div className="type-mono text-[13px] font-semibold text-foreground">{inv.id}</div>
        </div>
        <div className="min-w-0">
          <div className="type-label text-slate">Primary Subject</div>
          <div className="truncate text-[13px] font-semibold text-foreground">
            {inv.vessel} · <span className="type-mono">IMO {inv.imo}</span>
          </div>
        </div>
        <div>
          <div className="type-label text-slate">Risk</div>
          <RiskPill level={inv.risk} />
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceRing pct={inv.confidencePct} />
          <div>
            <div className="type-label text-slate">Confidence</div>
            <div className="text-[13px] font-bold">{inv.confidencePct}%</div>
          </div>
        </div>
        <div>
          <div className="type-label text-slate">Assigned Officer</div>
          <div className="text-[13px] font-semibold text-foreground">{inv.officer}</div>
        </div>
        <div>
          <div className="type-label text-slate">Status</div>
          <div className="text-[13px] font-semibold text-foreground">{inv.status}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate">Opened {inv.opened} · Updated {inv.updated}</span>
          <button className="rounded-md border border-line p-1.5 hover:bg-surface-2" title="Download">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button className="rounded-md border border-line p-1.5 hover:bg-surface-2" title="Print">
            <Printer className="h-3.5 w-3.5" />
          </button>
          <ConfidenceChip tier="inferred" />
        </div>
      </div>
    </div>
  );
}

function ConfidenceRing({ pct }: { pct: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
