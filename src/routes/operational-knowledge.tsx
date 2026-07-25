/**
 * /operational-knowledge — Operational Knowledge Layer (OKL) surface.
 *
 * Golden Rule: OKL consumes ONLY the Unified Intelligence Package and
 * (optionally) the Maritime Knowledge Graph. Every pattern here carries
 * source connectors, evidence citations, contradictions, alternatives,
 * a reasoning trace, and the full Confidence Pyramid. The officer decides.
 */
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { OperationalInsights } from "@/components/intelligence/OperationalInsights";
import { analyzeOperationalKnowledge } from "@/services/okl";
import {
  DEMO_UIP,
  DEMO_EVIDENCE,
  DEMO_HISTORICAL,
  DEMO_INVESTIGATIONS,
} from "@/services/okl/fixtures";

export const Route = createFileRoute("/operational-knowledge")({
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
  const pkg = useMemo(
    () =>
      analyzeOperationalKnowledge({
        uip: DEMO_UIP,
        rawEvidence: DEMO_EVIDENCE,
        historical: DEMO_HISTORICAL,
        investigations: DEMO_INVESTIGATIONS,
      }),
    [],
  );

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
            It consumes only the fused Unified Intelligence Package and the
            Maritime Knowledge Graph. Every pattern below cites the evidence,
            names the connectors, surfaces contradictions and alternative
            explanations, and gates enforcement recommendations behind explicit
            officer approval.
          </p>
        </div>
        <OperationalInsights package={pkg} />
      </div>
    </AppShell>
  );
}
