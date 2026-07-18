import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Check,
  Clock,
  Copy,
  Download,
  FileClock,
  FilePlus,
  History,
  ListChecks,
  MoreHorizontal,
  Printer,
  StickyNote,
  User,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { AuditTimeline } from "@/components/intelligence/AuditTimeline";
import { CopilotPanel } from "@/components/intelligence/CopilotPanel";
import { DomainFilterTabs } from "@/components/domain-filter-tabs";
import { EvidenceCard } from "@/components/intelligence/EvidenceCard";
import { KnowledgeGraph } from "@/components/intelligence/KnowledgeGraph";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { cn } from "@/lib/utils";
import {
  AI_FINDINGS,
  AUDIT_TRAIL,
  CASE_PROGRESS,
  COPILOT_RECOMMENDATIONS,
  EVIDENCE_ITEMS,
  HISTORICAL_SIMILARITY,
  INV_BOTTOM_COUNTS,
  INVESTIGATIONS,
  RELATED_INVESTIGATIONS,
  RULES_TRIGGERED,
  graphForInvestigation,
  investigationById,
  type GraphNode,
  type Investigation,
} from "@/lib/lifecycle-data";



/**
 * INV — Investigate / Voyage Workspace.
 *
 * Primary Investigate surface: the case workspace. When no `:id` is
 * supplied the workspace opens the first active investigation. The
 * investigations list lives at /investigate/open.
 */
export function InvestigateWorkspace() {
  const params = useParams({ strict: false }) as { id?: string };
  const inv = params.id ? investigationById(params.id) : INVESTIGATIONS[0];
  return <Workspace inv={inv} />;
}

type LeftPanelKey =
  | "timeline"
  | "evidence"
  | "documents"
  | "history"
  | "notes";

function Workspace({ inv }: { inv: Investigation }) {
  const [domain, setDomain] = useState("Overview");
  const [leftPanel, setLeftPanel] = useState<LeftPanelKey>("timeline");
  const [bottomTab, setBottomTab] = useState<
    "findings" | "rules" | "evidence" | "audit" | "downloads"
  >("findings");
  const [selectedFinding, setSelectedFinding] = useState<number>(
    AI_FINDINGS[0].id,
  );
  const [selectedEntity, setSelectedEntity] = useState<GraphNode | null>(null);

  // Per-investigation subgraph — the KG reflects the case that is open.
  const graph = graphForInvestigation(inv);

  // Findings/evidence filtered by the selected KG entity, if any.
  const filteredFindings = selectedEntity
    ? AI_FINDINGS.filter((f) => {
        const hay = `${f.title} ${f.explanation} ${f.keyIndicators.join(" ")}`.toLowerCase();
        return hay.includes(selectedEntity.label.toLowerCase());
      })
    : AI_FINDINGS;
  const findingsToShow = filteredFindings.length ? filteredFindings : AI_FINDINGS;

  const filteredEvidence = selectedEntity
    ? EVIDENCE_ITEMS.filter((e) =>
        `${e.title} ${e.source}`
          .toLowerCase()
          .includes(selectedEntity.label.toLowerCase()),
      )
    : EVIDENCE_ITEMS;
  const evidenceToShow = filteredEvidence.length ? filteredEvidence : EVIDENCE_ITEMS;

  const bottomTabs = [
    { key: "findings", label: "AI Findings", count: findingsToShow.length },
    { key: "rules", label: "Rules Triggered", count: INV_BOTTOM_COUNTS.rules },
    { key: "evidence", label: "Evidence", count: evidenceToShow.length },
    { key: "audit", label: "Audit Trail" },
    { key: "downloads", label: "Downloads" },
  ] as const;

  const finding =
    findingsToShow.find((f) => f.id === selectedFinding) ?? findingsToShow[0];

  const domainTabs = [
    { key: "Overview", label: "Overview", count: 0 },
    { key: "Manifest", label: "Manifest", count: 0 },
    { key: "Cargo", label: "Cargo", count: 0 },
    { key: "Revenue", label: "Revenue", count: 0 },
    { key: "Vessel Movement", label: "Vessel Movement", count: 0 },
    { key: "Compliance", label: "Compliance", count: 0 },
    { key: "Ownership", label: "Ownership", count: 0 },
    { key: "Alerts", label: "Alerts", count: 7 },
    { key: "All Data", label: "All Data", count: 0 },
  ];



  return (
    <AppShell title="Investigate" subtitle="Voyage Workspace" mode="light">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        {/* INV-1 Case Header Bar */}
        <CaseHeader inv={inv} />

        {/* INV-2 Domain tabs */}
        <DomainFilterTabs
          active={domain}
          onChange={setDomain}
          tabs={domainTabs}
          trailing={
            <>
              <button className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-surface-2">
                <FilePlus className="h-3 w-3" /> Add Note
              </button>
              <button
                className="rounded-md border border-line p-1.5 text-slate hover:bg-surface-2"
                title="More"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </>
          }
        />

        {/* INV-3 Left · INV-4 Centre KG · INV-6 Right Copilot */}
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_340px]">
          <aside className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-line bg-card shadow-card">
              <ul>
                <LeftItem
                  icon={Clock}
                  label="Timeline"
                  active={leftPanel === "timeline"}
                  onClick={() => setLeftPanel("timeline")}
                />
                <LeftItem
                  icon={FileClock}
                  label="Evidence"
                  active={leftPanel === "evidence"}
                  onClick={() => setLeftPanel("evidence")}
                />
                <LeftItem
                  icon={ListChecks}
                  label="Documents"
                  count={24}
                  active={leftPanel === "documents"}
                  onClick={() => setLeftPanel("documents")}
                />
                <LeftItem
                  icon={History}
                  label="History"
                  active={leftPanel === "history"}
                  onClick={() => setLeftPanel("history")}
                />
                <LeftItem
                  icon={StickyNote}
                  label="Officer Notes"
                  count={5}
                  active={leftPanel === "notes"}
                  onClick={() => setLeftPanel("notes")}
                />
              </ul>
            </div>
            <CaseProgress />
            <Link
              to="/investigate/open"
              className="block rounded-lg border border-line bg-card px-3 py-2 text-[11px] font-semibold text-[color:var(--color-blue)] hover:bg-surface-2"
            >
              Open Investigations →
            </Link>
          </aside>

          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-line bg-card shadow-card">
              <KnowledgeGraph
                nodes={graph.nodes}
                edges={graph.edges}
                focalId={graph.focalId}
                onSelectionChange={(n) => {
                  setSelectedEntity(n);
                  // Auto-open Evidence panel on entity focus.
                  if (n) setLeftPanel("evidence");
                }}
                height={540}
              />
            </div>
            {selectedEntity && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[11px]">
                <span className="type-label text-slate">Focused entity</span>
                <span className="font-semibold text-foreground">
                  {selectedEntity.label}
                </span>
                <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate">
                  {selectedEntity.kind}
                </span>
                {selectedEntity.confidence !== undefined && (
                  <span className="text-slate">
                    Confidence {selectedEntity.confidence}%
                  </span>
                )}
                <span className="ml-auto text-slate">
                  {findingsToShow.length} findings · {evidenceToShow.length} evidence
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedEntity(null)}
                  className="rounded border border-line bg-surface-1 px-2 py-0.5 text-[10px] font-semibold text-slate hover:bg-surface-2"
                >
                  Clear
                </button>
              </div>
            )}
          </div>


          <CopilotPanel
            recommendations={COPILOT_RECOMMENDATIONS}
            similarity={HISTORICAL_SIMILARITY}
            related={RELATED_INVESTIGATIONS}
            entitySummary={[
              { label: "Vessel Type", value: "Container Ship" },
              { label: "Flag", value: inv.flag },
              { label: "Owner", value: "Oceanic Lines Ltd." },
              { label: "Operator", value: "ABC Shipping Ltd." },
              { label: "Risk Profile", value: "High" },
              { label: "Watchlist", value: "No Match" },
            ]}
          />
        </div>

        {/* INV-7 Bottom workspace */}
        <div className="rounded-lg border border-line bg-card shadow-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
            {bottomTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setBottomTab(t.key as typeof bottomTab)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold motion-fast",
                  bottomTab === t.key
                    ? "bg-[color:var(--color-navy)] text-white"
                    : "text-foreground/75 hover:bg-surface-2",
                )}
              >
                {t.label}
                {"count" in t && t.count !== undefined && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                      bottomTab === t.key
                        ? "bg-white/15 text-white"
                        : "bg-surface-2 text-slate",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-3">
            {bottomTab === "findings" && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
                {/* INV-8 findings table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="type-label bg-surface-2 text-slate">
                      <tr>
                        <th className="px-3 py-2 text-left">Finding</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-left">Confidence</th>
                        <th className="px-3 py-2 text-left">Evidence</th>
                        <th className="px-3 py-2 text-left">First Observed</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findingsToShow.map((f, i) => (
                        <tr
                          key={f.id}
                          onClick={() => setSelectedFinding(f.id)}
                          className={cn(
                            "cursor-pointer border-t border-line hover:bg-surface-2/60",
                            selectedFinding === f.id &&
                              "bg-[color:var(--color-teal)]/5",
                          )}
                        >
                          <td className="px-3 py-2 font-semibold text-foreground">
                            <span className="type-mono mr-1.5 text-slate">
                              {i + 1}.
                            </span>
                            {f.title}
                          </td>
                          <td className="px-3 py-2 text-foreground/80">
                            {f.category}
                          </td>
                          <td className="px-3 py-2 font-semibold text-foreground">
                            {f.confidencePct}%
                          </td>
                          <td className="px-3 py-2 text-slate">
                            {f.evidenceCount}
                          </td>
                          <td className="px-3 py-2 text-slate">
                            {f.firstObserved}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                f.status === "NEW"
                                  ? "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
                                  : "bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)]"
                              }`}
                            >
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* INV-9 finding detail */}
                <div className="rounded-lg border border-line bg-surface-2/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-foreground">
                      {finding.title}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-[color:var(--color-red)]/10 text-[color:var(--color-red)]">
                      HIGH PRIORITY
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-foreground/80">
                    AI model detected potential {finding.category.toLowerCase()} based on cargo value, volume, and historical patterns.
                  </p>
                  <div className="mt-3">
                    <div className="type-label mb-1 text-slate">
                      Key Indicators
                    </div>
                    <ul className="space-y-1 text-[12px]">
                      {finding.keyIndicators.map((k) => (
                        <li
                          key={k}
                          className="flex items-start gap-1.5 text-foreground/85"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-teal)]" />
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
                    View Full Analysis →
                  </button>
                </div>

                {/* Evidence column */}
                <div className="rounded-lg border border-line bg-surface-2/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-foreground">
                      Evidence ({evidenceToShow.length})
                    </span>
                    <button className="text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
                      View all
                    </button>
                  </div>
                  <div className="space-y-2">
                    {evidenceToShow.slice(0, 3).map((e) => (
                      <EvidenceCard key={e.id} item={e} />
                    ))}
                    <div className="pt-1 text-[11px] text-slate">
                      + {Math.max(0, evidenceToShow.length - 3)} more evidence
                      items
                    </div>

                  </div>
                </div>
              </div>
            )}

            {bottomTab === "rules" && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {RULES_TRIGGERED.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-line bg-surface-2/60 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="type-mono text-[11px] font-semibold">
                        {r.id}
                      </span>
                      <RiskPill level={r.impact} />
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-foreground">
                      {r.title}
                    </div>
                    <div className="mt-1 text-[11px] text-slate">
                      Hits: {r.hits}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bottomTab === "evidence" && (
              <div className="grid gap-2 md:grid-cols-2">
                {evidenceToShow.map((e) => (
                  <EvidenceCard key={e.id} item={e} />
                ))}
              </div>
            )}

            {bottomTab === "audit" && <AuditTimeline events={AUDIT_TRAIL} />}

            {bottomTab === "downloads" && (
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  "Case brief (PDF)",
                  "Evidence pack (ZIP)",
                  "Audit log (CSV)",
                ].map((d) => (
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
            search={{
              entityId: inv.entityId,
              fromStage: "Investigate",
              fromRoute: `/investigate/${inv.id}`,
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-navy)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90"
          >
            Hand off to Decision Support →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────

function CaseHeader({ inv }: { inv: Investigation }) {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <HeaderField label="Mission">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-red)]" />
            {inv.mission}
          </span>
        </HeaderField>

        <HeaderField label="Investigation">
          <span className="flex items-center gap-1.5">
            <span className="type-mono text-[13px] font-semibold text-foreground">
              {inv.id}
            </span>
            <button
              className="text-slate hover:text-foreground"
              title="Copy ID"
              type="button"
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
        </HeaderField>

        <HeaderField label="Primary Subject">
          <span className="text-[13px] font-semibold text-foreground">
            {inv.vessel}{" "}
            <span className="type-mono text-slate">IMO {inv.imo}</span>
          </span>
        </HeaderField>

        <HeaderField label="Risk Level">
          <RiskPill level={inv.risk} />
        </HeaderField>

        <HeaderField label="Confidence">
          <div className="flex items-center gap-2">
            <ConfidenceRing pct={inv.confidencePct} />
            <span className="text-[13px] font-bold text-foreground">
              {inv.confidencePct}%
            </span>
          </div>
        </HeaderField>

        <HeaderField label="Assigned Officer">
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--color-navy)]/10 text-[color:var(--color-navy)]">
              <User className="h-3 w-3" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold text-foreground">
                {inv.officer}
              </span>
              <span className="text-[10px] text-slate">NIMASA Analyst</span>
            </span>
          </span>
        </HeaderField>

        <HeaderField label="Case Status">
          <span className="inline-flex rounded-md bg-[color:var(--color-green)]/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[color:var(--color-green)]">
            {inv.status === "In Review" ? "ACTIVE" : inv.status.toUpperCase()}
          </span>
        </HeaderField>

        <HeaderField label="Timeline">
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold text-foreground">
              {inv.opened}
            </span>
            <span className="type-mono text-[11px] text-slate">
              {inv.updated}
            </span>
          </span>
        </HeaderField>

        <div className="ml-auto flex items-center gap-1">
          <button
            className="rounded-md border border-line p-1.5 hover:bg-surface-2"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded-md border border-line p-1.5 hover:bg-surface-2"
            title="Print"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HeaderField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="type-label text-[10px] uppercase tracking-[0.08em] text-slate">
        {label}
      </span>
      <span className="mt-0.5">{children}</span>
    </div>
  );
}

function ConfidenceRing({ pct }: { pct: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width="34" height="34" viewBox="0 0 36 36">
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="3.5"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth="3.5"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Left panel
// ─────────────────────────────────────────────────────────────

function LeftItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 border-l-2 px-3 py-2 text-[12px] font-medium motion-fast",
          active
            ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/5 text-foreground"
            : "border-transparent text-foreground/80 hover:bg-surface-2",
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            active ? "text-[color:var(--color-blue)]" : "text-slate",
          )}
        />
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

function CaseProgress() {
  const done = CASE_PROGRESS.filter((s) => s.done).length;
  const total = CASE_PROGRESS.length;
  const pct = Math.round((done / total) * 100);
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <span className="type-h2 text-foreground">Case Progress</span>
        <button className="text-[10px] font-semibold text-[color:var(--color-blue)] hover:underline">
          View all
        </button>
      </div>
      <div className="mb-2 text-[11px] text-slate">
        {done} of {total} completed
      </div>
      <div className="flex justify-center">
        <div className="relative">
          <svg width="80" height="80" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="5"
            />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke="var(--color-teal)"
              strokeWidth="5"
              strokeDasharray={c}
              strokeDashoffset={off}
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-[13px] font-bold text-foreground">
            {pct}%
          </div>
        </div>
      </div>
      <ol className="mt-3 space-y-1">
        {CASE_PROGRESS.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between gap-2 text-[11.5px]"
          >
            <span
              className={cn(
                s.done ? "text-foreground/80" : "text-foreground font-semibold",
              )}
            >
              {s.label}
            </span>
            <span
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded-full",
                s.done
                  ? "bg-[color:var(--color-green)] text-white"
                  : "border border-line bg-surface",
              )}
            >
              {s.done && <Check className="h-2.5 w-2.5" />}
            </span>
          </li>
        ))}
      </ol>
      <button className="mt-3 block w-full text-center text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
        View Workflow →
      </button>
    </div>
  );
}
