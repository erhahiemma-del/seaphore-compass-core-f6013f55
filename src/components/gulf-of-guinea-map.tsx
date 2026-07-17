import { useMemo, useState } from "react";
import { Layers, Locate, Minus, Plus, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Live Maritime Picture — Gulf of Guinea SVG stylisation of vessel
 * positions. Colour-coded by risk (red/amber/green/purple per MC-MAP-1).
 * When a real Mapbox/Google integration lands the SVG swaps out; the
 * data contract (props) does not change.
 */
export type VesselRisk = "high" | "medium" | "normal" | "sanctioned";

export interface MapVessel {
  id: string;
  imo: string;
  name: string;
  x: number; // 0..100
  y: number; // 0..100
  risk: VesselRisk;
  watchlist?: boolean;
}

const RISK_HEX: Record<VesselRisk, string> = {
  high: "#C0392B",
  medium: "#B06A00",
  normal: "#1E6B3A",
  sanctioned: "#7C3AED",
};

const FILTERS = ["All Vessels", "High Risk", "Watchlist", "Sanctioned"] as const;
type Filter = (typeof FILTERS)[number];

export interface GulfOfGuineaMapProps {
  vessels: MapVessel[];
  onVesselClick?: (v: MapVessel) => void;
  live?: boolean;
  lastUpdated?: string;
  className?: string;
}

export function GulfOfGuineaMap({
  vessels,
  onVesselClick,
  live = true,
  lastUpdated,
  className,
}: GulfOfGuineaMapProps) {
  const [filter, setFilter] = useState<Filter>("All Vessels");
  const [zoom, setZoom] = useState(1);

  const filtered = useMemo(() => {
    switch (filter) {
      case "High Risk":
        return vessels.filter((v) => v.risk === "high");
      case "Watchlist":
        return vessels.filter((v) => v.watchlist);
      case "Sanctioned":
        return vessels.filter((v) => v.risk === "sanctioned");
      default:
        return vessels;
    }
  }, [filter, vessels]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-[11px] font-semibold motion-fast",
              filter === f
                ? "bg-[color:var(--color-navy)] text-white"
                : "bg-surface-2 text-foreground/70 hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
            live
              ? "bg-[color:var(--color-green)]/12 text-[color:var(--color-green)]"
              : "bg-[color:var(--color-amber)]/12 text-[color:var(--color-amber)]",
          )}
        >
          <Radio className={cn("h-3 w-3", live && "animate-pulse")} />
          {live ? "LIVE" : `DELAYED${lastUpdated ? ` · ${lastUpdated}` : ""}`}
        </span>
      </div>

      {/* Map surface */}
      <div className="relative flex-1 overflow-hidden rounded-md border border-line bg-[#0D2A4A]">
        {/* Ocean base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 40%, #123a63 0%, #0a1e37 60%, #071528 100%)",
          }}
        />
        {/* Grid */}
        <svg
          className="absolute inset-0 h-full w-full opacity-25"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 11 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * 10}
              x2={100}
              y2={i * 10}
              stroke="#5A84B8"
              strokeWidth={0.1}
            />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={i * 10}
              y1={0}
              x2={i * 10}
              y2={100}
              stroke="#5A84B8"
              strokeWidth={0.1}
            />
          ))}
        </svg>

        {/* Coastline — stylised Nigerian + neighbouring coast */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d="M 0,55 Q 12,52 22,58 T 40,60 Q 48,54 55,58 T 72,65 Q 82,60 92,68 L 100,72 L 100,100 L 0,100 Z"
            fill="#1a3a2e"
            stroke="#2a5a44"
            strokeWidth="0.3"
          />
          {/* Port markers */}
          {[
            { x: 32, y: 60, label: "Lagos" },
            { x: 52, y: 62, label: "Warri" },
            { x: 62, y: 66, label: "Port Harcourt" },
            { x: 72, y: 68, label: "Calabar" },
          ].map((p) => (
            <g key={p.label}>
              <circle cx={p.x} cy={p.y} r="0.6" fill="#F0F3F6" />
              <text
                x={p.x + 1.5}
                y={p.y + 0.6}
                fontSize="2.2"
                fill="#F0F3F6"
                opacity="0.7"
                fontWeight="600"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Vessels */}
        <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
          {filtered.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onVesselClick?.(v)}
              className="group absolute -translate-x-1/2 -translate-y-1/2 motion-fast"
              style={{ left: `${v.x}%`, top: `${v.y}%` }}
              title={`${v.name} · IMO ${v.imo}`}
            >
              <span
                className="block h-2.5 w-2.5 rounded-full ring-2 ring-white/50 group-hover:ring-white"
                style={{
                  backgroundColor: RISK_HEX[v.risk],
                  boxShadow: `0 0 8px ${RISK_HEX[v.risk]}`,
                }}
              />
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-md border border-white/10 bg-black/40 p-1 backdrop-blur">
          <IconBtn onClick={() => setZoom((z) => Math.min(z + 0.25, 2))} label="Zoom in"><Plus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={() => setZoom((z) => Math.max(z - 0.25, 0.75))} label="Zoom out"><Minus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={() => setZoom(1)} label="Recenter"><Locate className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={() => {}} label="Layers"><Layers className="h-3.5 w-3.5" /></IconBtn>
        </div>

        {/* Vessels Live inset */}
        <div className="absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/55 p-2.5 text-white backdrop-blur">
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/60">
            Vessels Live
          </div>
          <div className="type-mono text-[18px] font-bold leading-tight">
            {vessels.length}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {[
              { k: "High Risk", n: vessels.filter((v) => v.risk === "high").length, c: RISK_HEX.high },
              { k: "Sanctioned", n: vessels.filter((v) => v.risk === "sanctioned").length, c: RISK_HEX.sanctioned },
              { k: "Under Watch", n: vessels.filter((v) => v.watchlist).length, c: RISK_HEX.medium },
              { k: "Normal", n: vessels.filter((v) => v.risk === "normal").length, c: RISK_HEX.normal },
            ].map((r) => (
              <div key={r.k} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.c }} />
                <span className="opacity-75">{r.k}</span>
                <span className="ml-auto font-semibold">{r.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white motion-fast"
    >
      {children}
    </button>
  );
}
