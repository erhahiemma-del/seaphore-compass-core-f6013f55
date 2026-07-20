/**
 * Sprint 12 · Offline / degraded mode.
 *
 * When circuit breakers trip or upstream health checks fail, the app
 * enters DEGRADED and — if all critical sources are down — OFFLINE.
 * Officers keep working on cached intelligence; every response is
 * clearly labelled so HR-3 (Cite Confidence) and HR-11 (Officer Owns
 * Decision) are preserved.
 */

export type OperatingMode = "online" | "degraded" | "offline";

export interface SourceHealth {
  id: string;
  ok: boolean;
  critical?: boolean;
  message?: string;
  checkedAt: number;
}

export interface ModeSnapshot {
  mode: OperatingMode;
  at: number;
  sources: readonly SourceHealth[];
  banner: string;
  degradedCapabilities: readonly string[];
}

const BANNERS: Record<OperatingMode, string> = {
  online: "All intelligence sources online.",
  degraded: "Degraded mode — some external sources unavailable. Cached intelligence in use; confidence chips reflect staleness.",
  offline: "Offline mode — external sources unreachable. Read-only cached intelligence. Officer decisions remain authoritative.",
};

export interface ModeManager {
  report(health: SourceHealth): void;
  snapshot(): ModeSnapshot;
  subscribe(fn: (s: ModeSnapshot) => void): () => void;
  set(mode: OperatingMode): void;   // ops override
}

export function createModeManager(now: () => number = Date.now): ModeManager {
  const sources = new Map<string, SourceHealth>();
  const subs = new Set<(s: ModeSnapshot) => void>();
  let override: OperatingMode | undefined;

  const computeMode = (): OperatingMode => {
    if (override) return override;
    if (sources.size === 0) return "online";
    const list = [...sources.values()];
    const critFail = list.filter((s) => s.critical && !s.ok);
    const anyFail = list.filter((s) => !s.ok);
    if (critFail.length === list.filter((s) => s.critical).length && critFail.length > 0) return "offline";
    if (anyFail.length > 0) return "degraded";
    return "online";
  };

  const snap = (): ModeSnapshot => {
    const mode = computeMode();
    const degraded: string[] = [];
    for (const s of sources.values()) if (!s.ok) degraded.push(s.id);
    return {
      mode, at: now(),
      sources: [...sources.values()],
      banner: BANNERS[mode],
      degradedCapabilities: degraded,
    };
  };

  const notify = () => { const s = snap(); for (const fn of subs) fn(s); };

  return {
    report(h) {
      const prev = sources.get(h.id);
      sources.set(h.id, { ...h, checkedAt: h.checkedAt || now() });
      if (!prev || prev.ok !== h.ok) notify();
    },
    snapshot: snap,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    set(mode) { override = mode; notify(); },
  };
}
