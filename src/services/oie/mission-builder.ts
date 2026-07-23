/**
 * OIE · Module 2 — Mission Context Builder.
 *
 * Hydrates the currently-active investigation snapshot (vessel, voyage,
 * manifest, port, companies, decisions…) from the shared
 * `mission-context.store`. Every OIE step downstream reads the same
 * snapshot so the officer never has to repeat themselves when moving
 * between Copilot surfaces.
 */
import type { OperationalMission } from "./types";
import type { InterpretedQuery } from "./types";
import type { Workspace } from "@/services/orchestration";

export interface MissionSnapshotSource {
  investigationId?: string;
  workspace?: Workspace;
  raw?: Record<string, unknown>;
}

function pickString(o: Record<string, unknown> | undefined, k: string): string | undefined {
  const v = o?.[k];
  if (typeof v === "string" && v.length > 0) return v;
  if (v && typeof v === "object" && "name" in v && typeof (v as { name: unknown }).name === "string") {
    return (v as { name: string }).name;
  }
  return undefined;
}

export function buildMission(
  source: MissionSnapshotSource | undefined,
  interpreted: InterpretedQuery,
): OperationalMission {
  const raw = source?.raw ?? {};
  const companyList = Array.isArray(raw.companies) ? (raw.companies as unknown[]) : [];
  return {
    investigationId: source?.investigationId,
    workspace: source?.workspace,
    vesselRef:
      pickString(raw, "vessel") ??
      interpreted.entities.find((e) => e.type === "vessel" || e.type === "imo")?.value,
    voyageRef: pickString(raw, "voyage"),
    portRef:
      pickString(raw, "port") ?? interpreted.entities.find((e) => e.type === "port")?.value,
    companyRefs: companyList
      .map((c) => (typeof c === "string" ? c : pickString(c as Record<string, unknown>, "name")))
      .filter((s): s is string => Boolean(s)),
    snapshot: raw,
  };
}
