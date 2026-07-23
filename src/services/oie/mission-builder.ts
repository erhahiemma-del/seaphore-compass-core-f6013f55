/**
 * OIE · Module 2 — Mission Context Builder.
 *
 * Hydrates the currently-active investigation snapshot (vessel,
 * voyage, manifest, port, companies…) and the rolling conversation
 * history. Downstream modules read the same builder output so the
 * officer never has to repeat themselves.
 */
import type {
  EntityMention,
  InterpretedQuery,
  MissionConversationTurn,
  OperationalMission,
} from "./types";
import type { Workspace } from "@/services/orchestration";
import { extractEntities } from "./query-interpreter";
import { findAnchor } from "./conversation-resolver";

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

interface RawConversationEntry {
  role?: string;
  text?: string;
  ts?: number;
}

function extractConversation(raw: Record<string, unknown> | undefined): MissionConversationTurn[] {
  const arr = Array.isArray(raw?.conversation) ? (raw!.conversation as RawConversationEntry[]) : [];
  return arr
    .filter((t) => typeof t?.text === "string" && (t.role === "officer" || t.role === "copilot"))
    .map((t) => ({
      role: t.role as "officer" | "copilot",
      text: t.text as string,
      ts: typeof t.ts === "number" ? t.ts : 0,
      entities: extractEntities(t.text as string),
    }));
}

export function buildMission(
  source: MissionSnapshotSource | undefined,
  interpreted: InterpretedQuery,
): OperationalMission {
  const raw = source?.raw ?? {};
  const companyList = Array.isArray(raw.companies) ? (raw.companies as unknown[]) : [];
  const conversation = extractConversation(raw);
  const lastEntity: EntityMention | undefined =
    findAnchor(conversation) ??
    interpreted.entities.find((e) => e.type === "vessel" || e.type === "company" || e.type === "port");

  return {
    investigationId: source?.investigationId,
    workspace: source?.workspace,
    vesselRef:
      pickString(raw, "vessel") ??
      interpreted.entities.find((e) => e.type === "vessel" || e.type === "imo")?.value ??
      (lastEntity?.type === "vessel" ? lastEntity.value : undefined),
    voyageRef: pickString(raw, "voyage"),
    portRef:
      pickString(raw, "port") ??
      interpreted.entities.find((e) => e.type === "port")?.value ??
      (lastEntity?.type === "port" ? lastEntity.value : undefined),
    companyRefs: companyList
      .map((c) => (typeof c === "string" ? c : pickString(c as Record<string, unknown>, "name")))
      .filter((s): s is string => Boolean(s)),
    snapshot: raw,
    conversation,
    lastEntity,
  };
}
