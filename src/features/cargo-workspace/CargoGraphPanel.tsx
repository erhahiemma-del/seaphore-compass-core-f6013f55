/**
 * SPRINT CAP-03 — Cargo Knowledge Graph officer projection.
 *
 * The graph is a backend intelligence artefact, so the Golden Rule
 * requires it be visible to the officer. This panel projects the graph
 * operations for the focused entity: the evidenced chain, related
 * entities, relationship paths and the reconstructed timeline — each with
 * its provenance. Nothing here is inferred; gaps are named.
 */
import { useMemo, useState } from "react";
import { Network, Share2 } from "lucide-react";

import { PanelCard } from "@/components/panel-card";
import { useCargoGraph } from "./use-cargo-graph";
import {
  CARGO_ROLE_LABEL,
  type CargoInvestigationContext,
} from "@/services/cargo-graph";

const TABS = [
  { key: "chain", label: "Cargo chain" },
  { key: "related", label: "Related entities" },
  { key: "paths", label: "Relationship paths" },
  { key: "timeline", label: "Timeline" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CargoGraphPanel({ focusId }: { focusId: string | null }) {
  const { facade, stats, empty } = useCargoGraph();
  const [tab, setTab] = useState<TabKey>("chain");

  const resolvedFocus = useMemo(() => {
    if (!facade) return null;
    if (focusId && facade.query.node(focusId)) return focusId;
    // Fall back to a deterministic node so the panel is useful without
    // the officer needing to know canonical ids.
    const nodes = [...facade.query.graph.allNodes()].sort((a, b) => a.id.localeCompare(b.id));
    return nodes.length > 0 ? nodes[0].id : null;
  }, [facade, focusId]);

  const answer = useMemo(
    () => (facade && resolvedFocus ? facade.context(resolvedFocus) : null),
    [facade, resolvedFocus],
  );
  const ctx = (answer?.data ?? null) as CargoInvestigationContext | null;
  const traversal = useMemo(
    () => (facade && resolvedFocus ? facade.traverse(resolvedFocus, 3) : null),
    [facade, resolvedFocus],
  );

  return (
    <PanelCard>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="type-h6 font-semibold text-foreground">Cargo Knowledge Graph</h3>
          <p className="type-small text-slate">
            {stats
              ? `${stats.nodes} entities · ${stats.edges} evidenced relationships · ${stats.evidenceRecords} evidence records`
              : "Built from the Canonical UIP only"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "rounded-md bg-surface-3 px-2 py-1 text-[11.5px] font-semibold text-foreground"
                  : "rounded-md px-2 py-1 text-[11.5px] text-slate hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {empty || !ctx || !ctx.focus ? (
        <p className="flex items-start gap-2 type-small text-slate">
          <Network className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          No cargo relationships can be drawn: the Canonical UIP carries no cargo evidence for this
          centre in the current session. The graph reports the absence rather than inferring a
          chain.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="type-small text-slate">
            Focus: <span className="text-foreground">{ctx.focus.label}</span> · weakest supporting
            grade {ctx.grade} · {ctx.evidenceCount} evidence record
            {ctx.evidenceCount === 1 ? "" : "s"}
          </p>

          {tab === "chain" ? (
            <ul className="space-y-1">
              {ctx.chain.map((step) => (
                <li
                  key={step.role}
                  className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface-2 px-2.5 py-1.5"
                >
                  <span className="type-small font-semibold text-foreground">
                    {CARGO_ROLE_LABEL[step.role]}
                  </span>
                  <span className="type-small text-right text-slate">
                    {step.missing
                      ? "No evidence — reported, not inferred"
                      : step.nodes
                          .map((n) => n.label)
                          .slice(0, 4)
                          .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "related" ? (
            <ul className="space-y-1">
              {ctx.related.slice(0, 12).map((r) => (
                <li
                  key={r.node.id}
                  className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-small font-semibold text-foreground">
                      {CARGO_ROLE_LABEL[r.node.role]} · {r.node.label}
                    </span>
                    <span className="type-small text-slate">{r.grade}</span>
                  </div>
                  <p className="type-small text-slate">{r.reason}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "paths" ? (
            <ul className="space-y-1">
              {(traversal?.lines ?? []).slice(1, 13).map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 type-small text-foreground/85"
                >
                  <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                  {line}
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "timeline" ? (
            <ol className="space-y-1">
              {ctx.timeline.slice(0, 14).map((e, i) => (
                <li
                  key={`${e.at}-${e.nodeId}-${i}`}
                  className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-small font-semibold text-foreground">{e.label}</span>
                    <span className="type-small text-slate">
                      {e.at.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <p className="type-small text-slate">
                    {e.description} · {e.grade}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}

          {ctx.gaps.length > 0 ? (
            <p className="type-small text-slate">
              Chain gaps: {ctx.gaps.map((g) => CARGO_ROLE_LABEL[g]).join(", ")}.
            </p>
          ) : null}

          {answer && answer.citations.length > 0 ? (
            <p className="type-small text-slate">
              {answer.citations.length} evidence citation
              {answer.citations.length === 1 ? "" : "s"} back this view. System recommends; officer
              decides.
            </p>
          ) : null}
        </div>
      )}
    </PanelCard>
  );
}
