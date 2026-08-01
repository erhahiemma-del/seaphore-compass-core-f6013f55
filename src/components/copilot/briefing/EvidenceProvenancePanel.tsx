/**
 * EvidenceProvenancePanel
 *
 * Briefing-view provenance panel — a compact, evidence-first projection of the
 * Canonical Unified Intelligence Package (UIP) that produced the current
 * Executive Briefing. Complements the fuller `UipCanonicalPanel` in the
 * Evidence Explorer; here we keep it dense and citation-oriented so officers
 * reading a briefing can answer, at a glance:
 *
 *   • How many sources actually responded (sourcesResponded / sourcesQueried)?
 *   • How many canonical entities were resolved?
 *   • For every claim in the briefing, which evidence backs it?
 *
 * Evidence-first citation list: each row shows source, timestamp, connector
 * record id, kind, and OC-001 grade — never a synthesized narrative — and
 * links into the Evidence Explorer filtered to that UIP.
 *
 * Data source: Canonical UIP resolved via `getUip(briefing.source_uip_id)`.
 * No demo fixtures, no synthesis.
 */
import { Link } from "@tanstack/react-router";
import {
  Database,
  Fingerprint,
  Network,
  Clock,
  FileText,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";

interface Props {
  uip: UnifiedIntelligencePackage;
  /** Max citations rendered inline (rest linked out to the Explorer). Default 8. */
  maxCitations?: number;
}

const GRADE_TONE: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  B: "bg-sky-50 text-sky-700 ring-sky-200",
  C: "bg-amber-50 text-amber-700 ring-amber-200",
  D: "bg-orange-50 text-orange-700 ring-orange-200",
  E: "bg-rose-50 text-rose-700 ring-rose-200",
};

function fmtWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

export function EvidenceProvenancePanel({ uip, maxCitations = 8 }: Props) {
  const { fused, provenance, rawEvidence } = uip;
  const { sourcesResponded, sourcesQueried, canonicalEntities, contradictions } = fused.stats;

  // Order citations newest-first — officers cite the freshest observation.
  const citations = [...rawEvidence]
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, maxCitations);
  const overflow = Math.max(0, rawEvidence.length - citations.length);

  return (
    <section
      aria-label="Evidence provenance"
      className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[13px] text-slate-800">
          <Database className="h-4 w-4 text-slate-500" aria-hidden />
          <span className="font-semibold">Evidence provenance</span>
          <span className="text-[11px] text-slate-500">
            Canonical UIP{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">{uip.id}</code>
          </span>
        </div>
        <Link
          to="/intelligence-evidence"
          search={{ uip: uip.id }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Open in Evidence Explorer
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 text-[11.5px] sm:grid-cols-4">
        <Stat
          icon={<Network className="h-3.5 w-3.5" aria-hidden />}
          label="Sources responded"
          value={`${sourcesResponded} / ${sourcesQueried}`}
        />
        <Stat
          icon={<Fingerprint className="h-3.5 w-3.5" aria-hidden />}
          label="Canonical entities"
          value={canonicalEntities}
        />
        <Stat
          icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
          label="Evidence rows"
          value={rawEvidence.length}
        />
        <Stat
          icon={
            contradictions > 0 ? (
              <Network className="h-3.5 w-3.5 text-amber-600" aria-hidden />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            )
          }
          label="Correlations"
          value={contradictions === 0 ? "consistent" : `${contradictions} conflicts`}
        />
      </dl>

      {/* Per-connector agreement (compact strip) */}
      {provenance.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5 text-[10.5px]">
          {provenance.map((p) => (
            <li
              key={p.connectorId}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700"
              title={`${p.sourceName} · ${p.records} record${p.records === 1 ? "" : "s"}`}
            >
              <code className="text-[10px] text-slate-500">{p.connectorId}</code>
              <span className="text-slate-400">·</span>
              <span>{p.records}</span>
              <span className="text-slate-400">·</span>
              <span>agr {(p.agreementScore * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      )}

      {/* Evidence-first citation list */}
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold text-slate-800">Citations</h3>
          <span className="text-[10.5px] text-slate-500">
            Evidence first · newest first · sanitized
          </span>
        </div>
        {citations.length === 0 ? (
          <p className="text-[11.5px] italic text-slate-500">No evidence rows in this package.</p>
        ) : (
          <ol className="space-y-1.5 text-[11.5px]">
            {citations.map((n, i) => (
              <li
                key={n.id}
                className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-1.5"
              >
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[10px] text-slate-400">
                  [{i + 1}]
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-slate-800">{n.sourceName}</span>
                    <span className="text-[10.5px] text-slate-500">
                      <code className="rounded bg-white px-1 py-0.5 text-[10px] text-slate-500">
                        {n.source}
                      </code>
                    </span>
                    <span className="text-[10.5px] text-slate-500">· {n.kind}</span>
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                      <Clock className="h-3 w-3" aria-hidden />
                      {fmtWhen(n.observedAt)}
                    </span>
                    {n.providerRecordId && (
                      <span className="text-[10.5px] text-slate-500">
                        · record{" "}
                        <code className="text-[10px] text-slate-500">{n.providerRecordId}</code>
                      </span>
                    )}
                  </div>
                  {n.excerpt && (
                    <p className="mt-0.5 truncate text-[11px] text-slate-600" title={n.excerpt}>
                      {n.excerpt}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${GRADE_TONE[n.grade] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}
                  title={`OC-001 grade ${n.grade}`}
                >
                  {n.grade}
                </span>
              </li>
            ))}
          </ol>
        )}
        {overflow > 0 && (
          <div className="mt-2 text-[11px] text-slate-500">
            +{overflow} more evidence row{overflow === 1 ? "" : "s"} —{" "}
            <Link
              to="/intelligence-evidence"
              search={{ uip: uip.id }}
              className="text-primary hover:underline"
            >
              view all in Evidence Explorer
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="text-[14px] font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
