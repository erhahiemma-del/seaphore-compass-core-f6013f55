/**
 * LAYER 2.6 — Event Bus (append-only, persisted).
 * All critical pipeline events flow through this bus so downstream subscribers
 * (audit, alerts, analytics) receive a single authoritative stream.
 */
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrchestrationEventType } from "./types";

export interface EmittedEvent {
  event_type: OrchestrationEventType;
  entity_ids?: string[];
  payload?: Record<string, unknown>;
  emitted_by?: string;
}

export interface EventBusDeps {
  /** Authenticated Supabase client from a server-fn context. Preferred. */
  supabase?: SupabaseClient;
}

export async function emitEvent(evt: EmittedEvent, deps: EventBusDeps = {}): Promise<void> {
  try {
    const client = deps.supabase ?? browserSupabase;
    if (!deps.supabase) {
      // Browser fallback: only insert when the user has a session (RLS).
      const { data: sess } = await browserSupabase.auth.getSession();
      if (!sess?.session) return;
    }
    const { error } = await client.from("orchestration_events").insert({
      event_type: evt.event_type,
      entity_ids: evt.entity_ids ?? [],
      payload: (evt.payload ?? {}) as never,
      emitted_by: evt.emitted_by ?? null,
    });
    if (error) console.warn("[event-bus] emit failed:", error.message);
    else console.info("[event-bus] emitted", evt.event_type);
  } catch (err) {
    console.warn("[event-bus] emit threw:", err);
  }
}
