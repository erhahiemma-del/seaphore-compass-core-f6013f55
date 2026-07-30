/**
 * INT-01A.3 — Intelligence Provenance Panel
 *
 * Five-tab panel displaying: Execution Trace, Contributors,
 * Confidence Decompositions, Recommendation Lineage, Intelligence Gaps.
 * Consumes a serialised IpefRecord — no additional server calls after load.
 */
import React, { useState } from "react";
import type {
  IpefRecord,
  IpefContributorRecord,
  IpefConfidenceDecomposition,
} from "@/services/ipef/types";

const STATUS_CLS: Record<string, string> = {
  success:  "text-emerald-600 bg-emerald-50 border-emerald-200",
  degraded: "text-amber-700  bg-amber-50  border-amber-200",
  failed:   "text-red-700    bg-red-50    border-red-200",
  skipped:  "text-slate-500  bg-slate-50  border-slate-200",
  "not-run":"text-slate-400  bg-slate-50  border-slate-200",
  high:     "text-emerald-600 bg-emerald-50 border-emerald-200",
  medium:   "text-amber-700  bg-amber-50  border-amber-200",
  low:      "text-red-700    bg-red-50    border-red-200",
  very_high:"text-emerald-700 bg-emerald-50 border-emerald-300",
};
const STATUS_DOT: Record<string, string> = {
  success: "bg-emerald-500", degraded: "bg-amber-500",
  failed: "bg-red-500", skipped: "bg-slate-400", "not-run": "bg-slate-300",
};

function Badge({ label }: { label: string }) {
  const key = label.toLowerCase().replace(/[-_ ]/g, "-");
  const cls = STATUS_CLS[key] ?? STATUS_CLS["not-run"];
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function PipelineTrace({ record }: { record: IpefRecord }) {
  return (
    <div className="space-y-1">
      {record.pipelineTrace.map((stage, i) => (
        <div key={stage.contributorId} className="flex items-start gap-3">
          <div className="flex flex-col items-center pt-1.5">
            <div className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[stage.status] ?? "bg-slate-300"}`} />
            {i < record.pipelineTrace.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 18 }} />
            )}
          </div>
          <div className="flex-1 pb-2 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">{stage.displayName}</span>
              <div className="flex items-center gap-1.5">
                {stage.durationMs != null && (
                  <span className="font-mono text-[10px] text-muted-foreground">{stage.durationMs}ms</span>
                )}
                <Badge label={stage.status} />
              </div>
            </div>
            {stage.facts.length > 0 && (
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                {stage.facts.map((f) => (
                  <div key={f.label} className="flex justify-between gap-1 text-[10px]">
                    <dt className="text-muted-foreground truncate">{f.label}</dt>
                    <dd className="font-mono font-medium text-foreground flex-shrink-0">
                      {String(f.value)}{f.unit ? ` ${f.unit}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {stage.warnings.map((w, wi) => (
              <p key={wi} className="mt-0.5 text-[10px] text-amber-600">⚠ {w}</p>
            ))}
            {stage.errors.map((e, ei) => (
              <p key={ei} className="mt-0.5 text-[10px] text-red-600">✗ {e}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContributorCard({ c }: { c: IpefContributorRecord }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground">{c.displayName}</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">{c.durationMs}ms</span>
          <Badge label={c.status} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {c.facts.map((f) => (
          <div key={f.label} className="flex justify-between gap-1 text-[10px]">
            <dt className="text-muted-foreground truncate">{f.label}</dt>
            <dd className="font-mono font-medium text-foreground flex-shrink-0">
              {String(f.value)}{f.unit ? ` ${f.unit}` : ""}
            </dd>
          </div>
        ))}
      </dl>
      {c.warnings.map((w, i) => <p key={i} className="text-[10px] text-amber-600">⚠ {w}</p>)}
      {c.errors.map((e, i) => <p key={i} className="text-[10px] text-red-600">✗ {e}</p>)}
    </div>
  );
}

function ConfidenceCard({ d }: { d: IpefConfidenceDecomposition }) {
  const pct = Math.round(d.compositeScore * 100);
  const barColor = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground truncate max-w-[55%]">{d.entityLabel}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs font-bold">{pct}%</span>
          <Badge label={d.tier} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {d.factors.map((f) => (
          <div key={f.factor} className="flex justify-between gap-1 text-[10px]">
            <dt className="text-muted-foreground truncate">{f.factor}</dt>
            <dd className="font-mono text-foreground">{(f.contribution * 100).toFixed(1)}%</dd>
          </div>
        ))}
      </dl>
      {d.intelligenceGaps.map((g, i) => (
        <p key={i} className="text-[10px] text-amber-600">⚠ {g}</p>
      ))}
      {d.reasoning && (
        <p className="text-[10px] text-muted-foreground italic leading-relaxed">{d.reasoning}</p>
      )}
    </div>
  );
}

type Tab = "pipeline" | "contributors" | "confidence" | "lineage" | "gaps";

export function ProvenancePanel({ ipef }: { ipef: IpefRecord }) {
  const [tab, setTab] = useState<Tab>("pipeline");
  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "pipeline",     label: "Execution Trace" },
    { id: "contributors", label: "Contributors",   count: ipef.contributors.length },
    { id: "confidence",   label: "Confidence",     count: ipef.confidenceDecompositions.length },
    { id: "lineage",      label: "Lineage",        count: ipef.recommendationProvenance.length },
    { id: "gaps",         label: "Gaps",           count: ipef.intelligenceGaps.length },
  ];
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-semibold text-slate-800">Intelligence Provenance</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={ipef.overallStatus} />
          <span className="font-mono text-[10px] text-muted-foreground">{ipef.totalDurationMs}ms</span>
        </div>
      </div>
      <div className="flex gap-1 border-b border-slate-100 px-3 pt-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px]">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "pipeline" && <PipelineTrace record={ipef} />}
        {tab === "contributors" && (
          <div className="space-y-3">
            {ipef.contributors.map((c) => <ContributorCard key={c.contributorId} c={c} />)}
          </div>
        )}
        {tab === "confidence" && (
          <div className="space-y-3">
            {ipef.confidenceDecompositions.length === 0
              ? <p className="text-xs text-muted-foreground">No entities processed yet. Send a Copilot query.</p>
              : ipef.confidenceDecompositions.map((d) => <ConfidenceCard key={d.entityId} d={d} />)}
          </div>
        )}
        {tab === "lineage" && (
          <div className="space-y-4">
            {ipef.recommendationProvenance.length === 0
              ? <p className="text-xs text-muted-foreground">No recommendations with lineage in this briefing.</p>
              : ipef.recommendationProvenance.map((rp, ri) => (
                <div key={ri} className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">{rp.recommendationText}</p>
                  <div className="pl-2 space-y-0.5">
                    {rp.chain.map((node, ni) => (
                      <div key={ni} className="flex items-start gap-2 text-[10px]">
                        <span className="mt-0.5 flex-shrink-0 text-muted-foreground/50">→</span>
                        <span className={`flex-shrink-0 rounded border px-1 ${STATUS_CLS["not-run"]}`}>{node.kind}</span>
                        <span className="font-medium text-foreground">{node.label}</span>
                        <span className="text-muted-foreground">— {node.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
        {tab === "gaps" && (
          <div className="space-y-1.5">
            {ipef.intelligenceGaps.length === 0
              ? <p className="text-xs text-muted-foreground">No intelligence gaps identified.</p>
              : ipef.intelligenceGaps.map((g, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 flex-shrink-0 text-amber-500">⚠</span>
                  <span className="text-foreground">{g}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 px-5 py-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">ID: {ipef.correlationId.slice(0, 24)}…</span>
        <span className="text-[10px] text-muted-foreground">
          {ipef.contributors.length} contributors · {new Date(ipef.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
