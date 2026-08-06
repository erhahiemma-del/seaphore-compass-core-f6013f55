/**
 * Maritime — Sources section of the Layer Panel.
 *
 * Lists every registered intelligence provider and lets an officer enable,
 * disable, and inspect each one.
 *
 * **No provider is named in this file.** Every row is rendered from the
 * provider's own `describe()` and `report()`, so registering NOAA,
 * OpenSanctions, MarineTraffic or anything else makes it appear here with
 * no change to this component. That is the whole reason descriptors exist.
 *
 * Enablement is stored in SGS (`enabledSources`) like every other map
 * preference — there is no second store, and the selection travels in a
 * shared link.
 */
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  listVesselSources,
  sgs,
  useMapSelector,
  type SharedGeospatialService,
  type SourceHealthReport,
  type SourceStatus,
  type VesselSourceDescriptor,
} from "@/services/geospatial";

export interface SourcesSectionProps {
  readonly service?: SharedGeospatialService;
  /** Poll interval for provider reports, ms. */
  readonly refreshMs?: number;
}

export function SourcesSection({ service = sgs, refreshMs = 5_000 }: SourcesSectionProps) {
  const enabledCsv = useMapSelector((state) => state.enabledSources.join(","), service);
  const enabled = new Set(enabledCsv ? enabledCsv.split(",") : []);

  // Providers report on their own cadence; poll rather than subscribe so a
  // provider needs no event plumbing to appear here.
  const [rows, setRows] = useState<
    ReadonlyArray<{ descriptor: VesselSourceDescriptor; report: SourceHealthReport }>
  >([]);

  useEffect(() => {
    function read() {
      setRows(
        listVesselSources().map((source) => ({
          descriptor: source.describe(),
          report: source.report(),
        })),
      );
    }
    read();
    const interval = setInterval(read, refreshMs);
    return () => clearInterval(interval);
  }, [refreshMs]);

  return (
    <section className="border-b border-border/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Radio className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sources
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {enabled.size}/{rows.length} on
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs leading-snug text-muted-foreground">
          No intelligence providers are registered. The map will show geography only.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ descriptor, report }) => (
            <SourceRow
              key={descriptor.id}
              descriptor={descriptor}
              report={report}
              checked={enabled.has(descriptor.id)}
              onToggle={() => service.toggleSource(descriptor.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface SourceRowProps {
  readonly descriptor: VesselSourceDescriptor;
  readonly report: SourceHealthReport;
  readonly checked: boolean;
  readonly onToggle: () => void;
}

function SourceRow({ descriptor, report, checked, onToggle }: SourceRowProps) {
  return (
    <li className="flex items-start gap-3">
      <Switch
        id={`source-${descriptor.id}`}
        checked={checked}
        onCheckedChange={onToggle}
        aria-describedby={`source-${descriptor.id}-detail`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor={`source-${descriptor.id}`} className="cursor-pointer text-sm font-medium">
            {descriptor.label}
          </label>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
            {descriptor.type}
          </Badge>
          <StatusPill status={report.status} />
        </div>

        <p
          id={`source-${descriptor.id}-detail`}
          className="text-xs leading-snug text-muted-foreground"
        >
          {descriptor.description}
        </p>

        {descriptor.caveat ? (
          /* A stated limitation must survive to the screen. */
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/80">
            {descriptor.caveat}
          </p>
        ) : null}

        {report.message ? (
          <p className="mt-0.5 text-[11px] leading-snug text-amber-500">{report.message}</p>
        ) : null}

        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <Metric label="Records" value={String(report.recordCount)} />
          <Metric label="Freshness" value={formatAge(report.freshnessMs)} />
          <Metric label="Updated" value={formatTimestamp(report.lastCheckedAt)} />
          <Metric
            label="Confidence"
            value={
              report.confidence === null
                ? "—"
                : `${Math.round(report.confidence * 100)}% ${report.confidenceLevel ?? ""}`.trim()
            }
          />
        </dl>
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="truncate font-mono text-foreground/80">{value}</dd>
    </div>
  );
}

/** Status vocabulary, stated plainly. Colour is never the only signal. */
const STATUS_LABEL: Readonly<Record<SourceStatus, string>> = {
  ok: "Live",
  empty: "No data",
  "credentials-missing": "No credentials",
  "auth-failed": "Auth failed",
  "upstream-error": "Unreachable",
  "not-queried": "Idle",
};

const STATUS_CLASS: Readonly<Record<SourceStatus, string>> = {
  ok: "text-emerald-500 border-emerald-500/40",
  empty: "text-muted-foreground border-border",
  "credentials-missing": "text-amber-500 border-amber-500/40",
  "auth-failed": "text-destructive border-destructive/40",
  "upstream-error": "text-destructive border-destructive/40",
  "not-queried": "text-muted-foreground border-border",
};

function StatusPill({ status }: { status: SourceStatus }) {
  return (
    <span
      className={`rounded border px-1.5 py-0 text-[10px] ${STATUS_CLASS[status]}`}
      title={STATUS_LABEL[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Freshness as an age, or an explicit dash when nothing has been observed. */
function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "never";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return formatAge(Date.now() - parsed) + " ago";
}
