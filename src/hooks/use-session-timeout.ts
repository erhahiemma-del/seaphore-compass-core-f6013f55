/**
 * useSessionTimeout — inactivity-based auto-logout with pre-warning.
 *
 * SECURITY: reduces exposure of unattended workstations. Complements
 * Supabase's short-lived access tokens (refreshed automatically by the
 * SDK). This hook does NOT extend server-side token lifetime — it only
 * signs the user out locally after `timeoutMs` without activity.
 *
 * Activity signals: mousemove, keydown, click, touchstart, scroll,
 * visibilitychange. Passive listeners keep the input path fast.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { performLogout } from "@/lib/auth/logout";

export interface SessionTimeoutOptions {
  /** Total inactivity before auto-logout (ms). Default 30 min. */
  timeoutMs?: number;
  /** Warn the user this many ms before logout. Default 2 min. */
  warnBeforeMs?: number;
}

export interface SessionTimeoutState {
  /** True when the pre-logout warning window is active. */
  warning: boolean;
  /** ms until forced logout while `warning` is true. */
  remainingMs: number;
  /** Manually reset the timer (e.g. from the warning modal). */
  reset: () => void;
}

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "touchstart",
  "scroll",
  "visibilitychange",
] as const;

export function useSessionTimeout(opts: SessionTimeoutOptions = {}): SessionTimeoutState {
  const timeoutMs = opts.timeoutMs ?? 30 * 60_000;
  const warnBeforeMs = opts.warnBeforeMs ?? 2 * 60_000;

  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(warnBeforeMs);

  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(0);

  useEffect(() => {
    if (!session) return;

    function clearAll() {
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
      warnTimer.current = null;
      logoutTimer.current = null;
      tickTimer.current = null;
    }

    function schedule() {
      clearAll();
      setWarning(false);
      deadlineRef.current = Date.now() + timeoutMs;
      warnTimer.current = setTimeout(() => {
        setWarning(true);
        setRemainingMs(warnBeforeMs);
        tickTimer.current = setInterval(() => {
          const left = Math.max(0, deadlineRef.current - Date.now());
          setRemainingMs(left);
        }, 1_000);
      }, Math.max(0, timeoutMs - warnBeforeMs));
      logoutTimer.current = setTimeout(() => {
        void performLogout({ queryClient, router });
      }, timeoutMs);
    }

    function onActivity() {
      // Ignore activity once we've entered the warning window — force an
      // explicit user acknowledgement via reset() to extend the session.
      if (warning) return;
      schedule();
    }

    schedule();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    return () => {
      clearAll();
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
    };
  }, [session, timeoutMs, warnBeforeMs, warning, queryClient, router]);

  return {
    warning,
    remainingMs,
    reset: () => {
      setWarning(false);
      deadlineRef.current = Date.now() + timeoutMs;
    },
  };
}
