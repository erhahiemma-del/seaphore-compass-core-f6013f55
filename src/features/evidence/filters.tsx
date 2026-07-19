/**
 * Evidence Library — production filter controls.
 *
 * Every dropdown is a real, searchable, keyboard-accessible control wired to
 * dynamic options derived from the loaded evidence set (Supabase-first with
 * seed fallback via evidenceService). Filters compose with AND logic and are
 * persisted to localStorage so navigation preserves the officer's view.
 *
 * Design system tokens only — the sidebar chrome is unchanged; only the inert
 * placeholder buttons became real Popover-driven components.
 */
import * as React from "react";
import { Search, ChevronDown, Check, X, Save, Calendar as CalIcon } from "lucide-react";
import { format, isWithinInterval, startOfDay, endOfDay, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { EvidenceItem } from "@/features/evidence/data";
import { portName, vesselName } from "@/features/evidence/data";

/* ==========================================================================
 * State model
 * ========================================================================== */

export interface EvidenceFilters {
  search: string;
  types: string[];
  levels: string[];
  investigations: string[];
  entities: string[];       // vessel ids OR company names, prefixed "v:" / "c:"
  ports: string[];          // port codes
  officers: string[];
  classifications: string[];
  tags: string[];
  dateFrom?: string;        // ISO
  dateTo?: string;          // ISO
}

export const EMPTY_FILTERS: EvidenceFilters = {
  search: "",
  types: [], levels: [], investigations: [],
  entities: [], ports: [], officers: [],
  classifications: [], tags: [],
};

const STORAGE_KEY = "seaphore.evidence.filters.v1";

export function loadPersistedFilters(): EvidenceFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<EvidenceFilters>) };
  } catch {
    return EMPTY_FILTERS;
  }
}
export function persistFilters(f: EvidenceFilters) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

/** Total selected dimensions (not per-option count) for the Apply badge. */
export function activeFilterCount(f: EvidenceFilters): number {
  return (
    (f.search.trim() ? 1 : 0) +
    f.types.length + f.levels.length + f.investigations.length +
    f.entities.length + f.ports.length + f.officers.length +
    f.classifications.length + f.tags.length +
    (f.dateFrom || f.dateTo ? 1 : 0)
  );
}

/* ==========================================================================
 * Option derivation
 * ========================================================================== */

export interface FacetOption { value: string; label: string; count: number }

function facet(items: EvidenceItem[], pick: (i: EvidenceItem) => string | string[] | undefined | null): FacetOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const it of items) {
    const raw = pick(it);
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const v of values) {
      if (!v) continue;
      const prev = map.get(v);
      map.set(v, { label: v, count: (prev?.count ?? 0) + 1 });
    }
  }
  return Array.from(map.entries())
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface FacetSet {
  types: FacetOption[];
  levels: FacetOption[];
  investigations: FacetOption[];
  entities: FacetOption[];
  ports: FacetOption[];
  officers: FacetOption[];
  classifications: FacetOption[];
  tags: FacetOption[];
}

export function deriveFacets(items: EvidenceItem[]): FacetSet {
  return {
    types: facet(items, (i) => i.kind),
    levels: facet(items, (i) => i.confidence).map((o) => ({
      ...o,
      label: o.value.charAt(0).toUpperCase() + o.value.slice(1),
    })),
    investigations: facet(items, (i) => i.linkedInvestigation),
    entities: (() => {
      // Build a combined entity facet from vessels + companies with typed values.
      const rows: FacetOption[] = [];
      const push = (value: string, label: string) => {
        const found = rows.find((r) => r.value === value);
        if (found) found.count += 1;
        else rows.push({ value, label, count: 1 });
      };
      for (const it of items) {
        if (it.linkedVesselId) push(`v:${it.linkedVesselId}`, `Vessel · ${vesselName(it.linkedVesselId) ?? it.linkedVesselId}`);
        if (it.linkedCompany)  push(`c:${it.linkedCompany}`, `Company · ${it.linkedCompany}`);
      }
      return rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    })(),
    ports: facet(items, (i) => i.linkedPortCode).map((o) => ({
      ...o,
      label: portName(o.value) ?? o.value,
    })),
    officers: facet(items, (i) => i.uploadedBy),
    classifications: facet(items, (i) => i.classification),
    tags: facet(items, (i) => i.tags),
  };
}

/* ==========================================================================
 * Filter application (AND logic)
 * ========================================================================== */

export function applyEvidenceFilters(items: EvidenceItem[], f: EvidenceFilters, extraSearch = ""): EvidenceItem[] {
  const q = `${f.search} ${extraSearch}`.trim().toLowerCase();
  const from = f.dateFrom ? new Date(f.dateFrom) : undefined;
  const to = f.dateTo ? new Date(f.dateTo) : undefined;

  return items.filter((e) => {
    if (q) {
      const hay = `${e.refNumber} ${e.kind} ${e.description} ${e.tags.join(" ")} ${e.uploadedBy} ${e.source} ${e.linkedInvestigation ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.types.length && !f.types.includes(e.kind)) return false;
    if (f.levels.length && !f.levels.includes(e.confidence)) return false;
    if (f.classifications.length && !f.classifications.includes(e.classification)) return false;
    if (f.investigations.length && (!e.linkedInvestigation || !f.investigations.includes(e.linkedInvestigation))) return false;
    if (f.ports.length && (!e.linkedPortCode || !f.ports.includes(e.linkedPortCode))) return false;
    if (f.officers.length && !f.officers.includes(e.uploadedBy)) return false;
    if (f.tags.length && !e.tags.some((t) => f.tags.includes(t))) return false;
    if (f.entities.length) {
      const own: string[] = [];
      if (e.linkedVesselId) own.push(`v:${e.linkedVesselId}`);
      if (e.linkedCompany)  own.push(`c:${e.linkedCompany}`);
      if (!own.some((v) => f.entities.includes(v))) return false;
    }
    if (from || to) {
      const at = new Date(e.uploadedAt);
      if (from && at < startOfDay(from)) return false;
      if (to && at > endOfDay(to)) return false;
    }
    return true;
  });
}

/* ==========================================================================
 * Reusable dropdowns
 * ========================================================================== */

interface MultiSelectProps {
  label: string;
  hint: string;
  options: FacetOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
}

export function MultiSelectFilter({
  label, hint, options, selected, onChange, loading, error, emptyLabel = "No options available",
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); }, [open]);

  const debouncedQuery = useDebouncedValue(query, 200);

  const visible = React.useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
  }, [options, debouncedQuery]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange([]); };

  const summary = selected.length === 0 ? hint
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selected`;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-slate">
        <span>{label}</span>
        {selected.length > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] text-[color:var(--color-blue)] hover:underline"
            aria-label={`Clear ${label}`}
          >
            <X className="h-2.5 w-2.5" /> {selected.length}
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`filter-trigger-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn(
              "flex w-full items-center justify-between rounded-md border border-line/60 bg-surface-2/40 px-2 py-1.5 text-[11.5px] text-foreground hover:bg-surface-2/60 focus:outline-none focus:ring-1 focus:ring-[color:var(--color-blue)]",
              selected.length > 0 && "border-[color:var(--color-blue)]/60",
            )}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className={cn("truncate", selected.length === 0 && "text-slate")}>{summary}</span>
            <ChevronDown className={cn("h-3 w-3 shrink-0 text-slate transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="w-[260px] border-line/70 bg-surface-1 p-0 text-foreground">
          <div className="border-b border-line/60 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full rounded border border-line/50 bg-surface-2/50 py-1 pl-6 pr-2 text-[11.5px] text-foreground placeholder:text-slate focus:outline-none focus:ring-1 focus:ring-[color:var(--color-blue)]"
              />
            </div>
          </div>
          <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-4 text-center text-[11px] text-slate">Loading…</div>
            ) : error ? (
              <div className="px-3 py-4 text-center text-[11px] text-rose-400">{error}</div>
            ) : visible.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-slate">
                {options.length === 0 ? emptyLabel : "No matches"}
              </div>
            ) : (
              visible.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.value)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11.5px] hover:bg-surface-2/60",
                      on && "bg-[color:var(--color-blue)]/10 text-foreground",
                    )}
                  >
                    <span className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                      on ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]" : "border-line/70 bg-surface-2/40",
                    )}>
                      {on && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    <span className="text-[10px] text-slate">{o.count}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-line/60 p-2 text-[10.5px] text-slate">
              <span>{selected.length} selected</span>
              <button
                onClick={() => onChange([])}
                className="rounded px-1.5 py-0.5 text-[color:var(--color-blue)] hover:bg-surface-2/60"
              >
                Clear
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ==========================================================================
 * Date range with presets
 * ========================================================================== */

interface DateRangeProps {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}

const PRESETS: { key: string; label: string; range: () => { from: Date; to: Date } }[] = [
  { key: "today", label: "Today",        range: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { key: "7d",    label: "Last 7 Days",  range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { key: "30d",   label: "Last 30 Days", range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
  { key: "90d",   label: "Last 90 Days", range: () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }) },
];

export function DateRangeFilter({ from, to, onChange }: DateRangeProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<DateRange | undefined>({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  React.useEffect(() => {
    setPending({ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });
  }, [from, to]);

  const active = Boolean(from || to);
  const summary = active
    ? `${from ? format(new Date(from), "MMM d, yyyy") : "…"} – ${to ? format(new Date(to), "MMM d, yyyy") : "…"}`
    : "All Dates";

  const apply = (r?: DateRange) => {
    onChange(r?.from?.toISOString(), r?.to?.toISOString());
    setOpen(false);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-slate">
        <span>Date Range</span>
        {active && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(undefined, undefined); }}
            className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] text-[color:var(--color-blue)] hover:underline"
          >
            <X className="h-2.5 w-2.5" /> Clear
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between rounded-md border border-line/60 bg-surface-2/40 px-2 py-1.5 text-[11.5px] text-foreground hover:bg-surface-2/60 focus:outline-none focus:ring-1 focus:ring-[color:var(--color-blue)]",
              active && "border-[color:var(--color-blue)]/60",
            )}
          >
            <span className={cn("truncate flex items-center gap-1.5", !active && "text-slate")}>
              <CalIcon className="h-3 w-3" />
              {summary}
            </span>
            <ChevronDown className={cn("h-3 w-3 text-slate transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="w-auto max-w-[92vw] border-line/70 bg-surface-1 p-0 text-foreground">
          <div className="flex flex-col md:flex-row">
            <div className="flex flex-col gap-1 border-b border-line/60 p-2 md:min-w-[140px] md:border-b-0 md:border-r">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { const r = p.range(); apply({ from: r.from, to: r.to }); }}
                  className="w-full rounded px-2 py-1.5 text-left text-[11.5px] text-foreground hover:bg-surface-2/60"
                >
                  {p.label}
                </button>
              ))}
              <div className="mt-1 border-t border-line/60 pt-1 text-[10px] uppercase tracking-[0.06em] text-slate">
                Custom Range
              </div>
            </div>
            <div className="p-1">
              <Calendar
                mode="range"
                selected={pending}
                onSelect={setPending}
                numberOfMonths={2}
                className="text-[12px]"
              />
              <div className="flex items-center justify-between gap-2 border-t border-line/60 p-2">
                <button
                  onClick={() => { setPending(undefined); apply(undefined); }}
                  className="rounded px-2 py-1 text-[11px] text-slate hover:bg-surface-2/60"
                >
                  Reset
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded border border-line/60 px-2 py-1 text-[11px] text-foreground hover:bg-surface-2/60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => apply(pending)}
                    disabled={!pending?.from}
                    className="rounded bg-[color:var(--color-blue)]/90 px-3 py-1 text-[11px] font-semibold text-white hover:bg-[color:var(--color-blue)] disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ==========================================================================
 * Sidebar
 * ========================================================================== */

interface SidebarProps {
  items: EvidenceItem[];
  filters: EvidenceFilters;
  setFilters: React.Dispatch<React.SetStateAction<EvidenceFilters>>;
  loading?: boolean;
  error?: string | null;
}

export function EvidenceFilterSidebar({ items, filters, setFilters, loading, error }: SidebarProps) {
  const facets = React.useMemo(() => deriveFacets(items), [items]);
  const [filterQuery, setFilterQuery] = React.useState("");
  const active = activeFilterCount(filters);

  const patch = (p: Partial<EvidenceFilters>) => setFilters((prev) => ({ ...prev, ...p }));
  const clear = () => setFilters(EMPTY_FILTERS);

  // Static enum facets are enriched from the data when present, otherwise
  // fall back to the canonical enum so options never disappear entirely.
  const LEVELS: FacetOption[] = ["verified", "observed", "inferred", "unconfirmed"].map((k) => {
    const found = facets.levels.find((o) => o.value === k);
    return found ?? { value: k, label: k.charAt(0).toUpperCase() + k.slice(1), count: 0 };
  });
  const CLASSIFICATIONS: FacetOption[] = ["Official Document", "Field Capture", "System Ingest", "Third-Party Feed", "OSINT"].map((k) => {
    const found = facets.classifications.find((o) => o.value === k);
    return found ?? { value: k, label: k, count: 0 };
  });

  // Every filter row is described here so the top-of-sidebar search can hide
  // rows whose label doesn't match — helping officers focus one facet at a time.
  const rows: { key: string; label: string; node: React.ReactNode }[] = [
    { key: "types",           label: "Evidence Type",  node: <MultiSelectFilter label="Evidence Type"  hint="All Types"           options={facets.types}           selected={filters.types}           onChange={(v) => patch({ types: v })}           loading={loading} error={error} /> },
    { key: "levels",          label: "Confidence Level", node: <MultiSelectFilter label="Confidence Level" hint="All Levels"       options={LEVELS}                 selected={filters.levels}          onChange={(v) => patch({ levels: v })} /> },
    { key: "investigations",  label: "Investigation",  node: <MultiSelectFilter label="Investigation"  hint="All Investigations"  options={facets.investigations}  selected={filters.investigations}  onChange={(v) => patch({ investigations: v })}  loading={loading} error={error} /> },
    { key: "entities",        label: "Entity",         node: <MultiSelectFilter label="Entity"         hint="All Entities"        options={facets.entities}        selected={filters.entities}        onChange={(v) => patch({ entities: v })}        loading={loading} error={error} /> },
    { key: "ports",           label: "Port",           node: <MultiSelectFilter label="Port"           hint="All Ports"           options={facets.ports}           selected={filters.ports}           onChange={(v) => patch({ ports: v })}           loading={loading} error={error} /> },
    { key: "date",            label: "Date Range",     node: <DateRangeFilter from={filters.dateFrom} to={filters.dateTo} onChange={(f, t) => patch({ dateFrom: f, dateTo: t })} /> },
    { key: "officers",        label: "Uploaded By",    node: <MultiSelectFilter label="Uploaded By"    hint="All Officers"        options={facets.officers}        selected={filters.officers}        onChange={(v) => patch({ officers: v })}        loading={loading} error={error} /> },
    { key: "classifications", label: "Classification", node: <MultiSelectFilter label="Classification" hint="All Classifications" options={CLASSIFICATIONS}        selected={filters.classifications} onChange={(v) => patch({ classifications: v })} /> },
    { key: "tags",            label: "Tags",           node: <MultiSelectFilter label="Tags"           hint="All Tags"            options={facets.tags}            selected={filters.tags}            onChange={(v) => patch({ tags: v })}            loading={loading} error={error} /> },
  ];

  const q = filterQuery.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;

  return (
    <aside className="rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          Filter Evidence{active > 0 && <span className="ml-1.5 rounded bg-[color:var(--color-blue)]/20 px-1.5 py-0.5 text-[10px] text-[color:var(--color-blue)]">{active}</span>}
        </span>
        <button
          onClick={clear}
          className={cn("text-[10.5px] hover:underline", active > 0 ? "text-[color:var(--color-blue)]" : "text-slate/60 cursor-default")}
          disabled={active === 0}
        >
          Clear All
        </button>
      </header>
      <div className="space-y-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate" />
          <input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search filters..."
            className="w-full rounded-md border border-line/50 bg-surface-2/40 py-1.5 pl-7 pr-2 text-[11.5px] text-foreground placeholder:text-slate focus:outline-none focus:ring-1 focus:ring-[color:var(--color-blue)]"
          />
        </div>
        {shown.length === 0 && (
          <div className="rounded border border-dashed border-line/50 px-2 py-4 text-center text-[11px] text-slate">
            No filters match “{filterQuery}”
          </div>
        )}
        {shown.map((r) => <React.Fragment key={r.key}>{r.node}</React.Fragment>)}
        <button
          onClick={() => { /* filters apply live — this is a visual confirmation */ }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-[color:var(--color-blue)]/90 px-3 py-2 text-[11.5px] font-semibold text-white hover:bg-[color:var(--color-blue)]"
        >
          Apply Filters ({active})
        </button>
        <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-3 py-2 text-[11.5px] text-foreground hover:bg-surface-2/60">
          <Save className="h-3 w-3" /> Save View
        </button>
      </div>
    </aside>
  );
}
