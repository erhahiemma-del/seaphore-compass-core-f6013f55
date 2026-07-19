import { useMemo } from "react";
import { COMPANIES, VESSELS, type OwnershipEdge } from "@/lib/intel-centre-data";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";

/** Minimal radial ownership graph for VES-3 / OWN-1. */
export function OwnershipGraph({
  centerId,
  edges,
  height = 300,
}: {
  centerId: string;
  edges: OwnershipEdge[];
  height?: number;
}) {
  const nodeLabel = (id: string) =>
    VESSELS.find((v) => v.id === id)?.name ?? COMPANIES.find((c) => c.id === id)?.name ?? id;

  const nodeKind = (id: string): "vessel" | "company" =>
    VESSELS.some((v) => v.id === id) ? "vessel" : "company";

  const related = useMemo(() => {
    const set = new Set<string>();
    edges.forEach((e) => {
      if (e.fromId === centerId) set.add(e.toId);
      if (e.toId === centerId) set.add(e.fromId);
    });
    return Array.from(set);
  }, [edges, centerId]);

  const cx = 260,
    cy = height / 2,
    R = Math.min(220, height / 2 - 40);
  const positions = new Map<string, { x: number; y: number }>();
  positions.set(centerId, { x: cx, y: cy });
  related.forEach((id, i) => {
    const angle = (i / Math.max(1, related.length)) * Math.PI * 2 - Math.PI / 2;
    positions.set(id, { x: cx + Math.cos(angle) * R, y: cy + Math.sin(angle) * R });
  });

  const shown = edges.filter((e) => positions.has(e.fromId) && positions.has(e.toId));

  const edgeColour = (c: OwnershipEdge["confidence"]) =>
    c === "verified"
      ? "#1E6B3A"
      : c === "observed"
        ? "#2563EB"
        : c === "inferred"
          ? "#B06A00"
          : "#5A6B7B";

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="rounded-md border border-line/60 bg-surface/40" style={{ height }}>
        <svg viewBox={`0 0 520 ${height}`} className="h-full w-full">
          {shown.map((e, i) => {
            const a = positions.get(e.fromId)!;
            const b = positions.get(e.toId)!;
            return (
              <g key={i}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edgeColour(e.confidence)}
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray={e.confidence === "inferred" ? "4 3" : undefined}
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  fill="#5A6B7B"
                  fontSize={9}
                >
                  {e.label}
                </text>
              </g>
            );
          })}
          {Array.from(positions.entries()).map(([id, p]) => {
            const isCenter = id === centerId;
            const kind = nodeKind(id);
            const fill = isCenter ? "#2563EB" : kind === "vessel" ? "#0F1A2A" : "#1A2438";
            const stroke = isCenter ? "#7DB8FF" : kind === "vessel" ? "#2563EB" : "#5A6B7B";
            return (
              <g key={id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isCenter ? 22 : 16}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fill="#E4E8EC"
                  fontSize={9}
                  fontWeight={700}
                >
                  {kind === "vessel" ? "VSL" : "CO"}
                </text>
                <text
                  x={p.x}
                  y={p.y + (isCenter ? 40 : 32)}
                  textAnchor="middle"
                  fill="#B7C0C8"
                  fontSize={10}
                >
                  {truncate(nodeLabel(id), 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
          Edges
        </div>
        <ul className="space-y-1.5 text-[11px]">
          {shown.map((e, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-2 rounded border border-line/50 bg-surface/50 p-2"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground/90">
                  {truncate(nodeLabel(e.fromId), 16)} <span className="text-slate">·</span>{" "}
                  {e.label}
                </div>
                <div className="truncate text-slate">→ {truncate(nodeLabel(e.toId), 20)}</div>
                <div className="mt-0.5 truncate text-[10px] text-slate">{e.sourceNote}</div>
              </div>
              <ConfidenceChip tier={e.confidence} size={9} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
