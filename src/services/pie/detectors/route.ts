/**
 * Route Deviation detector.
 *
 * Predicts likelihood that a vessel will deviate from its declared voyage
 * (unscheduled port call, course change, STS rendezvous) based on the
 * frequency of past deviations in the fused evidence.
 */
import type { Detector, PredictionFactor } from "../types";
import type { NormalizedEvidence } from "@/services/ial/types";
import { buildPrediction } from "./util";

const CATEGORY = "route-deviation" as const;

export const routeDeviationDetector: Detector = {
  id: CATEGORY,
  label: "Route Deviation Forecast",
  detect(ctx) {
    const out = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const voyages: NormalizedEvidence[] = records.filter(
        (r) => r.kind === "voyage" || r.kind === "port-call",
      );
      if (voyages.length < 2) continue;

      const deviations = voyages.filter((r) => {
        const flagged = r.fields.deviation === true || r.fields.unscheduled === true;
        const declared = r.fields.declaredPort as string | undefined;
        const actual = r.fields.actualPort as string | undefined;
        return flagged || (declared && actual && declared !== actual);
      });
      if (deviations.length === 0) continue;

      const rate = deviations.length / voyages.length;
      ctx.baselines.observe(`route.deviation.${entityId}`, rate);

      const factors: PredictionFactor[] = [
        {
          label: `${deviations.length} deviation(s) across ${voyages.length} voyage record(s) (${Math.round(rate * 100)}%)`,
          weight: Math.min(0.7, 0.25 + rate * 0.6),
          evidenceIds: deviations.map((r) => r.id),
        },
      ];
      if (rate >= 0.5) {
        factors.push({
          label: "Deviation rate ≥ 50% of observed voyages",
          weight: 0.15,
          evidenceIds: deviations.map((r) => r.id),
        });
      }

      out.push(
        buildPrediction({
          category: CATEGORY,
          subject: voyages[0].entity,
          headline: "Route deviation likely on next voyage",
          explanation: `Historical evidence shows a ${Math.round(rate * 100)}% deviation rate across observed voyages. Model expects a further unscheduled deviation or port switch within the short-term horizon.`,
          factors,
          evidence: deviations,
          alternatives: [
            {
              label: "Operational weather / port congestion",
              probability: 0.2,
              rationale: "Deviations can be legitimate operational reroutes recorded by the master.",
            },
          ],
          now: ctx.now,
          revision: ctx.revision,
          salt: `${deviations.length}:${voyages.length}`,
        }),
      );
    }
    return out;
  },
};
