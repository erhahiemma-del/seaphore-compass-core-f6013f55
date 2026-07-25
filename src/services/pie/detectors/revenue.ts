/**
 * Revenue anomaly detector.
 *
 * Compares declared revenue / value fields on evidence records against the
 * subject's own historical baseline. Fires only above 2σ and only once the
 * baseline has at least three observations.
 */
import type { Detector, PredictionFactor } from "../types";
import { buildPrediction } from "./util";
import { zScore } from "../baselines";

const CATEGORY = "revenue-anomaly" as const;

export const revenueAnomalyDetector: Detector = {
  id: CATEGORY,
  label: "Revenue Anomaly Forecast",
  detect(ctx) {
    const out = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const revenueEvents = records
        .map((r) => ({
          rec: r,
          v: Number(r.fields.revenue ?? r.fields.declaredValue ?? r.fields.value ?? NaN),
        }))
        .filter((x) => Number.isFinite(x.v));
      if (revenueEvents.length === 0) continue;

      for (const e of revenueEvents) ctx.baselines.observe(`revenue.${entityId}`, e.v);
      const snap = ctx.baselines.snapshot(`revenue.${entityId}`);
      if (!snap || snap.n < 3) continue;

      const latest = revenueEvents[revenueEvents.length - 1];
      const z = zScore(latest.v, snap);
      if (Math.abs(z) < 2) continue;

      const factors: PredictionFactor[] = [
        {
          label: `Declared value ${latest.v.toLocaleString()} deviates ${z.toFixed(2)}σ from baseline ${snap.mean.toFixed(0)} ±${snap.stddev.toFixed(0)} (n=${snap.n})`,
          weight: Math.min(0.7, 0.3 + (Math.abs(z) - 2) * 0.1),
          evidenceIds: [latest.rec.id],
        },
      ];

      out.push(
        buildPrediction({
          category: CATEGORY,
          subject: latest.rec.entity,
          headline: z > 0 ? "Revenue spike anomaly" : "Revenue drop anomaly",
          explanation: `Declared revenue on the latest record is ${Math.abs(z).toFixed(1)}σ from the entity's own baseline. Deviations of this magnitude correlate with under/over-declaration or unusual charter economics warranting review.`,
          factors,
          evidence: [latest.rec],
          alternatives: [
            {
              label: "Legitimate market swing",
              probability: 0.25,
              rationale: "Freight-market volatility can produce genuine large revenue swings.",
            },
          ],
          baseline: {
            metric: "revenue",
            mean: snap.mean,
            stddev: snap.stddev,
            n: snap.n,
            observed: latest.v,
            zScore: z,
          },
          now: ctx.now,
          revision: ctx.revision,
          salt: `${latest.rec.id}:${z.toFixed(2)}`,
        }),
      );
    }
    return out;
  },
};
