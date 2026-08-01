/**
 * /knowledge-graph — Maritime Knowledge Graph explorer.
 *
 * The projection surface for the MKG: an interactive, evidence-backed
 * view of every entity and relationship the platform has fused so far.
 *
 * Golden Rule: One entity. One graph. One source of truth. Every
 * relationship must be explainable and evidence-backed.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraphView } from "@/components/mkg/GraphView";
import { EntityInspector } from "@/components/mkg/EntityInspector";
import { useMkgStore } from "@/services/mkg/store";
import { findConflictingIdentities } from "@/services/mkg/insights";
import { buildUnifiedIntelligencePackage } from "@/services/ife";
import { MaritimeKnowledgeGraph } from "@/services/mkg/graph";
import type { NormalizedEvidence } from "@/services/ial/types";

export const Route = createFileRoute("/knowledge-graph")({
  head: () => ({
    meta: [
      { title: "Maritime Knowledge Graph · Seaphore" },
      {
        name: "description",
        content:
          "Interactive graph of vessels, companies, people, ports, cargo, sanctions, and incidents — evidence-backed and explainable.",
      },
      { property: "og:title", content: "Maritime Knowledge Graph · Seaphore" },
      {
        property: "og:description",
        content:
          "One entity. One graph. One source of truth. Every relationship carries source, timestamp, confidence, and supporting evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgeGraphRoute,
});

/**
 * Seeds the MKG with a small, deterministic evidence set derived from the
 * Sprint 1C DONGWON NO.16 validation and the Sprint 1D fusion demo. The
 * seed is idempotent — subsequent visits do not duplicate nodes.
 */
function seedFromSprint1D(): void {
  const graph = useMkgStore.getState().graph;
  if (graph.size().nodes > 0) return;

  const ev: NormalizedEvidence[] = [
    {
      id: "ev-gfw-identity",
      source: "gfw",
      sourceName: "Global Fishing Watch",
      grade: "CORROBORATED",
      entity: { kind: "vessel", id: "vessel:mmsi:440825000", label: "DONGWON NO.16" },
      kind: "identity",
      fields: { mmsi: "440825000", flag: "KOR" },
      observedAt: "2026-07-25T14:30:15.000Z",
      retrievedAt: "2026-07-25T14:30:15.000Z",
      freshnessSeconds: 1,
      hash: "gfw-id-hash",
    },
    {
      id: "ev-equasis-ownership",
      source: "equasis",
      sourceName: "Equasis",
      grade: "VERIFIED",
      entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
      kind: "ownership",
      fields: {
        ownerEntityId: "company:cac:DWIND-100",
        ownerName: "Dongwon Industries Ltd",
        managerEntityId: "company:cac:DWSM-200",
        managerName: "Dongwon Ship Management",
        flag: "KOR",
      },
      observedAt: "2026-07-24T09:12:00.000Z",
      retrievedAt: "2026-07-24T09:12:00.000Z",
      freshnessSeconds: 60,
      hash: "eq-own-hash",
    },
    {
      id: "ev-equasis-portcall",
      source: "equasis",
      sourceName: "Equasis",
      grade: "OBSERVED",
      entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
      kind: "port-call",
      fields: { portUnlocode: "NGLOS", portName: "Lagos" },
      observedAt: "2026-07-20T12:00:00.000Z",
      retrievedAt: "2026-07-20T12:00:00.000Z",
      freshnessSeconds: 120,
      hash: "eq-pc-hash",
    },
    {
      id: "ev-sanctions",
      source: "opensanctions",
      sourceName: "OpenSanctions",
      grade: "VERIFIED",
      entity: { kind: "company", id: "company:cac:DWIND-100", label: "Dongwon Industries Ltd" },
      kind: "sanctions",
      fields: { list: "Reference Watchlist", match: "listed" },
      observedAt: "2026-07-23T08:00:00.000Z",
      retrievedAt: "2026-07-23T08:00:00.000Z",
      freshnessSeconds: 60,
      hash: "sanc-hash",
    },
    {
      id: "ev-cargo",
      source: "equasis",
      sourceName: "Equasis",
      grade: "REPORTED",
      entity: { kind: "vessel", id: "vessel:imo:9438291", label: "DONGWON NO.16" },
      kind: "cargo",
      fields: {
        cargoId: "cargo:tuna-frozen-2026-07",
        cargoName: "Frozen tuna (FROZEN-TUNA)",
        tonnage: 420,
        manifestId: "manifest:MN-2026-07-2201",
      },
      observedAt: "2026-07-19T04:00:00.000Z",
      retrievedAt: "2026-07-19T04:00:00.000Z",
      freshnessSeconds: 300,
      hash: "cargo-hash",
    },
  ];

  const uip = buildUnifiedIntelligencePackage({
    input: {
      records: ev,
      sources: [
        { connectorId: "gfw", sourceName: "Global Fishing Watch", records: 1 } as never,
        { connectorId: "equasis", sourceName: "Equasis", records: 3 } as never,
        { connectorId: "opensanctions", sourceName: "OpenSanctions", records: 1 } as never,
      ],
    },
  });
  useMkgStore.getState().ingest(uip, ev);
}

function KnowledgeGraphRoute() {
  const revision = useMkgStore((s) => s.revision);
  const snapshot = useMkgStore((s) => s.snapshot());
  const clear = useMkgStore((s) => s.clear);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    seedFromSprint1D();
  }, []);

  useEffect(() => {
    if (!selectedId && snapshot.nodes.length > 0) {
      // Pick a vessel by default so traversal makes sense visually.
      const vessel = snapshot.nodes.find((n) => n.kind === "vessel");
      setSelectedId(vessel?.id ?? snapshot.nodes[0].id);
    }
  }, [snapshot.nodes, selectedId]);

  const conflicts = useMemo(() => {
    // Recompute against the live graph.
    const g = useMkgStore.getState().graph;
    return findConflictingIdentities(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  return (
    <AppShell
      title="Maritime Knowledge Graph"
      subtitle="One entity · one graph · one source of truth"
    >
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Fused Intelligence Graph</CardTitle>
                <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
                  Every node is a canonical entity produced by the Intelligence Fusion Engine. Every
                  edge is backed by concrete evidence records with source, timestamp, and OC-001
                  grade. Dashed edges show identity-cluster aliases the resolver merged.
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>
                  {snapshot.stats.nodes} nodes · {snapshot.stats.edges} edges
                </span>
                <span>{snapshot.stats.connectors.length} connectors contributing</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clear}
                  className="mt-1 h-7 text-[10px]"
                >
                  Reset graph
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <GraphView
              nodes={snapshot.nodes}
              edges={snapshot.edges}
              selectedNodeId={selectedId ?? undefined}
              onSelectNode={setSelectedId}
            />
            <EntityInspector entityId={selectedId} onSelectNode={setSelectedId} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Relationship coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(snapshot.stats.byEdgeType)
                  .sort()
                  .map(([t, n]) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t} · {n}
                    </Badge>
                  ))}
                {Object.keys(snapshot.stats.byEdgeType).length === 0 ? (
                  <span className="text-xs text-muted-foreground">No relationships yet.</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Officer review — conflicting identities</CardTitle>
            </CardHeader>
            <CardContent>
              {conflicts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No conflicting identities in the graph. Every canonical entity is corroborated or
                  cleanly single-sourced.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {conflicts.slice(0, 6).map((c) => (
                    <li
                      key={c.node.id}
                      className="cursor-pointer rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1"
                      onClick={() => setSelectedId(c.node.id)}
                    >
                      <div className="font-medium">{c.node.label}</div>
                      <div className="text-[10px] text-muted-foreground">{c.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

// Force the module-level import to be considered used even when the file
// is loaded only for its route side-effects.
void MaritimeKnowledgeGraph;
