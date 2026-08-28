/**
 * The operational attention centre.
 *
 * A count an officer can see without asking, and a list they can act
 * from. It renders `AlertPresentation` and nothing else — no arrival is
 * computed here, no severity is decided here, and no sentence is written
 * here that the projection did not already commit to.
 *
 * ## An alert is not a search result
 *
 * A query highlights vessels an answer is about and dims the rest; that
 * is a presentation state which disappears with the next question. An
 * alert is an unresolved item of work with a lifecycle and an audit
 * trail. They are kept visually and structurally apart, and running a
 * query never changes this count.
 *
 * ## Colour is never the only channel
 *
 * Each severity carries an icon, a word and a shape as well as a colour,
 * so the surface stays readable for an officer who cannot distinguish
 * amber from red — and so a screen reader is told the same thing the
 * screen shows.
 */
import { useState } from "react";
import { AlertTriangle, Bell, Check, CircleAlert, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertPresentation } from "@/services/alerts";
import type { AttentionSeverity } from "@/services/alerts";

/**
 * How each severity is drawn and said.
 *
 * Four channels per row: an icon, a word, a colour and a shape. The
 * `label` is what a screen reader announces, so it never says "red".
 */
const SEVERITY_STYLE: Readonly<
  Record<
    AttentionSeverity,
    { label: string; dot: string; text: string; Icon: typeof AlertTriangle }
  >
> = {
  URGENT: {
    label: "Urgent",
    dot: "bg-[color:var(--color-alert-urgent,#DC2626)]",
    text: "text-[color:var(--color-alert-urgent,#DC2626)]",
    Icon: CircleAlert,
  },
  ATTENTION: {
    label: "Attention",
    dot: "bg-[color:var(--color-alert-attention,#EA580C)]",
    text: "text-[color:var(--color-alert-attention,#EA580C)]",
    Icon: AlertTriangle,
  },
  WATCH: {
    label: "Watch",
    dot: "bg-[color:var(--color-alert-watch,#D97706)]",
    text: "text-[color:var(--color-alert-watch,#D97706)]",
    Icon: Eye,
  },
};

export interface AttentionCentreProps {
  readonly alerts: readonly AlertPresentation[];
  readonly counts: Readonly<Record<AttentionSeverity, number>>;
  /**
   * Whether an assessment could be made at all.
   *
   * The difference between "nothing is approaching" and "nobody looked",
   * which this surface must never blur.
   */
  readonly assessable: boolean;
  /** Vessels the latest pass could not assess. Never counted as alerts. */
  readonly unassessableCount: number;
  /** Select the vessel through the canonical path. Never a second one. */
  readonly onView: (imo: string) => void;
  readonly onAcknowledge: (alertId: string) => void;
  readonly className?: string;
}

export function AttentionCentre({
  alerts,
  counts,
  assessable,
  unassessableCount,
  onView,
  onAcknowledge,
  className,
}: AttentionCentreProps) {
  const [open, setOpen] = useState(false);
  const total = alerts.length;

  return (
    <div className={cn("relative", className)} data-testid="attention-centre">
      <Button
        variant="ghost"
        size="sm"
        aria-label={
          total === 0
            ? "Attention centre. No active alerts."
            : `Attention centre. ${total} active ${total === 1 ? "alert" : "alerts"}.`
        }
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="h-7 gap-1.5 px-2"
      >
        <Bell className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[11px] font-medium tabular-nums">{total}</span>
      </Button>

      {open ? (
        <div
          role="region"
          aria-label="Attention centre"
          data-testid="attention-panel"
          className="absolute right-0 top-9 z-40 w-80 overflow-hidden rounded-md border border-border bg-background shadow-lg"
        >
          <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Attention</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{total}</span>
          </header>

          {total > 0 ? (
            <p className="border-b border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">
              {counts.URGENT} urgent · {counts.ATTENTION} attention · {counts.WATCH} watch
            </p>
          ) : null}

          <ul className="max-h-80 overflow-y-auto">
            {alerts.map((alert) => (
              <AlertRow
                key={alert.alertId}
                alert={alert}
                onView={onView}
                onAcknowledge={onAcknowledge}
              />
            ))}
          </ul>

          {total === 0 ? <EmptyState assessable={assessable} /> : null}

          {unassessableCount > 0 ? (
            /*
             * Reported separately and never as an alert. Vessels nobody
             * could assess are a limitation of the picture; counting them
             * as quiet would turn missing data into an all-clear.
             */
            <p
              data-testid="assessment-limitations"
              className="border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground"
            >
              Assessment limitations · {unassessableCount}{" "}
              {unassessableCount === 1 ? "vessel" : "vessels"} could not be assessed.
            </p>
          ) : null}

          <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            Alerts cover this session and are not stored.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What an empty list means.
 *
 * Two different sentences, because there are two different facts. With
 * nothing assessed, an all-clear would be a conclusion nobody reached.
 */
function EmptyState({ assessable }: { assessable: boolean }) {
  return (
    <p data-testid="attention-empty" className="px-3 py-4 text-[11.5px] text-muted-foreground">
      {assessable
        ? "No active alerts from the currently assessable vessel data."
        : "No assessment has been made. Approach alerts need a loaded fleet and the maritime boundary outline."}
    </p>
  );
}

function AlertRow({
  alert,
  onView,
  onAcknowledge,
}: {
  alert: AlertPresentation;
  onView: (imo: string) => void;
  onAcknowledge: (alertId: string) => void;
}) {
  const style = SEVERITY_STYLE[alert.severity];
  const { Icon } = style;

  return (
    <li className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", style.text)} aria-hidden />
        <div className="min-w-0 flex-1">
          {/*
            The hull identifier, not only the name. Vessel names are not
            unique — the simulated fleet alone puts two "Opobo Pioneer"
            hulls on the map — and an officer choosing between two rows
            that read the same has no way to tell which ship is which.
            Episode identity has always been the IMO; this shows it.
          */}
          <p className="truncate text-[12px] font-medium">{alert.vesselName}</p>
          <p className="truncate text-[10px] tabular-nums text-muted-foreground">IMO {alert.imo}</p>
          <p className="truncate text-[11px] text-muted-foreground">{alert.headline}</p>
          {/* The arrival always carries its basis, or says it has none. */}
          <p className="truncate text-[10.5px] text-muted-foreground">{alert.arrivalLine}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="sr-only">Severity: </span>
            {style.label}
            {alert.acknowledged ? " · Acknowledged" : ""}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10.5px]"
          onClick={() => onView(alert.imo)}
        >
          View
        </Button>
        {/* Offered only when the domain would accept it. */}
        {alert.actions.includes("ACKNOWLEDGE") ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10.5px]"
            onClick={() => onAcknowledge(alert.alertId)}
          >
            <Check className="h-3 w-3" aria-hidden />
            Acknowledge
          </Button>
        ) : null}
      </div>
    </li>
  );
}
