import { useMemo } from "react";
import { PORTS, VESSELS, portByCode, type Vessel } from "@/lib/intel-centre-data";
import { cn } from "@/lib/utils";

/**
 * Dark stylised Nigerian coast map (SVG, no external map lib).
 * Used across Manifest, Revenue, Port Operations.
 *
 * We draw a schematic Gulf-of-Guinea coastline + 5 major ports and
 * place vessel dots at approximate arrival positions offshore.
 * Colour reflects risk level so signals read at a glance.
 */
export function NigeriaMap({
  vessels = VESSELS,
  selectedVesselId,
  onSelectVessel,
  variant = "vessels",
  className,
}: {
  vessels?: Vessel[];
  selectedVesselId?: string;
  onSelectVessel?: (v: Vessel) => void;
  /**
   * "vessels"  → per-vessel dots (Manifest)
   * "heatmap"  → port hotspots sized by leakage (Revenue)
   */
  variant?: "vessels" | "heatmap";
  className?: string;
}) {
  const W = 900;
  const H = 460;

  const vesselDots = useMemo(
    () =>
      vessels.map((v) => {
        const port = portByCode(v.destinationPort)!;
        // scatter slightly offshore
        const dx = (parseInt(v.imo, 10) % 60) - 30;
        const dy = (parseInt(v.imo.slice(-2), 10) % 40) - 20;
        return {
          v,
          cx: port.x * W + dx,
          cy: port.y * H + dy - 40,
          port,
        };
      }),
    [vessels],
  );

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-line/60 bg-[#0A1524]",
        className,
      )}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        {/* grid */}
        <defs>
          <pattern id="ncgrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#132032" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="portGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#ncgrid)" />

        {/* Gulf of Guinea water */}
        <path
          d={`M0 ${H * 0.85} Q ${W * 0.25} ${H * 0.7}, ${W * 0.5} ${H * 0.78} T ${W} ${H * 0.75} L ${W} ${H} L 0 ${H} Z`}
          fill="#0A1B2E"
          stroke="#1A2B44"
          strokeWidth="0.6"
        />

        {/* Nigerian land mass (schematic) */}
        <path
          d={`M${W * 0.02} ${H * 0.05} L${W * 0.98} ${H * 0.02} L${W * 0.98} ${H * 0.55}
              Q${W * 0.85} ${H * 0.62}, ${W * 0.72} ${H * 0.58}
              L${W * 0.6}  ${H * 0.62}
              L${W * 0.5}  ${H * 0.72}
              L${W * 0.35} ${H * 0.7}
              L${W * 0.22} ${H * 0.72}
              L${W * 0.1}  ${H * 0.68}
              L${W * 0.02} ${H * 0.62} Z`}
          fill="#0F2036"
          stroke="#1E3557"
          strokeWidth="1"
        />

        {/* Country label */}
        <text x={W * 0.5} y={H * 0.32} textAnchor="middle" fill="#1E3557" fontSize={44} fontWeight={700}>
          NIGERIA
        </text>

        {/* Port markers */}
        {PORTS.map((p) => (
          <g key={p.code} transform={`translate(${p.x * W}, ${p.y * H})`}>
            {variant === "heatmap" && (
              <circle r={26 + p.congestionIndex / 4} fill="url(#portGlow)" />
            )}
            <circle r="4" fill="#2563EB" stroke="#0B1F3A" strokeWidth="1.5" />
            <text x="8" y="4" fill="#8DA5C7" fontSize="10.5" fontWeight={600}>
              {p.name}
            </text>
          </g>
        ))}

        {/* Vessels */}
        {variant === "vessels" &&
          vesselDots.map(({ v, cx, cy }) => {
            const active = v.id === selectedVesselId;
            const colour =
              v.riskLevel === "high"
                ? "#C0392B"
                : v.riskLevel === "medium"
                  ? "#B06A00"
                  : v.riskLevel === "low"
                    ? "#1E6B3A"
                    : "#5A6B7B";
            return (
              <g
                key={v.id}
                transform={`translate(${cx}, ${cy})`}
                className="cursor-pointer"
                onClick={() => onSelectVessel?.(v)}
              >
                {active && <circle r="10" fill={colour} opacity="0.25" />}
                <circle r="4" fill={colour} stroke="#0B1F3A" strokeWidth="1.25" />
                {active && (
                  <text x="8" y="-6" fill="#E4E8EC" fontSize="10" fontWeight={600}>
                    {v.name}
                  </text>
                )}
              </g>
            );
          })}
      </svg>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded border border-line/40 bg-[#0A1524]/80 px-2 py-1 text-[10px] text-slate/80">
        <LegendDot colour="#C0392B" label="High" />
        <LegendDot colour="#B06A00" label="Medium" />
        <LegendDot colour="#1E6B3A" label="Low" />
        <LegendDot colour="#5A6B7B" label="Unknown" />
      </div>
    </div>
  );
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}
