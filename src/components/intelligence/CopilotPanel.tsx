import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { RiskPill } from "@/components/intelligence/RiskPill";
import type {
  CopilotRecommendation,
  HistoricalSimilarity,
  RelatedInvestigation,
} from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

/**
 * INV-6 Seaphore Copilot side panel (BETA).
 */
export function CopilotPanel({
  recommendations,
  similarity,
  related,
  entitySummary,
  className,
}: {
  recommendations: CopilotRecommendation[];
  similarity: HistoricalSimilarity[];
  related: RelatedInvestigation[];
  entitySummary: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <aside className={cn("space-y-4", className)}>
      <section className="rounded-lg border border-line bg-card p-3 shadow-card">
        <header className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-purple)]/10 text-[color:var(--color-purple)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="type-h2 text-foreground">Seaphore Copilot</span>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
            style={{ color: "#7C3AED", backgroundColor: "#7C3AED14" }}
          >
            BETA
          </span>
        </header>
        <p className="type-small text-slate">
          Recommendations from evidence and rules — every action is yours.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="type-label mb-2 text-slate">Recommended Actions</div>
        <ul className="space-y-1.5">
          {recommendations.map((r) => (
            <li key={r.title}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-line/60 bg-surface-2/60 px-2.5 py-2 text-left motion-fast hover:bg-surface-2"
              >
                <RiskPill level={r.risk} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-foreground">
                    {r.title}
                  </div>
                  <div className="truncate text-[11px] text-slate">{r.detail}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="type-label mb-2 text-slate">Historical Similarity</div>
        <ul className="space-y-2">
          {similarity.map((h) => (
            <li key={h.caseRef} className="rounded-md bg-surface-2/60 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="type-mono text-[11px] font-semibold text-foreground">
                  {h.caseRef}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ color: "#0E7C7B", backgroundColor: "#0E7C7B14" }}
                >
                  {h.matchPct}% match
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-foreground/85">{h.summary}</div>
              <div className="mt-1 flex gap-3 text-[11px] text-slate">
                <span>
                  Revenue loss <b className="text-foreground">{h.revenueLoss}</b>
                </span>
                <span>
                  · Outcome <b className="text-foreground">{h.outcome}</b>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="type-label mb-2 text-slate">Related Investigations</div>
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-slate">
            <tr>
              <th className="pb-1 text-left font-semibold">Case</th>
              <th className="pb-1 text-left font-semibold">Entity</th>
              <th className="pb-1 text-left font-semibold">Risk</th>
              <th className="pb-1 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {related.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1.5 type-mono text-[11px] font-semibold">{r.id}</td>
                <td className="py-1.5 truncate">{r.entity}</td>
                <td className="py-1.5">
                  <RiskPill level={r.risk} />
                </td>
                <td className="py-1.5 text-slate">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="flex items-center justify-between">
          <span className="type-label text-slate">Entity Summary</span>
          <ConfidenceChip tier="inferred" size={9} />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[12px]">
          {entitySummary.map((f) => (
            <div key={f.label}>
              <dt className="text-[10px] uppercase tracking-wider text-slate">{f.label}</dt>
              <dd className="font-semibold text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
        <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
          View full profile <ArrowRight className="h-3 w-3" />
        </button>
      </section>
    </aside>
  );
}
