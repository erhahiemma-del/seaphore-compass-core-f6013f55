import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { AlertStatus } from "@/lib/intel-centre-data";

/**
 * Live-update stream for the Alerts Center.
 *
 * Subscribes to postgres_changes on public.alerts, public.signals and
 * public.investigations. Any UPDATE whose metadata carries an `alertId`
 * matching a locally-known alert is applied to `statusMap` / `assignMap`
 * overrides so every panel (queue, details, timeline, correlation) reflects
 * the change without a refresh. Every event also bumps `eventCount` so the
 * UI can flash a LIVE indicator.
 *
 * Officer principle: the stream only carries observations from the database.
 * The officer still decides — this hook never mutates evidence, only mirrors
 * server truth into local view state.
 */
export type RealtimeEventKind = "alert" | "signal" | "investigation";

export interface RealtimeEvent {
  kind: RealtimeEventKind;
  type: "INSERT" | "UPDATE" | "DELETE";
  at: string;
  summary: string;
}

export interface UseAlertsRealtimeOptions {
  /** Local alertIds (metadata.alertId) that identify existing rows in the workspace. */
  knownAlertIds: string[];
  onStatusChange?: (alertId: string, status: AlertStatus) => void;
  onAssignChange?: (alertId: string, assignedTo: string) => void;
}

export interface UseAlertsRealtimeResult {
  status: "connecting" | "live" | "error";
  eventCount: number;
  lastEvent: RealtimeEvent | null;
  /** Map of local alertId → epoch ms of most recent matching update. */
  recentUpdates: Record<string, number>;
  /** True if `alertId` was updated within `withinMs` (default 8s). */
  wasRecentlyUpdated: (alertId: string, withinMs?: number) => boolean;
}

interface AlertRow {
  id: string;
  status: string | null;
  severity: string | null;
  acknowledged_by: string | null;
  metadata: Record<string, unknown> | null;
}

function statusFromDb(raw: string | null | undefined): AlertStatus | null {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up === "NEW" || up === "ACK" || up === "RESOLVED") return up as AlertStatus;
  if (up === "ACKNOWLEDGED") return "ACK";
  return null;
}

export function useAlertsRealtime({
  knownAlertIds,
  onStatusChange,
  onAssignChange,
}: UseAlertsRealtimeOptions): UseAlertsRealtimeResult {
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<Record<string, number>>({});
  // `now` ticks every second while there are unexpired entries so consumers
  // re-render and freshness labels ("updated just now") naturally expire.
  const [, setNow] = useState(0);

  // Keep the known-ids set and callbacks in refs so we can subscribe once and
  // avoid tearing the channel down when props change (which would leak channels
  // and can trigger costly reconnect loops).
  const knownRef = useRef(new Set(knownAlertIds));
  const onStatusRef = useRef(onStatusChange);
  const onAssignRef = useRef(onAssignChange);

  useEffect(() => {
    knownRef.current = new Set(knownAlertIds);
  }, [knownAlertIds]);
  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onAssignRef.current = onAssignChange;
  }, [onAssignChange]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const record = (evt: RealtimeEvent) => {
      if (cancelled) return;
      setEventCount((n) => n + 1);
      setLastEvent(evt);
    };

    const applyAlertRow = (row: AlertRow | null, type: RealtimeEvent["type"]) => {
      if (!row) return;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const localId = typeof meta.alertId === "string" ? meta.alertId : null;
      const summaryTitle =
        (typeof meta.title === "string" && meta.title) || localId || row.id.slice(0, 8);

      record({
        kind: "alert",
        type,
        at: new Date().toISOString(),
        summary: `${type} · ${summaryTitle}`,
      });

      if (!localId || !knownRef.current.has(localId)) return;
      setRecentUpdates((prev) => ({ ...prev, [localId]: Date.now() }));
      const nextStatus = statusFromDb(row.status);
      if (nextStatus) onStatusRef.current?.(localId, nextStatus);
      const assignee = typeof meta.assignedTo === "string" ? meta.assignedTo : null;
      if (assignee) onAssignRef.current?.(localId, assignee);
    };

    channel = supabase
      .channel("alerts-center-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (payload) => {
        const row = (payload.new ?? payload.old) as AlertRow | null;
        applyAlertRow(row, payload.eventType as RealtimeEvent["type"]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, (payload) => {
        const row = (payload.new ?? payload.old) as { statement?: string } | null;
        record({
          kind: "signal",
          type: payload.eventType as RealtimeEvent["type"],
          at: new Date().toISOString(),
          summary: `Signal ${payload.eventType} · ${row?.statement?.slice(0, 60) ?? ""}`,
        });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "investigations" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { title?: string } | null;
          record({
            kind: "investigation",
            type: payload.eventType as RealtimeEvent["type"],
            at: new Date().toISOString(),
            summary: `Investigation ${payload.eventType} · ${row?.title ?? ""}`,
          });
        },
      )
      .subscribe((s) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("error");
      });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // Subscribe exactly once for the lifetime of the workspace.
  }, []);

  // Prune expired recent-update entries + tick freshness labels every second.
  useEffect(() => {
    const keys = Object.keys(recentUpdates);
    if (keys.length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setRecentUpdates((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [k, ts] of Object.entries(prev)) {
          if (now - ts < 15_000) next[k] = ts;
          else changed = true;
        }
        return changed ? next : prev;
      });
      setNow(now);
    }, 1000);
    return () => window.clearInterval(id);
  }, [recentUpdates]);

  const wasRecentlyUpdated = (alertId: string, withinMs = 8_000) => {
    const ts = recentUpdates[alertId];
    return !!ts && Date.now() - ts < withinMs;
  };

  return { status, eventCount, lastEvent, recentUpdates, wasRecentlyUpdated };
}
