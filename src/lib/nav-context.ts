/**
 * Seaphore navigation handoff model.
 *
 * Every navigation target carries context. Lovable never navigates to a
 * blank screen — it carries the entity, voyage, or investigation ID that
 * the target needs to pre-populate the case header, workspace, and first
 * evidence item (the detecting signal).
 *
 * Canonical shape (from Screen Inventory & Navigation Map, Part 05):
 *
 *   onNavigate({
 *     target: "/investigate/INV-2026-00431",
 *     context: {
 *       entityId: "VE-00042",
 *       voyageId: "VY-00251",
 *       signalId: "SIG-00891",
 *       confidence: "INFERRED",
 *       fromStage: "Detect",
 *     },
 *   })
 */

import { useNavigate, useSearch } from "@tanstack/react-router";

export type LifecycleStage = "Monitor" | "Detect" | "Investigate" | "Decide" | "Share" | "Learn";

/** UI-facing confidence tiers (see OC-001 Confidence Ladder). */
export type HandoffConfidence = "VERIFIED" | "OBSERVED" | "INFERRED" | "UNCONFIRMED";

/**
 * Handoff context — serialised into URL search params so the target
 * screen can pre-populate deterministically and the audit trail can
 * reconstruct the navigation chain.
 */
export interface HandoffContext {
  entityId?: string;
  voyageId?: string;
  signalId?: string;
  investigationId?: string;
  alertId?: string;
  confidence?: HandoffConfidence;
  fromStage?: LifecycleStage;
  /** Route the user came from (for audit + back-nav). */
  fromRoute?: string;
}

export interface HandoffCall {
  target: string;
  context?: HandoffContext;
}

/** Serialise HandoffContext into a query-string search object. */
export function contextToSearch(context: HandoffContext | undefined): Record<string, string> {
  if (!context) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  }
  return out;
}

/**
 * useHandoffNavigate — the ONLY sanctioned way to navigate between
 * lifecycle stages / Intelligence Centres. Guarantees the target screen
 * receives entity/voyage/signal/confidence context.
 */
export function useHandoffNavigate() {
  const navigate = useNavigate();
  return ({ target, context }: HandoffCall) => {
    navigate({
      to: target,
      search: contextToSearch(context),
    });
  };
}

/**
 * useHandoffContext — read the handoff context on the target screen.
 * Returns an empty object when the screen was entered directly (no
 * upstream handoff).
 */
export function useHandoffContext(): HandoffContext {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const pick = (k: keyof HandoffContext) =>
    typeof search[k] === "string" ? (search[k] as string) : undefined;
  return {
    entityId: pick("entityId"),
    voyageId: pick("voyageId"),
    signalId: pick("signalId"),
    investigationId: pick("investigationId"),
    alertId: pick("alertId"),
    confidence: pick("confidence") as HandoffConfidence | undefined,
    fromStage: pick("fromStage") as LifecycleStage | undefined,
    fromRoute: pick("fromRoute"),
  };
}
