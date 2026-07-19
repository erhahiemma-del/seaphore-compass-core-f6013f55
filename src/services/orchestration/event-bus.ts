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
  await supabase.from("orchestration_events").insert({
    event_type: evt.event_type,
    entity_ids: evt.entity_ids ?? [],
    payload: evt.payload ?? {},
    emitted_by: evt.emitted_by ?? null,
  });
}
