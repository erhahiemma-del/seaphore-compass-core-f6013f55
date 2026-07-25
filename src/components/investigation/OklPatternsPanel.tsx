/**
 * OklPatternsPanel — Operational Knowledge Layer patterns projected inside a
 * Maritime Investigation Workspace.
 *
 * Golden Rule compliance:
 *   • Every pattern shows its reasoning trace, 5-level Confidence Pyramid,
 *     supporting/contradictory evidence ids, source connectors, and
 *     alternative benign explanations.
 *   • Every recommended action is officer-approval-gated. Approve → task +
 *     decision. Reject → decision only. Both are audited on the timeline.
 *   • Drill-down links open the Intelligence Evidence Explorer filtered to
 *     the pattern's investigation so the officer can inspect the evidence
 *     chain that produced the reasoning.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";

import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { useWorkspaceStore } from "@/stores/workspace.store";
import {
  analyzeOperationalKnowledge,
  type OperationalPattern,
  type OperationalRecommendation,
} from "@/services/okl";
import {
  DEMO_UIP,
  DEMO_HISTORICAL,
  DEMO_INVESTIGATIONS,
} from "@/services/okl/fixtures";
import { autoIngestOklIntoInvestigations } from "@/services/okl/auto-ingest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const RISK_STYLE: Record<OperationalPattern["riskLevel"], string> = {
  LOW: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  MEDIUM: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  HIGH: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  CRITICAL: "bg-red-500/10 text-red-700 border-red-500/40",
};

const URGENCY_PRIORITY: Record<
  OperationalRecommendation["urgency"],
  "CRITICAL" | "HIGH" | "MEDIUM"
> = { IMMEDIATE: "CRITICAL", PRIORITY: "HIGH", ROUTINE: "MEDIUM" };

function approvalKey(recId: string) {
  return `okl:rec:${recId}`;
}
function rejectKey(recId: string) {
  return `okl:reject:${recId}`;
}

export function OklPatternsPanel({ w }: { w: InvestigationWorkspace }) {
  const addTask = useWorkspaceStore((s) => s.addTask);
  const addDecision = useWorkspaceStore((s) => s.addDecision);
  const addTimelineEvent = useWorkspaceStore((s) => s.addTimelineEvent);

  const linkedIds = useMemo(
    () => new Set(w.oklPatternIds ?? []),
    [w.oklPatternIds],
  );

  const allPatterns = useMemo(() => {
    const pkg = analyzeOperationalKnowledge({
      uip: DEMO_UIP,
      historical: DEMO_HISTORICAL,
      investigations: DEMO_INVESTIGATIONS,
    });
    return pkg.patterns;
  }, []);

  const patterns = useMemo(
    () => allPatterns.filter((p) => linkedIds.has(p.id)),
    [allPatterns, linkedIds],
  );

  function handleAutoIngest() {
    const res = autoIngestOklIntoInvestigations(
      analyzeOperationalKnowledge({
        uip: DEMO_UIP,
        historical: DEMO_HISTORICAL,
        investigations: DEMO_INVESTIGATIONS,
      }),
    );
    const mine = res.perInvestigation.find((r) => r.investigationId === w.id);
    if (!mine || mine.linkedPatterns === 0) {
      toast.info("No new OKL patterns match this investigation.");
      return;
    }
    toast.success("OKL patterns ingested", {
      description: `${mine.linkedPatterns} linked · ${mine.evidenceAdded} evidence · ${mine.tasksAdded} recommendations`,
    });
  }

  function decisionFor(rec: OperationalRecommendation): "approved" | "rejected" | null {
    const approved = w.tasks.some((t) => t.sourceCommand === approvalKey(rec.id));
    if (approved) return "approved";
    const rejected = w.decisions.some((d) => d.detail?.includes(rejectKey(rec.id)));
    if (rejected) return "rejected";
    return null;
  }

  function handleApprove(pattern: OperationalPattern, rec: OperationalRecommendation) {
    addTask(w.id, {
      title: rec.label,
      priority: URGENCY_PRIORITY[rec.urgency],
      sourceCommand: approvalKey(rec.id),
    });
    addDecision(w.id, {
      title: `Approved OKL recommendation: ${rec.label}`,
      detail: `Pattern ${pattern.name} · ${rec.rationale} · confidence ${rec.confidence}% · evidence [${rec.supportingEvidenceIds.join(", ")}]`,
      officer: w.officer,
    });
    addTimelineEvent(w.id, {
      kind: "recommendation",
      label: `OKL recommendation approved: ${rec.label}`,
      detail: `Pattern ${pattern.id} · officer ${w.officer ?? "unknown"}`,
      refId: pattern.id,
    });
    toast.success("Recommendation approved", {
      description: `${rec.label} — task created, decision logged.`,
    });
  }

  function handleReject(pattern: OperationalPattern, rec: OperationalRecommendation) {
    addDecision(w.id, {
      title: `Rejected OKL recommendation: ${rec.label}`,
      detail: `${rejectKey(rec.id)} · Pattern ${pattern.name} · officer weighed alternatives`,
      officer: w.officer,
    });
    addTimelineEvent(w.id, {
      kind: "recommendation",
      label: `OKL recommendation rejected: ${rec.label}`,
      detail: `Pattern ${pattern.id} · officer ${w.officer ?? "unknown"}`,
      refId: pattern.id,
    });
    toast("Recommendation rejected", {
      description: "Officer decision recorded on the case audit trail.",
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Brain className="h-4 w-4 text-violet-600" /> Operational Knowledge
          </h3>
          <p className="text-[11px] text-muted-foreground">
            OKL patterns linked to this case. Reasoning is evidence-backed. Recommendations require officer approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {patterns.length} linked
          </Badge>
          <Button size="sm" variant="outline" onClick={handleAutoIngest}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Sync OKL
          </Button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {patterns.length === 0 ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            No OKL patterns have been linked to this investigation yet. Run <span className="font-medium">Sync OKL</span> to project any detected patterns whose entities overlap this case.
          </p>
        ) : (
          patterns.map((p) => (
            <PatternCard
              key={p.id}
              pattern={p}
              investigationId={w.id}
              decisionFor={decisionFor}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))
        )}

        <p className="border-t pt-2 text-[10px] text-muted-foreground">
          Evidence first. Explainable always. Officer decides.
        </p>
      </div>
    </section>
  );
}

function PatternCard({
  pattern,
  investigationId,
  decisionFor,
  onApprove,
  onReject,
}: {
  pattern: OperationalPattern;
  investigationId: string;
  decisionFor: (r: OperationalRecommendation) => "approved" | "rejected" | null;
  onApprove: (p: OperationalPattern, r: OperationalRecommendation) => void;
  onReject: (p: OperationalPattern, r: OperationalRecommendation) => void;
}) {
  const c = pattern.confidence;
  return (
    <article className="rounded-lg border bg-background/60">
      <header className="flex items-start justify-between gap-3 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RISK_STYLE[pattern.riskLevel]}`}
            >
              <ShieldAlert className="h-3 w-3" />
              {pattern.riskLevel}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {pattern.kind.replace(/_/g, " ")}
            </span>
            <Badge variant="outline" className="text-[10px]">
              conf {c.recommendation}% · {c.tier}
            </Badge>
          </div>
          <h4 className="mt-1 truncate text-sm font-semibold">{pattern.name}</h4>
          <p className="text-[11px] text-muted-foreground">{pattern.operationalImpact}</p>
        </div>
        <Link
          to="/intelligence-evidence"
          search={{ investigation: investigationId, pattern: pattern.id } as never}
          className="shrink-0 text-[11px] text-primary underline-offset-2 hover:underline"
        >
          Drill-down <ExternalLink className="ml-0.5 inline h-3 w-3" />
        </Link>
      </header>

      <div className="grid gap-3 p-3 md:grid-cols-2">
        {/* Confidence Pyramid */}
        <section>
          <SectionLabel icon={Brain}>Confidence Pyramid</SectionLabel>
          <div className="mt-1 grid grid-cols-5 gap-1 text-center">
            {[
              { l: "Identity", v: c.identity },
              { l: "Evidence", v: c.evidence },
              { l: "Fusion", v: c.fusion },
              { l: "Pattern", v: c.pattern },
              { l: "Recomm.", v: c.recommendation },
            ].map((x) => (
              <div key={x.l} className="rounded border bg-background px-1 py-1">
                <div className="text-[9px] uppercase text-muted-foreground">{x.l}</div>
                <div className="text-xs font-semibold">{x.v}</div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{c.explanation}</p>
        </section>

        {/* Reasoning */}
        <section>
          <SectionLabel icon={Lightbulb}>Reasoning trace</SectionLabel>
          <ol className="mt-1 space-y-0.5 text-[11px]">
            {pattern.reasoning.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>
                  <span className="font-medium">{r.step}</span>
                  {r.detail ? <span className="text-muted-foreground"> — {r.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Supporting evidence */}
        <section>
          <SectionLabel icon={CheckCircle2}>Supporting evidence</SectionLabel>
          <div className="mt-1 flex flex-wrap gap-1">
            {pattern.supportingEvidenceIds.length === 0 ? (
              <span className="text-[10px] text-muted-foreground">None recorded</span>
            ) : (
              pattern.supportingEvidenceIds.map((id) => (
                <code key={id} className="rounded bg-muted px-1 py-0.5 text-[10px]">
                  {id}
                </code>
              ))
            )}
          </div>
          {pattern.contradictoryEvidenceIds.length > 0 ? (
            <>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                Contradictions
              </div>
              <div className="flex flex-wrap gap-1">
                {pattern.contradictoryEvidenceIds.map((id) => (
                  <code
                    key={id}
                    className="rounded border border-destructive/40 bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive"
                  >
                    {id}
                  </code>
                ))}
              </div>
            </>
          ) : null}
          <div className="mt-1 text-[10px] text-muted-foreground">
            Sources: {pattern.sourceConnectors.join(", ") || "—"}
          </div>
        </section>

        {/* Alternatives */}
        <section>
          <SectionLabel icon={ChevronRight}>Alternative explanations</SectionLabel>
          {pattern.alternatives.length === 0 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              No credible benign explanations identified.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {pattern.alternatives.map((a, i) => (
                <li key={i}>
                  <span className="font-medium">{a.label}</span>
                  <span className="text-muted-foreground"> ({a.likelihood.toLowerCase()}) — {a.rationale}</span>
                </li>
              ))}
            </ul>
          )}
          {pattern.historicalContext ? (
            <p className="mt-1 text-[10px] italic text-muted-foreground">{pattern.historicalContext}</p>
          ) : null}
        </section>
      </div>

      {/* Recommendations with approval gate */}
      <div className="border-t px-3 py-2">
        <SectionLabel icon={ShieldAlert}>Recommended actions · officer decides</SectionLabel>
        {pattern.recommendations.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">No recommendations produced.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {pattern.recommendations.map((rec) => {
              const state = decisionFor(rec);
              return (
                <li
                  key={rec.id}
                  className="flex items-start justify-between gap-2 rounded border bg-background/60 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{rec.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {rec.urgency.toLowerCase()}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {rec.confidence}%
                      </Badge>
                      {rec.requiresOfficerApproval ? (
                        <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700">
                          approval gated
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{rec.rationale}</p>
                    {rec.supportingEvidenceIds.length > 0 ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Evidence: {rec.supportingEvidenceIds.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {state === "approved" ? (
                      <Badge className="bg-emerald-600 text-[10px] text-white">Approved</Badge>
                    ) : state === "rejected" ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Rejected
                      </Badge>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => onApprove(pattern, rec)}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => onReject(pattern, rec)}
                        >
                          <XCircle className="mr-1 h-3 w-3" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </div>
  );
}
