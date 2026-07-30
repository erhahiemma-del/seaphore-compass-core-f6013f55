/**
 * EIE · Knowledge Graph projection.
 *
 * Produces the node/edge view the interactive explorer renders, with
 * expand / collapse, search and type filtering applied. Pure projection —
 * no layout, no DOM, no fetching.
 */
import type { EntityRegistry } from "./registry";
import type { EieEntity, EieEntityType, EieRelationship } from "./types";

export interface GraphViewOptions {
  readonly focusId: string;
  /** Entities whose neighbourhood the officer has expanded. */
  readonly expanded?: ReadonlyArray<string>;
  readonly types?: ReadonlyArray<EieEntityType>;
  readonly query?: string;
  readonly maxNodes?: number;
}

export interface GraphViewNode {
  readonly entity: EieEntity;
  readonly hops: number;
  readonly degree: number;
  /** Neighbours not currently on canvas — the "+N" affordance. */
  readonly hiddenNeighbours: number;
  readonly expanded: boolean;
  readonly matchesQuery: boolean;
}

export interface EntityGraphView {
  readonly nodes: ReadonlyArray<GraphViewNode>;
  readonly edges: ReadonlyArray<EieRelationship>;
  readonly focusId: string;
  readonly truncated: boolean;
}

/**
 * Visible set = focus entity + neighbourhoods of every expanded entity,
 * filtered by type. The focus entity is never filtered out; officers must
 * always see what they opened.
 */
export function buildEntityGraphView(
  registry: EntityRegistry,
  opts: GraphViewOptions,
): EntityGraphView {
  const maxNodes = opts.maxNodes ?? 60;
  const focus = registry.get(opts.focusId);
  if (!focus) return { nodes: [], edges: [], focusId: opts.focusId, truncated: false };

  const expanded = new Set<string>([focus.id, ...(opts.expanded ?? [])]);
  const typeOk = (e: EieEntity): boolean =>
    !opts.types || opts.types.length === 0 || opts.types.includes(e.type);

  const hops = new Map<string, number>([[focus.id, 0]]);
  const frontier: string[] = [focus.id];
  let truncated = false;

  while (frontier.length) {
    const current = frontier.shift()!;
    if (!expanded.has(current)) continue;
    const depth = hops.get(current) ?? 0;
    for (const { entity } of registry.neighbours(current)) {
      if (hops.has(entity.id)) continue;
      if (!typeOk(entity)) continue;
      if (hops.size >= maxNodes) {
        truncated = true;
        break;
      }
      hops.set(entity.id, depth + 1);
      frontier.push(entity.id);
    }
  }

  const visible = new Set(hops.keys());
  const q = (opts.query ?? "").trim().toLowerCase();

  const nodes: GraphViewNode[] = Array.from(visible)
    .map((id) => registry.get(id))
    .filter((e): e is EieEntity => Boolean(e))
    .map((entity) => {
      const neighbours = registry.neighbours(entity.id);
      const hidden = neighbours.filter((n) => !visible.has(n.entity.id)).length;
      return {
        entity,
        hops: hops.get(entity.id) ?? 0,
        degree: neighbours.length,
        hiddenNeighbours: hidden,
        expanded: expanded.has(entity.id),
        matchesQuery:
          q.length > 0 &&
          (entity.label.toLowerCase().includes(q) || entity.id.toLowerCase().includes(q)),
      };
    })
    .sort((a, b) => a.hops - b.hops || a.entity.label.localeCompare(b.entity.label));

  const edges = registry
    .relationships()
    .filter((r) => visible.has(r.sourceId) && visible.has(r.targetId));

  return { nodes, edges, focusId: focus.id, truncated };
}
