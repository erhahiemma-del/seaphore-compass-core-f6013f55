/**
 * LAYER 3.3 #18 — Human Override Gate.
 * Captures the officer's final Agree / Disagree / Modify / Dismiss decision.
 * Writes are immutable at the database layer (see block_override_mutation).
 */
import { supabase } from "@/integrations/supabase/client";
import type { OverrideDecision } from "./types";
import { emitEvent } from "./event-bus";

export interface OverrideInput {
  briefing_id: string;
  officer_id: string;
  decision: OverrideDecision;
  justification?: string;
  modifications?: Record<string, unknown>;
}

export async function captureOverride(input: OverrideInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("briefing_overrides")
    .insert({
      briefing_id: input.briefing_id,
      officer_id: input.officer_id,
      decision: input.decision,
      justification: input.justification ?? null,
      modifications: input.modifications ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await emitEvent({
    event_type: "officer.actioned",
    payload: { briefing_id: input.briefing_id, decision: input.decision },
    emitted_by: input.officer_id,
  });
  return { id: data.id as string };
}
