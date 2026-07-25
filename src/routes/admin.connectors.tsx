/**
 * Connector Admin — server-driven health for authenticated
 * intelligence connectors. The browser NEVER decides whether a
 * connector exists; it reads projected snapshots from the server.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import {
  listAuthenticatedConnectorsFn,
  probeAllAuthenticatedConnectorsFn,
  probeAuthenticatedConnectorFn,
  type ConnectorAdminSnapshot,
} from "@/lib/connectors.functions";

export const Route = createFileRoute("/admin/connectors")({
  component: ConnectorAdminPage,
  head: () => ({
    meta: [
      { title: "Connector Admin · Seaphore" },
      {
        name: "description",
        content:
          "Server-driven health for every authenticated Seaphore intelligence connector. Evidence only; no secrets in the browser.",
      },
      { property: "og:title", content: "Connector Admin · Seaphore" },
      {
        property: "og:description",
        content: "Live health, authentication, and evidence-only status for Seaphore's authenticated intelligence connectors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function stateBadge(state: ConnectorAdminSnapshot["lastHealth"] extends infer H ? H : never) {
  return state;
}

const STATE_STYLES: Record<string, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  degraded: { label: "Degraded", className: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  auth_failed: { label: "Authentication Failed", className: "bg-red-500/15 text-red-500 border-red-500/40" },
  rate_limited: { label: "Rate Limited", className: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  offline: { label: "Offline", className: "bg-slate-500/15 text-slate-400 border-slate-500/40" },
  unavailable: { label: "Unavailable", className: "bg-slate-500/15 text-slate-400 border-slate-500/40" },
};

function ConnectorAdminPage() {
  const listFn = useServerFn(listAuthenticatedConnectorsFn);
  const probeAllFn = useServerFn(probeAllAuthenticatedConnectorsFn);
  const probeOneFn = useServerFn(probeAuthenticatedConnectorFn);

  const [rows, setRows] = useState<ConnectorAdminSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (probe: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = probe ? await probeAllFn() : await listFn();
      setRows(data);
      setRefreshedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const total = rows.length;
    const healthy = rows.filter((r) => r.lastHealth?.state === "healthy").length;
    const failing = rows.filter(
      (r) =>
        r.lastHealth &&
        (r.lastHealth.state === "auth_failed" ||
          r.lastHealth.state === "offline" ||
          r.lastHealth.state === "unavailable"),
    ).length;
    return { total, healthy, failing };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Connector Admin</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Authenticated intelligence connectors. Server-driven registry, evidence-only. No
              secrets ever reach the browser.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{summary.healthy}/{summary.total} healthy</Badge>
            {summary.failing > 0 && (
              <Badge variant="outline" className="border-red-500/40 text-red-500">
                {summary.failing} failing
              </Badge>
            )}
            <Button variant="secondary" size="sm" disabled={loading} onClick={() => refresh(true)}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Probe all
            </Button>
          </div>
        </header>

        {error && (
          <Card className="border-red-500/40 bg-red-500/5">
            <CardContent className="py-4 text-sm text-red-400">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {rows.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              No authenticated connectors registered yet.
            </p>
          )}
          {rows.map((row) => {
            const style = row.lastHealth
              ? STATE_STYLES[row.lastHealth.state] ?? STATE_STYLES.offline
              : { label: "Unknown", className: "bg-slate-500/15 text-slate-400 border-slate-500/40" };
            return (
              <Card key={row.id} className="border-border/60">
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                  <div>
                    <CardTitle className="text-lg">{row.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                      {row.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline" className={style.className}>
                      {style.label}
                    </Badge>
                    <Badge variant="outline">v{row.version}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Authentication</dt>
                      <dd className="font-medium">
                        {row.credentialsPresent ? "Credential present (server)" : "Not configured"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last health check</dt>
                      <dd className="font-medium">
                        {row.lastHealth?.checkedAt
                          ? new Date(row.lastHealth.checkedAt).toLocaleTimeString()
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last successful query</dt>
                      <dd className="font-medium">
                        {row.lastSuccessAt
                          ? new Date(row.lastSuccessAt).toLocaleTimeString()
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Avg response</dt>
                      <dd className="font-medium">
                        {row.averageResponseTimeMs != null ? `${row.averageResponseTimeMs}ms` : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Supported entities</dt>
                      <dd className="font-medium">{row.supportedEntityTypes.join(", ")}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Health message</dt>
                      <dd className="font-medium">{row.lastHealth?.message ?? "—"}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Secret env{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                        {row.secretEnv}
                      </code>{" "}
                      is read only by the server-side gateway.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={probing === row.id}
                      onClick={async () => {
                        setProbing(row.id);
                        try {
                          const updated = await probeOneFn({ data: { id: row.id } });
                          if (updated) {
                            setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
                          }
                        } finally {
                          setProbing(null);
                        }
                      }}
                    >
                      {probing === row.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Probe
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {refreshedAt && (
          <p className="text-xs text-muted-foreground">
            Snapshot refreshed {new Date(refreshedAt).toLocaleTimeString()}. Server-driven — the
            browser reads projected state only.
          </p>
        )}
      </div>
    </div>
  );
}

// Silence unused import complaint from tests.
void stateBadge;
