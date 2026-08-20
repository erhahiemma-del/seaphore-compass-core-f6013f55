/**
 * Universal intelligence search.
 *
 * Routes through the existing understanding → plan → validate → apply
 * pipeline. It contains no interpretation of its own: the text goes to
 * `understand()`, the understanding to `planMap()`, and the intents
 * through `validateIntents()` before anything touches the map.
 *
 * That chain is the point. A search box that moved the map directly would
 * be a second interpretation engine, and it would bypass the validation
 * boundary that stops an invalid instruction corrupting map state.
 */
import { useCallback, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { layerRegistry, sgs, type SharedGeospatialService } from "@/services/geospatial";
import {
  captureMapContext,
  intentsToStatePatch,
  planMap,
  selectionAsEntity,
  understand,
  validateIntents,
  type IntelligenceMapPlan,
} from "@/services/orchestration";

export interface MapSearchProps {
  readonly service?: SharedGeospatialService;
  /** Notified after a query is applied, for the explanation strip. */
  readonly onApplied?: (plan: IntelligenceMapPlan) => void;
  readonly className?: string;
}

export function MapSearch({ service = sgs, onApplied, className }: MapSearchProps) {
  const [text, setText] = useState("");

  const submit = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length === 0) return;

      const state = service.get();
      const context = captureMapContext(state);

      // The map's selection becomes ambient context, so "why is this
      // vessel here?" resolves without the officer repeating the identity.
      const understanding = understand(trimmed, {
        ambientEntity: selectionAsEntity(state.selection),
      });

      const plan = planMap(understanding, { context });

      // Nothing reaches the map unvalidated, including a plan this
      // component built itself.
      const { accepted } = validateIntents(plan.intents, {
        knownLayerIds: layerRegistry.list().map((layer) => layer.id),
      });

      service.update(intentsToStatePatch(accepted, state));
      onApplied?.(plan);
    },
    [service, onApplied],
  );

  return (
    <form
      role="search"
      aria-label="Intelligence search"
      className={cn("relative min-w-0 flex-1", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit(text);
      }}
    >
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search vessels, ports, areas — or ask a question"
        aria-label="Search vessels, ports, areas, or ask a question"
        data-testid="map-search"
        className="h-8 pl-8 text-[12px]"
      />
    </form>
  );
}
