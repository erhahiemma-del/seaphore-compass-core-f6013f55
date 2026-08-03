/**
 * Sanctions proximity detector.
 *
 * Predicts likelihood the subject will be linked to (or directly affected by)
 * a sanctions enforcement action, based on directly-listed evidence and
 * proximity signals surfaced by connectors.
 */
import type { Detector, PredictionFactor } from "../types";
import { buildPrediction } from "./util";

const CATEGORY = "sanctions-proximity" as const;

export const sanctionsProximityDetector: Detector = {
  id: CATEGORY,
  label: "Sanctions Exposure Forecast",
  detect(ctx) {
    const out = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const sanctions = records.filter((r) => r.kind === "sanctions");
      if (sanctions.length === 0) continue;

      const direct = sanctions.filter(
        (r) => r.fields.status === "listed" || r.fields.match === "direct",
      );
      const proximity = sanctions.filter(
        (r) => r.fields.status === "indirect" || r.fields.match === "associate" || r.fields.hops,
      );

      if (direct.length === 0 && proximity.length === 0) continue;

      const factors: PredictionFactor[] = [];
      if (direct.length > 0) {
        factors.push({
          label: `${direct.length} direct sanctions hit(s) on record`,
          weight: 0.85,
          evidenceIds: direct.map((r) => r.id),
        });
      }
      if (proximity.length > 0) {
        const hops = proximity.map((r) => Number(r.fields.hops ?? 2)).filter(Number.isFinite);
        const minHops = hops.length > 0 ? Math.min(...hops) : 2;
        factors.push({
          label: `${proximity.length} indirect / n-hop sanctions association (nearest: ${minHops} hop${minHops > 1 ? "s" : ""})`,
          weight: Math.max(0.15, 0.5 - (minHops - 1) * 0.15),
          evidenceIds: proximity.map((r) => r.id),
        });
      }

      out.push(
        buildPrediction({
          category: CATEGORY,
          subject: sanctions[0].entity,
          headline:
            direct.length > 0
              ? "Direct sanctions exposure — action likely"
              : "Sanctions proximity elevated",
          explanation: `Sanctions evidence indicates ${direct.length} direct listing(s) and ${proximity.length} proximity association(s). Model expects further enforcement engagement within the immediate horizon.`,
          factors,
          evidence: sanctions,
          alternatives: [
            {
              label: "Name / entity collision",
              probability: 0.1,
              rationale:
                "Some hits may reflect similarly-named entities not identical to the subject.",
            },
          ],
          now: ctx.now,
          revision: ctx.revision,
          salt: `${direct.length}:${proximity.length}`,
        }),
      );
    }
    return out;
  },
};
