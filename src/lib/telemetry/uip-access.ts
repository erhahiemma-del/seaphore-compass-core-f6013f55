/**
 * UIP Access Telemetry — Sprint: Provenance Hardening.
 *
 * A lightweight, in-memory audit trail of every downstream consumer
 * (MIBC, Evidence Explorer, Investigation Workspace, Predictions,
 * Revenue Leakage, Operational Knowledge, Copilot briefing view)
 * that opens a Canonical Unified Intelligence Package.
 *
 * The intelligence pipeline itself is untouched — this module never
 * mutates or re-reads a UIP. It only *records* which snapshot each
 * surface displayed, so officers and auditors can later confirm that
 * every consumer is looking at the same source_uip_id, without
 * digging through browser DevTools.
 *
 * The store is a bounded ring buffer (last 500 events, oldest evicted)
 * held only in the current session. It is intentionally not persisted
 * — telemetry is a live-diagnostic aid, not durable evidence.
 */
import { create } from "zustand";

export type UipConsumerSurface =
  | "MIBC"
  | "EVIDENCE_EXPLORER"
  | "INVESTIGATION_WORKSPACE"
  | "PREDICTIONS"
  | "REVENUE_LEAKAGE"
  | "OPERATIONAL_KNOWLEDGE"
  | "COPILOT_BRIEFING"
  | "OKL_PATTERNS_PANEL";

export interface UipAccessEvent {
  readonly id: string;
  readonly at: string; // ISO timestamp
  readonly surface: UipConsumerSurface;
  readonly uipId: string | null;
  readonly briefingId?: string | null;
  readonly officerId?: string | null;
  readonly action: "OPENED" | "GENERATED" | "EXPORTED" | "DOWNLOAD" | "RESOLVED_MISS";
  readonly detail?: string;
}

interface TelemetryState {
  readonly events: ReadonlyArray<UipAccessEvent>;
  record: (e: Omit<UipAccessEvent, "id" | "at">) => void;
  clear: () => void;
}

const MAX_EVENTS = 500;

export const useUipTelemetryStore = create<TelemetryState>((set) => ({
  events: [],
  record: (e) =>
    set((prev) => {
      const evt: UipAccessEvent = {
        ...e,
        id: `uip-access-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
      };
      // Dedupe rapid repeat OPENED events on the same surface+uip within
      // 750ms — React StrictMode + re-renders would otherwise flood
      // the trail with identical rows.
      const last = prev.events[0];
      if (
        last &&
        last.action === evt.action &&
        last.surface === evt.surface &&
        last.uipId === evt.uipId &&
        Date.now() - Date.parse(last.at) < 750
      ) {
        return prev;
      }
      const events = [evt, ...prev.events].slice(0, MAX_EVENTS);
      return { events };
    }),
  clear: () => set({ events: [] }),
}));

/**
 * Non-hook helper. Every consumer surface calls this when it first
 * resolves (or fails to resolve) a Canonical UIP for display.
 *
 * Callers pass `uipId: null` explicitly for `RESOLVED_MISS` — that
 * records the *attempt*, which is more useful than silence.
 */
export function recordUipAccess(e: Omit<UipAccessEvent, "id" | "at">): void {
  useUipTelemetryStore.getState().record(e);
}
