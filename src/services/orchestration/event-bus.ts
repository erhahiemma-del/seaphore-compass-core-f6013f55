/**
 * LAYER 2.6 — Event Bus (append-only, persisted).
 * All critical pipeline events flow through this bus so downstream subscribers
 * (audit, alerts, analytics) receive a single authoritative stream.
 */
import { supabase } from "@/integrations/supabase/client";
import type { OrchestrationEventType } from "./types";

export interface EmittedEvent {
  event_type: OrchestrationEventType;
  entity_ids?: string[];
  payload?: Record<string, unknown>;
  emitted_by?: string;
}

export async function emitEvent(evt: EmittedEvent): Promise<void> {
  // Guard: in dev-bypass (no auth session) RLS blocks the insert. We keep
  // the pipeline alive and silent — persistence is best-effort here.
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) return;
    const { error } = await supabase.from("orchestration_events").insert({
      event_type: evt.event_type,
      entity_ids: evt.entity_ids ?? [],
      payload: (evt.payload ?? {}) as never,
      emitted_by: evt.emitted_by ?? null,
    });
    if (error) console.warn("[event-bus] emit failed:", error.message);
  } catch (err) {
    console.warn("[event-bus] emit threw:", err);
  }
}
