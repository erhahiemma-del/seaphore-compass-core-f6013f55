/**
 * IBE · Proactive Intelligence (Phase 3, 14).
 *
 * Scans the mission context and the OIE briefing for signals the
 * officer would miss if the Copilot only answered what was asked.
 */
import type { OIEResult } from "@/services/oie/types";
import type { MissionContext } from "@/stores/mission-context.store";
import type { ProactiveNudge } from "./types";

function has(obj: unknown, key: string): boolean {
  return !!obj && typeof obj === "object" && key in (obj as Record<string, unknown>);
}

function readString(obj: unknown, key: string): string | null {
  if (!has(obj, key)) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

export function scanForNudges(
  mission: MissionContext | null,
  oie: OIEResult | null,
): ProactiveNudge[] {
  const nudges: ProactiveNudge[] = [];
  if (mission?.vessel) {
    const ownershipChanged = readString(mission.vessel, "ownershipChangedAt");
    if (ownershipChanged) {
      nudges.push({
        id: `nudge-owner-${ownershipChanged}`,
        priority: "high",
        origin: "ownership",
        text: `Before we continue, note that this vessel changed ownership on ${ownershipChanged}. That may affect the sanctions and revenue assessment.`,
      });
    }
    const aisGap = readString(mission.vessel, "aisGapHours");
    if (aisGap && Number(aisGap) > 6) {
      nudges.push({
        id: `nudge-ais-${aisGap}`,
        priority: "monitor",
        origin: "ais",
        text: `AIS is unreported for ${aisGap} hours. Common during port congestion, but worth flagging until we corroborate the vessel's position.`,
      });
    }
  }
  if ((mission?.companies ?? []).length > 3) {
    nudges.push({
      id: "nudge-owner-layers",
      priority: "monitor",
      origin: "ownership",
      text: "The ownership chain runs through several layers — I'd screen every intermediary rather than just the registered owner.",
    });
  }
  if (oie?.kind === "briefing" && oie.briefing.intelligence_status === "insufficient") {
    nudges.push({
      id: "nudge-insufficient",
      priority: "high",
      origin: "conversation",
      text: "Several sources didn't respond in time. I would corroborate the working assessment before acting on it.",
    });
  }
  // De-dupe by id.
  const seen = new Set<string>();
  return nudges.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}
