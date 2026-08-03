/**
 * SPRINT EP-COPERNICUS-02 — Copernicus live validation admin page.
 *
 * Runs the full 12-step validation inside the Lovable Cloud runtime
 * where process.env credentials and CDSE network egress are available.
 * Admin-only. Results displayed in the browser; nothing sensitive returned.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { copernicusValidateFn } from "@/routes/api/public/hooks/copernicus-validate";

export const Route = createFileRoute("/admin/copernicus-validate")({
  head: () => ({
    meta: [{ title: "Copernicus Live Validation · Seaphore Admin" }],
  }),
  component: CopernicusValidatePage,
});

type Report = Awaited<ReturnType<typeof copernicusValidateFn>>;

const VERDICT_STYLE: Record<string, string> = {
  OPERATIONAL: "bg-emerald-50 border-emerald-300 text-emerald-800",
  CREDENTIAL_ISSUE: "bg-amber-50 border-amber-300 text-amber-800",
  NETWORK_ISSUE: "bg-red-50 border-red-300 text-red-800",
  PARTIAL: "bg-sky-50 border-sky-300 text-sky-800",
};

function CopernicusValidatePage() {
  const runValidation = useServerFn(copernicusValidateFn);
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const result = await runValidation({});
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Copernicus CDSE — Live Validation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Runs a 12-step validation of the CopernicusProvider using Lovable Cloud Runtime Secrets.
          Credentials are never returned to the browser. Admin only.
        </p>
      </div>

      <button
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {running ? "Running validation…" : "Run live validation"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className={`rounded-lg border p-4 ${VERDICT_STYLE[report.verdict] ?? ""}`}>
            <div className="font-semibold text-lg">
              Verdict: {report.verdict} — {report.summary.passed}/{report.summary.total} checks
              passed
            </div>
            <div className="text-xs mt-1 opacity-75">
              {report.timestamp} · {report.environment}
            </div>
            <div className="mt-2 text-sm">
              Credentials: username {report.credentialsPresent.username ? "✓ present" : "✗ missing"}{" "}
              · password {report.credentialsPresent.password ? "✓ present" : "✗ missing"}
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Check</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Result</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Detail</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">ms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.steps.map((s) => (
                  <tr key={s.step} className={s.pass ? "" : "bg-red-50/50"}>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{s.step}</td>
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-semibold ${s.pass ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {s.pass ? "✓ PASS" : "✗ FAIL"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">{s.detail}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                      {s.latencyMs != null ? `${s.latencyMs}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Evidence first. Explainable always. Officer decides.
          </p>
        </div>
      )}
    </div>
  );
}
