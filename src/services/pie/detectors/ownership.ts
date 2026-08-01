/**
 * Ownership churn detector.
 *
 * A vessel that changes registered owner, manager, or flag repeatedly is a
 * classic obfuscation signal. Predicts the likelihood of a further ownership
 * change based on churn frequency in the evidence window.
 */
import type { Detector, PredictionFactor } from "../types";
import { buildPrediction } from "./util";

const CATEGORY = "ownership-churn" as const;

export const ownershipChurnDetector: Detector = {
  id: CATEGORY,
  label: "Ownership Churn Forecast",
  detect(ctx) {
    const out = [];
    for (const [entityId, records] of ctx.evidenceByEntity) {
      const owners = records.filter((r) => r.kind === "ownership");
      if (owners.length < 2) continue;

      const distinctOwners = new Set(
        owners.map((r) => String(r.fields.ownerName ?? r.fields.owner ?? "")).filter(Boolean),
      );
      const distinctFlags = new Set(owners.map((r) => String(r.fields.flag ?? "")).filter(Boolean));
      const changeCount =
        Math.max(distinctOwners.size - 1, 0) + Math.max(distinctFlags.size - 1, 0);
      if (changeCount === 0) continue;

      ctx.baselines.observe(`ownership.changes.${entityId}`, changeCount);

      const factors: PredictionFactor[] = [];
      if (distinctOwners.size > 1) {
        factors.push({
          label: `${distinctOwners.size} distinct owners recorded`,
          weight: Math.min(0.6, 0.2 + (distinctOwners.size - 1) * 0.15),
          evidenceIds: owners.map((r) => r.id),
        });
      }
      if (distinctFlags.size > 1) {
        factors.push({
          label: `${distinctFlags.size} distinct flag states recorded`,
          weight: 0.25,
          evidenceIds: owners.map((r) => r.id),
        });
      }

      out.push(
        buildPrediction({
          category: CATEGORY,
          subject: owners[0].entity,
          headline: "Further ownership or flag change likely",
          explanation: `Evidence shows ${distinctOwners.size} distinct owner(s) and ${distinctFlags.size} distinct flag(s). Rapid churn is a documented obfuscation pattern.`,
          factors,
          evidence: owners,
          alternatives: [
            {
              label: "Legitimate corporate restructuring",
              probability: 0.25,
              rationale: "Ownership changes may reflect lawful M&A or fleet reorganisation.",
            },
          ],
          now: ctx.now,
          revision: ctx.revision,
          salt: `${distinctOwners.size}:${distinctFlags.size}`,
        }),
      );
    }
    return out;
  },
};
