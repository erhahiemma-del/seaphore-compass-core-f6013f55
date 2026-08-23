import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Locate, Minus, Plus, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusSubjectStore } from "@/stores/focus-subject.store";

/**
 * Live Maritime Picture — Gulf of Guinea stylisation of vessel positions.
 * Colour-coded by risk (MC-MAP-1). When a real MapLibre/Mapbox integration
 * becomes active the surface swaps out; the data contract (props) does not.
 *
 * This revision refines interaction only: cursor-anchored exponential zoom,
 * drag pan, a marker popover, and a layer panel. No data is invented here.
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

const RISK_LABEL: Record<VesselRisk, string> = {
  high: "High risk",
  medium: "Elevated",
  normal: "Nominal",
  sanctioned: "Sanctioned",
};

const FILTERS = ["All Vessels", "High Risk", "Watchlist", "Sanctioned"] as const;
type Filter = (typeof FILTERS)[number];

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 6;

const PORTS = [
  { x: 32, y: 60, label: "Lagos" },
  { x: 52, y: 62, label: "Warri" },
  { x: 62, y: 66, label: "Port Harcourt" },
  { x: 72, y: 68, label: "Calabar" },
];

interface Layer {
  key: "grid" | "coast" | "ports" | "labels";
  label: string;
}
const LAYERS: Layer[] = [
  { key: "grid", label: "Graticule" },
  { key: "coast", label: "Coastline" },
  { key: "ports", label: "Ports" },
  { key: "labels", label: "Port labels" },
];

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
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [selected, setSelected] = useState<MapVessel | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<Record<Layer["key"], boolean>>({
    grid: true,
    coast: true,
    ports: true,
    labels: true,
  });

  const setSubject = useFocusSubjectStore((s) => s.setSubject);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

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

  /** Cursor-anchored exponential zoom — keeps the point under the pointer fixed. */
  const zoomAt = useCallback((nextZoomRaw: number, px: number, py: number) => {
    const prev = viewRef.current;
    const next = Math.min(Math.max(nextZoomRaw, MIN_ZOOM), MAX_ZOOM);
    if (next === prev.zoom) return;
    const k = next / prev.zoom;
    setView({
      zoom: next,
      x: px - (px - prev.x) * k,
      y: py - (py - prev.y) * k,
    });
  }, []);

  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    zoomAt(
      viewRef.current.zoom * Math.exp(-dy * 0.0015),
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Never capture the pointer over an interactive marker or control — doing
    // so swallows its click.
    if ((e.target as HTMLElement).closest("button,label,input")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const centerZoom = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    zoomAt(viewRef.current.zoom * factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  const handleVesselClick = (v: MapVessel) => {
    setSelected(v);
    setSubject({
      kind: "vessel",
      id: v.id,
      title: v.name,
      descriptor: `IMO ${v.imo}`,
      facts: [
        { label: "Risk posture", value: RISK_LABEL[v.risk] },
        { label: "Watchlist", value: v.watchlist ? "Yes" : "No" },
      ],
    });
    onVesselClick?.(v);
  };

  const counts = useMemo(
    () => ({
      high: vessels.filter((v) => v.risk === "high").length,
      sanctioned: vessels.filter((v) => v.risk === "sanctioned").length,
      watch: vessels.filter((v) => v.watchlist).length,
      normal: vessels.filter((v) => v.risk === "normal").length,
    }),
    [vessels],
  );

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
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative flex-1 touch-none overflow-hidden rounded-md border border-line bg-[#0D2A4A] elev-2 [cursor:grab] active:[cursor:grabbing]"
      >
        {/* Ocean base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 40%, #123a63 0%, #0a1e37 60%, #071528 100%)",
          }}
        />

        {/* Transformed world — graticule, coast, ports, vessels share one frame */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transition: drag.current ? "none" : "transform var(--dur-2) var(--ease-out)",
          }}
        >
          {layers.grid && (
            <svg
              className="absolute inset-0 h-full w-full opacity-20"
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
                  strokeWidth={0.08}
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
                  strokeWidth={0.08}
                />
              ))}
            </svg>
          )}

          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {layers.coast && (
              <path
                d="M 0,55 Q 12,52 22,58 T 40,60 Q 48,54 55,58 T 72,65 Q 82,60 92,68 L 100,72 L 100,100 L 0,100 Z"
                fill="#15342a"
                stroke="#2a5a44"
                strokeWidth="0.25"
              />
            )}
            {layers.ports &&
              PORTS.map((p) => (
                <g key={p.label}>
                  <circle cx={p.x} cy={p.y} r={0.5} fill="#F0F3F6" opacity="0.9" />
                  {layers.labels && (
                    <text
                      x={p.x + 1.4}
                      y={p.y + 0.6}
                      fontSize={1.9}
                      fill="#F0F3F6"
                      opacity="0.6"
                      fontWeight="600"
                    >
                      {p.label}
                    </text>
                  )}
                </g>
              ))}
          </svg>

          {filtered.map((v) => {
            const active = selected?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleVesselClick(v);
                }}
                className="group absolute -translate-x-1/2 -translate-y-1/2 motion-fast"
                style={{
                  left: `${v.x}%`,
                  top: `${v.y}%`,
                  // Markers keep constant screen size as the world scales.
                  transform: `translate(-50%, -50%) scale(${1 / view.zoom})`,
                }}
                title={`${v.name} · IMO ${v.imo}`}
                aria-label={`${v.name}, IMO ${v.imo}, ${RISK_LABEL[v.risk]}`}
              >
                <span
                  className={cn(
                    "block h-2.5 w-2.5 rounded-full ring-2 motion-fast",
                    active ? "ring-white" : "ring-white/45 group-hover:ring-white/85",
                  )}
                  style={{
                    backgroundColor: RISK_HEX[v.risk],
                    boxShadow: `0 0 ${active ? 14 : 8}px ${RISK_HEX[v.risk]}`,
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Marker popover — anchored to the selected vessel's screen position */}
        {selected && (
          <div
            className="pointer-events-auto absolute z-20 w-[210px] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md border border-white/12 bg-black/72 p-3 text-white backdrop-blur elev-3"
            style={{
              left: `${(selected.x / 100) * (containerRef.current?.clientWidth ?? 0) * view.zoom + view.x}px`,
              top: `${(selected.y / 100) * (containerRef.current?.clientHeight ?? 0) * view.zoom + view.y}px`,
            }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold leading-tight">
                  {selected.name}
                </div>
                <div className="type-mono text-[10px] text-white/60">IMO {selected.imo}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close vessel popover"
                className="text-white/60 hover:text-white motion-fast"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: RISK_HEX[selected.risk] }}
              />
              {RISK_LABEL[selected.risk]}
              {selected.watchlist && <span className="text-white/55">· watchlist</span>}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-white/55">
              Positions as reported by the active provider. Officer decides.
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-1 rounded-md border border-white/10 bg-black/40 p-1 backdrop-blur">
          <IconBtn onClick={() => centerZoom(1.35)} label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn onClick={() => centerZoom(1 / 1.35)} label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            onClick={() => {
              setView({ zoom: 1, x: 0, y: 0 });
              setSelected(null);
            }}
            label="Recenter"
          >
            <Locate className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn onClick={() => setLayersOpen((o) => !o)} label="Layers" active={layersOpen}>
            <Layers className="h-3.5 w-3.5" />
          </IconBtn>
        </div>

        {layersOpen && (
          <div className="absolute right-12 top-3 z-20 w-[168px] rounded-md border border-white/10 bg-black/62 p-2 text-white backdrop-blur elev-3">
            <div className="px-1 pb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">
              Layers
            </div>
            {LAYERS.map((l) => (
              <label
                key={l.key}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11px] hover:bg-white/10 motion-fast"
              >
                <input
                  type="checkbox"
                  checked={layers[l.key]}
                  onChange={(e) =>
                    setLayers((s) => ({ ...s, [l.key]: e.target.checked }))
                  }
                  className="h-3 w-3 accent-[color:var(--color-teal)]"
                />
                {l.label}
              </label>
            ))}
          </div>
        )}

        {/* Vessels Live inset */}
        <div className="absolute bottom-3 left-3 z-10 rounded-md border border-white/10 bg-black/55 p-2.5 text-white backdrop-blur">
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/60">
            Vessels Live
          </div>
          <div className="type-mono text-[18px] font-bold leading-tight">{vessels.length}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {[
              { k: "High Risk", n: counts.high, c: RISK_HEX.high },
              { k: "Sanctioned", n: counts.sanctioned, c: RISK_HEX.sanctioned },
              { k: "Under Watch", n: counts.watch, c: RISK_HEX.medium },
              { k: "Normal", n: counts.normal, c: RISK_HEX.normal },
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
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded motion-fast",
        active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
