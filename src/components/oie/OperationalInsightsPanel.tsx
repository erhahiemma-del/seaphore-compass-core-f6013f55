/**
 * Sprint 2.5 — Operational Intelligence Engine (OIE) · officer projection.
 *
 * Renders explainable reasoning insights derived exclusively from the OKL.
 * Every insight is stamped with confidence + provenance (source_uip_id,
 * briefing_id, investigation_id, OKL record ids). No connector calls, no
 * recomputation of evidence.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateOieInsights } from "@/lib/oie-reasoning.functions";
import type { OieInsight, OieInsightBundle, OieInsightKind } from "@/services/oie-reasoning/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { Brain, GitCompareArrows, History, Layers, Link2, ShieldAlert, Target } from "lucide-react";

const KIND_META: Record<OieInsightKind, { label: string; icon: React.ReactNode }> = {
  SIMILAR_INVESTIGATION: {
    label: "Similar Investigation",
    icon: <GitCompareArrows className="h-3.5 w-3.5" />,
  },
  RECURRING_PATTERN: { label: "Recurring Pattern", icon: <Layers className="h-3.5 w-3.5" /> },
  HISTORICAL_OUTCOME: { label: "Historical Outcome", icon: <History className="h-3.5 w-3.5" /> },
  EMERGING_RISK: { label: "Emerging Risk", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  RECOMMENDATION_EFFECTIVENESS: {
    label: "Recommendation Effectiveness",
    icon: <Target className="h-3.5 w-3.5" />,
  },
  CROSS_CASE_RELATIONSHIP: {
    label: "Cross-Case Relationship",
    icon: <Link2 className="h-3.5 w-3.5" />,
  },
};

interface Props {
  workspace: InvestigationWorkspace;
}

export function OperationalInsightsPanel({ workspace }: Props) {
  const fn = useServerFn(generateOieInsights);
  const [bundle, setBundle] = useState<OieInsightBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { entityIds, entityLabels } = useMemo(() => {
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const e of workspace.entities ?? []) {
      if (e.id) ids.add(e.id);
      if (e.name) labels.add(e.name);
    }
    if (workspace.subjectId) ids.add(workspace.subjectId);
    if (workspace.subjectName) labels.add(workspace.subjectName);
    return { entityIds: Array.from(ids), entityLabels: Array.from(labels) };
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn({
      data: {
        entityIds,
        entityLabels,
        investigationId: workspace.id,
        limitPerLens: 8,
      },
    })
      .then((res) => {
        if (!cancelled) setBundle(res as OieInsightBundle);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityIds, entityLabels, workspace.id, fn]);

  const grouped = useMemo(() => {
    const g = new Map<OieInsightKind, OieInsight[]>();
    for (const i of bundle?.insights ?? []) {
      const list = g.get(i.kind) ?? [];
      list.push(i);
      g.set(i.kind, list);
    }
    return g;
  }, [bundle]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" /> Operational Intelligence Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" /> Operational Intelligence Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">OIE unavailable: {error}</p>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !bundle || bundle.insights.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4" /> Operational Intelligence Engine
        </CardTitle>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[10px]">
            {bundle?.stats.recordsScanned ?? 0} OKL rows
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {bundle?.stats.uipsTouched ?? 0} UIPs
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground">
            No historical knowledge yet supports operational reasoning on this subject. Close a
            related investigation to seed the OKL.
          </p>
        ) : (
          Array.from(grouped.entries()).map(([kind, list]) => (
            <div key={kind} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {KIND_META[kind].icon}
                <span>{KIND_META[kind].label}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {list.length}
                </Badge>
              </div>
              <ScrollArea className="max-h-56">
                <ul className="space-y-2">
                  {list.map((i) => (
                    <li
                      key={i.id}
                      className="text-xs border border-border/40 rounded-md p-2 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{i.title}</div>
                        <Badge
                          variant={i.confidence >= 75 ? "default" : "secondary"}
                          className="text-[10px] shrink-0"
                          title="System-computed confidence. Officer decides."
                        >
                          {i.confidence}% confidence
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">{i.summary}</div>
                      <div className="text-[11px] text-muted-foreground italic">
                        Why: {i.rationale}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {i.provenance.slice(0, 4).map((p, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-0.5"
                            title={`inv ${p.investigationId} · uip ${p.sourceUipId}${p.briefingId ? ` · briefing ${p.briefingId}` : ""} · ${p.oklRecordIds.length} OKL rows`}
                          >
                            uip {p.sourceUipId.slice(0, 8)} · {p.oklRecordIds.length}r
                          </span>
                        ))}
                        {i.provenance.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{i.provenance.length - 4} more
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          ))
        )}
        <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
          Reasoning-only layer. Every insight above traces to OKL records stamped with
          `source_uip_id`, `briefing_id`, and `investigation_id`. No connector calls. System
          recommends; officer decides.
        </p>
      </CardContent>
    </Card>
  );
}
