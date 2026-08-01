/**
 * Provider Health Dashboard — scheduled `healthCheck()` probes for every
 * certified Evidence Provider. Status, last check time, and error detail
 * are projected verbatim; the dashboard reports, the officer decides.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  probeProviderHealthFn,
  probeSingleProviderHealthFn,
  type ProviderHealthSnapshot,
} from "@/lib/provider-health.functions";
import { buildEvidenceProviderCatalog, formatCacheTtl } from "@/connectors/catalog";

export const Route = createFileRoute("/admin/provider-health")({
  component: ProviderHealthPage,
  head: () => ({
    meta: [
      { title: "Provider Health · Seaphore" },
      {
        name: "description",
        content:
          "Scheduled health probes for every certified Seaphore Evidence Provider: status, last check time, latency, and full error detail.",
      },
      { property: "og:title", content: "Provider Health · Seaphore" },
      {
        property: "og:description",
        content:
          "Live status, last check time, and error details for Seaphore's certified Evidence Providers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATE_STYLES: Record<ProviderHealthSnapshot["state"], { label: string; className: string }> =
  {
    healthy: {
      label: "Healthy",
      className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-500",
    },
    degraded: {
      label: "Degraded",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    },
    unauthenticated: {
      label: "Unauthenticated",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    },
    "credentials-missing": {
      label: "Credentials Missing",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    },
    "credentials-invalid": {
      label: "Credentials Invalid",
      className: "border-orange-500/40 bg-orange-500/15 text-orange-500",
    },

    offline: { label: "Offline", className: "border-red-500/40 bg-red-500/15 text-red-500" },
  };

/** Probe cadence options. The officer chooses the schedule. */
const INTERVALS = [
  { value: "0", label: "Manual only" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every 60 seconds" },
  { value: "300", label: "Every 5 minutes" },
];

function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * Confidence chip — a health probe is a single OBSERVED measurement, so
 * every number on this page is labelled as such rather than implying a
 * trend the probe cannot support.
 */
function ObservedChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate">
      {children}
    </span>
  );
}

function ProviderHealthPage() {
  const probeAll = useServerFn(probeProviderHealthFn);
  const probeOne = useServerFn(probeSingleProviderHealthFn);

  const [rows, setRows] = useState<ProviderHealthSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState("60");
  const [now, setNow] = useState(() => Date.now());
  const runIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const runId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await probeAll();
      if (runId !== runIdRef.current) return;
      setRows(data);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, [probeAll]);

  // Initial probe.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Scheduled probes at the officer-selected cadence.
  useEffect(() => {
    const seconds = Number(intervalSeconds);
    if (!seconds) return;
    const timer = setInterval(() => void refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [intervalSeconds, refresh]);

  // Ticker so "last check" ages visibly between probes.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const reprobe = async (id: string) => {
    setProbingId(id);
    try {
      const snapshot = await probeOne({ data: { id } });
      if (snapshot) {
        setRows((prev) => prev.map((r) => (r.id === snapshot.id ? snapshot : r)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbingId(null);
    }
  };

  const summary = useMemo(() => {
    const healthy = rows.filter((r) => r.state === "healthy").length;
    const failing = rows.filter((r) => r.state === "offline").length;
    const attention = rows.filter(
      (r) => r.state === "degraded" || r.state === "unauthenticated",
    ).length;
    return { total: rows.length, healthy, failing, attention };
  }, [rows]);

  const lastCheckedAt = useMemo(() => {
    const stamps = rows.map((r) => new Date(r.checkedAt).getTime()).filter((n) => !Number.isNaN(n));
    return stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
  }, [rows]);

  return (
    <AppShell
      title="Provider Health"
      subtitle="Certified Evidence Providers · Scheduled healthCheck() probes"
      mode="dark"
    >
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Provider Health</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Scheduled <code className="text-xs">healthCheck()</code> probes against every
              certified Evidence Provider. Errors are shown verbatim — never summarised away.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={intervalSeconds} onValueChange={setIntervalSeconds}>
              <SelectTrigger className="w-[168px]" aria-label="Probe schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVALS.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" disabled={loading} onClick={() => void refresh()}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Probe now
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryTile label="Providers" value={summary.total} />
          <SummaryTile label="Healthy" value={summary.healthy} />
          <SummaryTile label="Needs attention" value={summary.attention} />
          <SummaryTile label="Offline" value={summary.failing} />
        </section>

        {lastCheckedAt && (
          <p className="text-xs text-muted-foreground">
            Last completed sweep {relativeTime(lastCheckedAt, now)} ·{" "}
            {new Date(lastCheckedAt).toLocaleString()}
          </p>
        )}

        {error && (
          <Card className="border-red-500/40">
            <CardContent className="flex items-start gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
              <div>
                <p className="font-medium text-red-500">Probe sweep failed</p>
                <p className="mt-1 break-words text-muted-foreground">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {rows.length === 0 && !loading && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No certified Evidence Providers are registered.
              </CardContent>
            </Card>
          )}

          {rows.map((row) => {
            const style = STATE_STYLES[row.state];
            return (
              <Card key={row.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {row.displayName}
                      <Badge variant="outline" className={style.className}>
                        {style.label}
                      </Badge>
                    </CardTitle>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.id} · {row.providerType} · {row.environment}
                      {row.specVersion ? ` · spec v${row.specVersion}` : ""}
                      {row.enabled ? "" : " · disabled"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={probingId === row.id}
                    onClick={() => void reprobe(row.id)}
                  >
                    {probingId === row.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Re-probe
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <dl className="grid gap-3 sm:grid-cols-4">
                    <Metric label="Last check">
                      <span title={new Date(row.checkedAt).toLocaleString()}>
                        {relativeTime(row.checkedAt, now)}
                      </span>
                    </Metric>
                    <Metric label="Probe latency">{row.probeLatencyMs} ms</Metric>
                    <Metric label="Reported p50">{row.reportedLatencyMsP50} ms</Metric>
                    <Metric label="Failure rate">{Math.round(row.failureRate * 100)}%</Metric>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {row.capabilities.length > 0 ? (
                      row.capabilities.map((c) => (
                        <Badge key={c} variant="outline" className="font-normal">
                          {c}
                        </Badge>
                      ))
                    ) : (
                      <span>No capabilities declared</span>
                    )}
                    {row.quotaRemaining !== null && (
                      <span>Quota remaining {row.quotaRemaining}</span>
                    )}
                    <span>
                      Last success{" "}
                      {row.lastSuccessAt
                        ? new Date(row.lastSuccessAt).toLocaleString()
                        : "not recorded"}
                    </span>
                  </div>

                  {row.lastError && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
                      <p className="text-xs font-medium text-red-500">
                        {row.probeFailed ? "healthCheck() threw" : "Provider-reported error"}
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {row.lastError}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <EvidenceProviderCatalogSection />
      </div>
    </AppShell>
  );
}

/**
 * Sprint EP-MASTER — Evidence Provider Catalog projection. Derived from
 * the provider instances themselves, so a row cannot drift from reality.
 */
function EvidenceProviderCatalogSection() {
  const catalog = useMemo(() => buildEvidenceProviderCatalog(), []);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Evidence Provider Catalog</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The single source of truth for every integrated Evidence Provider. Derived live from each
          provider and re-certified on render — health status comes from the probes above.
        </p>
      </div>
      <div className="space-y-3">
        {catalog.map((row) => (
          <Card key={row.providerId}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <CardTitle className="text-base">
                {row.providerName}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {row.sprint} · {row.providerId}
                </span>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    row.certification === "CERTIFIED"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                      : "border-red-500/40 bg-red-500/15 text-red-500"
                  }
                >
                  {row.certification}
                </Badge>
                <Badge variant="outline">spec v{row.specVersion}</Badge>
                {row.referenceImplementation && (
                  <Badge variant="outline">Reference implementation</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Metric label="Capability">{row.capabilities.join(", ")}</Metric>
              <Metric label="Provider type">
                {row.providerType} · {row.environment} · priority {row.priority}
              </Metric>
              <Metric label="Cache TTL">{formatCacheTtl(row.cacheTtlMs)}</Metric>
              <Metric label="Authentication">
                {row.authentication === "none"
                  ? "None (keyless)"
                  : `${row.authentication} · ${row.credentialEnv.join(", ")}`}
              </Metric>
              <Metric label="Health status">Probed live (see sweep above)</Metric>
              <Metric label="Last validation">{row.lastValidationDate}</Metric>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Data source(s)
                </dt>
                <dd className="text-muted-foreground">{row.dataSources.join(" · ")}</dd>
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Test coverage · documentation
                </dt>
                <dd className="break-words font-mono text-xs text-muted-foreground">
                  {row.testCoverage.join(" · ")} · {row.documentation}
                </dd>
              </div>
              {row.certificationFailures.length > 0 && (
                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-red-500">
                    Certification failures
                  </dt>
                  <dd className="break-words font-mono text-xs text-red-500">
                    {row.certificationFailures.join(" · ")}
                  </dd>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <ObservedChip>Observed</ObservedChip>
      </CardContent>
    </Card>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 tabular-nums">
        {children}
        <ObservedChip>Observed</ObservedChip>
      </dd>
    </div>
  );
}
