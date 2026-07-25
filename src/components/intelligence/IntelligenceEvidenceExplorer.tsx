/**
 * IntelligenceEvidenceExplorer
 *
 * Comprehensive investigator surface over the sanitized
 * IntelligenceEvidenceItem stream. Four view modes:
 *   • List         — the classic Sprint 1B evidence table (unchanged).
 *   • Graph        — entity/relationship graph across vessels, companies,
 *                    people, cargo, ports, incidents, and documents.
 *   • Timeline     — chronological projection with confidence chips.
 *   • Source       — grouped by connector, exposing coverage per source.
 *
 * All modes share filters (connector, confidence, entity, investigation,
 * time, type, status, source, search) and highlight cross-connector
 * conflicts. Every conclusion routes back to its underlying evidence.
 *
 * Golden Rule: every conclusion explainable, every relationship navigable,
 * every piece of evidence traceable.
 */
import { useMemo, useState, useEffect, type ReactNode, type ComponentType } from "react";
import {
  AlertTriangle,
  Anchor,
  Brain,
  Building2,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Filter,
  GitBranch,
  Layers,
  List as ListIcon,
  MapPin,
  Package,
  ScrollText,
  Search,
  ShieldAlert,
  Sparkles,
  Timer,
  User2,
  X,
} from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  applyEvidenceFilters,
  emptyFilters,
  type EvidenceConfidence,
  type EvidenceFilters,
  type EvidenceStatus,
  type EvidenceType,
  type EvidenceEntityType,
  type IntelligenceEvidenceItem,
  type OklExplainability,
} from "@/lib/evidence/intelligence-evidence";
import {
  buildRelationshipGraph,
  type EntityNode,
} from "@/lib/evidence/relationships";
import { detectConflicts, type EvidenceConflict } from "@/lib/evidence/conflicts";
import { computeConfidenceBreakdown } from "@/lib/evidence/confidence-breakdown";

const TYPE_LABEL: Record<EvidenceType, string> = {
  "ais-continuity": "AIS continuity",
  movement: "Movement",
  identity: "Identity",
  sanctions: "Sanctions",
  ownership: "Ownership",
  assessment: "Assessment",
  other: "Other",
};

const STATUS_TONE: Record<EvidenceStatus, string> = {
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  historical: "border-slate-500/40 bg-slate-500/10 text-slate-700",
  conflicting: "border-orange-500/40 bg-orange-500/10 text-orange-700",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  verified: "Verified",
  pending: "Pending",
  historical: "Historical",
  conflicting: "Conflicting",
  rejected: "Rejected",
};

const CONFIDENCES: EvidenceConfidence[] = ["VERIFIED", "OBSERVED", "INFERRED", "UNCONFIRMED"];

import type { LucideIcon } from "lucide-react";
const ENTITY_ICON: Record<EvidenceEntityType, LucideIcon> = {
  vessel: Anchor,
  company: Building2,
  person: User2,
  cargo: Package,
  port: MapPin,
  incident: ShieldAlert,
  document: ScrollText,
};

const ENTITY_COLOR: Record<EvidenceEntityType, string> = {
  vessel: "#0ea5e9",
  company: "#8b5cf6",
  person: "#f59e0b",
  cargo: "#10b981",
  port: "#0891b2",
  incident: "#ef4444",
  document: "#64748b",
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function isSafeSourceUrl(u?: string): u is string {
  if (!u) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

type Mode = "list" | "graph" | "timeline" | "source";

export interface IntelligenceEvidenceExplorerProps {
  items: IntelligenceEvidenceItem[];
  title?: string;
  className?: string;
  /** Optional initial filters (e.g. from route search params). */
  initialFilters?: Partial<EvidenceFilters>;
  /** Optional initial mode. */
  initialMode?: Mode;
  /** Fired when officer selects an evidence row from any view. */
  onInspect?: (item: IntelligenceEvidenceItem) => void;
  /** Fired when officer changes filters — useful for URL syncing. */
  onFiltersChange?: (filters: EvidenceFilters) => void;
}

export function IntelligenceEvidenceExplorer({
  items,
  title = "Intelligence Evidence Explorer",
  className,
  initialFilters,
  initialMode = "list",
  onInspect,
  onFiltersChange,
}: IntelligenceEvidenceExplorerProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [filters, setFilters] = useState<EvidenceFilters>(() => ({
    ...emptyFilters(),
    ...initialFilters,
    types: new Set(initialFilters?.types ?? []),
    statuses: new Set(initialFilters?.statuses ?? []),
    sources: new Set(initialFilters?.sources ?? []),
    connectors: new Set(initialFilters?.connectors ?? []),
    investigations: new Set(initialFilters?.investigations ?? []),
    confidences: new Set(initialFilters?.confidences ?? []),
  }));
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);

  useEffect(() => {
    onFiltersChange?.(filters);
  }, [filters, onFiltersChange]);

  const allSources = useMemo(
    () => Array.from(new Set(items.map((i) => i.source))).sort(),
    [items],
  );
  const allConnectors = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.connector).filter((c): c is string => Boolean(c))),
      ).sort(),
    [items],
  );
  const allInvestigations = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.investigationId).filter((c): c is string => Boolean(c))),
      ).sort(),
    [items],
  );

  const filtered = useMemo(
    () =>
      applyEvidenceFilters(items, filters).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [items, filters],
  );

  const conflicts = useMemo(() => detectConflicts(items), [items]);
  const graph = useMemo(() => buildRelationshipGraph(filtered), [filtered]);

  const conflictEvidenceIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conflicts) for (const id of c.evidenceIds) s.add(id);
    return s;
  }, [conflicts]);

  const updateFilters = (patch: Partial<EvidenceFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const toggle = <T,>(field: keyof EvidenceFilters, value: T) =>
    setFilters((prev) => {
      const set = new Set((prev[field] as Set<T>) ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [field]: set };
    });

  const focusedItems = useMemo(() => {
    if (!focusedEntityId) return filtered;
    const ids = graph.entityToEvidence.get(focusedEntityId);
    if (!ids) return [];
    const idSet = new Set(ids);
    return filtered.filter((f) => idSet.has(f.id));
  }, [focusedEntityId, filtered, graph]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          <Badge variant="secondary" className="text-[10px]">
            {filtered.length}/{items.length}
          </Badge>
          {conflicts.length > 0 && (
            <Badge className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-700">
              <AlertTriangle className="h-3 w-3" />
              {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              placeholder="Search claim, entity, or source…"
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <ModeSwitcher mode={mode} onChange={setMode} />
        </div>
      </header>

      <FilterPanel
        filters={filters}
        allSources={allSources}
        allConnectors={allConnectors}
        allInvestigations={allInvestigations}
        onToggle={toggle}
        onChange={updateFilters}
      />

      {conflicts.length > 0 && (
        <ConflictBanner
          conflicts={conflicts}
          onOpenEvidence={(id) => {
            const item = items.find((x) => x.id === id);
            if (item) onInspect?.(item);
          }}
        />
      )}

      {focusedEntityId && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">Focused on entity</span>
          <span className="font-medium text-foreground">
            {graph.nodes.find((n) => n.id === focusedEntityId)?.name ?? focusedEntityId}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-2 text-[11px]"
            onClick={() => setFocusedEntityId(null)}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        </div>
      )}

      {mode === "list" && (
        <EvidenceList
          items={focusedItems}
          conflictIds={conflictEvidenceIds}
          onInspect={onInspect}
        />
      )}
      {mode === "graph" && (
        <RelationshipGraphView
          nodes={graph.nodes}
          edges={graph.edges}
          focusedId={focusedEntityId}
          onFocus={(id) => setFocusedEntityId((cur) => (cur === id ? null : id))}
        />
      )}
      {mode === "timeline" && (
        <TimelineView
          items={focusedItems}
          conflictIds={conflictEvidenceIds}
          onInspect={onInspect}
        />
      )}
      {mode === "source" && (
        <SourceView
          items={filtered}
          conflictIds={conflictEvidenceIds}
          onInspect={onInspect}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Mode Switcher ─────────────────────────── */

function ModeSwitcher({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const modes: Array<{ id: Mode; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "list", label: "List", icon: ListIcon },
    { id: "graph", label: "Graph", icon: GitBranch },
    { id: "timeline", label: "Timeline", icon: Timer },
    { id: "source", label: "Source", icon: Layers },
  ];
  return (
    <div
      role="tablist"
      aria-label="Evidence view mode"
      className="inline-flex rounded-md border border-border/60 bg-muted/30 p-0.5"
    >
      {modes.map((m) => {
        const Icon = m.icon;
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(m.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Filter Panel ─────────────────────────── */

function FilterPanel({
  filters,
  allSources,
  allConnectors,
  allInvestigations,
  onToggle,
  onChange,
}: {
  filters: EvidenceFilters;
  allSources: string[];
  allConnectors: string[];
  allInvestigations: string[];
  onToggle: <T,>(field: keyof EvidenceFilters, value: T) => void;
  onChange: (patch: Partial<EvidenceFilters>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
      <FilterRow label="Type" icon>
        {(Object.keys(TYPE_LABEL) as EvidenceType[]).map((t) => (
          <FilterChip
            key={t}
            active={filters.types.has(t)}
            onClick={() => onToggle("types", t)}
          >
            {TYPE_LABEL[t]}
          </FilterChip>
        ))}
      </FilterRow>
      <FilterRow label="Confidence">
        {CONFIDENCES.map((c) => (
          <FilterChip
            key={c}
            active={filters.confidences?.has(c) ?? false}
            onClick={() => onToggle("confidences", c)}
          >
            {c}
          </FilterChip>
        ))}
      </FilterRow>
      <FilterRow label="Status">
        {(Object.keys(STATUS_LABEL) as EvidenceStatus[]).map((s) => (
          <FilterChip
            key={s}
            active={filters.statuses.has(s)}
            onClick={() => onToggle("statuses", s)}
          >
            {STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </FilterRow>
      {allConnectors.length > 0 && (
        <FilterRow label="Connector">
          {allConnectors.map((c) => (
            <FilterChip
              key={c}
              active={filters.connectors?.has(c) ?? false}
              onClick={() => onToggle("connectors", c)}
            >
              {c}
            </FilterChip>
          ))}
        </FilterRow>
      )}
      {allSources.length > 1 && (
        <FilterRow label="Source">
          {allSources.map((s) => (
            <FilterChip
              key={s}
              active={filters.sources.has(s)}
              onClick={() => onToggle("sources", s)}
            >
              {s}
            </FilterChip>
          ))}
        </FilterRow>
      )}
      {allInvestigations.length > 0 && (
        <FilterRow label="Investigation">
          {allInvestigations.map((i) => (
            <FilterChip
              key={i}
              active={filters.investigations?.has(i) ?? false}
              onClick={() => onToggle("investigations", i)}
            >
              {i.slice(0, 8)}
            </FilterChip>
          ))}
        </FilterRow>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="flex min-w-[64px] items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Entity
        </span>
        <Input
          value={filters.entity ?? ""}
          onChange={(e) => onChange({ entity: e.target.value })}
          placeholder="Vessel, company, port…"
          className="h-7 max-w-[220px] text-[11px]"
        />
        <span className="flex min-w-[64px] items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3 w-3" />
          Time
        </span>
        <Input
          type="date"
          value={filters.timeStart?.slice(0, 10) ?? ""}
          onChange={(e) =>
            onChange({ timeStart: e.target.value ? `${e.target.value}T00:00:00Z` : undefined })
          }
          className="h-7 max-w-[150px] text-[11px]"
        />
        <span className="text-[11px] text-muted-foreground">→</span>
        <Input
          type="date"
          value={filters.timeEnd?.slice(0, 10) ?? ""}
          onChange={(e) =>
            onChange({ timeEnd: e.target.value ? `${e.target.value}T23:59:59Z` : undefined })
          }
          className="h-7 max-w-[150px] text-[11px]"
        />
      </div>
    </div>
  );
}

function FilterRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex min-w-[64px] items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon && <Filter className="h-3 w-3" />}
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Conflict Banner ─────────────────────────── */

function ConflictBanner({
  conflicts,
  onOpenEvidence,
}: {
  conflicts: EvidenceConflict[];
  onOpenEvidence: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-orange-500/40 bg-orange-500/5 p-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-orange-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        {conflicts.length} cross-connector conflict{conflicts.length === 1 ? "" : "s"} detected
      </div>
      <p className="mt-0.5 text-[11px] text-orange-800/80">
        Conflicts are surfaced, never hidden. Every conflict cites its underlying evidence.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {conflicts.slice(0, 4).map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded border border-orange-500/30 bg-background p-2 text-[11px]"
          >
            <span className="rounded bg-orange-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-orange-700">
              {c.dimension}
            </span>
            <span className="font-medium text-foreground">{c.entity}</span>
            <span className="text-muted-foreground">— {c.description}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1">
              {c.evidenceIds.slice(0, 5).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenEvidence(id)}
                  className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] hover:bg-muted"
                  title={`View evidence ${id}`}
                >
                  {id.split(".").slice(0, 2).join(".")}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────── List View ─────────────────────────── */

function EvidenceList({
  items,
  conflictIds,
  onInspect,
}: {
  items: IntelligenceEvidenceItem[];
  conflictIds: Set<string>;
  onInspect?: (item: IntelligenceEvidenceItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-center text-[12px] text-muted-foreground">
        No evidence matches the current filters.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "rounded-md border bg-background p-3 shadow-[0_1px_0_hsl(var(--border))]",
            conflictIds.has(item.id) ? "border-orange-500/50" : "border-border/60",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <ConfidenceChip level={item.confidence} size="sm" />
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    STATUS_TONE[item.status],
                  )}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {TYPE_LABEL[item.evidenceType]}
                </span>
                {item.subject && (
                  <span className="text-[11px] text-muted-foreground">· {item.subject}</span>
                )}
                {conflictIds.has(item.id) && (
                  <span className="inline-flex items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                    <AlertTriangle className="h-3 w-3" />
                    Conflict
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-[13px] font-medium text-foreground">{item.claim}</p>
              {item.summary && (
                <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                  {item.summary}
                </p>
              )}

              <ConfidenceBreakdownBar item={item} cohort={items} />

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>{item.source}</span>
                <span>·</span>
                <span>{formatTs(item.timestamp)}</span>
                {item.connector && (
                  <>
                    <span>·</span>
                    <span>via {item.connector}</span>
                  </>
                )}
                {item.producer && (
                  <>
                    <span>·</span>
                    <span>Producer {item.producer}</span>
                  </>
                )}
                {item.hash && (
                  <>
                    <span>·</span>
                    <span title={item.hash}>Hash {item.hash.slice(0, 10)}…</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {isSafeSourceUrl(item.sourceUrl) && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                >
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                    Source
                  </a>
                </Button>
              )}
              {onInspect && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onInspect(item)}
                >
                  Inspect
                </Button>
              )}
            </div>
          </div>
          {item.oklExplainability && (
            <OklExplainabilityPanel explainability={item.oklExplainability} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ConfidenceBreakdownBar({
  item,
  cohort,
}: {
  item: IntelligenceEvidenceItem;
  cohort: IntelligenceEvidenceItem[];
}) {
  const b = useMemo(() => computeConfidenceBreakdown(item, cohort), [item, cohort]);
  const axes: Array<{ key: keyof typeof b; label: string }> = [
    { key: "identity", label: "Identity" },
    { key: "freshness", label: "Freshness" },
    { key: "completeness", label: "Completeness" },
    { key: "crossSourceAgreement", label: "Cross-source" },
  ];
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
      {axes.map((a) => {
        const v = b[a.key] as number;
        return (
          <div key={a.key} className="min-w-0">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>{a.label}</span>
              <span className="font-mono text-foreground/80">{Math.round(v * 100)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-primary"
                style={{ width: `${Math.max(2, Math.round(v * 100))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Graph View ─────────────────────────── */

function RelationshipGraphView({
  nodes,
  edges,
  focusedId,
  onFocus,
}: {
  nodes: EntityNode[];
  edges: { a: string; b: string; evidenceIds: string[]; label: string }[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-center text-[12px] text-muted-foreground">
        No entities to graph for the current filters.
      </div>
    );
  }
  const width = 720;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 40;
  const positioned = nodes.slice(0, 24).map((n, i, arr) => {
    const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
  const posById = new Map(positioned.map((p) => [p.id, p]));

  return (
    <div className="rounded-md border border-border/60 bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Nodes represent entities from every evidence source. Edges connect entities that appear in the same evidence item — every edge is traceable.</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
        <div className="overflow-hidden rounded border border-border/50 bg-muted/20">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[420px] w-full"
            role="img"
            aria-label="Entity relationship graph"
          >
            {edges.map((e, i) => {
              const a = posById.get(e.a);
              const b = posById.get(e.b);
              if (!a || !b) return null;
              const strong = Math.min(1, e.evidenceIds.length / 3);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.4 + 0.6 * strong}
                  strokeWidth={1 + strong * 2}
                />
              );
            })}
            {positioned.map((n) => {
              const active = n.id === focusedId;
              const r = Math.min(28, 12 + Math.log2(n.evidenceCount + 1) * 3);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  onClick={() => onFocus(n.id)}
                >
                  <circle
                    r={r}
                    fill={ENTITY_COLOR[n.type]}
                    fillOpacity={active ? 0.9 : 0.65}
                    stroke={active ? ENTITY_COLOR[n.type] : "hsl(var(--background))"}
                    strokeWidth={active ? 3 : 2}
                  />
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize={10}
                  >
                    {n.name.length > 22 ? `${n.name.slice(0, 20)}…` : n.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <ul className="max-h-[420px] overflow-auto rounded border border-border/50 bg-background">
          {positioned.map((n) => {
            const Icon = ENTITY_ICON[n.type];
            const active = n.id === focusedId;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onFocus(n.id)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-border/40 px-2.5 py-1.5 text-left text-[11px]",
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: ENTITY_COLOR[n.type] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  <Badge variant="secondary" className="text-[9px]">
                    {n.evidenceCount}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ─────────────────────────── Timeline View ─────────────────────────── */

function TimelineView({
  items,
  conflictIds,
  onInspect,
}: {
  items: IntelligenceEvidenceItem[];
  conflictIds: Set<string>;
  onInspect?: (item: IntelligenceEvidenceItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-center text-[12px] text-muted-foreground">
        No evidence in the current time window.
      </div>
    );
  }
  const sorted = [...items].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  return (
    <ol className="relative flex flex-col gap-2 border-l-2 border-border/50 pl-4">
      {sorted.map((it) => (
        <li key={it.id} className="relative">
          <span
            className={cn(
              "absolute -left-[21px] top-2 h-3 w-3 rounded-full ring-2 ring-background",
              conflictIds.has(it.id) ? "bg-orange-500" : "bg-primary/70",
            )}
          />
          <div
            className={cn(
              "rounded-md border bg-background p-2.5",
              conflictIds.has(it.id) ? "border-orange-500/50" : "border-border/60",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>{formatTs(it.timestamp)}</span>
              <span>·</span>
              <span>{it.source}</span>
              {it.connector && (
                <>
                  <span>·</span>
                  <span>via {it.connector}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ConfidenceChip level={it.confidence} size="sm" />
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  STATUS_TONE[it.status],
                )}
              >
                {STATUS_LABEL[it.status]}
              </span>
              <span className="text-[12px] font-medium text-foreground">{it.claim}</span>
              {onInspect && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-[10px]"
                  onClick={() => onInspect(it)}
                >
                  Inspect
                </Button>
              )}
            </div>
            {it.oklExplainability && (
              <OklExplainabilityPanel explainability={it.oklExplainability} compact />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────── Source View ─────────────────────────── */

function SourceView({
  items,
  conflictIds,
  onInspect,
}: {
  items: IntelligenceEvidenceItem[];
  conflictIds: Set<string>;
  onInspect?: (item: IntelligenceEvidenceItem) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, IntelligenceEvidenceItem[]>();
    for (const it of items) {
      const key = it.source;
      const arr = m.get(key) ?? [];
      arr.push(it);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-center text-[12px] text-muted-foreground">
        No sources match the current filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {groups.map(([source, rows]) => {
        const chipCounts = rows.reduce<Record<EvidenceConfidence, number>>(
          (acc, r) => ({ ...acc, [r.confidence]: (acc[r.confidence] ?? 0) + 1 }),
          { VERIFIED: 0, OBSERVED: 0, INFERRED: 0, UNCONFIRMED: 0 },
        );
        const latest = rows.reduce((a, b) =>
          new Date(a.timestamp) > new Date(b.timestamp) ? a : b,
        );
        return (
          <div key={source} className="rounded-md border border-border/60 bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">{source}</h3>
              <Badge variant="secondary" className="text-[10px]">
                {rows.length}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {CONFIDENCES.map((c) =>
                chipCounts[c] > 0 ? (
                  <span
                    key={c}
                    className="rounded border border-border/60 px-1 py-0.5"
                  >
                    {c} · {chipCounts[c]}
                  </span>
                ) : null,
              )}
              <span className="ml-auto">Latest {formatTs(latest.timestamp)}</span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rows.slice(0, 5).map((it) => (
                <li
                  key={it.id}
                  className={cn(
                    "flex items-start gap-2 rounded border bg-muted/20 p-2 text-[11px]",
                    conflictIds.has(it.id) ? "border-orange-500/50" : "border-border/40",
                  )}
                >
                  <ConfidenceChip level={it.confidence} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{it.claim}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatTs(it.timestamp)}
                    </div>
                  </div>
                  {onInspect && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onInspect(it)}
                    >
                      Open
                    </Button>
                  )}
                </li>
              ))}
              {rows.length > 5 && (
                <li className="text-center text-[10px] text-muted-foreground">
                  + {rows.length - 5} more
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
