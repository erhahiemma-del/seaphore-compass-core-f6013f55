/**
 * /national-risk — National Maritime Risk Scoring Engine (NMRSE) surface.
 *
 * Continuously composes PIE, OSAE, sanctions proximity, compliance history,
 * MKG connectivity, and revenue leakage into an explainable score with a
 * per-component breakdown. Sprint 1G.
 */
import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNmrseStore } from "@/services/nmrse";
import { usePieStore } from "@/services/pie";
import { useRevenueLeakageStore } from "@/services/revenue-leakage";
import { Gauge } from "lucide-react";

export const Route = createFileRoute("/national-risk")({
  head: () => ({
    meta: [
      { title: "National Maritime Risk · Seaphore" },
      {
        name: "description",
        content:
          "National Maritime Risk Scoring Engine — continuous, explainable, evidence-backed risk scores for vessels, ports, operators, companies, and activities.",
      },
      { property: "og:title", content: "National Maritime Risk · Seaphore" },
      {
        property: "og:description",
        content: "Fused-intelligence composite risk with per-component breakdown and citations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NationalRiskRoute,
});

function bandVariant(band: string) {
  return band === "critical"
    ? "destructive"
    : band === "high"
      ? "default"
      : band === "elevated"
        ? "secondary"
        : "outline";
}

function NationalRiskRoute() {
  const predictions = usePieStore((s) => s.predictions);
  const leakage = useRevenueLeakageStore((s) => s.findings);
  const { scores, scoreMany, reset } = useNmrseStore();

  useEffect(() => {
    reset();
    scoreMany([
      {
        entity: { id: "vessel:9411640", label: "DONGWON NO.16", kind: "vessel" },
        inputs: {
          predictions: predictions.filter((p) => p.subject.id === "vessel:9411640"),
          osaePriority: "urgent",
          sanctionsProximity: { proximity: 0.6, evidenceIds: ["sanc-1"] },
          complianceHistory: { detentions: 1, deficiencies: 11, evidenceIds: ["comp-1", "comp-2"] },
          graphConnectivity: { highRiskNeighbors: 3, totalNeighbors: 7 },
          revenueLeakage: leakage.filter((f) => f.subjectId === "vessel:9411640"),
        },
      },
      {
        entity: { id: "port:unlocode:NGLOS", label: "Lagos", kind: "port" },
        inputs: {
          osaePriority: "act",
          complianceHistory: { detentions: 0, deficiencies: 3 },
          graphConnectivity: { highRiskNeighbors: 4, totalNeighbors: 20 },
          revenueLeakage: leakage.filter((f) => f.subjectId === "port:unlocode:NGLOS"),
        },
      },
      {
        entity: { id: "company:pacific-holdings", label: "Pacific Holdings SA", kind: "company" },
        inputs: {
          osaePriority: "monitor",
          sanctionsProximity: { proximity: 1, evidenceIds: ["sanc-1"] },
          graphConnectivity: { highRiskNeighbors: 5, totalNeighbors: 12 },
        },
      },
    ]);
  }, [predictions, leakage, scoreMany, reset]);

  const critical = useMemo(() => scores.filter((s) => s.band === "critical").length, [scores]);
  const high = useMemo(() => scores.filter((s) => s.band === "high").length, [scores]);

  return (
    <AppShell title="National Maritime Risk" subtitle="Fused intelligence · continuous scoring">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4" /> NMRSE — composite risk
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">Scored · {scores.length}</Badge>
            <Badge variant="outline">Critical · {critical}</Badge>
            <Badge variant="outline">High · {high}</Badge>
            <span className="text-xs text-muted-foreground">
              Weights: PIE 25 · OSAE 20 · Sanctions 20 · Compliance 15 · Graph 10 · Leakage 10
            </span>
          </CardContent>
        </Card>

        {scores.map((s) => (
          <Card key={s.entityId}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>
                  {s.entityLabel} <span className="text-xs opacity-60">({s.kind})</span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={bandVariant(s.band) as never} className="uppercase">
                    {s.band}
                  </Badge>
                  <span className="text-sm font-mono">{s.score.toFixed(1)}</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Progress value={Math.max(0, Math.min(100, s.score))} />
              <div className="text-xs text-muted-foreground">
                Composite confidence: {s.confidence}
              </div>
              <section>
                <div className="text-xs font-medium">Breakdown</div>
                <ul className="text-xs text-muted-foreground">
                  {s.components.map((c) => (
                    <li key={c.key} className="flex items-baseline justify-between gap-2 py-0.5">
                      <span>
                        {c.label} · w{c.weight.toFixed(2)}
                      </span>
                      <span className="font-mono">
                        {c.points.toFixed(1)} pts
                        <span className="ml-2 opacity-60">— {c.rationale}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
