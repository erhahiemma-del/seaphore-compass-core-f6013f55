/**
 * Risk, drawn only when risk has actually been assessed.
 *
 * A gauge is a persuasive shape. A needle resting in the green reads as
 * "we checked, it's fine" from across a room, and every vessel on this
 * map carries `riskLevel: "UNKNOWN"` because nothing assigns it yet. So
 * the unassessed state does not get a needle at all: no position on the
 * arc can be honest when no assessment exists, and choosing the leftmost
 * point — the natural default — is precisely the lie, because the left
 * of a risk arc means LOW.
 *
 * Instead the arc greys out and the face says so. The distinction it
 * protects is between "no risk" and "risk not assessed", which are
 * opposite operational conclusions drawn from the same empty field.
 *
 * When a real assessment lands, `riskLevel` becomes a band and the
 * needle appears at the band's centre. Nothing else changes.
 */
import { cn } from "@/lib/utils";
import { RISK_COLORS, type Vessel } from "@/services/geospatial";

/**
 * Where each band's needle rests, as a fraction of the arc.
 *
 * Every band the map recognises is here except `UNKNOWN`, whose absence
 * is the mechanism: a band with no entry gets no needle, so a risk level
 * added upstream without a considered position on the arc renders as
 * unassessed rather than landing somewhere arbitrary and reassuring.
 */
const BAND_POSITION: Readonly<Record<string, number>> = {
  CLEAN: 0.08,
  LOW: 0.25,
  MEDIUM: 0.5,
  MODERATE: 0.5,
  HIGH: 0.75,
  CRITICAL: 0.92,
};

const RADIUS = 52;
const CENTRE_X = 64;
const CENTRE_Y = 58;
/** The arc sweeps 180°, from due west round to due east. */
const SWEEP_DEGREES = 180;

export interface RiskGaugeProps {
  readonly vessel: Vessel;
  /** Why no assessment exists, shown beneath the face. */
  readonly reason?: string;
  readonly className?: string;
}

export function RiskGauge({ vessel, reason, className }: RiskGaugeProps) {
  const band = vessel.riskLevel;
  const position = BAND_POSITION[band];
  const assessed = position != null;
  const colour = assessed ? RISK_COLORS[band as keyof typeof RISK_COLORS] : undefined;

  return (
    <div
      className={cn("flex flex-col items-center gap-1", className)}
      data-testid="risk-gauge"
      data-assessed={assessed ? "true" : "false"}
      data-risk={band}
    >
      <svg
        viewBox="0 0 128 74"
        className="w-full max-w-[168px]"
        role="img"
        aria-label={assessed ? `Risk assessed as ${band}` : "Risk not assessed for this vessel"}
      >
        {/*
          Unassessed draws one flat neutral arc rather than the green →
          red ramp. A coloured scale invites the eye to look for the
          needle, and there is no needle to find.
        */}
        {assessed ? (
          <>
            {arc(0, 0.33, RISK_COLORS.LOW)}
            {arc(0.335, 0.665, RISK_COLORS.MEDIUM ?? RISK_COLORS.LOW)}
            {arc(0.67, 1, RISK_COLORS.HIGH)}
          </>
        ) : (
          arc(0, 1, "currentColor", "text-muted-foreground/25")
        )}

        {assessed ? <Needle position={position} colour={colour ?? "currentColor"} /> : null}
      </svg>

      <div className="text-center">
        <div
          className={cn(
            "text-[13px] font-semibold leading-tight",
            assessed ? undefined : "text-muted-foreground",
          )}
          style={assessed ? { color: colour } : undefined}
        >
          {assessed ? band : "Risk not assessed"}
        </div>
        <div className="text-[10.5px] leading-tight text-muted-foreground">
          {assessed ? "Assessed risk band" : (reason ?? "No assessment has been resolved")}
        </div>
      </div>
    </div>
  );
}

function arc(from: number, to: number, stroke: string, className?: string) {
  const start = pointAt(from);
  const end = pointAt(to);
  return (
    <path
      d={`M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`}
      fill="none"
      stroke={stroke}
      className={className}
      strokeWidth={9}
      strokeLinecap="round"
    />
  );
}

function Needle({ position, colour }: { position: number; colour: string }) {
  const tip = pointAt(position, RADIUS - 14);
  return (
    <>
      <line
        x1={CENTRE_X}
        y1={CENTRE_Y}
        x2={tip.x}
        y2={tip.y}
        stroke={colour}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle cx={CENTRE_X} cy={CENTRE_Y} r={4} fill={colour} />
    </>
  );
}

/** A fraction of the sweep, as a point on the arc. */
function pointAt(fraction: number, radius: number = RADIUS) {
  const radians = (180 + fraction * SWEEP_DEGREES) * (Math.PI / 180);
  return {
    x: CENTRE_X + radius * Math.cos(radians),
    y: CENTRE_Y + radius * Math.sin(radians),
  };
}
