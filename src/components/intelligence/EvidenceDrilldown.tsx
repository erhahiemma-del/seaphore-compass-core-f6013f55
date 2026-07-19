import { useEffect, type ReactNode } from "react";
import { Clock, FileText, Info, Link2, ShieldCheck, Sparkles, User, X } from "lucide-react";

import {
  ConfidenceChip,
  CONFIDENCE_DESCRIPTIONS,
  type ConfidenceTier,
} from "@/components/intelligence/ConfidenceChip";
import { cn } from "@/lib/utils";

/**
 * Evidence-first drilldown — opens a right-side sheet describing every
 * assumption behind a metric, KPI or table row. Honesty rules:
 *   HR-1  Every figure carries a confidence tier.
 *   HR-2  Verified figures must name an authoritative source.
 *   HR-11 Every observation ships with its supporting evidence.
 *   HR-9  Every derived value is traceable via the audit log.
 */

export interface DrilldownSource {
  id: string;
  label: string;
  system: string;
  timestamp: string;
  confidence: ConfidenceTier;
  reference?: string;
}

export interface DrilldownAuditEntry {
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface EvidenceDrilldownData {
  kind: "metric" | "kpi" | "row";
  title: string;
  subtitle?: string;
  value?: ReactNode;
  confidence: ConfidenceTier;
  /** Officer-readable explanation of how the value was derived (HR-9). */
  explanation: string;
  sources: DrilldownSource[];
  audit: DrilldownAuditEntry[];
  /** Optional labelled fields — used for row context. */
  fields?: Array<{ label: string; value: ReactNode }>;
}

export function EvidenceDrilldown({
  open,
  data,
  onClose,
}: {
  open: boolean;
  data: EvidenceDrilldownData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !data) return null;

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence drilldown"
    >
      <button
        type="button"
        aria-label="Close drilldown"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-fast"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-line bg-card shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]">
            <Info className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="type-label text-slate">
              Evidence drilldown ·{" "}
              {data.kind === "kpi" ? "KPI" : data.kind === "metric" ? "Metric" : "Record"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <h2 className="type-h2 text-foreground">{data.title}</h2>
              {data.value != null && (
                <span className="text-[15px] font-extrabold text-foreground">{data.value}</span>
              )}
              <ConfidenceChip tier={data.confidence} />
            </div>
            {data.subtitle && <div className="mt-0.5 text-[11px] text-slate">{data.subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Confidence rationale */}
          <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Confidence Rationale">
            <p className="text-[12.5px] leading-relaxed text-foreground/85">
              <span className="font-semibold">
                {data.confidence.charAt(0).toUpperCase() + data.confidence.slice(1)}:
              </span>{" "}
              {CONFIDENCE_DESCRIPTIONS[data.confidence]}.
            </p>
          </Section>

          {/* Officer explanation (HR-9) */}
          <Section icon={<Sparkles className="h-3.5 w-3.5" />} title="How this value was derived">
            <p className="text-[12.5px] leading-relaxed text-foreground/85">{data.explanation}</p>
          </Section>

          {/* Contextual fields for row drilldowns */}
          {data.fields && data.fields.length > 0 && (
            <Section icon={<FileText className="h-3.5 w-3.5" />} title="Record Context">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                {data.fields.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="type-label text-slate">{f.label}</dt>
                    <dd className="text-right font-semibold text-foreground/90">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {/* Underlying sources (HR-11) */}
          <Section
            icon={<Link2 className="h-3.5 w-3.5" />}
            title={`Underlying Sources · ${data.sources.length}`}
          >
            {data.sources.length === 0 ? (
              <p className="text-[12px] text-slate">
                No source records attached. Metric cannot be verified.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.sources.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-md border border-line/60 bg-surface/50 px-2.5 py-2"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-foreground">
                        {s.label}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate">
                        <span>{s.system}</span>
                        <span>·</span>
                        <span>{s.timestamp}</span>
                        {s.reference && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{s.reference}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ConfidenceChip tier={s.confidence} size={9} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Audit trail (HR-9) */}
          <Section
            icon={<Clock className="h-3.5 w-3.5" />}
            title={`Audit Trail · ${data.audit.length}`}
          >
            <ol className="space-y-2 border-l border-line pl-3">
              {data.audit.map((a, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-[color:var(--color-blue)]" />
                  <div className="text-[12px] font-semibold text-foreground">{a.action}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-slate">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-2.5 w-2.5" />
                      {a.actor}
                    </span>
                    <span>·</span>
                    <span>{a.at}</span>
                  </div>
                  {a.detail && (
                    <div className="mt-0.5 text-[11.5px] text-foreground/80">{a.detail}</div>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <footer className="border-t border-line px-4 py-2 text-[10.5px] text-slate">
          Evidence first. Explainable always. Officer decides.
        </footer>
      </aside>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
        <span className={cn("text-[color:var(--color-blue)]")}>{icon}</span>
        {title}
      </header>
      {children}
    </section>
  );
}
