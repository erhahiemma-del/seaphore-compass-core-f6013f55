/**
 * Cargo / tonnage anomaly detector.
 *
 * Watches declared cargo tonnage and flags observations that deviate from the
 * subject's own baseline. Uses Welford-based z-scores; small-N observations
 * are shrunk to avoid firing on a single record.
 */
import type { Detector, PredictionFactor } from "../types";
import { buildPrediction } from "./util";
import { zScore } from "../baselines";

const CATEGORY = "cargo-anomaly" as const;

export const cargoAnomalyDetector: Detector = {
  id: CATEGORY,
  label: "Cargo Anomaly Forecast",
  detect(ctx) {
    const out = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const cargo = records.filter((r) => r.kind === "cargo");
      const tonnages = cargo
        .map((r) => ({ rec: r, v: Number(r.fields.tonnage ?? r.fields.declaredWeight ?? NaN) }))
        .filter((x) => Number.isFinite(x.v));
      if (tonnages.length === 0) continue;

      for (const t of tonnages) ctx.baselines.observe(`cargo.tonnage.${entityId}`, t.v);
      const snap = ctx.baselines.snapshot(`cargo.tonnage.${entityId}`);
      if (!snap || snap.n < 3) continue;

      const latest = tonnages[tonnages.length - 1];
      const z = zScore(latest.v, snap);
      if (Math.abs(z) < 2) continue;

      const factors: PredictionFactor[] = [
        {
          label: `Latest tonnage ${latest.v.toFixed(0)}t deviates from baseline ${snap.mean.toFixed(0)}t ±${snap.stddev.toFixed(0)}t (z=${z.toFixed(2)})`,
          weight: Math.min(0.65, 0.25 + (Math.abs(z) - 2) * 0.1),
          evidenceIds: [latest.rec.id],
        },
      ];

      out.push(
        buildPrediction({
          category: CATEGORY,
          subject: latest.rec.entity,
          headline: z > 0 ? "Cargo tonnage spike anomaly" : "Cargo tonnage drop anomaly",
          explanation: `Declared cargo tonnage on the latest voyage is ${Math.abs(z).toFixed(1)}σ from the vessel's own baseline (n=${snap.n}). Anomalies of this magnitude correlate with under-declaration, transhipment, or manifest error.`,
          factors,
          evidence: [latest.rec],
          alternatives: [
            {
              label: "Legitimate charter change",
              probability: 0.2,
              rationale: "A different charterer or route can legitimately shift declared tonnage.",
            },
            {
              label: "Manifest data-entry error",
              probability: 0.15,
              rationale: "Single-record anomalies are sometimes clerical.",
            },
          ],
          baseline: {
            metric: "cargoTonnage",
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
