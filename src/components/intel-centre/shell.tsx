import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, Save, Search, Bookmark, Filter } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ConfidenceChip, type ConfidenceTier } from "@/components/confidence-chip";
import { cn } from "@/lib/utils";

/**
 * Intelligence Centre workspace shell (dark).
 *
 * Every centre inherits: KPI ribbon · workspace tabs · left filter
 * sidebar · main workspace · right Copilot panel · bottom evidence tabs
 * · bottom audit bar. Only the content slots differ.
 *
 * Layout, spacing, and interactions stay consistent across all 9
 * centres — do not fork this shell per centre.
 */

export interface WorkspaceTab {
  key: string;
  label: string;
  count?: number;
}

export interface EvidenceTabDef {
  key: "evidence" | "audit" | "downloads" | "notes";
  label: string;
  count?: number;
}

export interface IntelCentreShellProps {
  title: string;
  subtitle: string;
  centreDropdown?: ReactNode;

  kpiRibbon: ReactNode;

  tabs: WorkspaceTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  tabTrailing?: ReactNode; // Analytics · Export · Columns

  filters: ReactNode; // left sidebar filter body
  main: ReactNode;
  copilot: ReactNode;

  evidenceTabs?: EvidenceTabDef[];
  activeEvidenceTab?: string;
  onEvidenceTabChange?: (key: string) => void;
  evidenceBody?: ReactNode;
}

const DEFAULT_EVIDENCE_TABS: EvidenceTabDef[] = [
  { key: "evidence", label: "Evidence" },
  { key: "audit", label: "Audit Trail" },
  { key: "downloads", label: "Downloads" },
  { key: "notes", label: "Notes" },
];

export function IntelCentreShell({
  title,
  subtitle,
  centreDropdown,
  kpiRibbon,
  tabs,
  activeTab,
  onTabChange,
  tabTrailing,
  filters,
  main,
  copilot,
  evidenceTabs,
  activeEvidenceTab,
  onEvidenceTabChange,
  evidenceBody,
}: IntelCentreShellProps) {
  const evTabs = evidenceTabs ?? DEFAULT_EVIDENCE_TABS;
  const [innerEvTab, setInnerEvTab] = useState<string>(activeEvidenceTab ?? evTabs[0]!.key);
  const currentEv = activeEvidenceTab ?? innerEvTab;
  const setEv = onEvidenceTabChange ?? setInnerEvTab;

  return (
    <AppShell title={title} subtitle={subtitle} mode="dark">
      <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-background text-foreground">
        {/* Centre header strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 bg-surface/60 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-line/60 bg-surface-2/50 px-3 py-1.5 text-[13px] font-semibold text-foreground">
              {title}
              <ChevronDown className="h-3.5 w-3.5 text-slate" />
            </div>
            <span className="text-[12px] text-slate">{subtitle}</span>
            {centreDropdown}
          </div>
        </div>

        {/* KPI ribbon */}
        <div className="border-b border-line/60 bg-surface/40 px-5 py-3">{kpiRibbon}</div>

        {/* Workspace tabs */}
        <div className="flex items-center justify-between gap-4 border-b border-line/60 bg-surface/40 px-5">
          <div role="tablist" className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTabChange(t.key)}
                  className={cn(
                    "relative shrink-0 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                    active ? "text-foreground" : "text-slate hover:text-foreground",
                  )}
                >
                  {t.label}
                  {typeof t.count === "number" && (
                    <span className="ml-1.5 rounded bg-surface-2/70 px-1.5 py-0.5 text-[10px] text-slate">
                      {t.count}
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[color:var(--color-blue)]" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 py-2 text-[12px] text-slate">{tabTrailing}</div>
        </div>

        {/* 3-column body: filters | main | copilot */}
        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
          <aside className="border-r border-line/60 bg-surface/30 px-3 py-4">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
              <Filter className="h-3 w-3" /> Filters
            </div>
            <div className="space-y-3">{filters}</div>
            <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1.5 text-[11.5px] font-medium text-foreground hover:bg-surface-2/70">
              <Save className="h-3 w-3" /> Save Current View
            </button>
          </aside>

          <section className="min-w-0 overflow-hidden px-5 py-4">{main}</section>

          <aside className="border-l border-line/60 bg-surface/30 px-3 py-4">{copilot}</aside>
        </div>

        {/* Evidence tabs strip */}
        <div className="border-t border-line/60 bg-surface/40">
          <div className="flex items-center gap-1 overflow-x-auto px-5">
            {evTabs.map((t) => {
              const active = t.key === currentEv;
              return (
                <button
                  key={t.key}
                  onClick={() => setEv(t.key)}
                  className={cn(
                    "relative shrink-0 px-3 py-2 text-[12px] font-medium",
                    active ? "text-foreground" : "text-slate hover:text-foreground",
                  )}
                >
                  {t.label}
                  {typeof t.count === "number" && (
                    <span className="ml-1.5 rounded bg-surface-2/70 px-1.5 py-0.5 text-[10px] text-slate">
                      {t.count}
                    </span>
                  )}
                  {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[color:var(--color-blue)]" />}
                </button>
              );
            })}
          </div>
          {evidenceBody && <div className="border-t border-line/60 px-5 py-3">{evidenceBody}</div>}
        </div>

        {/* Bottom audit bar — confidence legend + view full audit */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 bg-surface-2/50 px-5 py-2.5 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-2 text-slate">
            <span className="font-semibold uppercase tracking-[0.08em] text-slate/80">Confidence</span>
            {(["verified", "observed", "inferred", "unconfirmed"] as ConfidenceTier[]).map((t) => (
              <ConfidenceChip key={t} tier={t} size={9} />
            ))}
          </div>
          <button className="inline-flex items-center gap-1 rounded text-[11.5px] font-medium text-[color:var(--color-blue)] hover:underline">
            View Full Audit Trail →
          </button>
        </div>
      </div>
    </AppShell>
  );
}

// Small helper widgets used across every centre's filter sidebar.
export function FilterBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate/80">
        {label}
      </div>
      {children}
    </div>
  );
}

export function FilterSearch({ placeholder = "Search…" }: { placeholder?: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1.5">
      <Search className="h-3 w-3 text-slate" />
      <input
        placeholder={placeholder}
        className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate/70"
      />
    </div>
  );
}

export function SavedViewList({ views }: { views: string[] }) {
  return (
    <ul className="space-y-1">
      {views.map((v) => (
        <li key={v}>
          <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] text-foreground/80 hover:bg-surface-2/60">
            <Bookmark className="h-3 w-3 text-slate" />
            {v}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CheckList({ options, defaultChecked = [] }: { options: string[]; defaultChecked?: string[] }) {
  return (
    <ul className="space-y-1">
      {options.map((o) => (
        <li key={o} className="flex items-center gap-2 text-[12px] text-foreground/80">
          <input
            type="checkbox"
            defaultChecked={defaultChecked.includes(o)}
            className="h-3 w-3 accent-[color:var(--color-blue)]"
          />
          {o}
        </li>
      ))}
    </ul>
  );
}
