/**
 * ICE Explainability Panel — officer-facing view of the Intelligence
 * Correlation Engine output for the current entity / query.
 *
 * Renders five sections:
 *   1. Correlation Matrix (Field × Source × Value)
 *   2. Conflicts (severity-graded)
 *   3. Evidence Strength (per-field composite confidence)
 *   4. Missing Evidence (fields with no sources or single-source coverage)
 *   5. Recommendations (P1–P4 / INFO)
 *
 * The panel calls `runIce` on demand against the default IAL manager. If
 * that fails (e.g. connector errors during dev), it renders the failure
 * transparently — no fabricated intelligence.
 */
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { getIntelligenceAcquisitionManager } from "@/services/ial";
import { runIce } from "@/services/ice";
import { CRITICAL_FIELDS } from "@/services/ice/field-config";
import type {
  ConflictRow,
  FusedField,
  IntelligencePackage,
  MatrixCell,
  Recommendation,
  Severity,
  Priority,
} from "@/services/ice/types";

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  HIGH: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  LOW: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  P1: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  P2: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  P3: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  P4: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  INFO: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

export function IceExplainabilityPanel() {
  const [pkg, setPkg] = useState<IntelligencePackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mgr = getIntelligenceAcquisitionManager();
      const result = await runIce(
        { text: "Correlate all sources for current investigation subject" },
        mgr,
      );
      setPkg(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ICE run failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/60 bg-surface/60 px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground">
            ICE Explainability
          </h2>
          <p className="mt-0.5 text-[11.5px] text-slate">
            Correlation matrix · conflicts · evidence strength · missing evidence · recommendations
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/50 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-2/80",
            loading && "opacity-60",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {pkg ? "Re-run correlation" : "Run correlation"}
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">ICE run failed</div>
            <div className="mt-0.5 text-rose-200/80">{error}</div>
          </div>
        </div>
      )}

      {!pkg && !error && (
        <div className="rounded-lg border border-dashed border-line/60 bg-surface/30 px-6 py-10 text-center text-[12px] text-slate">
          Run correlation to generate an explainable ICE package from all registered sources.
          Every finding is traceable to the underlying matrix.
        </div>
      )}

      {pkg && (
        <>
          <SummaryStrip pkg={pkg} />
          <CorrelationMatrixSection matrix={pkg.matrix} />
          <ConflictsSection conflicts={pkg.conflicts} />
          <EvidenceStrengthSection fused={pkg.fused} />
          <MissingEvidenceSection matrix={pkg.matrix} fused={pkg.fused} />
          <RecommendationsSection recs={pkg.recommendations} />

          <p className="pt-1 text-center text-[10.5px] uppercase tracking-[0.12em] text-slate">
            Evidence first. Explainable always. Officer decides.
          </p>
        </>
      )}
    </div>
  );
}

/* -------------------- Summary strip -------------------- */

function SummaryStrip({ pkg }: { pkg: IntelligencePackage }) {
  const stats = useMemo(() => {
    const sources = new Set(pkg.matrix.map((c) => c.sourceId)).size;
    const fields = new Set(pkg.matrix.map((c) => c.fieldName)).size;
    const critical = pkg.conflicts.filter((c) => c.severity === "CRITICAL").length;
    const verified = pkg.fused.filter((f) => f.cellStatus === "VERIFIED").length;
    return {
      sources,
      fields,
      cells: pkg.matrix.length,
      conflicts: pkg.conflicts.length,
      critical,
      corroborations: pkg.corroborations.length,
      verified,
      recommendations: pkg.recommendations.length,
    };
  }, [pkg]);

  const tiles: Array<{ label: string; value: string | number; tone?: string }> = [
    { label: "Sources", value: stats.sources },
    { label: "Fields", value: stats.fields },
    { label: "Cells", value: stats.cells },
    { label: "Corroborations", value: stats.corroborations },
    { label: "Conflicts", value: stats.conflicts, tone: stats.conflicts ? "text-amber-300" : "" },
    { label: "Critical", value: stats.critical, tone: stats.critical ? "text-rose-300" : "" },
    { label: "Verified fields", value: stats.verified, tone: "text-emerald-300" },
    { label: "Recommendations", value: stats.recommendations },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-md border border-line/60 bg-surface/50 px-3 py-2"
        >
          <div className={cn("text-[15px] font-semibold text-foreground", t.tone)}>{t.value}</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

/* -------------------- Correlation Matrix -------------------- */

function CorrelationMatrixSection({ matrix }: { matrix: ReadonlyArray<MatrixCell> }) {
  const { fields, sources, byKey } = useMemo(() => {
    const fs = Array.from(new Set(matrix.map((c) => c.fieldName))).sort();
    const ss = Array.from(new Set(matrix.map((c) => c.sourceId))).sort();
    const key = new Map<string, MatrixCell>();
    for (const c of matrix) key.set(`${c.fieldName}::${c.sourceId}`, c);
    return { fields: fs, sources: ss, byKey: key };
  }, [matrix]);

  return (
    <Section title="Correlation Matrix" subtitle="Field × Source × Value with per-cell evidence score.">
      {fields.length === 0 ? (
        <Empty>No matrix cells produced.</Empty>
      ) : (
        <div className="overflow-auto rounded-md border border-line/60">
          <table className="min-w-full border-collapse text-[11.5px]">
            <thead className="bg-surface-2/50 text-slate">
              <tr>
                <th className="sticky left-0 z-10 bg-surface-2/80 px-2 py-1.5 text-left font-semibold uppercase tracking-[0.06em]">
                  Field
                </th>
                {sources.map((s) => (
                  <th key={s} className="px-2 py-1.5 text-left font-semibold">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f} className="border-t border-line/50">
                  <td className="sticky left-0 z-10 bg-surface/70 px-2 py-1.5 font-medium text-foreground">
                    {f}
                    {CRITICAL_FIELDS.includes(f as never) && (
                      <span className="ml-1 text-[9.5px] uppercase tracking-wide text-rose-300/80">
                        · critical
                      </span>
                    )}
                  </td>
                  {sources.map((s) => {
                    const cell = byKey.get(`${f}::${s}`);
                    return (
                      <td key={s} className="px-2 py-1.5 align-top">
                        {cell ? <CellChip cell={cell} /> : <span className="text-slate/60">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function CellChip({ cell }: { cell: MatrixCell }) {
  const tone =
    cell.cellStatus === "VERIFIED" || cell.cellStatus === "CORROBORATED"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : cell.cellStatus === "CONFLICT_MAJORITY"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : cell.cellStatus === "CONFLICT_MINORITY"
          ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
          : cell.cellStatus === "SINGLE_SOURCE"
            ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
            : "border-slate/40 bg-slate/10 text-slate-200";
  return (
    <div className={cn("inline-flex flex-col gap-0.5 rounded border px-1.5 py-1", tone)}>
      <span className="max-w-[180px] truncate font-medium">{fmt(cell.normalizedValue)}</span>
      <span className="text-[9.5px] uppercase tracking-wide opacity-80">
        {cell.cellStatus} · score {Math.round(cell.evidenceScore)}
      </span>
    </div>
  );
}

/* -------------------- Conflicts -------------------- */

function ConflictsSection({ conflicts }: { conflicts: ReadonlyArray<ConflictRow> }) {
  return (
    <Section title="Conflicts" subtitle="Cross-source disagreements graded by severity.">
      {conflicts.length === 0 ? (
        <Empty tone="ok">
          <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />
          No conflicts detected across the correlated sources.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {conflicts.map((c, i) => (
            <li
              key={`${c.fieldName}-${i}`}
              className="rounded-md border border-line/60 bg-surface/40 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    SEVERITY_STYLE[c.severity],
                  )}
                >
                  {c.severity}
                </span>
                <span className="font-medium text-foreground">{c.fieldName}</span>
                <span className="text-slate">· {c.canonicalId}</span>
                {c.isCriticalField && (
                  <span className="text-[10px] uppercase text-rose-300/80">critical field</span>
                )}
                <span className="ml-auto text-[10.5px] text-slate">
                  Δ {Math.round(c.ageDifferentialHrs)}h
                </span>
              </div>
              <div className="mt-1.5 grid gap-1.5 text-[11.5px] sm:grid-cols-2">
                <div>
                  <div className="text-slate">Majority ({c.majoritySources.join(", ")})</div>
                  <div className="text-foreground">{fmt(c.majorityValue)}</div>
                </div>
                <div>
                  <div className="text-slate">Minority ({c.minoritySources.join(", ")})</div>
                  <div className="text-foreground">{fmt(c.minorityValue)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* -------------------- Evidence Strength -------------------- */

function EvidenceStrengthSection({ fused }: { fused: ReadonlyArray<FusedField> }) {
  const rows = useMemo(
    () => [...fused].sort((a, b) => a.confidence - b.confidence),
    [fused],
  );
  return (
    <Section
      title="Evidence Strength"
      subtitle="Composite confidence per field after trust · freshness · corroboration · conflict."
    >
      {rows.length === 0 ? (
        <Empty>No fused fields.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((f) => {
            const pct = Math.round(f.confidence * 100);
            const bar =
              pct >= 75
                ? "bg-emerald-400/70"
                : pct >= 50
                  ? "bg-amber-400/70"
                  : "bg-rose-400/70";
            return (
              <li
                key={`${f.canonicalId}-${f.fieldName}`}
                className="rounded-md border border-line/60 bg-surface/40 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <span className="font-medium text-foreground">{f.fieldName}</span>
                  <span className="text-slate">= {fmt(f.fusedValue)}</span>
                  <span className="ml-auto text-[10.5px] uppercase tracking-wide text-slate">
                    {f.confidenceLevel} · {f.cellStatus}
                  </span>
                  <span className="w-10 text-right text-[11.5px] font-semibold text-foreground">
                    {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2/50">
                  <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
                </div>
                {f.explanationText && (
                  <div className="mt-1 text-[11px] text-slate">{f.explanationText}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* -------------------- Missing Evidence -------------------- */

function MissingEvidenceSection({
  matrix,
  fused,
}: {
  matrix: ReadonlyArray<MatrixCell>;
  fused: ReadonlyArray<FusedField>;
}) {
  const items = useMemo(() => {
    const covered = new Set(matrix.map((c) => c.fieldName));
    const absent = CRITICAL_FIELDS.filter((f) => !covered.has(f)).map((f) => ({
      field: f,
      reason: "No source returned this critical field.",
      kind: "absent" as const,
    }));
    const singles = fused
      .filter((f) => f.cellStatus === "SINGLE_SOURCE" || f.hasMissingData)
      .map((f) => ({
        field: f.fieldName,
        reason:
          f.cellStatus === "SINGLE_SOURCE"
            ? `Only one source reports this value (${f.winningSource ?? "unknown"}).`
            : "Partial data — corroborating sources are missing.",
        kind: "thin" as const,
      }));
    return [...absent, ...singles];
  }, [matrix, fused]);

  return (
    <Section
      title="Missing Evidence"
      subtitle="Critical fields with no source, or fields corroborated by only one provider."
    >
      {items.length === 0 ? (
        <Empty tone="ok">
          <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />
          All critical fields are covered by at least two independent sources.
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              key={`${it.field}-${i}`}
              className="flex items-start gap-2 rounded-md border border-line/60 bg-surface/40 px-3 py-2 text-[11.5px]"
            >
              {it.kind === "absent" ? (
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
              ) : (
                <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              )}
              <div>
                <div className="font-medium text-foreground">{it.field}</div>
                <div className="text-slate">{it.reason}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* -------------------- Recommendations -------------------- */

function RecommendationsSection({ recs }: { recs: ReadonlyArray<Recommendation> }) {
  return (
    <Section
      title="Recommendations"
      subtitle="System-generated actions ranked P1 → INFO. The officer decides."
    >
      {recs.length === 0 ? (
        <Empty>No recommendations at this time.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {recs.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-line/60 bg-surface/40 px-3 py-2 text-[11.5px]"
            >
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  PRIORITY_STYLE[r.priority],
                )}
              >
                {r.priority}
              </span>
              <div className="min-w-0">
                <div className="text-foreground">{r.recommendation}</div>
                <div className="mt-0.5 text-[10.5px] text-slate">
                  trigger: <span className="font-mono">{r.triggerCondition}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* -------------------- shared -------------------- */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line/60 bg-surface/40 p-4">
      <header className="mb-3">
        <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Empty({ children, tone }: { children: React.ReactNode; tone?: "ok" }) {
  return (
    <div
      className={cn(
        "rounded border border-dashed px-3 py-4 text-center text-[11.5px]",
        tone === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90"
          : "border-line/60 bg-surface/30 text-slate",
      )}
    >
      {children}
    </div>
  );
}
