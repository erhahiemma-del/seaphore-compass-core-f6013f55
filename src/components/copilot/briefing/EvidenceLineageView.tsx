/**
 * EvidenceLineageView — projection of the Evidence Lineage Trace.
 *
 * For every recommendation, the officer sees:
 *   1. Which evidence was used (source, grade, excerpt, hash, retrieval time)
 *   2. Which shared operational context links scoped the recommendation
 *      (mission slices, hypotheses, prior decisions, conversation anchor)
 *   3. Which evidence was discarded — and why
 *
 * Presentation-only. All data comes from `buildLineageTrace`.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, FileSearch, GitBranch, Info, XCircle } from "lucide-react";
import { SectionShell } from "./primitives";
import { ExplainableConfidenceChip } from "@/components/intelligence/ExplainableConfidenceChip";
import type {
  DiscardedEvidence,
  LineageContextLink,
  LineageEvidence,
  LineageTrace,
  RecommendationLineage,
} from "@/lib/lineage/types";

const GRADE_TONE: Record<string, string> = {
  VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  CORROBORATED: "border-teal-500/40 bg-teal-500/10 text-teal-800",
  OBSERVED: "border-sky-500/40 bg-sky-500/10 text-sky-800",
  REPORTED: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  INFERRED: "border-orange-500/40 bg-orange-500/10 text-orange-800",
  UNKNOWN: "border-muted bg-muted/40 text-muted-foreground",
};

const ORIGIN_LABEL: Record<DiscardedEvidence["origin"], string> = {
  workspace_rejected: "Workspace · Rejected",
  hypothesis_contradicting: "Hypothesis · Contradicting",
  fusion_conflict: "Fusion · Conflict",
  intelligence_gap: "Intelligence Gap",
  information_needed: "Still Needed",
};

function EvidenceRow({ ev }: { ev: LineageEvidence }) {
  const tone = GRADE_TONE[ev.grade] ?? GRADE_TONE.UNKNOWN;
  return (
    <li className="flex items-start gap-2 rounded-md border border-border/60 bg-background/60 p-2 text-[12px]">
      <span
        className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone}`}
      >
        {ev.grade}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{ev.source}</p>
        {ev.excerpt && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{ev.excerpt}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {ev.collectedAt && <span>Collected {ev.collectedAt.slice(0, 16).replace("T", " ")}Z</span>}
          {ev.hash && <span title={ev.hash}>Hash {ev.hash.slice(0, 10)}…</span>}
          <span title={ev.id}>Id {ev.id.slice(0, 10)}</span>
        </div>
      </div>
    </li>
  );
}

function ContextLinkRow({ link }: { link: LineageContextLink }) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2 text-[12px]">
      <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{link.label}</p>
        {link.detail && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{link.detail}</p>
        )}
      </div>
    </li>
  );
}

function DiscardedRow({ d }: { d: DiscardedEvidence }) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[12px]">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/80" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{d.label}</span>
          <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-destructive">
            {ORIGIN_LABEL[d.origin]}
          </span>
          {d.source && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {d.source}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{d.reason}</p>
      </div>
    </li>
  );
}

function RecommendationCard({ rec }: { rec: RecommendationLineage }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-accent/40"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {rec.action}
        </span>
        <ExplainableConfidenceChip
          confidenceBadge={rec.confidenceBadge}
          supporting={rec.supporting}
          discarded={rec.discarded}
          size="sm"
          className="shrink-0"
        />
      </button>
      {open && (
        <div className="space-y-4 px-3 py-3">
          {rec.rationale && (
            <p className="rounded-md bg-muted/40 p-2 text-[12px] text-foreground/90">
              <span className="mr-1 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                Rationale
              </span>
              {rec.rationale}
            </p>
          )}

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileSearch className="h-3 w-3" />
              Evidence used ({rec.supporting.length})
            </p>
            {rec.supporting.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 p-2 text-[11px] italic text-muted-foreground">
                No citation-level evidence was attached to this recommendation.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {rec.supporting.map((e) => (
                  <EvidenceRow key={e.id} ev={e} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              Shared operational context ({rec.sharedContext.length})
            </p>
            {rec.sharedContext.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 p-2 text-[11px] italic text-muted-foreground">
                No mission or workspace state was linked to this recommendation.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {rec.sharedContext.map((l, i) => (
                  <ContextLinkRow key={`${l.kind}-${l.ref ?? i}`} link={l} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <XCircle className="h-3 w-3" />
              Discarded / not used ({rec.discarded.length})
            </p>
            {rec.discarded.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 p-2 text-[11px] italic text-muted-foreground">
                No evidence was rejected or contradicted for this turn.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {rec.discarded.map((d) => (
                  <DiscardedRow key={d.id} d={d} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function EvidenceLineageView({ trace }: { trace: LineageTrace }) {
  const [expanded, setExpanded] = useState(false);
  const recCount = trace.recommendations.length;

  return (
    <SectionShell
      title="Evidence Lineage"
      icon={<GitBranch className="h-3.5 w-3.5" />}
      actions={
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {recCount} recommendation{recCount === 1 ? "" : "s"}
        </span>
      }
    >
      <div className="mb-2 flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{trace.notice}</span>
      </div>

      {recCount === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-3 text-[12px] italic text-muted-foreground">
          No recommendations were produced for this turn, so there is no lineage
          to project.
        </p>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {expanded ? "Collapse all" : "Expand all"}
            </button>
          </div>
          <div key={expanded ? "open" : "closed"} className="space-y-3">
            {trace.recommendations.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </>
      )}

      {trace.globalDiscarded.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <XCircle className="h-3 w-3" />
            Unattached discarded evidence ({trace.globalDiscarded.length})
          </p>
          <ul className="space-y-1.5">
            {trace.globalDiscarded.map((d) => (
              <DiscardedRow key={d.id} d={d} />
            ))}
          </ul>
        </div>
      )}
    </SectionShell>
  );
}
