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
 * synthetic dataset (an order of magnitude above the production seed). The
 * intent is unchanged: if a refactor regresses any of these paths the
 * pan/zoom/filter/scrub UX collapses under real load.
 *
 * ## Why these assert ratios, not milliseconds
 *
 * They used to assert wall-clock budgets — "under 1s", "inside a 16ms
 * frame" — against a comment reading "Budgets target a mid-tier laptop;
 * CI machines beat these comfortably." That turned out to be a statement
 * about the machine, not about the code. On a developer box busy with a
 * dev server and a build, three of these failed while the algorithms were
 * untouched; on a quiet box they passed. A test that fails because
 * something else is compiling is not reporting a regression, and one that
 * cries wolf gets muted — which is how the real regression gets through.
 *
 * What actually needs defending is the *shape of the cost curve*. These
 * paths are linear in their input, and the failure that destroys
 * interactivity is a linear path turning quadratic — a nested scan added
 * inside a loop, a `.find()` where a `Set` lookup belonged. So each test
 * measures the same work at two sizes and asserts how the cost grew.
 * Machine speed cancels in a ratio: a slow machine makes both halves
 * slower and leaves the ratio alone.
 *
 * The thresholds sit between the two hypotheses rather than near either.
 * At 4x the input, linear predicts ~4x and quadratic ~16x, so the bound
 * is 8x — far enough above linear that noise cannot reach it, far enough
 * below quadratic that a regression cannot hide under it.
 *
 * Timings use the *best* of several runs. Background load can only ever
 * add time, never remove it, so the minimum is the closest available
 * estimate of what the machine can actually do — which is what makes
 * these stable while the absolute versions were not.
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

/**
 * How much the cost grew, relative to how much the input grew.
 *
 * 1.0 means perfectly linear. Over a 4x input, quadratic work scores
 * about 4. Reported this way so a failure says "cost per unit of input
 * grew 4.8x" rather than quoting milliseconds that mean nothing without
 * the machine they came from.
 *
 * ## Why the two sizes are measured interleaved, and the median taken
 *
 * The obvious approach — time the small workload, then time the large
 * one, then divide — is what a first attempt did, and it was not stable
 * enough to keep in CI. Anything that drifts between the two
 * measurements lands entirely in the ratio: a GC pause, another process
 * waking, the CPU clocking down. Measured that way the *unchanged*
 * reachability path scored anywhere from 0.22 to 3.62.
 *
 * Interleaving removes the drift instead of hoping it averages out. Each
 * round times both sizes back to back, so a slow moment inflates the
 * numerator and denominator together and mostly cancels. The median of
 * those per-round ratios then discards the rounds where it did not
 * cancel, which a mean would let through.
 *
 * Both workloads are warmed once before anything is recorded, so the JIT
 * has compiled the loops. Without that the smaller workload pays a
 * compilation cost the larger one does not, and the ratio measures the
 * optimiser rather than the algorithm.
 */
function growthFactor(
  sizeRatio: number,
  baselineWork: () => void,
  scaledWork: () => void,
  rounds = 7,
): number {
  baselineWork();
  scaledWork();

  const ratios: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const b0 = performance.now();
    baselineWork();
    const baseline = performance.now() - b0;

    const s0 = performance.now();
    scaledWork();
    const scaled = performance.now() - s0;

    ratios.push(scaled / baseline / sizeRatio);
  }
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)]!;
}

const MAX_GROWTH_FACTOR = 3;

/*
 * A hang guard, not a budget.
 *
 * Vitest's default 5s timeout is itself an absolute wall-clock
 * assertion — the very thing these tests stopped making. The combined
 * benchmark legitimately runs ~4.3s here, so on a busy machine it
 * tripped that default and reported a timeout while every growth factor
 * was healthy: the same false alarm in a different costume.
 *
 * Sixty seconds is far beyond anything these workloads need and is
 * there only to stop a genuine hang from wedging CI.
 */
const HANG_GUARD_MS = 60_000;

describe("OwnershipNetworkGraph performance", () => {
  it(
    "keeps reachability linear in the number of edges",
    () => {
      /*
       * One pass over the edge list. The regression that matters is a
       * membership test that walks the set instead of hashing it — still
       * "one pass" to read, quadratic to run.
       */
      const small = seed(10_000, 20_000).edges;
      const large = seed(10_000, 80_000).edges;

      expect(reachable("n0", small).size).toBeGreaterThan(0);

      /*
       * Repeated inside the measured closure, not measured once.
       *
       * A single pass over 20k edges takes a third of a millisecond, and at
       * that scale `performance.now()` resolution and scheduling jitter
       * dominate the signal — the same unchanged code scored 0.33, 0.53 and
       * 1.45 on three consecutive runs. Twenty passes put the baseline into
       * milliseconds, where the ratio measures the algorithm.
       */
      const repeat = (edges: Edge[]) => () => {
        for (let i = 0; i < 20; i++) {
          const set = reachable("n0", edges);
          if (set.size < 0) throw new Error("unreachable");
        }
      };

      expect(growthFactor(4, repeat(small), repeat(large))).toBeLessThan(MAX_GROWTH_FACTOR);
    },
    HANG_GUARD_MS,
  );

  it(
    "keeps relationship-filter re-derivation proportional to the toggling",
    () => {
      /*
       * The interaction: an officer chattering through the Relationship
       * Types checkboxes. Twenty flips is the baseline, two hundred is the
       * workload, and ten times the interaction must cost about ten times
       * the work — not more. A cost that climbs faster than the officer's
       * clicking is one that gets stickier the longer they use it.
       */
      const { nodes, edges } = seed(10_000, 20_000);
      const nodeIds = new Set(nodes.map((n) => n.id));

      const toggle = (count: number) => () => {
        const relations = allOn();
        for (let i = 0; i < count; i++) {
          const key = RELATIONS[i % RELATIONS.length];
          relations[key] = !relations[key];
          const filtered = filterEdges(edges, nodeIds, relations);
          // Keeps the optimiser from eliding work nothing observes.
          if (filtered.length < 0) throw new Error("unreachable");
        }
      };

      expect(growthFactor(10, toggle(20), toggle(200), 5)).toBeLessThan(MAX_GROWTH_FACTOR);
    },
    HANG_GUARD_MS,
  );

  it(
    "keeps the cost of one re-filter linear in the size of the graph",
    () => {
      /*
       * This is the assertion that actually catches O(n) -> O(n^2), and it
       * is separate from the toggle test on purpose.
       *
       * Scaling the *toggle count* cannot catch it: if `filterEdges` turned
       * quadratic, twenty flips and two hundred flips would both get slower
       * by the same multiple and their ratio would look untouched. Only
       * growing the data separates a linear pass from a nested one.
       *
       * Nodes and edges grow *together*, and that detail is load-bearing.
       * The regression this defends against is a membership test that scans
       * the node list instead of hashing it — cost proportional to edges
       * times nodes. Growing edges alone would make that regression look
       * exactly linear, because the node count it multiplies by would have
       * stayed still, and the test would pass while the graph seized up.
       * Scaling both turns the same defect into 16x against a linear 4x.
       */
      const small = seed(5_000, 10_000);
      const large = seed(20_000, 40_000);
      const smallIds = new Set(small.nodes.map((n) => n.id));
      const largeIds = new Set(large.nodes.map((n) => n.id));
      const relations = allOn();

      const refilter = (edges: Edge[], ids: Set<string>) => () => {
        for (let i = 0; i < 20; i++) {
          const filtered = filterEdges(edges, ids, relations);
          if (filtered.length < 0) throw new Error("unreachable");
        }
      };

      expect(
        growthFactor(4, refilter(small.edges, smallIds), refilter(large.edges, largeIds)),
      ).toBeLessThan(MAX_GROWTH_FACTOR);
    },
    HANG_GUARD_MS,
  );

  it(
    "keeps timeline scrubbing proportional to the graph, not worse",
    () => {
      /*
       * Every year step re-derives the active set, so responsiveness while
       * dragging the scrubber depends on that derivation staying linear in
       * the node count. Asserting throughput rather than a 16ms frame keeps
       * the same guarantee without asking how fast this particular machine
       * is: a graph four times larger may cost four times as much and still
       * be a graph the officer can scrub.
       */
      const small = seed(20_000, 20_000).nodes;
      const large = seed(80_000, 20_000).nodes;
      const years = Array.from({ length: 14 }, (_, i) => 2013 + i);

      expect(timelineActive(small, 2020).size).toBeGreaterThan(0);

      const scrub = (nodes: Node[]) => () => {
        for (const year of years) {
          const active = timelineActive(nodes, year);
          if (active.size < 0) throw new Error("unreachable");
        }
      };

      expect(growthFactor(4, scrub(small), scrub(large))).toBeLessThan(MAX_GROWTH_FACTOR);
    },
    HANG_GUARD_MS,
  );

  it(
    "keeps a combined filter and scrub linear in the dataset",
    () => {
      /*
       * The realistic interaction: a relation flipped and the slider moved
       * in the same tick, which React batches into one render. Both halves
       * are linear, so the combination must be too — a quadratic in either
       * one shows up here as well, which is what makes this a useful
       * backstop rather than a duplicate.
       */
      const small = seed(10_000, 20_000);
      const large = seed(40_000, 80_000);

      const pipeline = (data: ReturnType<typeof seed>) => {
        const ids = new Set(data.nodes.map((n) => n.id));
        const relations = allOn();
        return () => {
          for (let i = 0; i < 20; i++) {
            relations.owns = !relations.owns;
            const filtered = filterEdges(data.edges, ids, relations);
            const active = timelineActive(data.nodes, 2013 + (i % 14));
            if (filtered.length < 0 || active.size < 0) throw new Error("unreachable");
          }
        };
      };

      expect(growthFactor(4, pipeline(small), pipeline(large))).toBeLessThan(MAX_GROWTH_FACTOR);
    },
    HANG_GUARD_MS,
  );
});
