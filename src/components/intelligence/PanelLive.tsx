import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { RealtimeEvent, RealtimeEventKind } from "@/hooks/use-alerts-realtime";

/**
 * Per-panel LIVE indicator.
 *
 * Watches the shared realtime `lastEvent` stream and pulses when an event
 * matching this panel's `kinds` arrives. Also tracks how many matching
 * updates this panel has seen so officers can tell at a glance which
 * surfaces are moving.
 */
export interface PanelLiveProps {
  lastEvent: RealtimeEvent | null;
  /** Which realtime event kinds cause this panel to pulse. */
  kinds: RealtimeEventKind[];
  /** Overall channel status from useAlertsRealtime. */
  status: "connecting" | "live" | "error";
  /** How long (ms) the flash lasts after a matching event. */
  pulseMs?: number;
  className?: string;
}

export function PanelLive({
  lastEvent,
  kinds,
  status,
  pulseMs = 1600,
  className,
}: PanelLiveProps) {
  const [count, setCount] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const [lastMatch, setLastMatch] = useState<RealtimeEvent | null>(null);
  const seenRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    const key = `${lastEvent.at}:${lastEvent.kind}:${lastEvent.type}`;
    if (seenRef.current === key) return;
    seenRef.current = key;
    if (!kinds.includes(lastEvent.kind)) return;
    setCount((n) => n + 1);
    setLastMatch(lastEvent);
    setPulsing(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setPulsing(false), pulseMs);
  }, [lastEvent, kinds, pulseMs]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const dot =
    status !== "live"
      ? status === "connecting"
        ? "bg-amber-400"
        : "bg-red-500"
      : pulsing
      ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.35)] animate-ping"
      : count > 0
      ? "bg-emerald-400"
      : "bg-slate/50";

  const label =
    status !== "live"
      ? status === "connecting"
        ? "CONNECTING"
        : "OFFLINE"
      : count === 0
      ? "LIVE"
      : `LIVE · ${count}`;

  return (
    <span
      title={
        lastMatch
          ? `Last update: ${lastMatch.summary} · ${new Date(lastMatch.at).toLocaleTimeString()}`
          : "No realtime updates yet"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-surface-2/50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.06em]",
        pulsing ? "text-emerald-300" : "text-slate",
        className,
      )}
    >
      <span className={cn("relative h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
