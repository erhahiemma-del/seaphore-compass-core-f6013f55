/**
 * MKG — Interactive graph visualisation.
 *
 * Lightweight, dependency-free SVG renderer. Uses a deterministic radial
 * layout centred on the selected node: hop distance = ring radius, so
 * traversal depth is visually obvious. Every node click expands its
 * neighbourhood; every edge is labelled with its OC-001 grade.
 *
 * This is a projection surface, not a scientific viz — it exists so
 * officers can see how the intelligence connects, not to run large-scale
 * network analytics. Ships with the Golden Rule caption baked in.
 */
import { useMemo, useState } from "react";
import type { MkgEdge, MkgNode, MkgNodeKind } from "@/services/mkg/types";
import { cn } from "@/lib/utils";

const KIND_COLOR: Record<MkgNodeKind, string> = {
  vessel: "hsl(var(--primary))",
  company: "hsl(var(--accent))",
  person: "hsl(var(--secondary))",
  port: "hsl(var(--muted-foreground))",
  cargo: "hsl(var(--warning, 45 90% 50%))",
  voyage: "hsl(var(--info, 200 90% 55%))",
  manifest: "hsl(var(--muted-foreground))",
  sanction: "hsl(var(--destructive))",
  inspection: "hsl(var(--muted-foreground))",
  incident: "hsl(var(--destructive))",
};

const GRADE_STROKE: Record<string, string> = {
  VERIFIED: "hsl(var(--primary))",
  CORROBORATED: "hsl(var(--primary))",
  OBSERVED: "hsl(var(--muted-foreground))",
  REPORTED: "hsl(var(--muted-foreground))",
  INFERRED: "hsl(var(--warning, 45 90% 50%))",
  UNKNOWN: "hsl(var(--muted-foreground))",
};

interface GraphViewProps {
  readonly nodes: ReadonlyArray<MkgNode>;
  readonly edges: ReadonlyArray<MkgEdge>;
  readonly focusNodeId?: string;
  readonly onSelectNode?: (id: string) => void;
  readonly selectedNodeId?: string;
}

interface Placed {
  id: string;
  x: number;
  y: number;
  ring: number;
  node: MkgNode;
}

/** Deterministic radial layout: BFS from `focusNodeId` (or the highest-
 *  degree node when unset). Ring n = nodes n hops from the centre. */
function layout(
  nodes: ReadonlyArray<MkgNode>,
  edges: ReadonlyArray<MkgEdge>,
  focusId: string | undefined,
  width: number,
  height: number,
): Placed[] {
  if (nodes.length === 0) return [];
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.fromId)?.add(e.toId);
    adj.get(e.toId)?.add(e.fromId);
  }
  const start =
    focusId && adj.has(focusId)
      ? focusId
      : nodes.slice().sort((a, b) => (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0))[0].id;

  const ring = new Map<string, number>();
  ring.set(start, 0);
  const queue: string[] = [start];
  while (queue.length) {
    const n = queue.shift()!;
    for (const nbr of adj.get(n) ?? []) {
      if (!ring.has(nbr)) {
        ring.set(nbr, (ring.get(n) ?? 0) + 1);
        queue.push(nbr);
      }
    }
  }
  // Anything unreachable → outermost ring.
  let maxRing = 0;
  for (const r of ring.values()) maxRing = Math.max(maxRing, r);
  for (const n of nodes) if (!ring.has(n.id)) ring.set(n.id, maxRing + 1);
  maxRing = Math.max(maxRing, 1);

  const byRing = new Map<number, MkgNode[]>();
  for (const n of nodes) {
    const r = ring.get(n.id) ?? 0;
    const arr = byRing.get(r) ?? [];
    arr.push(n);
    byRing.set(r, arr);
  }
  const cx = width / 2;
  const cy = height / 2;
  const rMax = Math.min(width, height) / 2 - 40;
  const placed: Placed[] = [];
  for (const [r, arr] of byRing) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
    const radius = r === 0 ? 0 : (r / (maxRing + 1)) * rMax;
    const count = arr.length;
    for (let i = 0; i < count; i += 1) {
      const angle = count === 1 && r === 0 ? 0 : (i / count) * Math.PI * 2 + r * 0.35;
      placed.push({
        id: arr[i].id,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        ring: r,
        node: arr[i],
      });
    }
  }
  return placed;
}

export function GraphView({
  nodes,
  edges,
  focusNodeId,
  selectedNodeId,
  onSelectNode,
}: GraphViewProps) {
  const [hover, setHover] = useState<string | null>(null);
  const width = 720;
  const height = 560;

  const placed = useMemo(
    () => layout(nodes, edges, focusNodeId ?? selectedNodeId, width, height),
    [nodes, edges, focusNodeId, selectedNodeId],
  );
  const byId = useMemo(() => {
    const m = new Map<string, Placed>();
    for (const p of placed) m.set(p.id, p);
    return m;
  }, [placed]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[560px] w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-xs text-muted-foreground">
        Graph is empty. Run an intelligence query to populate the Maritime Knowledge Graph.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[560px] w-full rounded-lg border border-border/60 bg-card"
        role="img"
        aria-label="Maritime Knowledge Graph visualisation"
      >
        {/* Edges */}
        <g>
          {edges.map((e) => {
            const a = byId.get(e.fromId);
            const b = byId.get(e.toId);
            if (!a || !b) return null;
            const highlighted =
              hover === e.id || selectedNodeId === e.fromId || selectedNodeId === e.toId;
            return (
              <g key={e.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={GRADE_STROKE[e.grade] ?? "hsl(var(--muted-foreground))"}
                  strokeWidth={highlighted ? 2.2 : 1}
                  strokeDasharray={e.type === "ALIAS_OF" ? "4 3" : undefined}
                  opacity={highlighted ? 0.95 : 0.55}
                  onMouseEnter={() => setHover(e.id)}
                  onMouseLeave={() => setHover(null)}
                />
                {highlighted ? (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 4}
                    fontSize={10}
                    textAnchor="middle"
                    fill="hsl(var(--foreground))"
                    className="pointer-events-none select-none"
                  >
                    {e.type} · {e.grade}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
        {/* Nodes */}
        <g>
          {placed.map((p) => {
            const selected = p.id === selectedNodeId;
            const color = KIND_COLOR[p.node.kind] ?? "hsl(var(--muted-foreground))";
            return (
              <g
                key={p.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                onClick={() => onSelectNode?.(p.id)}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
              >
                <circle
                  r={selected ? 12 : 8}
                  fill={color}
                  stroke={selected ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                  strokeWidth={selected ? 2.5 : 1}
                  opacity={p.node.hasContradictions ? 0.75 : 1}
                />
                {p.node.hasContradictions ? (
                  <circle
                    r={14}
                    fill="none"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={1.2}
                    strokeDasharray="3 2"
                  />
                ) : null}
                <text
                  y={-14}
                  fontSize={10}
                  textAnchor="middle"
                  fill="hsl(var(--foreground))"
                  className="pointer-events-none select-none"
                >
                  {p.node.label.length > 22 ? `${p.node.label.slice(0, 21)}…` : p.node.label}
                </text>
                <text
                  y={22}
                  fontSize={9}
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  className="pointer-events-none select-none uppercase tracking-wide"
                >
                  {p.node.kind} · {p.node.grade}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute right-3 top-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {(
          ["vessel", "company", "person", "port", "cargo", "sanction", "voyage"] as MkgNodeKind[]
        ).map((k) => (
          <span
            key={k}
            className={cn(
              "flex items-center gap-1 rounded-md border border-border/50 bg-card/80 px-2 py-0.5",
            )}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: KIND_COLOR[k] }}
            />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

export default GraphView;
