/**
 * Officer-Facing Projection Contract — audit view.
 *
 * Renders the full contract registry so Administrators and Directors can
 * verify the Golden Rule: every backend intelligence artifact is either
 * PROJECTED to the officer, marked INTERNAL, or explicitly JUSTIFIED as
 * unnecessary — with zero silent disappearance.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PROJECTION_CONTRACT } from "@/lib/projection-contract/registry";
import { validateContract } from "@/lib/projection-contract/validate";
import type {
  BackendLayer,
  ProjectionContractEntry,
  ProjectionState,
} from "@/lib/projection-contract/types";

export const Route = createFileRoute("/admin/projection-contract")({
  head: () => ({
    meta: [
      { title: "Projection Contract · Seaphore Governance" },
      {
        name: "description",
        content:
          "Golden Rule audit: every backend intelligence artifact is projected, internal, or explicitly justified.",
      },
      { property: "og:title", content: "Projection Contract · Seaphore Governance" },
      {
        property: "og:description",
        content: "Officer-facing projection contract for every backend intelligence artifact.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectionContractPage,
});

const STATE_LABEL: Record<ProjectionState, string> = {
  PROJECTED: "Projected",
  INTERNAL: "Internal",
  JUSTIFIED_UNNECESSARY: "Justified",
};

const STATE_TONE: Record<ProjectionState, string> = {
  PROJECTED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  INTERNAL: "bg-muted text-muted-foreground border-border",
  JUSTIFIED_UNNECESSARY: "bg-amber-500/10 text-amber-700 border-amber-500/30",
};

function ProjectionContractPage() {
  const [filter, setFilter] = useState<"ALL" | ProjectionState>("ALL");
  const [producer, setProducer] = useState<"ALL" | BackendLayer>("ALL");

  const report = useMemo(() => validateContract(), []);
  const producers = useMemo(
    () => Array.from(new Set(PROJECTION_CONTRACT.map((e) => e.producer))).sort(),
    [],
  );

  const rows = useMemo(() => {
    return PROJECTION_CONTRACT.filter((e) => filter === "ALL" || e.state === filter).filter(
      (e) => producer === "ALL" || e.producer === producer,
    );
  }, [filter, producer]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Projection Contract
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Golden Rule audit. Each backend intelligence artifact resolves to exactly one of{" "}
            <span className="font-medium text-foreground">Projected</span>,{" "}
            <span className="font-medium text-foreground">Internal</span>, or{" "}
            <span className="font-medium text-foreground">Justified unnecessary</span>. No silent
            disappearance is permitted.
          </p>
        </div>
        <Link
          to="/admin"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Administration
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total artifacts" value={report.totalEntries} />
        <StatCard label="Projected" value={report.projected} tone="emerald" />
        <StatCard label="Internal" value={report.internal} tone="muted" />
        <StatCard label="Justified" value={report.justified} tone="amber" />
      </div>

      {!report.ok && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="font-medium">Golden Rule violations detected</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.issues.map((i, idx) => (
              <li key={idx}>
                <span className="font-mono text-xs">{i.id}</span> — {i.problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip label="All" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        <FilterChip
          label="Projected"
          active={filter === "PROJECTED"}
          onClick={() => setFilter("PROJECTED")}
        />
        <FilterChip
          label="Internal"
          active={filter === "INTERNAL"}
          onClick={() => setFilter("INTERNAL")}
        />
        <FilterChip
          label="Justified"
          active={filter === "JUSTIFIED_UNNECESSARY"}
          onClick={() => setFilter("JUSTIFIED_UNNECESSARY")}
        />
        <div className="ml-auto">
          <select
            value={producer}
            onChange={(e) => setProducer(e.target.value as "ALL" | BackendLayer)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="ALL">All producers</option>
            {producers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Artifact</th>
              <th className="px-3 py-2 text-left">Producer</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-left">Projection / Rationale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <ContractRow key={e.id} entry={e} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No entries match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </p>
    </div>
  );
}

function ContractRow({ entry }: { entry: ProjectionContractEntry }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-3">
        <div className="font-medium text-foreground">{entry.name}</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {entry.id}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{entry.description}</div>
      </td>
      <td className="px-3 py-3">
        <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">
          {entry.producer}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATE_TONE[entry.state]}`}
        >
          {STATE_LABEL[entry.state]}
        </span>
      </td>
      <td className="px-3 py-3 text-xs">
        {entry.state === "PROJECTED" && entry.projection && (
          <div className="space-y-1">
            <div className="text-foreground">{entry.projection.surface}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {entry.projection.location}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {entry.projection.interaction}
            </div>
          </div>
        )}
        {entry.state === "INTERNAL" && entry.internal && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {entry.internal.reason.replace(/-/g, " ")}
            </div>
            <div className="text-foreground">{entry.internal.note}</div>
          </div>
        )}
        {entry.state === "JUSTIFIED_UNNECESSARY" && entry.justified && (
          <div className="space-y-1">
            <div className="text-foreground">{entry.justified.justification}</div>
            {entry.justified.approvedBy && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Approved by {entry.justified.approvedBy}
                {entry.justified.approvedAt ? ` · ${entry.justified.approvedAt}` : ""}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "muted";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-700"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}
