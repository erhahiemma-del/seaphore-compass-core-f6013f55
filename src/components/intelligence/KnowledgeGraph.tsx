import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Filter,
  Layers,
  Maximize2,
  Minus,
  MoveHorizontal,
  Pause,
  Play,
  Plus,
} from "lucide-react";

import type {
  GraphEdge,
  GraphNode,
  GraphNodeKind,
} from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

const KIND_COLOR: Record<GraphNodeKind, string> = {
  vessel: "#2563EB",
  company: "#B8860B",
  person: "#7C3AED",
  port: "#0E7C7B",
  cargo: "#B06A00",
  manifest: "#5A6B7B",
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  vessel: "Vessels",
  company: "Companies",
  person: "Persons",
  port: "Ports",
  cargo: "Cargo",
  manifest: "Manifests",
};

export type GraphLayout = "Force" | "Radial" | "Hierarchy";
export type GraphRange = "1D" | "7D" | "30D" | "All";

const RANGE_WINDOW: Record<GraphRange, [number, number]> = {
  "1D": [90, 100],
  "7D": [70, 100],
  "30D": [30, 100],
  All: [0, 100],
};

/**
 * INV-4 / INV-5 / MEM-3 knowledge graph.
 *
 * Interactive controls (all functional):
 *  - Entity-type filter — hides/shows nodes by kind.
 *  - Relationship-type filter — hides/shows edges by type.
 *  - Confidence ≥ slider — hides nodes below threshold.
 *  - Evidence-only — keeps only nodes with attached evidence.
 *  - Layout selector — Force (stored coords), Radial (around focal),
 *    Hierarchy (top-down banded by kind).
 *  - Zoom in/out/reset — drives the SVG viewBox, so labels stay legible.
 *  - Timeline scrubber + Play — animates edges/nodes appearing over time
 *    within the selected range window.
 *  - Node click — reports selection to the parent via onSelectionChange
 *    and highlights the immediate neighbourhood.
 */
interface PersistedGraphSettings {
  layout?: GraphLayout;
  zoom?: number;
  activeKinds?: GraphNodeKind[];
  activeRels?: string[];
  confidenceFilter?: number;
  evidenceOnly?: boolean;
  range?: GraphRange;
  cursor?: number;
  minimap?: boolean;
}

const STORAGE_PREFIX = "seaphore:kg:";

function readPersisted(key?: string): PersistedGraphSettings | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as PersistedGraphSettings) : null;
  } catch {
    return null;
  }
}

function writePersisted(key: string, value: PersistedGraphSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or disabled — silently skip */
  }
}

function clearPersisted(key?: string) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* silently skip */
  }
}

export interface KnowledgeGraphHandle {
  /** Clears persisted view settings for this workspace and restores defaults. */
  reset: () => void;
}

export const KnowledgeGraph = forwardRef<
  KnowledgeGraphHandle,
  {
    nodes: GraphNode[];
    edges: GraphEdge[];
    focalId?: string;
    onNodeClick?: (n: GraphNode) => void;
    onSelectionChange?: (n: GraphNode | null) => void;
    className?: string;
    height?: number;
    minimap?: boolean;
    /**
     * When provided, view settings (layout, zoom, filters, timeline range/cursor,
     * minimap visibility) are persisted to localStorage under this key so the
     * officer's context survives refresh and route navigation.
     */
    persistKey?: string;
  }
>(function KnowledgeGraph(
  {
    nodes,
    edges,
    focalId,
    className,
    onNodeClick,
    onSelectionChange,
    height = 420,
    minimap = false,
    persistKey,
  },
  ref,
) {
  const persisted = useMemo(() => readPersisted(persistKey), [persistKey]);

  const [layout, setLayout] = useState<GraphLayout>(persisted?.layout ?? "Force");
  const [zoom, setZoom] = useState(persisted?.zoom ?? 1);
  const [activeKinds, setActiveKinds] = useState<Set<GraphNodeKind>>(
    new Set(
      (persisted?.activeKinds as GraphNodeKind[] | undefined) ??
        (Object.keys(KIND_COLOR) as GraphNodeKind[]),
    ),
  );
  const relTypes = useMemo(() => {
    const set = new Set<string>();
    edges.forEach((e) => set.add(e.type ?? e.label));
    return Array.from(set);
  }, [edges]);
  const [activeRels, setActiveRels] = useState<Set<string>>(() => {
    if (persisted?.activeRels) {
      return new Set(persisted.activeRels.filter((r) => relTypes.includes(r)));
    }
    return new Set(relTypes);
  });
  // If edges change and there's no persisted preference, refresh the visible set.
  const relHydratedRef = useRef(false);
  useEffect(() => {
    if (!relHydratedRef.current && persisted?.activeRels) {
      relHydratedRef.current = true;
      return;
    }
    if (!persisted?.activeRels) setActiveRels(new Set(relTypes));
  }, [relTypes, persisted?.activeRels]);

  const [range, setRange] = useState<GraphRange>(persisted?.range ?? "All");
  const [cursor, setCursor] = useState(persisted?.cursor ?? 100);
  const [playing, setPlaying] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState(
    persisted?.confidenceFilter ?? 0,
  );
  const [evidenceOnly, setEvidenceOnly] = useState(
    persisted?.evidenceOnly ?? false,
  );
  const [showMinimap, setShowMinimap] = useState<boolean>(
    persisted?.minimap ?? minimap,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      clearPersisted(persistKey);
      setLayout("Force");
      setZoom(1);
      setActiveKinds(new Set(Object.keys(KIND_COLOR) as GraphNodeKind[]));
      setActiveRels(new Set(relTypes));
      setRange("All");
      setCursor(100);
      setConfidenceFilter(0);
      setEvidenceOnly(false);
      setShowMinimap(minimap);
      setSelectedId(null);
      setPlaying(false);
      onSelectionChange?.(null);
    },
  }));

  const [rangeStart, rangeEnd] = RANGE_WINDOW[range];

  // Reset cursor when range changes — skip once so a persisted cursor survives mount.
  const rangeHydratedRef = useRef(false);
  useEffect(() => {
    if (!rangeHydratedRef.current) {
      rangeHydratedRef.current = true;
      return;
    }
    setCursor(rangeEnd);
  }, [rangeEnd]);

  // Persist view settings whenever they change.
  useEffect(() => {
    if (!persistKey) return;
    writePersisted(persistKey, {
      layout,
      zoom,
      activeKinds: Array.from(activeKinds),
      activeRels: Array.from(activeRels),
      confidenceFilter,
      evidenceOnly,
      range,
      cursor,
      minimap: showMinimap,
    });
  }, [
    persistKey,
    layout,
    zoom,
    activeKinds,
    activeRels,
    confidenceFilter,
    evidenceOnly,
    range,
    cursor,
    showMinimap,
  ]);

  // Play advances the cursor across the window and stops at the end.
  const playRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    playRef.current = window.setInterval(() => {
      setCursor((c) => {
        const next = c + Math.max(1, Math.round((rangeEnd - rangeStart) / 40));
        if (next >= rangeEnd) {
          setPlaying(false);
          return rangeEnd;
        }
        return next;
      });
    }, 120);
    return () => {
      if (playRef.current) window.clearInterval(playRef.current);
    };
  }, [playing, rangeEnd, rangeStart]);

  // Layout: compute per-node display coordinates from stored home coords.
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (layout === "Force") {
      nodes.forEach((n) => map.set(n.id, { x: n.x, y: n.y }));
    } else if (layout === "Radial") {
      const focal = nodes.find((n) => n.id === (focalId ?? nodes[0]?.id));
      const rest = nodes.filter((n) => n.id !== focal?.id);
      if (focal) map.set(focal.id, { x: 50, y: 50 });
      rest.forEach((n, i) => {
        const a = (i / Math.max(1, rest.length)) * Math.PI * 2;
        map.set(n.id, { x: 50 + Math.cos(a) * 34, y: 50 + Math.sin(a) * 34 });
      });
    } else {
      const bands: GraphNodeKind[] = [
        "person",
        "company",
        "vessel",
        "manifest",
        "cargo",
        "port",
      ];
      bands.forEach((kind, row) => {
        const layer = nodes.filter((n) => n.kind === kind);
        const y = 10 + (row * 80) / (bands.length - 1);
        layer.forEach((n, i) => {
          const x = layer.length === 1 ? 50 : 10 + (i * 80) / (layer.length - 1);
          map.set(n.id, { x, y });
        });
      });
      nodes.forEach((n) => {
        if (!map.has(n.id)) map.set(n.id, { x: n.x, y: n.y });
      });
    }
    return map;
  }, [layout, nodes, focalId]);

  const visibleNodes = useMemo(
    () =>
      nodes.filter((n) => {
        if (!activeKinds.has(n.kind)) return false;
        if ((n.confidence ?? 100) < confidenceFilter) return false;
        if (evidenceOnly && !n.evidence) return false;
        const t = n.t ?? 0;
        if (t < rangeStart || t > cursor) return false;
        return true;
      }),
    [nodes, activeKinds, confidenceFilter, evidenceOnly, cursor, rangeStart],
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      edges.filter((e) => {
        if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to))
          return false;
        if (!activeRels.has(e.type ?? e.label)) return false;
        const t = e.t ?? 0;
        return t >= rangeStart && t <= cursor;
      }),
    [edges, visibleNodeIds, activeRels, cursor, rangeStart],
  );

  const neighbourIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const s = new Set<string>([selectedId]);
    visibleEdges.forEach((e) => {
      if (e.from === selectedId) s.add(e.to);
      if (e.to === selectedId) s.add(e.from);
    });
    return s;
  }, [selectedId, visibleEdges]);

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  // Zoom: shrink the viewBox around the centre — labels scale up naturally.
  const vbSize = 100 / zoom;
  const vbOffset = (100 - vbSize) / 2;

  function selectNode(n: GraphNode | null) {
    setSelectedId(n?.id ?? null);
    onSelectionChange?.(n);
    if (n) onNodeClick?.(n);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-[#1E3048] bg-[#0D1B2A] text-[#E4E8EC]",
        className,
      )}
      style={{ minHeight: height }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1E3048] px-3 py-2 text-[11px]">
        <span
          className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-bold uppercase tracking-[0.06em]"
          style={{ color: "#1E6B3A", backgroundColor: "#1E6B3A26" }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1E6B3A]" />
          LIVE
        </span>
        <span className="text-white/80">
          Displaying <b>{visibleNodes.length}</b> entities,{" "}
          <b>{visibleEdges.length}</b> relationships
        </span>
        {selectedId && (
          <button
            type="button"
            onClick={() => selectNode(null)}
            className="ml-1 rounded border border-[#1E3048] bg-[#132032] px-1.5 py-0.5 text-white/80 hover:bg-[#172A40]"
          >
            Clear selection ×
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <label className="text-white/60">Layout</label>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as GraphLayout)}
            className="rounded border border-[#1E3048] bg-[#132032] px-1.5 py-0.5 text-[11px]"
          >
            <option>Force</option>
            <option>Radial</option>
            <option>Hierarchy</option>
          </select>
          <button
            type="button"
            aria-label="Zoom in"
            className="ml-2 rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className="rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            className="rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
            onClick={() => setZoom(1)}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={showMinimap ? "Hide minimap" : "Show minimap"}
            aria-pressed={showMinimap}
            className={cn(
              "ml-1 rounded border border-[#1E3048] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-[#172A40]",
              showMinimap
                ? "bg-[color:var(--color-teal)] text-white"
                : "bg-[#132032] text-white/70",
            )}
            onClick={() => setShowMinimap((v) => !v)}
          >
            Minimap
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="absolute left-3 top-14 z-10 w-52 rounded-md border border-[#1E3048] bg-[#132032]/95 p-2 text-[11px] backdrop-blur">
        <div className="mb-1 flex items-center gap-1.5 text-white/70">
          <Filter className="h-3 w-3" /> Filters
        </div>
        <div className="mb-1 font-semibold text-white/80">Entity types</div>
        <div className="mb-2 space-y-0.5">
          {(Object.keys(KIND_COLOR) as GraphNodeKind[]).map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-white/70">
              <input
                type="checkbox"
                checked={activeKinds.has(k)}
                onChange={(e) => {
                  const next = new Set(activeKinds);
                  if (e.target.checked) next.add(k);
                  else next.delete(k);
                  setActiveKinds(next);
                }}
              />
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: KIND_COLOR[k] }}
              />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
        <div className="mb-1 font-semibold text-white/80">
          Relationship types
        </div>
        <div className="max-h-24 space-y-0.5 overflow-auto pr-1">
          {relTypes.map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-white/60">
              <input
                type="checkbox"
                checked={activeRels.has(r)}
                onChange={(e) => {
                  const next = new Set(activeRels);
                  if (e.target.checked) next.add(r);
                  else next.delete(r);
                  setActiveRels(next);
                }}
              />
              {r}
            </label>
          ))}
        </div>
        <div className="mt-2 border-t border-[#1E3048] pt-2">
          <div className="mb-1 flex items-center justify-between font-semibold text-white/80">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" /> Confidence ≥
            </span>
            <span className="text-white">{confidenceFilter}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(+e.target.value)}
            className="w-full accent-[color:var(--color-teal)]"
          />
          <label className="mt-1 flex items-center gap-1.5 text-white/70">
            <input
              type="checkbox"
              checked={evidenceOnly}
              onChange={(e) => setEvidenceOnly(e.target.checked)}
            />
            Evidence only
          </label>
        </div>
      </div>

      {/* Legend + minimap */}
      <div className="absolute right-3 top-14 z-10 w-40 space-y-2">
        <div className="rounded-md border border-[#1E3048] bg-[#132032]/95 p-2 text-[10px] backdrop-blur">
          <div className="mb-1 font-semibold text-white/80">Legend</div>
          <div className="space-y-0.5">
            {(Object.keys(KIND_COLOR) as GraphNodeKind[]).map((k) => (
              <div
                key={k}
                className="flex items-center gap-1.5 text-white/70"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: KIND_COLOR[k] }}
                />
                {KIND_LABEL[k]}
              </div>
            ))}
          </div>
        </div>
        {showMinimap && (
          <div className="rounded-md border border-[#1E3048] bg-[#0B1420]/95 p-1 backdrop-blur">
            <div className="mb-1 px-1 text-[10px] font-semibold text-white/60">
              Minimap
            </div>
            <svg viewBox="0 0 100 100" className="h-16 w-full">
              {visibleEdges.map((e, i) => {
                const a = positions.get(e.from);
                const b = positions.get(e.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#1E3048"
                    strokeWidth={0.5}
                  />
                );
              })}
              {visibleNodes.map((n) => {
                const p = positions.get(n.id)!;
                return (
                  <circle
                    key={n.id}
                    cx={p.x}
                    cy={p.y}
                    r={1.5}
                    fill={KIND_COLOR[n.kind]}
                  />
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Graph canvas — zoom via viewBox so labels stay crisp. */}
      <svg
        viewBox={`${vbOffset} ${vbOffset} ${vbSize} ${vbSize}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block"
        style={{ height: height - 96, width: "100%" }}
      >
        <defs>
          <pattern
            id="kg-grid"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M10 0 L0 0 L0 10"
              fill="none"
              stroke="#152944"
              strokeWidth="0.15"
            />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#kg-grid)" />

        {visibleEdges.map((e, i) => {
          const a = positions.get(e.from)!;
          const b = positions.get(e.to)!;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const highlighted =
            !!selectedId && (e.from === selectedId || e.to === selectedId);
          const dim = !!selectedId && !highlighted;
          return (
            <g key={i} opacity={dim ? 0.25 : 1}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={highlighted ? "#7DD3FC" : "#2C4360"}
                strokeWidth={highlighted ? 0.55 : 0.35}
              />
              <text
                x={mx}
                y={my - 0.5}
                fontSize={1.6}
                fill={highlighted ? "#E4E8EC" : "#7B8CA0"}
                textAnchor="middle"
              >
                {e.label}
              </text>
            </g>
          );
        })}

        {visibleNodes.map((n) => {
          const p = positions.get(n.id)!;
          const isSelected = n.id === selectedId;
          const isNeighbour = neighbourIds.has(n.id);
          const dim = !!selectedId && !isNeighbour;
          const r = n.kind === "vessel" ? 3.2 : n.kind === "company" ? 2.8 : 2.2;
          return (
            <g
              key={n.id}
              className="cursor-pointer"
              opacity={dim ? 0.3 : 1}
              onClick={() => selectNode(n)}
            >
              {n.risk === "HIGH" && (
                <circle cx={p.x} cy={p.y} r={r + 1.6} fill="#C0392B33" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={KIND_COLOR[n.kind]}
                stroke={isSelected ? "#FFFFFF" : "#0D1B2A"}
                strokeWidth={isSelected ? 0.8 : 0.4}
              />
              <text
                x={p.x}
                y={p.y + r + 2.2}
                fontSize={1.9}
                fill="#E4E8EC"
                textAnchor="middle"
                fontWeight={600}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Timeline scrubber */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-[#1E3048] bg-[#0B1420]/90 px-3 py-2 text-[11px] backdrop-blur">
        <button
          type="button"
          aria-label={playing ? "Pause timeline" : "Play timeline"}
          onClick={() => {
            if (cursor >= rangeEnd) setCursor(rangeStart);
            setPlaying((p) => !p);
          }}
          className="rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
        >
          {playing ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </button>
        <MoveHorizontal className="h-3.5 w-3.5 text-white/60" />
        <span className="text-white/70">Timeline</span>
        <input
          type="range"
          min={rangeStart}
          max={rangeEnd}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(+e.target.value);
          }}
          className="flex-1 accent-[color:var(--color-teal)]"
        />
        <span className="type-mono text-white/70">
          t={cursor}/{rangeEnd}
        </span>
        <div className="flex items-center gap-1">
          {(Object.keys(RANGE_WINDOW) as GraphRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded px-2 py-0.5 font-semibold",
                range === r
                  ? "bg-[color:var(--color-teal)] text-white"
                  : "text-white/70 hover:bg-[#172A40]",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
