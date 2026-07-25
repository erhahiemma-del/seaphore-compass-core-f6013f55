/**
 * AIS Behaviour anomaly detector.
 *
 * Predicts likelihood of a *future* dark-window event for a vessel by combining
 * historical AIS-gap frequency and recent gap severity. Never fires without at
 * least one evidence record; always cites the records that drove the score.
 */
import type { Detector, PredictionFactor } from "../types";
import { buildPrediction } from "./util";

const CATEGORY = "ais-behaviour" as const;

export const aisBehaviourDetector: Detector = {
  id: CATEGORY,
  label: "AIS Behaviour Forecast",
  detect(ctx) {
    const predictions = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const position = records.filter((r) => r.kind === "position" || r.kind === "voyage");
      if (position.length === 0) continue;

      const gaps = position
        .map((r) => Number(r.fields.gapHours ?? r.fields.aisGapHours ?? 0))
        .filter((n) => Number.isFinite(n) && n > 0);

      // Feed baselines regardless — even absence of a long gap is a data point.
      for (const g of gaps) ctx.baselines.observe(`ais.gap.${entityId}`, g);

      if (gaps.length === 0) continue;

      const longest = Math.max(...gaps);
      const gapsOver12 = gaps.filter((g) => g >= 12).length;
      const gapsOver24 = gaps.filter((g) => g >= 24).length;

      const factors: PredictionFactor[] = [];
      if (gapsOver24 > 0) {
        factors.push({
          label: `${gapsOver24} AIS gap${gapsOver24 > 1 ? "s" : ""} ≥ 24h in evidence window`,
          weight: 0.55,
          evidenceIds: position.filter((r) => Number(r.fields.gapHours ?? 0) >= 24).map((r) => r.id),
        });
      }
      if (gapsOver12 - gapsOver24 > 0) {
        factors.push({
          label: `${gapsOver12 - gapsOver24} AIS gap${gapsOver12 - gapsOver24 > 1 ? "s" : ""} 12–24h`,
          weight: 0.3,
          evidenceIds: position
            .filter((r) => {
              const g = Number(r.fields.gapHours ?? 0);
              return g >= 12 && g < 24;
            })
            .map((r) => r.id),
        });
      }
      const snap = ctx.baselines.snapshot(`ais.gap.${entityId}`);
      if (snap && snap.n >= 3 && longest > snap.mean + snap.stddev) {
        factors.push({
          label: `Latest gap ${longest.toFixed(1)}h exceeds baseline (${snap.mean.toFixed(1)}h ±${snap.stddev.toFixed(1)}h, n=${snap.n})`,
          weight: 0.2,
          evidenceIds: position.map((r) => r.id),
        });
      }

      if (factors.length === 0) continue;

      predictions.push(
        buildPrediction({
          category: CATEGORY,
          subject: position[0].entity,
          headline: `Elevated risk of further AIS dark windows`,
          explanation: `Historical AIS pattern shows ${gapsOver12} gap(s) ≥12h and ${gapsOver24} gap(s) ≥24h. Model expects continued intermittent transponder loss over the next reporting cycle.`,
          factors,
          evidence: position,
          alternatives: [
            {
              label: "Equipment malfunction",
              probability: 0.15,
              rationale: "AIS transponder faults can produce clustered gaps without adversarial intent.",
            },
            {
              label: "High-latitude / shadow zone",
              probability: 0.1,
              rationale: "Certain areas produce structural reception gaps not attributable to the vessel.",
            },
          ],
          baseline: snap && snap.n >= 3
            ? {
                metric: "aisGapHours",
                mean: snap.mean,
                stddev: snap.stddev,
                n: snap.n,
                observed: longest,
                zScore: snap.stddev > 0 ? (longest - snap.mean) / snap.stddev : 0,
              }
            : undefined,
          now: ctx.now,
          revision: ctx.revision,
          salt: `${gapsOver12}:${gapsOver24}:${longest.toFixed(1)}`,
        }),
      );
    }
    return predictions;
  },
};
