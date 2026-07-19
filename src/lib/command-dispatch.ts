/**
 * Mission Intelligence Command Bar — unified dispatcher.
 *
 * A single entry point that routes any search (typed query, chip filter,
 * or detected entity token) to the correct Intelligence Centre or entity
 * profile with full handoff context (q, type, fromStage, fromRoute).
 */

import { useNavigate } from "@tanstack/react-router";

export type EntityType =
  | "imo"
  | "vessel"
  | "company"
  | "manifest"
  | "container"
  | "bol"
  | "voyage"
  | "port";

/** Chip / detected-type → canonical destination route. */
export const TYPE_ROUTE: Record<EntityType, string> = {
  imo: "/vessel",
  vessel: "/vessel",
  voyage: "/vessel",
  company: "/ownership",
  manifest: "/manifest",
  container: "/cargo",
  bol: "/cargo",
  port: "/ports",
};

const IMO_RE = /^\d{7}$/;
const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;
const BOL_RE = /^(BOL|BL)[-\s]?[A-Z0-9]{4,}$/i;
const VOYAGE_RE = /^V[YO]?[-\s]?[A-Z0-9]{3,}$/i;

/**
 * Infer an entity type from a raw query when the user has not
 * pinned a chip. Falls back to `vessel` (default global search target).
 */
export function detectEntityType(raw: string): EntityType {
  const q = raw.trim().toUpperCase();
  if (IMO_RE.test(q)) return "imo";
  if (CONTAINER_RE.test(q)) return "container";
  if (BOL_RE.test(q)) return "bol";
  if (VOYAGE_RE.test(q)) return "voyage";
  return "vessel";
}

export interface CommandDispatchInput {
  /** Raw query string. Empty allowed for chip-only navigation. */
  query?: string;
  /** Chip explicitly selected by officer; overrides auto-detect. */
  type?: EntityType | null;
  /**
   * Human-readable intelligence domain label (e.g. "Manifest Intelligence").
   * Forwarded on the URL so downstream Copilot / Gemini reasoners can
   * scope their answers to the active intelligence context.
   */
  aiContext?: string;
}

/**
 * useCommandDispatch — the ONLY sanctioned entry point for the Mission
 * Intelligence Command Bar. Every search / chip / entity shortcut goes
 * through here so routing, telemetry, and audit context stay consistent.
 */
export function useCommandDispatch() {
  const navigate = useNavigate();

  return ({ query, type, aiContext }: CommandDispatchInput) => {
    const q = (query ?? "").trim();
    const resolved: EntityType = type ?? (q ? detectEntityType(q) : "vessel");
    const target = TYPE_ROUTE[resolved];

    const search: Record<string, string> = {
      fromStage: "Monitor",
      fromRoute: "/",
      type: resolved,
    };
    if (q) search.q = q;
    if (aiContext) search.aiContext = aiContext;

    navigate({ to: target, search });
  };
}
