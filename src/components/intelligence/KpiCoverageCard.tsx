/**
 * SPRINT DIAG-02 — Smart KPI card.
 *
 * Renders a KPI as an honest state: a real number when one exists, and a
 * named coverage state (waiting for credentials / offline / rate limited /
 * no evidence / projection missing / dashboard mapping error) when it does
 * not. Expanding shows the full coverage trace and links to the Evidence
 * Provider Catalog for the providers behind the KPI.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, type LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import {
  COVERAGE_CHECK_LABELS,
  COVERAGE_CHECK_ORDER,
  KPI_STATE_META,
  ROOT_CAUSE_LABELS,
  type KpiCoverage,
  type ProviderCoverageStatus,
} from "@/lib/intelligence/coverage-model";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  good: "text-[color:var(--status-verified)]",
  warn: "text-[color:var(--status-review)]",
  bad: "text-[color:var(--status-critical)]",
  info: "text-[color:var(--status-active)]",
  neutral: "text-[color:var(--status-inactive)]",
};

const PROVIDER_STATUS_LABEL: Record<ProviderCoverageStatus, string> = {
  OPERATIONAL: "Operational",
  PARTIAL: "Partial",
  AWAITING_CREDENTIALS: "Awaiting credentials",
  CREDENTIALS_INVALID: "Credentials invalid",

  RATE_LIMITED: "Rate limited",
  // A provider we depend on that stopped answering. Genuine fault.
  OFFLINE: "Offline",
  // Nobody ever registered it. Not a fault, so not red.
  NOT_REGISTERED: "Not registered",
};

function when(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleString();
}

export function KpiCoverageCard({
  kpi,
  icon,
  onOpen,
}: {
  kpi: KpiCoverage;
  icon?: LucideIcon;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = icon ?? Activity;
  const meta = KPI_STATE_META[kpi.state];
  const tone = TONE_CLASS[meta.tone] ?? "text-slate";
  const isNumber = kpi.value !== null;

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface p-3 text-left elev-1 motion-fast hover:border-[color:var(--ocean)]/60">
      <button
        type="button"
        onClick={() => (onOpen ? onOpen() : setOpen((v) => !v))}
        className="flex flex-col text-left"
        title={kpi.stateDetail}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--ocean-050)] text-[color:var(--ocean)]">
            <Icon className="h-4 w-4" />
          </span>
          <span className="type-label text-slate">{kpi.title}</span>
        </div>

        {/*
          Geometry is constant. A KPI card is a KPI card whether or not a
          provider is connected: the value slot, trend slot, descriptor and
          footer always render. Missing data changes what the slots SAY
          ("—" plus the named coverage state), never whether they exist.
        */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="type-mono text-[22px] font-bold tabular-nums text-foreground">
            {isNumber ? kpi.display : "—"}
          </span>
          <span
            className={cn("text-[12px] font-bold tabular-nums", isNumber ? "text-slate" : tone)}
            title={isNumber ? "No trend series is available for this signal." : kpi.stateDetail}
          >
            —
          </span>
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-slate">
          {isNumber ? kpi.descriptor : kpi.stateDetail}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {isNumber ? (
            <ConfidenceChip tier={kpi.confidence as never} size={9} />
          ) : (
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.06em]", tone)}>
              {kpi.stateLabel}
            </span>
          )}
          <span className="text-[10px] font-semibold text-slate">Coverage {kpi.coveragePct}%</span>
        </div>

      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 self-start text-[10px] font-semibold text-[color:var(--ocean)]"
      >
        Coverage details
        <ChevronDown className={cn("h-3 w-3 motion-fast", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="mt-2 space-y-2 border-t border-line pt-2 text-[11px] text-slate">
          <Row label="Root cause" value={ROOT_CAUSE_LABELS[kpi.rootCause]} />
          <Row label="Evidence count" value={`${kpi.evidenceCount}`} />
          <Row label="Coverage" value={`${kpi.coveragePct}%`} />
          <Row label="Confidence" value={kpi.confidence} />
          <Row label="Projection" value={`${kpi.projectionStatus} · ${kpi.projectionContractId}`} />
          <Row label="Dashboard" value={`${kpi.dashboardStatus} · ${kpi.dashboardField}`} />

          <div className="space-y-1">
            {COVERAGE_CHECK_ORDER.map((key) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span>{COVERAGE_CHECK_LABELS[key]}</span>
                <span
                  className={
                    kpi.checks[key]
                      ? "text-[color:var(--ocean)]"
                      : "text-[color:var(--status-critical)]"
                  }
                >
                  {kpi.checks[key] ? "✓" : "✗"}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="type-label text-slate">Providers</div>
            {kpi.providers.length === 0 ? (
              <div className="text-[color:var(--status-critical)]">
                No provider declares this capability.
              </div>
            ) : (
              kpi.providers.map((p) => (
                <div key={p.providerId} className="rounded border border-line p-1.5">
                  <div className="flex items-center justify-between gap-2 font-semibold text-foreground">
                    <span>{p.providerName}</span>
                    <span>{PROVIDER_STATUS_LABEL[p.status]}</span>
                  </div>
                  <div>Last successful sync: {when(p.lastSuccessfulSync)}</div>
                  <div>Certification: {p.certification}</div>
                  <div>Last validation: {p.lastValidationDate}</div>
                  {p.credentialEnv.length > 0 ? (
                    <div>Credentials: {p.credentialEnv.join(", ")}</div>
                  ) : null}
                  {p.lastError ? (
                    <div className="text-[color:var(--status-critical)]">Error: {p.lastError}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <Link
            to={kpi.providerCatalogHref}
            className="inline-flex items-center gap-1 font-semibold text-[color:var(--ocean)]"
          >
            Open Evidence Provider Catalog
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span>{label}</span>
      <span className="max-w-[62%] text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}
