/**
 * SPRINT DIAG-02 — Platform-wide Intelligence Readiness card.
 *
 * Read-only projection of the Evidence Provider Catalog + live health.
 * Reports what the platform can actually do right now instead of letting
 * empty KPIs imply the platform is idle.
 */
import { Link } from "@tanstack/react-router";
import { ExternalLink, Gauge } from "lucide-react";
import type { IntelligenceReadiness } from "@/lib/intelligence/coverage-model";

function Group({
  dot,
  title,
  names,
}: {
  dot: string;
  title: string;
  names: ReadonlyArray<string>;
}) {
  return (
    <div>
      <div className="type-label text-slate">
        <span aria-hidden className="mr-1">
          {dot}
        </span>
        {title} ({names.length})
      </div>
      <ul className="mt-1 space-y-0.5 text-[11px] text-foreground">
        {names.length === 0 ? (
          <li className="text-slate">None</li>
        ) : (
          names.map((n) => <li key={n}>• {n}</li>)
        )}
      </ul>
    </div>
  );
}

export function IntelligenceReadinessCard({
  readiness,
  generatedAt,
}: {
  readiness: IntelligenceReadiness;
  generatedAt?: string;
}) {
  return (
    <section
      aria-label="Intelligence Readiness"
      className="rounded-lg border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <div className="type-label text-slate">Intelligence Readiness</div>
            <div className="text-[11px] text-slate">
              {readiness.activeKpis}/{readiness.totalKpis} KPIs reporting live evidence ·{" "}
              {readiness.totalProviders} providers
              {generatedAt ? ` · checked ${new Date(generatedAt).toLocaleTimeString()}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="type-mono text-[26px] font-bold tabular-nums text-foreground">
            {readiness.overallPct}%
          </div>
          <Link
            to="/admin/provider-health"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-teal)]"
          >
            Provider Health
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-teal)]/10">
        <div
          className="h-full rounded-full bg-[color:var(--color-teal)]"
          style={{ width: `${readiness.overallPct}%` }}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Group dot="🟢" title="Operational" names={readiness.operational} />
        <Group dot="🟡" title="Partial" names={readiness.partial} />
        <Group dot="🔴" title="Awaiting Credentials" names={readiness.awaitingConfiguration} />
        <Group dot="⚫" title="Offline" names={readiness.offline} />
      </div>
    </section>
  );
}
