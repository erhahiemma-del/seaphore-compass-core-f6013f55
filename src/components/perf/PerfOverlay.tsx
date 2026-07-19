import { useEffect, useState } from "react";
import { Activity, AlertTriangle, X } from "lucide-react";
import {
  getRecentAlerts,
  getRecentTraces,
  subscribe,
  summarize,
  type PerfTrace,
} from "@/lib/perf/monitor";

/**
 * Floating dev-only performance overlay. Toggled with Alt+P.
 * Auto-opens when a perf alert lands so breaches are impossible to miss.
 */
export function PerfOverlay() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const [flashAlert, setFlashAlert] = useState<PerfTrace | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const unsub = subscribe((t) => {
      force((n) => n + 1);
      if (t.overBudget) {
        setFlashAlert(t);
        setTimeout(() => setFlashAlert(null), 4000);
      }
    });
    return unsub;
  }, []);

  const traces = getRecentTraces(30);
  const alerts = getRecentAlerts(10);
  const summary = summarize();

  return (
    <>
      {/* Alert toast — always visible even when overlay is closed */}
      {flashAlert ? (
        <div
          role="alert"
          className="fixed bottom-24 right-4 z-[999] max-w-sm rounded-lg border border-[color:var(--color-red)]/60 bg-surface-1 px-4 py-3 shadow-xl"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-[color:var(--color-red)]" />
            <div className="text-[12px]">
              <div className="font-semibold text-foreground">
                Perf budget exceeded
              </div>
              <div className="text-slate">
                <code className="text-foreground">{flashAlert.name}</code>{" "}
                {flashAlert.durationMs.toFixed(1)}ms &gt;{" "}
                {flashAlert.budgetMs}ms
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toggle chip */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-[998] inline-flex items-center gap-1 rounded-full border border-line bg-surface-1/95 px-3 py-1.5 text-[11px] font-semibold text-slate shadow-lg hover:text-foreground"
        aria-label="Toggle performance overlay (Alt+P)"
      >
        <Activity className="h-3.5 w-3.5" />
        Perf
        {alerts.length > 0 ? (
          <span className="ml-1 rounded-full bg-[color:var(--color-red)]/20 px-1.5 py-0.5 text-[10px] text-[color:var(--color-red)]">
            {alerts.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed bottom-16 right-4 z-[998] flex h-[420px] w-[380px] flex-col rounded-lg border border-line bg-surface-1 shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <Activity className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />
              Seaphore Performance Traces
            </div>
            <button
              type="button"
              className="text-slate hover:text-foreground"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="border-b border-line p-2">
            <div className="type-label text-slate">Summary (p50 / p95 / max)</div>
            <div className="mt-1 space-y-0.5 text-[11px]">
              {Object.entries(summary).length === 0 ? (
                <div className="text-slate italic">No traces yet.</div>
              ) : (
                Object.entries(summary).map(([name, s]) => (
                  <div key={name} className="flex items-center justify-between font-mono">
                    <span className="truncate text-foreground">{name}</span>
                    <span className={s.breaches > 0 ? "text-[color:var(--color-red)]" : "text-slate"}>
                      {s.p50.toFixed(0)} / {s.p95.toFixed(0)} / {s.max.toFixed(0)}ms
                      {s.breaches > 0 ? ` · ${s.breaches}⚠` : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <div className="type-label text-slate">Recent traces</div>
            <ul className="mt-1 space-y-0.5 text-[11px] font-mono">
              {traces.map((t) => (
                <li
                  key={t.id}
                  className={
                    t.overBudget
                      ? "flex items-center justify-between text-[color:var(--color-red)]"
                      : "flex items-center justify-between text-slate"
                  }
                >
                  <span className="truncate">{t.name}</span>
                  <span>
                    {t.durationMs.toFixed(1)}ms
                    {t.budgetMs ? ` / ${t.budgetMs}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-line px-3 py-1.5 text-[10px] text-slate">
            Alt+P to toggle · budgets in <code>src/lib/perf/thresholds.ts</code>
          </div>
        </div>
      ) : null}
    </>
  );
}
