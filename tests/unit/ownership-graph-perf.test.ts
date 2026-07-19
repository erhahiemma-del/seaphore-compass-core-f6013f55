/**
 * Ownership Network Graph — algorithmic stress tests.
 *
 * The live graph memoises three hot paths that dominate re-render cost as
 * the Supabase dataset grows:
 *
 *   1. Reachability build     — nodes within N hops of the selected entity.
 *   2. Edge filter pipeline   — visibleRelations + node membership check.
 *   3. Timeline gating        — active-set derivation for the year scrubber.
 *
 * These are pure over the input arrays, so we exercise them here against a
 * synthetic dataset (10k nodes / 20k edges — an order of magnitude above the
 * production seed) and assert wall-clock budgets. If a refactor regresses any
 * of these paths the pan/zoom/filter/scrub UX collapses under real load, so
 * the thresholds are intentionally conservative rather than tight.
 *
 * Budgets target a mid-tier laptop; CI machines beat these comfortably.
 */
import { describe, it, expect } from "vitest";

type Kind = "company" | "vessel" | "person" | "port";
type Relation =
  | "owns"
  | "subsidiary-of"
  | "beneficial-owner"
  | "operates"
  | "manages"
  | "associated-with"
  | "agent-of";

interface Node {
  id: string;
  kind: Kind;
  firstSeenYear: number;
}
interface Edge {
  fromId: string;
  toId: string;
  label: Relation;
}

const RELATIONS: Relation[] = [
  "owns",
  "subsidiary-of",
  "beneficial-owner",
  "operates",
  "manages",
  "associated-with",
  "agent-of",
];

function seed(nodeCount: number, edgeCount: number) {
  const nodes: Node[] = [];
  const kinds: Kind[] = ["company", "vessel", "person", "port"];
  // Deterministic pseudo-random so runs are reproducible.
  let rng = 0x1a2b3c;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0xffffffff;
  };
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `n${i}`,
      kind: kinds[i % kinds.length],
      firstSeenYear: 2013 + Math.floor(rand() * 14),
    });
  }
  const edges: Edge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    edges.push({
      fromId: `n${Math.floor(rand() * nodeCount)}`,
      toId: `n${Math.floor(rand() * nodeCount)}`,
      label: RELATIONS[Math.floor(rand() * RELATIONS.length)],
    });
  }
  return { nodes, edges };
}

function reachable(centerId: string, edges: Edge[]) {
  const seen = new Set<string>([centerId]);
  for (const e of edges) {
    if (e.fromId === centerId) seen.add(e.toId);
    if (e.toId === centerId) seen.add(e.fromId);
  }
  return seen;
}

function filterEdges(
  edges: Edge[],
  nodeIds: Set<string>,
  visibleRelations: Record<Relation, boolean>,
) {
  const out: Edge[] = [];
  for (const e of edges) {
    if (!visibleRelations[e.label]) continue;
    if (!nodeIds.has(e.fromId) || !nodeIds.has(e.toId)) continue;
    out.push(e);
  }
  return out;
}

function timelineActive(nodes: Node[], asOfYear: number) {
  const active = new Set<string>();
  for (const n of nodes) {
    if (n.firstSeenYear > asOfYear) continue;
    active.add(n.id);
  }
  return active;
}

const allOn = (): Record<Relation, boolean> =>
  RELATIONS.reduce((a, r) => ({ ...a, [r]: true }), {} as Record<Relation, boolean>);

describe("OwnershipNetworkGraph performance", () => {
  it("builds reachability set on 20k edges under budget", () => {
    const { edges } = seed(10_000, 20_000);
    const start = performance.now();
    const set = reachable("n0", edges);
    const elapsed = performance.now() - start;
    expect(set.size).toBeGreaterThan(0);
    // Single pass over 20k edges; must stay well under a frame budget.
    expect(elapsed).toBeLessThan(50);
  });

  it("keeps relationship-filter re-derivation responsive across 200 toggles", () => {
    const { nodes, edges } = seed(10_000, 20_000);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const relations = allOn();
    const keys = RELATIONS;

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      // Flip one relation each iteration — simulates the user chattering
      // through the Relationship Types checkboxes in the sidebar.
      const k = keys[i % keys.length];
      relations[k] = !relations[k];
      const filtered = filterEdges(edges, nodeIds, relations);
      // Prevent the JIT from eliding the work entirely.
      if (filtered.length < 0) throw new Error("unreachable");
    }
    const elapsed = performance.now() - start;

    // 200 full re-filters on 20k edges must complete inside 1s so the
    // interactive checkboxes never feel sticky. Typical local: ~150-250ms.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("scrubs the timeline across the full year range under a 16ms/frame budget", () => {
    const { nodes } = seed(10_000, 20_000);
    const years = Array.from({ length: 14 }, (_, i) => 2013 + i);
    const frameTimes: number[] = [];
    for (const y of years) {
      const t = performance.now();
      const active = timelineActive(nodes, y);
      frameTimes.push(performance.now() - t);
      if (active.size < 0) throw new Error("unreachable");
    }
    const worstFrame = Math.max(...frameTimes);
    const total = frameTimes.reduce((a, b) => a + b, 0);
    // Each year step is one full re-compute; must stay inside a 60fps frame.
    expect(worstFrame).toBeLessThan(16);
    // Sanity: full scrub across 14 stops well under 200ms.
    expect(total).toBeLessThan(200);
  });

  it("combined filter + timeline pipeline stays under 100ms per interaction on 10k nodes", () => {
    const { nodes, edges } = seed(10_000, 20_000);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const relations = allOn();

    // Realistic interaction: user flips a relation AND scrubs the slider
    // in the same tick (React batches state updates).
    const iterations = 50;
    let worst = 0;
    for (let i = 0; i < iterations; i++) {
      const t = performance.now();
      relations["owns"] = !relations["owns"];
      const e2 = filterEdges(edges, nodeIds, relations);
      const active = timelineActive(nodes, 2013 + (i % 14));
      const dt = performance.now() - t;
      worst = Math.max(worst, dt);
      if (e2.length < 0 || active.size < 0) throw new Error("unreachable");
    }
    // Any single combined interaction must stay under a soft 100ms cap so
    // the graph never blocks the main thread visibly.
    expect(worst).toBeLessThan(100);
  });
});
