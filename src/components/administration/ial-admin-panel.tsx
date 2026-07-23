/**
 * IAL Admin Controls — force-refresh a connector, clear the evidence
 * cache, or prewarm it with the canonical query set.
 *
 * Every mutating action writes an audit_log entry via
 * `@/services/ial/admin.ts`. This panel is admin/director-gated by the
 * surrounding Administration Center; it deliberately does not re-check
 * permissions.
 */
import { useEffect, useMemo, useState } from "react";
import { Database, Flame, RefreshCcw, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearEvidenceCache,
  forceRefreshConnector,
  ialCacheStats,
  listIalConnectors,
  prewarmEvidenceCache,
  type IalCacheStats,
  type IalConnectorSummary,
  type PrewarmOutcome,
  type RefreshOutcome,
} from "@/services/ial/admin";
import type { ConnectorId } from "@/services/ial/types";

type BusyState =
  | { kind: "idle" }
  | { kind: "refresh"; connectorId: ConnectorId }
  | { kind: "clear"; scope: "all" | ConnectorId }
  | { kind: "prewarm" };

export function IalAdminPanel() {
  const [connectors, setConnectors] = useState<ReadonlyArray<IalConnectorSummary>>([]);
  const [stats, setStats] = useState<IalCacheStats>({ hits: 0, misses: 0, size: 0, hitRate: 0 });
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });
  const [lastRefresh, setLastRefresh] = useState<RefreshOutcome | null>(null);
  const [lastPrewarm, setLastPrewarm] = useState<ReadonlyArray<PrewarmOutcome> | null>(null);

  const refreshLocalState = () => {
    setConnectors(listIalConnectors());
    setStats(ialCacheStats());
  };

  useEffect(() => {
    refreshLocalState();
    const t = setInterval(refreshLocalState, 5000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async (connectorId: ConnectorId) => {
    setBusy({ kind: "refresh", connectorId });
    try {
      const outcome = await forceRefreshConnector(connectorId);
      setLastRefresh(outcome);
      if (outcome.error) {
        toast.error(`Refresh failed for ${connectorId}: ${outcome.error}`);
      } else {
        toast.success(
          `${connectorId} refreshed · ${outcome.cacheEntriesCleared} cache entries cleared`,
        );
      }
    } finally {
      refreshLocalState();
      setBusy({ kind: "idle" });
    }
  };

  const handleClear = async (scope: "all" | ConnectorId) => {
    setBusy({ kind: "clear", scope });
    try {
      const { cleared } = await clearEvidenceCache(scope === "all" ? undefined : scope);
      toast.success(
        scope === "all"
          ? `Evidence cache cleared · ${cleared} entries removed`
          : `Cache cleared for ${scope} · ${cleared} entries`,
      );
    } finally {
      refreshLocalState();
      setBusy({ kind: "idle" });
    }
  };

  const handlePrewarm = async () => {
    setBusy({ kind: "prewarm" });
    try {
      const results = await prewarmEvidenceCache();
      setLastPrewarm(results);
      const records = results.reduce((n, r) => n + r.records, 0);
      const failures = results.filter((r) => !r.ok).length;
      if (failures > 0) {
        toast.warning(
          `Prewarm completed with ${failures} failure(s) · ${records} records loaded`,
        );
      } else {
        toast.success(
          `Cache prewarmed · ${results.length} quer${results.length === 1 ? "y" : "ies"} · ${records} records`,
        );
      }
    } finally {
      refreshLocalState();
      setBusy({ kind: "idle" });
    }
  };

  const kpis = useMemo(
    () => [
      { label: "Cache Size", value: stats.size.toString(), hint: "entries" },
      { label: "Hit Rate", value: `${Math.round(stats.hitRate * 100)}%`, hint: `${stats.hits} hits` },
      { label: "Misses", value: stats.misses.toString(), hint: "since boot" },
      { label: "Connectors", value: connectors.length.toString(), hint: "registered" },
    ],
    [stats, connectors.length],
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="type-h2 text-foreground">Intelligence Acquisition Controls</div>
          <p className="type-small text-slate mt-1 max-w-2xl">
            Force-refresh individual connectors, clear the evidence cache, or prewarm it with
            the canonical query set. Every action is written to the audit log.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrewarm}
            disabled={busy.kind !== "idle"}
          >
            <Flame className="h-4 w-4 mr-1.5" />
            {busy.kind === "prewarm" ? "Prewarming…" : "Prewarm Cache"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleClear("all")}
            disabled={busy.kind !== "idle"}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {busy.kind === "clear" && busy.scope === "all" ? "Clearing…" : "Clear All"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <div className="type-caption text-slate uppercase tracking-wide">{k.label}</div>
            <div className="type-h1 text-foreground mt-1">{k.value}</div>
            <div className="type-caption text-slate mt-1">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[color:var(--color-teal)]" />
            <span className="type-h3 text-foreground">Registered Connectors</span>
          </div>
          <span className="type-caption text-slate">
            Force refresh re-authenticates and invalidates cached envelopes for the selected
            connector.
          </span>
        </div>
        <ul className="divide-y divide-line">
          {connectors.length === 0 ? (
            <li className="p-6 text-center type-small text-slate">
              No connectors registered.
            </li>
          ) : (
            connectors.map((c) => {
              const isBusy = busy.kind === "refresh" && busy.connectorId === c.id;
              const isClearing = busy.kind === "clear" && busy.scope === c.id;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="type-body text-foreground truncate">{c.displayName}</div>
                    <div className="type-caption text-slate font-mono">{c.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClear(c.id)}
                      disabled={busy.kind !== "idle"}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {isClearing ? "Clearing…" : "Clear Cache"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleRefresh(c.id)}
                      disabled={busy.kind !== "idle"}
                    >
                      <RefreshCcw
                        className={cn("h-3.5 w-3.5 mr-1.5", isBusy && "animate-spin")}
                      />
                      {isBusy ? "Refreshing…" : "Force Refresh"}
                    </Button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {lastRefresh && (
        <OutcomePanel
          title="Last force-refresh"
          icon={<RefreshCcw className="h-4 w-4 text-[color:var(--color-teal)]" />}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4 type-small">
            <Row label="Connector" value={lastRefresh.connectorId} />
            <Row label="Authenticated" value={lastRefresh.authenticated ? "Yes" : "No"} />
            <Row label="Cache cleared" value={`${lastRefresh.cacheEntriesCleared} entries`} />
            <Row label="Latency" value={`${lastRefresh.latencyMs} ms`} />
          </dl>
          {lastRefresh.error && (
            <p className="type-small text-[color:var(--color-danger)] mt-2">
              {lastRefresh.error}
            </p>
          )}
        </OutcomePanel>
      )}

      {lastPrewarm && (
        <OutcomePanel
          title="Last prewarm run"
          icon={<Zap className="h-4 w-4 text-[color:var(--color-teal)]" />}
        >
          <ul className="divide-y divide-line">
            {lastPrewarm.map((r, idx) => (
              <li key={idx} className="flex flex-wrap items-center justify-between gap-2 py-2 type-small">
                <span className="text-foreground font-mono truncate max-w-[60%]">
                  {r.query.entity?.id ?? r.query.text ?? "(empty)"}
                </span>
                <span className={cn("text-slate", !r.ok && "text-[color:var(--color-danger)]")}>
                  {r.ok
                    ? `${r.records} records · ${r.sources} sources · ${r.latencyMs} ms`
                    : `failed · ${r.error ?? "unknown error"}`}
                </span>
              </li>
            ))}
          </ul>
        </OutcomePanel>
      )}
    </section>
  );
}

function OutcomePanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="type-h3 text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate">{label}</dt>
      <dd className="text-foreground font-mono">{value}</dd>
    </>
  );
}
