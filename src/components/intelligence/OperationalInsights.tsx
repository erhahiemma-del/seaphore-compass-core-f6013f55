/**
 * OperationalInsights — presentation component for OKL packages.
 *
 * Renders operational patterns produced by the Operational Knowledge
 * Layer. Every pattern surfaces the full Confidence Pyramid, supporting
 * evidence, source connectors, contradictions, alternative explanations,
 * and a reasoning trace. The officer decides.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  Brain,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Fingerprint,
  Layers,
  Link2,
  ListTree,
  Radar,
  ShieldAlert,
  Sparkles,
  Workflow,
} from "lucide-react";
import type {
  ConfidencePyramid,
  OperationalKnowledgePackage,
  OperationalPattern,
  RiskLevel,
} from "@/services/okl";
import { cn } from "@/lib/utils";

const RISK_TONE: Record<RiskLevel, string> = {
  LOW: "bg-slate-50 text-slate-700 ring-slate-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
};

const RISK_DOT: Record<RiskLevel, string> = {
  LOW: "bg-slate-400",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-orange-500",
  CRITICAL: "bg-rose-500",
};

const TIER_TONE: Record<ConfidencePyramid["tier"], string> = {
  LOW: "text-slate-600 ring-slate-200",
  MEDIUM: "text-amber-700 ring-amber-200",
  HIGH: "text-emerald-700 ring-emerald-200",
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-[11px] text-slate-600">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-slate-900">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div
          className={cn(
            "h-1.5 rounded-full",
            value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${Math.min(100, Math.max(3, value))}%` }}
        />
      </div>
    </div>
  );
}

function PyramidCard({ p, dense }: { p: ConfidencePyramid; dense?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg ring-1 ring-slate-200 bg-white",
        dense ? "p-2.5" : "p-3",
      )}
    >
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Confidence Pyramid
        </span>
        <span
          className={cn(
            "ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
            TIER_TONE[p.tier],
          )}
        >
          {p.tier}
        </span>
      </div>
      <div className={cn("mt-2 grid gap-2", dense ? "grid-cols-5" : "grid-cols-5")}>
        <Bar label="Identity" value={p.identity} />
        <Bar label="Evidence" value={p.evidence} />
        <Bar label="Fusion" value={p.fusion} />
        <Bar label="Pattern" value={p.pattern} />
        <Bar label="Recommend" value={p.recommendation} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-600">{p.explanation}</p>
    </div>
  );
}

function PatternRow({ pattern }: { pattern: OperationalPattern }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", RISK_DOT[pattern.riskLevel])}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900">{pattern.name}</h4>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                RISK_TONE[pattern.riskLevel],
              )}
            >
              {pattern.riskLevel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
              <BadgeCheck className="h-3 w-3" />
              {pattern.confidence.tier} · {pattern.confidence.recommendation}
            </span>
            {pattern.investigationIds?.length ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                <Link2 className="h-3 w-3" />
                {pattern.investigationIds.length} investigation(s)
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-600">{pattern.operationalImpact}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Fingerprint className="h-3 w-3" />
              {pattern.entities.length} entit
              {pattern.entities.length === 1 ? "y" : "ies"}
            </span>
            <span>·</span>
            <span>{pattern.supportingEvidenceIds.length} evidence citations</span>
            <span>·</span>
            <span>{pattern.sourceConnectors.length} source connectors</span>
            {pattern.contradictoryEvidenceIds.length > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  {pattern.contradictoryEvidenceIds.length} contradictions
                </span>
              </>
            )}
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-4">
          <PyramidCard p={pattern.confidence} dense />

          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-lg ring-1 ring-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ListTree className="h-3.5 w-3.5" /> Reasoning trace
              </div>
              <ol className="mt-2 space-y-1 text-[11px] text-slate-700">
                {pattern.reasoning.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-400 tabular-nums">{i + 1}.</span>
                    <span>
                      <span className="font-medium">{r.step}</span>
                      {r.detail ? (
                        <span className="text-slate-500"> — {r.detail}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-lg ring-1 ring-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Brain className="h-3.5 w-3.5" /> Alternative explanations
              </div>
              {pattern.alternatives.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  No alternative explanations recorded.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-[11px] text-slate-700">
                  {pattern.alternatives.map((alt, i) => (
                    <li key={i} className="flex gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1",
                          alt.likelihood === "HIGH"
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : alt.likelihood === "MEDIUM"
                              ? "bg-slate-50 text-slate-700 ring-slate-200"
                              : "bg-slate-50 text-slate-500 ring-slate-200",
                        )}
                      >
                        {alt.likelihood}
                      </span>
                      <span>
                        <span className="font-medium">{alt.label}</span>
                        <span className="text-slate-500"> — {alt.rationale}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-lg ring-1 ring-indigo-100 bg-indigo-50/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-800">
              <Sparkles className="h-3.5 w-3.5" /> Recommended actions
              <span className="ml-2 text-[10px] font-medium uppercase text-indigo-500">
                Officer decides
              </span>
            </div>
            {pattern.recommendations.length === 0 ? (
              <p className="mt-2 text-[11px] text-indigo-700">
                No recommendation reached the evidence threshold.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {pattern.recommendations.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md bg-white p-2.5 ring-1 ring-indigo-100"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {r.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                          r.urgency === "IMMEDIATE"
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : r.urgency === "PRIORITY"
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-slate-50 text-slate-700 ring-slate-200",
                        )}
                      >
                        {r.urgency}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Confidence {r.confidence}
                      </span>
                      {r.requiresOfficerApproval && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                          <ShieldAlert className="h-3 w-3" /> Officer approval required
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">{r.rationale}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Cites {r.supportingEvidenceIds.length} evidence record(s).
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-2 rounded-lg ring-1 ring-slate-200 bg-white p-3 text-[11px] text-slate-600 md:grid-cols-3">
            <div>
              <div className="font-semibold text-slate-700">Related entities</div>
              <ul className="mt-1 space-y-0.5">
                {pattern.entities.map((e) => (
                  <li key={e.id} className="truncate">
                    <span className="uppercase tracking-wide text-slate-400">
                      {e.kind}
                    </span>{" "}
                    {e.label ?? e.id}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-slate-700">Source connectors</div>
              <ul className="mt-1 space-y-0.5">
                {pattern.sourceConnectors.length === 0 ? (
                  <li className="text-slate-400">— none attached to this UIP —</li>
                ) : (
                  pattern.sourceConnectors.map((c) => <li key={c}>{c}</li>)
                )}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-slate-700">Provenance</div>
              <ul className="mt-1 space-y-0.5 text-slate-500">
                <li>UIP {pattern.provenance.uipId}</li>
                <li>Fused {pattern.provenance.fusedPackageId}</li>
                <li>
                  Detector <span className="text-slate-700">{pattern.provenance.detector}</span>
                </li>
              </ul>
            </div>
          </section>

          {pattern.historicalContext && (
            <p className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">Historical context:</span>{" "}
              {pattern.historicalContext}
            </p>
          )}

          <div className="flex flex-wrap gap-2 text-[11px]">
            <Link
              to="/intelligence-evidence"
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white hover:bg-slate-800"
            >
              <Radar className="h-3 w-3" /> Open Evidence Explorer
            </Link>
            <Link
              to="/knowledge-graph"
              className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Workflow className="h-3 w-3" /> View in Knowledge Graph
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function OperationalInsights({
  package: pkg,
  compact,
}: {
  package: OperationalKnowledgePackage;
  compact?: boolean;
}) {
  const grouped = useMemo(() => {
    const order: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    return order
      .map((risk) => ({
        risk,
        items: pkg.patterns.filter((p) => p.riskLevel === risk),
      }))
      .filter((g) => g.items.length > 0);
  }, [pkg.patterns]);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-200">
            <Brain className="h-4.5 w-4.5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Operational Knowledge Layer
            </h3>
            <p className="text-[11px] text-slate-500">
              {pkg.summary.total} operational pattern(s) derived from the fused
              intelligence package.
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[10px]">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as RiskLevel[]).map((r) => (
            <span
              key={r}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1",
                RISK_TONE[r],
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", RISK_DOT[r])} />
              {r} · {pkg.summary.byRisk[r]}
            </span>
          ))}
        </div>
      </header>

      <PyramidCard p={pkg.summary.overallConfidence} />

      {pkg.summary.topRecommendation && (
        <div className="flex items-start gap-3 rounded-xl bg-indigo-50/60 p-3 ring-1 ring-indigo-100">
          <Sparkles className="mt-0.5 h-4 w-4 text-indigo-700" />
          <div className="min-w-0 flex-1 text-xs text-indigo-900">
            <span className="font-semibold">Top recommendation: </span>
            {pkg.summary.topRecommendation.label}
            <span className="text-indigo-700"> — {pkg.summary.topRecommendation.rationale}</span>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-indigo-500">
              {pkg.summary.topRecommendation.urgency} · confidence{" "}
              {pkg.summary.topRecommendation.confidence} · officer decides
            </div>
          </div>
        </div>
      )}

      {pkg.patterns.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center ring-1 ring-slate-200">
          <CircleAlert className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-sm text-slate-600">
            No operational patterns detected in the current fused intelligence
            package.
          </p>
          <p className="text-[11px] text-slate-400">
            OKL will re-run when new evidence enters the UIP.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.risk}>
              {!compact && (
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className={cn("h-2 w-2 rounded-full", RISK_DOT[g.risk])} />
                  {g.risk} risk
                </div>
              )}
              <div className="space-y-2">
                {g.items.map((p) => (
                  <PatternRow key={p.id} pattern={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
