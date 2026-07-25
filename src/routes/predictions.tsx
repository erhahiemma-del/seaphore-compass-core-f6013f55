/**
 * /predictions — Predictive Intelligence Engine (PIE) surface.
 *
 * Golden Rule: Predict early. Explain every prediction. Learn continuously.
 * Never make a prediction without evidence.
 */
import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PredictionsPanel } from "@/components/pie/PredictionsPanel";
import { usePieStore } from "@/services/pie";
import type { NormalizedEvidence } from "@/services/ial/types";
import { Radar } from "lucide-react";

export const Route = createFileRoute("/predictions")({
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
function seedEvidence(): ReadonlyArray<NormalizedEvidence> {
  const vessel = {
    id: "vessel:9411640",
    kind: "vessel" as const,
    primaryLabel: "DONGWON NO.16",
    identifiers: { imo: "9411640", mmsi: "440825000" },
  };
  const now = new Date("2026-07-25T12:00:00Z").getTime();
  const iso = (offsetH: number) => new Date(now - offsetH * 3600_000).toISOString();
  const rec = (over: Partial<NormalizedEvidence>): NormalizedEvidence => ({
    id: over.id ?? `seed_${Math.random().toString(36).slice(2, 9)}`,
    source: over.source ?? "gfw",
    sourceName: over.sourceName ?? "Global Fishing Watch",
    grade: over.grade ?? "CORROBORATED",
    entity: over.entity ?? vessel,
    kind: over.kind ?? "position",
    fields: over.fields ?? {},
    observedAt: over.observedAt ?? iso(1),
    retrievedAt: over.retrievedAt ?? iso(0),
    freshnessSeconds: 3600,
    hash: over.hash ?? "seed",
  });

  return [
    // AIS gap pattern
    rec({ id: "ais-1", kind: "position", grade: "VERIFIED", fields: { gapHours: 28 }, observedAt: iso(72) }),
    rec({ id: "ais-2", kind: "position", grade: "VERIFIED", fields: { gapHours: 16 }, observedAt: iso(48) }),
    rec({ id: "ais-3", kind: "position", grade: "VERIFIED", fields: { gapHours: 4 }, observedAt: iso(24) }),

    // Route deviations
    rec({ id: "voy-1", kind: "voyage", fields: { declaredPort: "PGLAE", actualPort: "IDBOA" }, observedAt: iso(120) }),
    rec({ id: "voy-2", kind: "voyage", fields: { declaredPort: "KRPUS", actualPort: "KRPUS" }, observedAt: iso(96) }),
    rec({ id: "voy-3", kind: "voyage", fields: { declaredPort: "IDBOA", actualPort: "PGLAE", unscheduled: true }, observedAt: iso(48) }),

    // Ownership churn
    rec({ id: "own-1", kind: "ownership", source: "opencorporates", sourceName: "OpenCorporates", grade: "VERIFIED",
      fields: { ownerName: "DONGWON F&B", flag: "KR" }, observedAt: iso(24 * 400) }),
    rec({ id: "own-2", kind: "ownership", source: "opencorporates", sourceName: "OpenCorporates", grade: "VERIFIED",
      fields: { ownerName: "Pacific Holdings SA", flag: "PA" }, observedAt: iso(24 * 180) }),
    rec({ id: "own-3", kind: "ownership", source: "opencorporates", sourceName: "OpenCorporates", grade: "VERIFIED",
      fields: { ownerName: "BlueSea Partners", flag: "LR" }, observedAt: iso(24 * 30) }),

    // Sanctions proximity (indirect)
    rec({ id: "sanc-1", kind: "sanctions", source: "opensanctions", sourceName: "OpenSanctions",
      grade: "VERIFIED", fields: { status: "indirect", hops: 2, matchedEntity: "Pacific Holdings SA" }, observedAt: iso(12) }),

    // Cargo baseline + spike
    ...[48, 52, 50, 49, 51].map((t, i) =>
      rec({ id: `cargo-${i}`, kind: "cargo", grade: "CORROBORATED", fields: { tonnage: t }, observedAt: iso(200 - i * 24) }),
    ),
    rec({ id: "cargo-spike", kind: "cargo", grade: "CORROBORATED", fields: { tonnage: 240 }, observedAt: iso(6) }),

    // Compliance history
    rec({ id: "comp-1", kind: "compliance", source: "psc-tokyo-mou", sourceName: "Tokyo MoU PSC",
      grade: "VERIFIED", fields: { outcome: "detention", deficiencies: 7 }, observedAt: iso(24 * 60) }),
    rec({ id: "comp-2", kind: "compliance", source: "psc-tokyo-mou", sourceName: "Tokyo MoU PSC",
      grade: "VERIFIED", fields: { outcome: "deficiency", deficiencies: 4 }, observedAt: iso(24 * 20) }),

    // Revenue baseline + drop
    ...[120_000, 118_000, 122_000, 119_000].map((v, i) =>
      rec({ id: `rev-${i}`, kind: "other", grade: "CORROBORATED", fields: { revenue: v }, observedAt: iso(200 - i * 24) }),
    ),
    rec({ id: "rev-drop", kind: "other", grade: "CORROBORATED", fields: { revenue: 42_000 }, observedAt: iso(4) }),
  ];
}

function PredictionsRoute() {
  const { predictions, lastCycle, ingest, reset } = usePieStore();

  useEffect(() => {
    reset();
    ingest({ evidence: seedEvidence() });
  }, [ingest, reset]);

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
            {lastCycle && (
              <span className="text-xs">
                Last cycle: {new Date(lastCycle.finishedAt).toLocaleTimeString()} · {lastCycle.evidenceConsidered} evidence records
              </span>
            )}
          </CardContent>
        </Card>
        <PredictionsPanel />
      </div>
    </AppShell>
  );
}
