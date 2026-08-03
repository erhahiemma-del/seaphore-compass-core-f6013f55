/**
 * MKG — Entity Inspector.
 *
 * Side panel that projects the full evidence-backed record for the
 * selected node: provenance (per connector), relationships (grouped by
 * type), and hidden-link intelligence. Every relationship is clickable
 * so the officer can traverse.
 */
import { useMemo } from "react";
import { useMkgStore } from "@/services/mkg/store";
import { summariseEntity, findHiddenLinks, edgeCitations } from "@/services/mkg/insights";
import type { MkgEdge } from "@/services/mkg/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  readonly entityId: string | null;
  readonly onSelectNode: (id: string) => void;
}

export function EntityInspector({ entityId, onSelectNode }: Props) {
  const revision = useMkgStore((s) => s.revision); // eslint-disable-line @typescript-eslint/no-unused-vars
  const graph = useMkgStore((s) => s.graph);

  const summary = useMemo(
    () => (entityId ? summariseEntity(graph, entityId) : null),
    [entityId, graph, revision],
  );
  const hidden = useMemo(
    () => (entityId ? findHiddenLinks(graph, entityId, 3).slice(0, 8) : []),
    [entityId, graph, revision],
  );
  const neighbors = useMemo(
    () => (entityId ? graph.neighbors(entityId) : []),
    [entityId, graph, revision],
  );

  if (!entityId || !summary) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm">Entity Inspector</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Select a node in the graph to see every evidence source, direct relationship, and indirect
          connection the MKG has recorded.
        </CardContent>
      </Card>
    );
  }

  const { node } = summary;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{node.label}</CardTitle>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {node.kind} · {node.id}
            </p>
          </div>
          <Badge
            variant={node.hasContradictions ? "destructive" : "secondary"}
            className="uppercase"
          >
            {node.grade}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 overflow-y-auto text-xs">
        {node.hasContradictions ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            IFE surfaced contradictions on this entity — officer review recommended.
          </p>
        ) : null}

        <section>
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Attributes
          </h4>
          {Object.keys(node.attributes).length === 0 ? (
            <p className="text-muted-foreground">No canonical attributes recorded.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              {Object.entries(node.attributes).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section>
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Provenance · {summary.connectorsCiting.length} source(s)
          </h4>
          <ul className="space-y-1">
            {node.provenance.slice(0, 6).map((p) => (
              <li
                key={`${p.connectorId}::${p.evidenceId}`}
                className="rounded-md border border-border/50 bg-muted/20 px-2 py-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.sourceName}</span>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {p.grade}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {p.evidenceId} · {p.observedAt}
                </div>
              </li>
            ))}
          </ul>
          {node.provenance.length > 6 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              +{node.provenance.length - 6} more supporting evidence records
            </p>
          ) : null}
        </section>

        <section>
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Direct relationships · {neighbors.length}
          </h4>
          <ul className="space-y-1">
            {neighbors.slice(0, 15).map(({ edge, neighbor }) => (
              <li
                key={edge.id}
                className={cn(
                  "cursor-pointer rounded-md border border-border/50 bg-card px-2 py-1 hover:bg-muted/30",
                )}
                onClick={() => onSelectNode(neighbor.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {edge.type}
                  </span>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {edge.grade}
                  </Badge>
                </div>
                <div className="truncate">{neighbor.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  {edge.sources.join(" · ") || "single source"} · weight {edge.weight.toFixed(2)}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {hidden.length > 0 ? (
          <section>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Indirect connections
            </h4>
            <ul className="space-y-1">
              {hidden.map((h) => {
                const target = graph.getNode(h.b);
                if (!target) return null;
                return (
                  <li
                    key={`${h.a}->${h.b}`}
                    className="cursor-pointer rounded-md border border-dashed border-border/60 bg-card px-2 py-1 hover:bg-muted/30"
                    onClick={() => onSelectNode(h.b)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{target.label}</span>
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {h.path.hops}-hop · {h.path.grade}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{h.rationale}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Small helper — inline evidence citations for an edge (used by briefs). */
export function EdgeCitations({ edge }: { edge: MkgEdge }) {
  return (
    <ul className="text-[10px] text-muted-foreground">
      {edgeCitations(edge).map((c, i) => (
        <li key={i} className="truncate">
          • {c}
        </li>
      ))}
    </ul>
  );
}
