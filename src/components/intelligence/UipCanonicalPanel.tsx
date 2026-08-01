/**
 * UipCanonicalPanel
 *
 * First production consumer surface for the Canonical Unified Intelligence
 * Package (UIP). Renders the FULL fused package alongside the existing
 * Evidence Explorer so officers can inspect:
 *   • Raw evidence count / freshest observation
 *   • Canonical entities (one resolved entity per identity cluster)
 *   • Correlations (fusion contradictions — cross-source disagreements)
 *   • Package-level confidence + composite grade
 *   • Provenance (per-connector record counts + agreement score)
 *   • Sources (attribution + weight)
 *
 * Data source: exclusively the Canonical UIP resolved via
 * `getUip(briefing.source_uip_id)` (Sprint 2.1A). NEVER a demo fixture.
 * Preserves the existing Evidence Explorer UI — this panel sits above it.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Database,
  GitMerge,
  ShieldCheck,
  AlertTriangle,
  Network,
  Fingerprint,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";

interface Props {
  uip: UnifiedIntelligencePackage;
}

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "just now";
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

const CONF_TONE: Record<string, string> = {
  HIGH: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  MEDIUM: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  LOW: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

const SEVERITY_TONE: Record<string, string> = {
  info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  warn: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  critical: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

export function UipCanonicalPanel({ uip }: Props) {
  const { fused, provenance, identity, rawEvidence, freshestSeconds, hasContradictions } = uip;

  const totalAgreement = useMemo(() => {
    if (provenance.length === 0) return 0;
    const sum = provenance.reduce((acc, p) => acc + p.agreementScore, 0);
    return sum / provenance.length;
  }, [provenance]);

  return (
    <section
      aria-label="Canonical Unified Intelligence Package"
      className="mb-6 rounded-lg border border-border/60 bg-card/50 shadow-sm"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Database className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-medium">Canonical Unified Intelligence Package</span>
          <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            {uip.id}
          </code>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={`rounded-full border px-2 py-0.5 font-medium ${CONF_TONE[fused.confidence] ?? ""}`}
          >
            {fused.confidence} · {fused.grade}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden /> freshest {formatSeconds(freshestSeconds)}
          </span>
        </div>
      </header>

      {/* Stat strip */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3 text-[11.5px] sm:grid-cols-4">
        <Stat label="Raw evidence" value={rawEvidence.length} />
        <Stat label="Canonical entities" value={fused.stats.canonicalEntities} />
        <Stat
          label="Correlations"
          value={fused.stats.contradictions}
          tone={hasContradictions ? "warn" : undefined}
        />
        <Stat
          label="Sources"
          value={`${fused.stats.sourcesResponded}/${fused.stats.sourcesQueried}`}
          hint={`avg agreement ${(totalAgreement * 100).toFixed(0)}%`}
        />
      </dl>

      {/* Canonical entities */}
      <Block
        icon={<Fingerprint className="h-3.5 w-3.5" aria-hidden />}
        title="Canonical entities"
        subtitle={`${fused.canonical.length} resolved after identity clustering`}
      >
        {fused.canonical.length === 0 ? (
          <Empty>No canonical entities in this package.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {fused.canonical.slice(0, 6).map((rec) => {
              const cluster = identity.find((c) => c.canonicalId === rec.entity.id);
              return (
                <li
                  key={rec.entity.id}
                  className="flex items-start justify-between gap-3 rounded border border-border/40 bg-background/40 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium">
                      {rec.entity.label ?? rec.entity.id}
                    </div>
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      <code className="text-[10px]">{rec.entity.id}</code>
                      {cluster && cluster.aliasIds.length > 1 && (
                        <>
                          {" · "}
                          <span title={cluster.aliasIds.join(", ")}>
                            {cluster.aliasIds.length} aliases merged
                          </span>
                        </>
                      )}
                      {" · "}
                      {rec.sources.length} source{rec.sources.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${CONF_TONE[rec.confidence] ?? ""}`}
                  >
                    {rec.grade}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      {/* Provenance / Sources */}
      <Block
        icon={<Network className="h-3.5 w-3.5" aria-hidden />}
        title="Provenance & sources"
        subtitle="Every evidence row below traces back to one of these connectors."
      >
        {provenance.length === 0 ? (
          <Empty>No connectors reported on this query.</Empty>
        ) : (
          <ul className="space-y-1">
            {provenance.map((p) => {
              const src = fused.sources.find((s) => s.connectorId === p.connectorId);
              return (
                <li
                  key={p.connectorId}
                  className="flex items-center justify-between gap-3 rounded border border-border/40 bg-background/40 px-2.5 py-1 text-[11.5px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px]">
                      {p.connectorId}
                    </code>
                    <span className="truncate text-muted-foreground">{p.sourceName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[10.5px] text-muted-foreground">
                    <span>
                      {p.records} record{p.records === 1 ? "" : "s"}
                    </span>
                    <span>agreement {(p.agreementScore * 100).toFixed(0)}%</span>
                    {src && <span>weight {(src.weight ?? 0).toFixed(2)}</span>}
                    <Link
                      to="/intelligence-evidence"
                      search={{ connector: p.connectorId, uip: uip.id }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      filter <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      {/* Correlations / Contradictions */}
      <Block
        icon={<GitMerge className="h-3.5 w-3.5" aria-hidden />}
        title="Correlations"
        subtitle="Cross-source agreements and disagreements surfaced by the IFE."
      >
        {fused.contradictions.length === 0 ? (
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            No contradictions — sources are consistent on the fused fields.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {fused.contradictions.slice(0, 5).map((c, i) => (
              <li
                key={`${c.entity.id}:${c.field}:${i}`}
                className="rounded border border-border/40 bg-background/40 px-2.5 py-1.5 text-[11.5px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-500" aria-hidden />
                      {c.entity.label ?? c.entity.id} · {c.field}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">{c.explanation}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase ${SEVERITY_TONE[c.severity] ?? ""}`}
                  >
                    {c.severity}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  {c.values.slice(0, 4).map((v, k) => (
                    <span
                      key={`${v.evidenceId}:${k}`}
                      className={`rounded border px-1.5 py-0.5 ${v.accepted ? "border-emerald-500/30 text-emerald-300" : "border-border/40"}`}
                      title={`evidence ${v.evidenceId}`}
                    >
                      {v.source}: {String(v.value)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {/* Explainability summary */}
      {fused.report.summary && (
        <div className="border-t border-border/60 px-4 py-2 text-[11px] italic text-muted-foreground">
          {fused.report.summary}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`text-[15px] font-semibold ${tone === "warn" ? "text-amber-300" : "text-foreground"}`}
      >
        {value}
        {hint && (
          <span className="ml-1.5 text-[10.5px] font-normal text-muted-foreground">{hint}</span>
        )}
      </dd>
    </div>
  );
}

function Block({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <header className="mb-2 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-[12px] font-semibold">{title}</h3>
        {subtitle && <span className="text-[10.5px] text-muted-foreground">· {subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] italic text-muted-foreground">{children}</div>;
}
