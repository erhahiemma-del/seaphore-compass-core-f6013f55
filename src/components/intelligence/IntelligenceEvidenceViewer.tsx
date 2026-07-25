/**
 * IntelligenceEvidenceViewer
 *
 * Officer-facing projection of every evidence item feeding an assessment.
 * Each row wears source, timestamp, confidence chip, evidence type, status,
 * and — when appropriate — a link back to the source.
 *
 * Golden Rule: this component NEVER renders raw API payloads. It consumes
 * pre-sanitized `IntelligenceEvidenceItem`s produced by adapters in
 * `src/lib/evidence/intelligence-evidence.ts`.
 */
import { useMemo, useState } from "react";
import { ExternalLink, FileSearch, Filter, Search } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  applyEvidenceFilters,
  type EvidenceStatus,
  type EvidenceType,
  type IntelligenceEvidenceItem,
} from "@/lib/evidence/intelligence-evidence";

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

interface EvidenceViewerProps {
  items: IntelligenceEvidenceItem[];
  /** Optional heading override. */
  title?: string;
  /** Emitted when the officer opens the drill-in for an item. */
  onInspect?: (item: IntelligenceEvidenceItem) => void;
  className?: string;
}

export function IntelligenceEvidenceViewer({
  items,
  title = "Intelligence Evidence",
  onInspect,
  className,
}: EvidenceViewerProps) {
  const [types, setTypes] = useState<Set<EvidenceType>>(new Set());
  const [statuses, setStatuses] = useState<Set<EvidenceStatus>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const allSources = useMemo(
    () => Array.from(new Set(items.map((i) => i.source))).sort(),
    [items],
  );

  const filtered = useMemo(
    () =>
      applyEvidenceFilters(items, { types, statuses, sources, search }).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [items, types, statuses, sources, search],
  );

  const toggle = <T,>(set: Set<T>, value: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          <Badge variant="secondary" className="text-[10px]">
            {filtered.length}/{items.length}
          </Badge>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claim, subject, or source…"
            className="h-8 pl-8 text-[12px]"
          />
        </div>
      </header>

      {/* Filter row */}
      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
        <FilterRow label="Type" icon>
          {(Object.keys(TYPE_LABEL) as EvidenceType[]).map((t) => (
            <FilterChip
              key={t}
              active={types.has(t)}
              onClick={() => toggle(types, t, setTypes)}
            >
              {TYPE_LABEL[t]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Status">
          {(Object.keys(STATUS_LABEL) as EvidenceStatus[]).map((s) => (
            <FilterChip
              key={s}
              active={statuses.has(s)}
              onClick={() => toggle(statuses, s, setStatuses)}
            >
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </FilterRow>
        {allSources.length > 1 && (
          <FilterRow label="Source">
            {allSources.map((s) => (
              <FilterChip
                key={s}
                active={sources.has(s)}
                onClick={() => toggle(sources, s, setSources)}
              >
                {s}
              </FilterChip>
            ))}
          </FilterRow>
        )}
      </div>

      {/* Rows */}
      <ul className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <li className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-center text-[12px] text-muted-foreground">
            No evidence matches the current filters.
          </li>
        ) : (
          filtered.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-border/60 bg-background p-3 shadow-[0_1px_0_hsl(var(--border))]"
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
                      <span className="text-[11px] text-muted-foreground">
                        · {item.subject}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-[13px] font-medium text-foreground">
                    {item.claim}
                  </p>
                  {item.summary && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                      {item.summary}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{item.source}</span>
                    <span>·</span>
                    <span>{formatTs(item.timestamp)}</span>
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
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
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
            </li>
          ))
        )}
      </ul>
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
  children: React.ReactNode;
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
  children: React.ReactNode;
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
