import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RefreshCw, Radio } from "lucide-react";

import { COMPANIES, VESSELS, OWNERSHIP_EDGES, type OwnershipEdge, PORTS } from "@/lib/intel-centre-data";
import { PERSONS } from "./ownership-data";
import { cn } from "@/lib/utils";

export type GraphLayout = "force" | "radial" | "hierarchy" | "timeline";
export type GraphNodeKind = "company" | "vessel" | "person" | "port";

export interface GraphNode {
  id: string;
  label: string;
  sub?: string;
  kind: GraphNodeKind;
  x: number;
  y: number;
}

/**
 * Reactive ownership network graph.
 *
 * Supports layout switching (force / radial / hierarchy / timeline),
 * pan + zoom, entity-type filters, live scrubbing across the timeline
 * and click-to-select. Runs entirely on the mock ownership dataset —
 * a repository-driven adapter can slot in without changing this shape.
 */
export function OwnershipNetworkGraph({
  centerId,
  layout,
  visibleKinds,
  visibleRelations,
  asOfYear,
  onSelect,
  live = true,
}: {
  centerId: string;
  layout: GraphLayout;
  visibleKinds: Record<GraphNodeKind, boolean>;
  visibleRelations: Record<OwnershipEdge["label"], boolean>;
  asOfYear: number;
  onSelect?: (id: string) => void;
  live?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // ------------------------------------------------------------
  // Build graph — nodes reachable from centerId within N hops.
  // ------------------------------------------------------------
  const nodes = useMemo<GraphNode[]>(() => {
    const seen = new Set<string>([centerId]);
    OWNERSHIP_EDGES.forEach((e) => {
      if (e.fromId === centerId) seen.add(e.toId);
      if (e.toId === centerId) seen.add(e.fromId);
    });
    // Add persons attached to the center company
    PERSONS.filter((p) => p.companyId === centerId).forEach((p) => seen.add(p.id));
    // Add ports reached by vessels linked in graph
    Array.from(seen).forEach((id) => {
      const v = VESSELS.find((x) => x.id === id);
      if (v) {
        const port = PORTS.find((p) => p.code === v.destinationPort);
        if (port) seen.add(`port-${port.code}`);
      }
    });

    const kindOf = (id: string): GraphNodeKind => {
      if (id.startsWith("port-")) return "port";
      if (PERSONS.some((p) => p.id === id)) return "person";
      if (VESSELS.some((v) => v.id === id)) return "vessel";
      return "company";
    };
    const labelOf = (id: string) => {
      if (id.startsWith("port-")) {
        const port = PORTS.find((p) => `port-${p.code}` === id);
        return port?.name ?? id;
      }
      return (
        COMPANIES.find((c) => c.id === id)?.name ??
        VESSELS.find((v) => v.id === id)?.name ??
        PERSONS.find((p) => p.id === id)?.name ??
        id
      );
    };
    const subOf = (id: string) => {
      const p = PERSONS.find((x) => x.id === id);
      if (p) return `(${p.role})`;
      const v = VESSELS.find((x) => x.id === id);
      if (v) return `IMO ${v.imo}`;
      const c = COMPANIES.find((x) => x.id === id);
      if (c) return c.role;
      return undefined;
    };

    const list = Array.from(seen)
      .filter((id) => visibleKinds[kindOf(id)])
      .map<GraphNode>((id) => ({
        id,
        label: labelOf(id),
        sub: subOf(id),
        kind: kindOf(id),
        x: 0,
        y: 0,
      }));

    layoutNodes(list, centerId, layout);
    return list;
  }, [centerId, layout, visibleKinds]);

  const edges = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const base = OWNERSHIP_EDGES.filter(
      (e) => visibleRelations[e.label] && nodeIds.has(e.fromId) && nodeIds.has(e.toId),
    );
    // Person -> Company beneficial edges
    PERSONS.forEach((p) => {
      if (!nodeIds.has(p.id) || !nodeIds.has(p.companyId)) return;
      if (!visibleRelations["beneficial-owner"] && p.role === "Beneficial Owner") return;
      const label = (p.role === "Director"
        ? "manages"
        : p.role === "Shareholder"
          ? "beneficial-owner"
          : "beneficial-owner") as OwnershipEdge["label"];
      if (!visibleRelations[label]) return;
      base.push({
        fromId: p.id,
        toId: p.companyId,
        label,
        confidence: p.verified,
        sourceNote: `${p.role}${p.stakePct ? ` · ${p.stakePct}%` : ""}`,
      });
    });
    return base;
  }, [nodes, visibleRelations]);

  // Timeline filter — hide nodes/edges whose first-seen date is after asOfYear.
  const timeFiltered = useMemo(() => {
    const active = new Set<string>();
    nodes.forEach((n) => {
      const p = PERSONS.find((x) => x.id === n.id);
      if (p && new Date(p.firstSeen).getFullYear() > asOfYear) return;
      active.add(n.id);
    });
    return active;
  }, [nodes, asOfYear]);

  // Pan handlers
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const down = (ev: MouseEvent) => {
      dragRef.current = { x: ev.clientX - pan.x, y: ev.clientY - pan.y };
    };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPan({ x: ev.clientX - dragRef.current.x, y: ev.clientY - dragRef.current.y });
    };
    const up = () => {
      dragRef.current = null;
    };
    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [pan.x, pan.y]);

  const nodeFill = (n: GraphNode, active: boolean) => {
    if (!active) return "#1A2438";
    if (n.id === centerId) return "#2563EB";
    switch (n.kind) {
      case "vessel":  return "#0B4C8F";
      case "person":  return "#6D4AB2";
      case "port":    return "#1E6B3A";
      default:        return "#274063";
    }
  };
  const nodeStroke = (n: GraphNode, active: boolean) => {
    if (!active) return "#33445E";
    if (n.id === centerId) return "#7DB8FF";
    switch (n.kind) {
      case "vessel":  return "#7DB8FF";
      case "person":  return "#C9B3FF";
      case "port":    return "#8FE0A9";
      default:        return "#8FA5C1";
    }
  };
  const edgeStroke = (c: OwnershipEdge["confidence"]) =>
    c === "verified" ? "#1E6B3A" : c === "observed" ? "#2563EB" : c === "inferred" ? "#B06A00" : "#5A6B7B";

  const viewW = 900, viewH = 460;

  return (
    <div className="relative overflow-hidden rounded-md border border-line/60 bg-[#050D1A]">
      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-between p-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-line/60 bg-surface/80 px-2 py-1 text-[10.5px] text-slate">
          {live && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-green)]" />
              <span className="font-semibold uppercase tracking-[0.06em] text-[color:var(--color-green)]">Live</span>
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex flex-col gap-1">
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))} className="rounded border border-line/60 bg-surface/80 p-1 text-slate hover:text-foreground" aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))} className="rounded border border-line/60 bg-surface/80 p-1 text-slate hover:text-foreground" aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="rounded border border-line/60 bg-surface/80 p-1 text-slate hover:text-foreground"
            aria-label="Fit view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded border border-line/60 bg-surface/80 p-1 text-slate hover:text-foreground" aria-label="Reset">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative h-[460px] w-full cursor-grab active:cursor-grabbing">
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-full w-full select-none" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="og-bg" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#0A1729" />
              <stop offset="100%" stopColor="#050D1A" />
            </radialGradient>
            <marker id="og-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#5A6B7B" />
            </marker>
          </defs>
          <rect width={viewW} height={viewH} fill="url(#og-bg)" />
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map((e, i) => {
              const a = nodes.find((n) => n.id === e.fromId);
              const b = nodes.find((n) => n.id === e.toId);
              if (!a || !b) return null;
              const active = timeFiltered.has(a.id) && timeFiltered.has(b.id);
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={`${e.fromId}-${e.toId}-${i}`} opacity={active ? 0.85 : 0.15}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={edgeStroke(e.confidence)}
                    strokeWidth={1.4}
                    strokeDasharray={e.confidence === "inferred" ? "5 3" : undefined}
                    markerEnd="url(#og-arrow)"
                  />
                  <text x={mx} y={my - 4} textAnchor="middle" fill="#6E8098" fontSize={8.5}>
                    {edgeShort(e.label)}{e.sourceNote.includes("%") ? " " + e.sourceNote.match(/\d+%/)?.[0] : ""}
                  </text>
                </g>
              );
            })}
            {nodes.map((n) => {
              const active = timeFiltered.has(n.id);
              const isCenter = n.id === centerId;
              const r = isCenter ? 26 : n.kind === "person" ? 16 : 18;
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`} onClick={() => onSelect?.(n.id)} className="cursor-pointer">
                  <circle r={r + 4} fill={nodeStroke(n, active)} opacity={active ? 0.18 : 0.06} />
                  <circle r={r} fill={nodeFill(n, active)} stroke={nodeStroke(n, active)} strokeWidth={isCenter ? 2 : 1.2} />
                  <text y={4} textAnchor="middle" fill={active ? "#E4E8EC" : "#33445E"} fontSize={9} fontWeight={700}>
                    {abbrev(n.kind)}
                  </text>
                  <text y={r + 12} textAnchor="middle" fill={active ? "#B7C0C8" : "#33445E"} fontSize={9.5}>
                    {truncate(n.label, isCenter ? 28 : 22)}
                  </text>
                  {n.sub && (
                    <text y={r + 22} textAnchor="middle" fill="#5A6B7B" fontSize={8.5}>
                      {truncate(n.sub, 26)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <MiniMap nodes={nodes} pan={pan} zoom={zoom} viewW={viewW} viewH={viewH} />
    </div>
  );
}

function MiniMap({
  nodes, pan, zoom, viewW, viewH,
}: { nodes: GraphNode[]; pan: { x: number; y: number }; zoom: number; viewW: number; viewH: number }) {
  const w = 130, h = 90;
  const sx = w / viewW, sy = h / viewH;
  return (
    <div className="absolute bottom-2 right-2 rounded-md border border-line/60 bg-surface/80 p-1">
      <svg width={w} height={h}>
        <rect width={w} height={h} fill="#0A1729" />
        {nodes.map((n) => (
          <circle key={n.id} cx={n.x * sx + pan.x * sx * zoom} cy={n.y * sy + pan.y * sy * zoom} r={1.6} fill="#7DB8FF" opacity={0.9} />
        ))}
        <rect x={-pan.x * sx / zoom} y={-pan.y * sy / zoom} width={w / zoom} height={h / zoom} fill="none" stroke="#7DB8FF" strokeOpacity={0.6} />
      </svg>
    </div>
  );
}

function layoutNodes(list: GraphNode[], centerId: string, layout: GraphLayout) {
  const cx = 450, cy = 230;
  const center = list.find((n) => n.id === centerId);
  if (center) { center.x = cx; center.y = cy; }
  const others = list.filter((n) => n.id !== centerId);

  if (layout === "radial" || layout === "force") {
    const R = 190;
    others.forEach((n, i) => {
      const angle = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
      n.x = cx + Math.cos(angle) * R + (layout === "force" ? Math.sin(i * 3.7) * 12 : 0);
      n.y = cy + Math.sin(angle) * R + (layout === "force" ? Math.cos(i * 2.9) * 12 : 0);
    });
    return;
  }
  if (layout === "hierarchy") {
    const buckets: Record<GraphNodeKind, GraphNode[]> = { company: [], vessel: [], person: [], port: [] };
    others.forEach((n) => buckets[n.kind].push(n));
    const cols: [GraphNodeKind, number][] = [
      ["person", 130],
      ["company", 320],
      ["vessel", 580],
      ["port", 810],
    ];
    cols.forEach(([kind, x]) => {
      const group = buckets[kind];
      const gap = 340 / (group.length + 1);
      group.forEach((n, i) => {
        n.x = x;
        n.y = 60 + (i + 1) * gap;
      });
    });
    if (center) { center.x = 450; center.y = 230; }
    return;
  }
  // timeline
  const spanX = 720, startX = 90;
  others
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach((n, i, arr) => {
      n.x = startX + (i / Math.max(1, arr.length - 1)) * spanX;
      n.y = 100 + (i % 3) * 100;
    });
  if (center) { center.x = 450; center.y = 260; }
}

function abbrev(k: GraphNodeKind) {
  return k === "vessel" ? "VSL" : k === "person" ? "PER" : k === "port" ? "PRT" : "CO";
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function edgeShort(l: OwnershipEdge["label"]) {
  return l === "beneficial-owner"
    ? "Beneficial Owner"
    : l === "agent-of"
      ? "Agent"
      : l === "associated-with"
        ? "Associated"
        : l === "subsidiary-of"
          ? "Subsidiary"
          : l.charAt(0).toUpperCase() + l.slice(1);
}

// Re-export layout name helper for the toolbar
export const LAYOUTS: { key: GraphLayout; label: string }[] = [
  { key: "force",     label: "Force Directed" },
  { key: "radial",    label: "Radial" },
  { key: "hierarchy", label: "Hierarchy" },
  { key: "timeline",  label: "Timeline" },
];

export { Radio as LiveIcon };
