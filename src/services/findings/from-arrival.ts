/**
 * Arrival alert → finding projection.
 *
 * The arrival domain is untouched. This reads a stored alert and the
 * presentation the alert domain already produced — already severity-
 * decided, already worded — and restates it in the cross-surface shape so
 * an arrival and a sanctions item can sit in one list.
 *
 * The arrival severity is NOT copied into the finding priority: they are
 * separate scales, mapped once, in one direction, here, and nothing reads
 * the finding priority back into the alert.
 */
import { presentAlert, type ArrivalInterventionAlert, type AttentionSeverity } from "@/services/alerts";

import type { FindingAttentionPriority, IntelligenceFinding } from "./finding";

function priorityFor(severity: AttentionSeverity): FindingAttentionPriority {
  switch (severity) {
    case "URGENT":
      return "REVIEW";
    case "ATTENTION":
      return "AWARE";
    default:
      return "INFORMATIONAL";
  }
}

export function findingsFromAlerts(
  alerts: readonly ArrivalInterventionAlert[],
): readonly IntelligenceFinding[] {
  return alerts.map((alert) => {
    const view = presentAlert(alert);
    return {
      id: `arrival:${view.alertId}`,
      subjectType: "vessel" as const,
      subjectId: view.imo,
      subjectLabel: view.vesselName,
      findingType: "ARRIVAL_INTERVENTION" as const,
      attentionPriority: priorityFor(view.severity),
      source: view.provenance.source,
      sourceRecordId: view.alertId,
      summary: view.headline,
      reason: view.reason,
      evidenceRef: null,
      status: view.acknowledged ? ("REVIEWED" as const) : ("OPEN" as const),
      statusDetail: view.lifecycleState,
      createdAt: alert.raisedAt,
      updatedAt: alert.updatedAt,
    };
  });
}
