/**
 * /predictions — Predictive Intelligence Engine (PIE) surface.
 *
 * Golden Rule: Predict early. Explain every prediction. Learn continuously.
 * Never make a prediction without evidence.
 */
import { useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PredictionsPanel } from "@/components/pie/PredictionsPanel";
import { usePieStore } from "@/services/pie";
import { useUipStore } from "@/stores/uip.store";
import { Radar } from "lucide-react";

export const Route = createFileRoute("/predictions")({
  validateSearch: (raw: Record<string, unknown>) => ({
    uip: typeof raw.uip === "string" ? raw.uip : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Predictive Intelligence · Seaphore" },
      {
        name: "description",
        content:
          "Predictive Intelligence Engine — evidence-backed forecasts, anomaly detection, and early-warning alerts for maritime operations.",
      },
      { property: "og:title", content: "Predictive Intelligence · Seaphore" },
      {
        property: "og:description",
        content:
          "Predict early. Explain every prediction. Learn continuously. Every prediction carries evidence, confidence, and alternative hypotheses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PredictionsRoute,
});

/** Deterministic demo evidence set exercising every detector — mirrors the
 *  DONGWON NO.16 / MKG validation used in earlier sprints. */
function PredictionsRoute() {
  const { uip: uipParam } = Route.useSearch();
  const uip = useUipStore((s) => {
    if (uipParam) return s.byId[uipParam];
    const latestId = s.order[0];
    return latestId ? s.byId[latestId] : undefined;
  });
  const { predictions, lastCycle, ingest, reset } = usePieStore();

  useEffect(() => {
    reset();
    if (uip && uip.rawEvidence.length > 0) {
      ingest({ evidence: uip.rawEvidence });
    }
  }, [uip, ingest, reset]);

  const alertCount = useMemo(() => predictions.filter((p) => p.alert).length, [predictions]);
  const critical = predictions.filter((p) => p.severity === "critical").length;
  const elevated = predictions.filter((p) => p.severity === "elevated").length;

  return (
    <AppShell
      title="Predictive Intelligence"
      subtitle="Evidence-backed forecasts, anomaly detection, and early warning"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4" /> PIE — Predictive Intelligence Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Predictions · {predictions.length}</Badge>
            <Badge variant="outline">Critical · {critical}</Badge>
            <Badge variant="outline">Elevated · {elevated}</Badge>
            <Badge variant="outline">Alerts · {alertCount}</Badge>
            {uip && (
              <Badge variant="outline" className="font-mono text-[10px]">
                UIP · {uip.id}
              </Badge>
            )}
            {lastCycle && (
              <span className="text-xs">
                Last cycle: {new Date(lastCycle.finishedAt).toLocaleTimeString()} · {lastCycle.evidenceConsidered} evidence records
              </span>
            )}
          </CardContent>
        </Card>
        {!uip ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Radar className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No Unified Intelligence Package loaded</div>
              <div className="max-w-md text-xs text-muted-foreground">
                PIE only predicts against live fused evidence. Run a briefing
                from the Copilot to populate this surface.
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
          <PredictionsPanel />
        )}
      </div>
    </AppShell>
  );
}
