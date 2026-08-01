/**
 * HistoricalKnowledgePanel — surfaces the four Sprint 2.4 knowledge lenses
 * for the active investigation:
 *   • Related Investigations
 *   • Known Patterns
 *   • Historical Decisions
 *   • Recurring Risks
 *
 * Consumes only `queryOklKnowledge` (which reads only the OKL store — never
 * connectors). Provenance is preserved: every row carries the originating
 * `source_uip_id` and, when present, `briefing_id`.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { queryOklKnowledge } from "@/lib/okl-knowledge.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { AlertTriangle, GitBranch, History, Layers } from "lucide-react";

interface Props {
  workspace: InvestigationWorkspace;
}

interface KnowledgeQuery {
  relatedInvestigations: Array<{
    investigationId: string;
    sourceUipIds: string[];
    briefingIds: string[];
    matchedEntityIds: string[];
    recordCount: number;
    lastSeen: string;
  }>;
  knownPatterns: Array<{
    patternKind: string;
    count: number;
    investigationCount: number;
    sampleLabel?: string;
    lastSeen: string;
    maxConfidence: number;
  }>;
  historicalDecisions: Array<{
    recordId: string;
    investigationId: string;
    sourceUipId: string;
    briefingId: string | null;
    label: string;
    detail: string | null;
    confidence: number | null;
    createdAt: string;
  }>;
  recurringRisks: Array<{
    riskLevel: string;
    entityId: string | null;
    entityLabel: string;
    occurrences: number;
    investigationCount: number;
    lastSeen: string;
  }>;
}

export function HistoricalKnowledgePanel({ workspace }: Props) {
  const query = useServerFn(queryOklKnowledge);
  const [data, setData] = useState<KnowledgeQuery | null>(null);
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
    query({
      data: {
        entityIds,
        entityLabels,
        excludeInvestigationId: workspace.id,
        limit: 20,
      },
    })
      .then((res) => {
        if (!cancelled) setData(res as KnowledgeQuery);
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
  }, [entityIds, entityLabels, workspace.id, query]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Historical Knowledge (OKL)</CardTitle>
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
          <CardTitle className="text-sm">Historical Knowledge (OKL)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">OKL unavailable: {error}</p>
        </CardContent>
      </Card>
    );
  }

  const isEmpty =
    !data ||
    (data.relatedInvestigations.length === 0 &&
      data.knownPatterns.length === 0 &&
      data.historicalDecisions.length === 0 &&
      data.recurringRisks.length === 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4" /> Historical Knowledge (OKL)
        </CardTitle>
        <Badge variant="outline" className="text-[10px]">
          {entityIds.length + entityLabels.length} entity keys queried
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground">
            No prior investigations in the OKL match this subject yet.
          </p>
        ) : (
          <>
            <Section
              icon={<GitBranch className="h-3.5 w-3.5" />}
              title="Related Investigations"
              count={data!.relatedInvestigations.length}
            >
              <ScrollArea className="max-h-40">
                <ul className="space-y-1">
                  {data!.relatedInvestigations.map((r) => (
                    <li
                      key={r.investigationId}
                      className="text-xs flex items-center justify-between border-b border-border/40 pb-1"
                    >
                      <span className="font-mono truncate max-w-[60%]">{r.investigationId}</span>
                      <span className="text-muted-foreground">
                        {r.recordCount} records · uip {r.sourceUipIds[0]?.slice(0, 8)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </Section>

            <Section
              icon={<Layers className="h-3.5 w-3.5" />}
              title="Known Patterns"
              count={data!.knownPatterns.length}
            >
              <ul className="space-y-1">
                {data!.knownPatterns.map((p) => (
                  <li key={p.patternKind} className="text-xs flex items-center justify-between">
                    <span>{p.sampleLabel ?? p.patternKind}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {p.count}× / {p.investigationCount} inv.
                    </Badge>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              icon={<History className="h-3.5 w-3.5" />}
              title="Historical Decisions"
              count={data!.historicalDecisions.length}
            >
              <ScrollArea className="max-h-40">
                <ul className="space-y-1">
                  {data!.historicalDecisions.map((d) => (
                    <li key={d.recordId} className="text-xs border-b border-border/40 pb-1">
                      <div className="font-medium">{d.label}</div>
                      {d.detail && (
                        <div className="text-muted-foreground line-clamp-2">{d.detail}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        inv {d.investigationId.slice(0, 8)} · uip {d.sourceUipId.slice(0, 8)}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </Section>

            <Section
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              title="Recurring Risks"
              count={data!.recurringRisks.length}
            >
              <ul className="space-y-1">
                {data!.recurringRisks.map((r) => (
                  <li
                    key={`${r.riskLevel}-${r.entityId ?? r.entityLabel}`}
                    className="text-xs flex items-center justify-between"
                  >
                    <span className="truncate max-w-[60%]">{r.entityLabel}</span>
                    <div className="flex gap-2 items-center">
                      <Badge
                        variant={r.riskLevel === "CRITICAL" ? "destructive" : "outline"}
                        className="text-[10px]"
                      >
                        {r.riskLevel}
                      </Badge>
                      <span className="text-muted-foreground">
                        {r.occurrences}× / {r.investigationCount} inv.
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
        <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
          Evidence first. Every row above traces to a `source_uip_id` in the OKL store. No connector
          calls were made to build this panel.
        </p>
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon}
        <span>{title}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}
