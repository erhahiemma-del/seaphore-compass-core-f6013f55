import { useMemo, useState } from "react";
import { Filter, Layers, Maximize2, Minus, MoveHorizontal, Plus } from "lucide-react";

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

const RELATIONSHIP_TYPES = [
  "owns",
  "operates",
  "beneficial owner",
  "director of",
  "consignee",
  "manifested on",
  "declares",
  "AIS blackout",
  "declared arrival",
  "prior port",
];

export type GraphLayout = "Force" | "Radial" | "Hierarchy";

/**
 * INV-4 / INV-5 / MEM-3 knowledge graph — dark-mode, interactive.
 * SVG is static-layout but nodes are clickable and edges show labels.
 */
export function KnowledgeGraph({
  nodes,
  edges,
  className,
  onNodeClick,
  height = 420,
  minimap = false,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (n: GraphNode) => void;
  className?: string;
  height?: number;
  minimap?: boolean;
}) {
  const [layout, setLayout] = useState<GraphLayout>("Force");
  const [zoom, setZoom] = useState(1);
  const [activeKinds, setActiveKinds] = useState<Set<GraphNodeKind>>(
    new Set(Object.keys(KIND_COLOR) as GraphNodeKind[]),
  );
  const [range, setRange] = useState<"1D" | "7D" | "30D" | "All">("30D");
  const [confidenceFilter, setConfidenceFilter] = useState(30);
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => activeKinds.has(n.kind)),
    [nodes, activeKinds],
  );
  const visibleEdges = useMemo(
    () =>
      edges.filter((e) => {
        const from = visibleNodes.find((n) => n.id === e.from);
        const to = visibleNodes.find((n) => n.id === e.to);
        return from && to;
      }),
    [edges, visibleNodes],
  );

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

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
        <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-bold uppercase tracking-[0.06em]"
          style={{ color: "#1E6B3A", backgroundColor: "#1E6B3A26" }}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1E6B3A]" />
          LIVE
        </span>
        <span className="text-white/80">
          Displaying <b>{visibleNodes.length}</b> entities,{" "}
          <b>{visibleEdges.length}</b> relationships
        </span>
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
            className="ml-2 rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded border border-[#1E3048] bg-[#132032] p-1 hover:bg-[#172A40]"
            onClick={() => setZoom(1)}
          >
            <Maximize2 className="h-3 w-3" />
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
        <div className="mb-1 font-semibold text-white/80">Relationship types</div>
        <div className="max-h-24 space-y-0.5 overflow-auto pr-1">
          {RELATIONSHIP_TYPES.slice(0, 6).map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-white/60">
              <input type="checkbox" defaultChecked />
              {r}
            </label>
          ))}
        </div>
        <div className="mt-2 border-t border-[#1E3048] pt-2">
          <div className="mb-1 flex items-center justify-between font-semibold text-white/80">
            <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> Confidence ≥</span>
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
              <div key={k} className="flex items-center gap-1.5 text-white/70">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: KIND_COLOR[k] }} />
                {KIND_LABEL[k]}
              </div>
            ))}
          </div>
        </div>
        {minimap && (
          <div className="rounded-md border border-[#1E3048] bg-[#0B1420]/95 p-1 backdrop-blur">
            <div className="mb-1 px-1 text-[10px] font-semibold text-white/60">Minimap</div>
            <svg viewBox="0 0 100 100" className="h-16 w-full">
              {visibleEdges.map((e, i) => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1E3048" strokeWidth={0.5} />;
              })}
              {visibleNodes.map((n) => (
                <circle key={n.id} cx={n.x} cy={n.y} r={1.5} fill={KIND_COLOR[n.kind]} />
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* Graph canvas */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block"
        style={{ height: height - 96, width: "100%", transform: `scale(${zoom})`, transition: "transform 200ms" }}
      >
        {/* subtle grid */}
        <defs>
          <pattern id="kg-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 L0 0 L0 10" fill="none" stroke="#152944" strokeWidth="0.15" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#kg-grid)" />

        {visibleEdges.map((e, i) => {
          const a = nodeById.get(e.from)!;
          const b = nodeById.get(e.to)!;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#2C4360"
                strokeWidth={0.35}
              />
              <text
                x={mx}
                y={my - 0.5}
                fontSize={1.6}
                fill="#7B8CA0"
                textAnchor="middle"
              >
                {e.label}
              </text>
            </g>
          );
        })}

        {visibleNodes.map((n) => {
          const isSelected = n.id === selectedId;
          const r = n.kind === "vessel" ? 3.2 : n.kind === "company" ? 2.8 : 2.2;
          return (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => {
                setSelectedId(n.id);
                onNodeClick?.(n);
              }}
            >
              {n.risk === "HIGH" && (
                <circle cx={n.x} cy={n.y} r={r + 1.6} fill="#C0392B33" />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={KIND_COLOR[n.kind]}
                stroke={isSelected ? "#FFFFFF" : "#0D1B2A"}
                strokeWidth={isSelected ? 0.8 : 0.4}
              />
              <text
                x={n.x}
                y={n.y + r + 2.2}
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
        <MoveHorizontal className="h-3.5 w-3.5 text-white/60" />
        <span className="text-white/70">Timeline</span>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={70}
          className="flex-1 accent-[color:var(--color-teal)]"
        />
        <div className="flex items-center gap-1">
          {(["1D", "7D", "30D", "All"] as const).map((r) => (
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
}
