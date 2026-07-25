/**
 * Compliance recurrence detector.
 *
 * Predicts likelihood of a further compliance finding based on the count and
 * recency of past inspections/detentions in the fused evidence.
 */
import type { Detector, PredictionFactor } from "../types";
import { buildPrediction } from "./util";

const CATEGORY = "compliance-recurrence" as const;

export const complianceRecurrenceDetector: Detector = {
  id: CATEGORY,
  label: "Compliance Recurrence Forecast",
  detect(ctx) {
    const out = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const findings = records.filter((r) => r.kind === "compliance");
      if (findings.length === 0) continue;

      const detentions = findings.filter((r) => r.fields.outcome === "detention" || r.fields.detained === true);
      const deficiencies = findings.reduce(
        (n, r) => n + (Number(r.fields.deficiencies ?? 0) || 0),
        0,
      );

      const factors: PredictionFactor[] = [];
      if (detentions.length > 0) {
        factors.push({
          label: `${detentions.length} detention(s) on record`,
          weight: Math.min(0.65, 0.3 + (detentions.length - 1) * 0.15),
          evidenceIds: detentions.map((r) => r.id),
        });
      }
      if (deficiencies > 0) {
        factors.push({
          label: `${deficiencies} cumulative deficiency finding(s)`,
          weight: Math.min(0.45, 0.1 + deficiencies * 0.05),
          evidenceIds: findings.map((r) => r.id),
        });
      }
      if (factors.length === 0) continue;

      out.push(
        buildPrediction({
          category: CATEGORY,
          subject: findings[0].entity,
          headline: "Further compliance finding likely at next inspection",
          explanation: `Vessel history contains ${findings.length} compliance record(s), including ${detentions.length} detention(s) and ${deficiencies} deficiency finding(s). Model expects a further adverse finding at the next inspection window.`,
          factors,
          evidence: findings,
          alternatives: [
            {
              label: "Remediated since last finding",
              probability: 0.2,
              rationale: "Follow-up inspection evidence may show corrective action has been taken.",
            },
          ],
          now: ctx.now,
          revision: ctx.revision,
          salt: `${detentions.length}:${deficiencies}`,
        }),
      );
    }
    return out;
  },
};
