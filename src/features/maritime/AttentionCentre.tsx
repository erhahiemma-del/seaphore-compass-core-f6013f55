/**
 * The operational attention centre.
 *
 * A count an officer can see without asking, and a feed they can act
 * from. It renders `AlertPresentation` and nothing else — no arrival is
 * computed here, no severity decided here, and no sentence written here
 * that the projection did not already commit to.
 *
 * ## An alert is not a search result
 *
 * A query highlights the vessels an answer is about and dims the rest;
 * that state disappears with the next question. An alert is an
 * unresolved item of work with a lifecycle and an audit trail. They are
 * kept apart visually and structurally, and running a query never
 * changes this count.
 *
 * ## Dark, because the map is the workspace
 *
 * A white card would sit on top of the chart and compete with it. A
 * translucent dark panel reads as an overlay *on* the operational
 * picture — present, secondary, and never the thing the officer is
 * looking through.
 *
 * ## Colour is never the only channel
 *
 * Every severity carries an icon, a word and a colour, so the surface
 * survives an officer who cannot separate amber from red and a screen
 * reader that sees no colour at all.
 */
import { useState } from "react";
import { AlertTriangle, Bell, Check, CircleAlert, Eye, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertPresentation, AttentionSeverity } from "@/services/alerts";

import { useAttentionFeed } from "./useAttentionFeed";

/**
 * How each severity is drawn and said.
 *
 * `label` is what a screen reader announces, so it never says "red".
 */
const SEVERITY_STYLE: Readonly<
  Record<AttentionSeverity, { label: string; text: string; Icon: typeof AlertTriangle }>
> = {
  URGENT: { label: "Urgent", text: "text-[#F87171]", Icon: CircleAlert },
  ATTENTION: { label: "Attention", text: "text-[#FB923C]", Icon: AlertTriangle },
  WATCH: { label: "Watch", text: "text-[#FBBF24]", Icon: Eye },
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
  /** Whether alerts survive a reload. Stated, never implied. */
  readonly durable?: boolean;
  /** Select the vessel through the canonical path. Never a second one. */
  readonly onView: (imo: string) => void;
  readonly onAcknowledge: (alertId: string) => void;
  /**
   * Findings from the other intelligence domains, already projected.
   *
   * A separate list from `alerts` on purpose: an arrival alert has a
   * lifecycle this surface can act on, while a finding is a pointer to
   * evidence held by the domain that produced it. Mixing them into one
   * array would invite one domain's actions onto another's rows.
   */
  readonly findings?: readonly IntelligenceFinding[];
  /** Opens the canonical context for the finding's subject. */
  readonly onOpenFinding?: (finding: IntelligenceFinding) => void;
  /** Officer attaches the finding to a case. Never automatic. */
  readonly onLinkFinding?: (finding: IntelligenceFinding) => void;
  /** Why the findings list is empty, when it is empty for a reason. */
  readonly findingsUnavailableReason?: string | null;
  readonly className?: string;
}

export function AttentionCentre({
  alerts,
  counts,
  assessable,
  unassessableCount,
  durable = false,
  onView,
  onAcknowledge,
  className,
}: AttentionCentreProps) {
  const [open, setOpen] = useState(false);
  const total = alerts.length;
  const feed = useAttentionFeed({ count: total, open });

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
          aria-label="Operational attention"
          data-testid="attention-panel"
          className={cn(
            /*
              Opens rightward from the trigger, into the map.
              Right-aligning it put a 22rem panel across the navigation
              sidebar, which sits above it: the officer could see the
              panel but the pointer landed on the nav, so hovering never
              paused the feed. Measured — the panel spanned x -65..287
              with the sidebar covering everything below x 205.
            */
            "absolute left-0 top-9 z-40 w-[22rem] overflow-hidden rounded-lg",
            "border border-white/10 shadow-2xl shadow-black/40",
            "bg-[rgba(10,16,24,0.92)] backdrop-blur-xl",
          )}
        >
          <header className="border-b border-white/10 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                Operational attention
              </span>
              <span className="font-mono text-[13px] tabular-nums text-white">{total}</span>
            </div>
            {total > 0 ? (
              <p className="mt-0.5 text-[10.5px] text-white/60">
                {counts.URGENT} urgent · {counts.ATTENTION} attention · {counts.WATCH} watch
              </p>
            ) : null}

            {/*
              The feed's own state, said plainly. An officer must be able
              to tell a list that is moving from one that has stopped
              because they touched it — otherwise a paused feed looks
              like a broken one.
            */}
            <div className="mt-1.5 flex items-center justify-between">
              <span
                data-testid="feed-motion"
                className="text-[10px] uppercase tracking-wider text-white/50"
              >
                {feed.motion === "LIVE"
                  ? "Live watch"
                  : feed.motion === "PAUSED"
                    ? "Paused"
                    : "All alerts visible"}
              </span>
              {feed.motion === "PAUSED" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Resume live watch"
                  onClick={feed.resume}
                  className="h-5 gap-1 px-1.5 text-[10px] text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <Play className="h-2.5 w-2.5" aria-hidden />
                  Resume
                </Button>
              ) : feed.motion === "LIVE" ? (
                <Pause className="h-3 w-3 text-white/30" aria-hidden />
              ) : null}
            </div>
          </header>

          {/*
            Arrivals are announced, never applied. An officer reading row
            nine keeps reading row nine.
          */}
          {feed.pendingCount > 0 ? (
            <button
              type="button"
              data-testid="attention-new"
              onClick={feed.showNew}
              className="w-full border-b border-white/10 bg-white/5 px-3 py-1.5 text-left text-[10.5px] font-medium text-white/90 hover:bg-white/10"
            >
              {feed.pendingCount} new {feed.pendingCount === 1 ? "alert" : "alerts"} · Show
            </button>
          ) : null}

          <ul
            ref={feed.listRef}
            className="max-h-[19rem] overflow-y-auto"
            {...feed.handlers}
            tabIndex={-1}
          >
            {alerts.map((alert) => (
              <AlertRow
                key={alert.alertId}
                alert={alert}
                onView={(imo) => {
                  feed.pause();
                  onView(imo);
                }}
                onAcknowledge={(id) => {
                  feed.pause();
                  onAcknowledge(id);
                }}
              />
            ))}
          </ul>

          {total === 0 ? <EmptyState assessable={assessable} /> : null}

          {unassessableCount > 0 ? (
            /*
             * Reported separately and never as an alert. Vessels nobody
             * could assess are a limitation of the picture; counting
             * them as quiet would turn missing data into an all-clear.
             */
            <p
              data-testid="assessment-limitations"
              className="border-t border-white/10 px-3 py-2 text-[10.5px] text-white/55"
            >
              Assessment limitations · {unassessableCount}{" "}
              {unassessableCount === 1 ? "vessel" : "vessels"} could not be assessed.
            </p>
          ) : null}

          {/* What is true of the store in use, not what the interface implies. */}
          <p className="border-t border-white/10 px-3 py-1.5 text-[10px] text-white/45">
            {durable
              ? "Alerts, acknowledgements and history are saved and survive a reload."
              : "Operational alerts are active for this session and are not stored."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What an empty list means.
 *
 * Two sentences, because there are two facts. With nothing assessed, an
 * all-clear would be a conclusion nobody reached.
 */
function EmptyState({ assessable }: { assessable: boolean }) {
  return (
    <p data-testid="attention-empty" className="px-3 py-4 text-[11.5px] text-white/60">
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
    <li className="border-b border-white/[0.07] px-3 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", style.text)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-white">{alert.vesselName}</p>
          {/*
            The hull identifier, not only the name. Vessel names are not
            unique — the simulated fleet alone puts two "Opobo Pioneer"
            hulls on the map — and two rows reading the same would leave
            an officer no way to tell which ship they were acting on.
          */}
          <p className="truncate font-mono text-[10px] tabular-nums text-white/45">
            IMO {alert.imo}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/70">{alert.headline}</p>
          {/* The arrival always carries its basis, or says it has none. */}
          <p className="truncate text-[10.5px] text-white/55">{alert.arrivalLine}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-white/45">
            <span className="sr-only">Severity: </span>
            {style.label} · {alert.lifecycleState}
            {" · "}
            <span className="normal-case">{alert.provenance.positionAge}</span>
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 border border-white/15 px-2 text-[10.5px] text-white/90 hover:bg-white/10 hover:text-white"
          onClick={() => onView(alert.imo)}
        >
          View
        </Button>
        {/* Offered only when the domain would accept it. */}
        {alert.actions.includes("ACKNOWLEDGE") ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10.5px] text-white/70 hover:bg-white/10 hover:text-white"
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
