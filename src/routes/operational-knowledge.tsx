/**
 * /operational-knowledge — Operational Knowledge Layer (OKL) surface.
 *
 * Golden Rule: OKL consumes ONLY the Unified Intelligence Package and
 * (optionally) the Maritime Knowledge Graph. Every pattern here carries
 * source connectors, evidence citations, contradictions, alternatives,
 * a reasoning trace, and the full Confidence Pyramid. The officer decides.
 *
 * Sprint 2.1B — Slice 2: demo fixtures removed. The route now resolves
 * evidence via `getUip(source_uip_id)` from the live client-side UIP
 * store, populated by the last Copilot briefing (or a specific UIP via
 * the `?uip=<id>` search param).
 */
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { OperationalInsights } from "@/components/intelligence/OperationalInsights";
import { analyzeOperationalKnowledge } from "@/services/okl";
import { useUipStore } from "@/stores/uip.store";
import { Card, CardContent } from "@/components/ui/card";
import { Radar } from "lucide-react";

interface OklSearch {
  uip?: string;
}

export const Route = createFileRoute("/operational-knowledge")({
  validateSearch: (raw: Record<string, unknown>): OklSearch => ({
    uip: typeof raw.uip === "string" ? raw.uip : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Operational Knowledge Layer · Seaphore" },
      {
        name: "description",
        content:
          "OKL derives explainable operational patterns from fused intelligence and the maritime knowledge graph. Every recommendation cites evidence; the officer decides.",
      },
      { property: "og:title", content: "Operational Knowledge Layer · Seaphore" },
      {
        property: "og:description",
        content:
          "Explainable maritime operational patterns with a full Confidence Pyramid, source connectors, contradictions, and officer-approval-gated recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationalKnowledgeRoute,
});

function OperationalKnowledgeRoute() {
  const { uip: uipParam } = Route.useSearch();
  const uip = useUipStore((s) => {
    if (uipParam) return s.byId[uipParam];
    const latestId = s.order[0];
    return latestId ? s.byId[latestId] : undefined;
  });

  const pkg = useMemo(() => {
    if (!uip) return null;
    return analyzeOperationalKnowledge({
      uip,
      rawEvidence: uip.rawEvidence,
    });
  }, [uip]);

  return (
    <AppShell
      title="Operational Knowledge Layer"
      subtitle="Explainable operational patterns derived from the Unified Intelligence Package"
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-900">
              OKL never touches raw connector data.
            </span>{" "}
            It consumes only the fused Unified Intelligence Package and the Maritime Knowledge
            Graph. Every pattern below cites the evidence, names the connectors, surfaces
            contradictions and alternative explanations, and gates enforcement recommendations
            behind explicit officer approval.
          </p>
        </div>
        {!uip || !pkg ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Radar className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No Unified Intelligence Package loaded</div>
              <div className="max-w-md text-xs text-muted-foreground">
                OKL only operates on live fused intelligence. Generate a briefing from the Copilot
                and this surface will populate with detected operational patterns for that UIP.
              </div>
              <Link
                to="/copilot"
                className="mt-2 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Open Copilot
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">{uip.id}</span>
              <span>
                {uip.fused.stats.canonicalEntities} entities · {uip.rawEvidence.length} evidence
                records · {uip.provenance.length} connectors
              </span>
            </div>
            <OperationalInsights package={pkg} />
          </>
        )}
      </div>
    </AppShell>
  );
}
