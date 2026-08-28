/**
 * Maritime Command search — one input for finding, asking and instructing.
 *
 * The panel holds no intelligence of its own. It calls `understand`,
 * renders what came back, and hands any instruction to
 * `executeCopilotAction`. That is the whole architecture: a client of
 * the engine, not another one.
 *
 * ## Understood as
 *
 * The interpretation card is rendered from the `QueryUnderstanding`
 * itself — its intent, its scope, its time window. Writing a separate
 * sentence describing what the engine "probably" did would be a second
 * account of the same event, and the two would drift.
 *
 * ## Only categories with a source behind them
 *
 * Vessels and places. Companies, alerts and reports are not offered,
 * because nothing in this deployment can answer them and a tab that
 * always returns nothing teaches an officer to distrust the ones that
 * work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Anchor, Search, Ship, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { executeCopilotAction } from "@/services/copilot/copilot-actions";
import type { ResolvableVessel } from "@/services/copilot/copilot-conversation";
import {
  layerRegistry,
  sgs,
  type SharedGeospatialService,
  type Vessel,
} from "@/services/geospatial";
import { eezRingIfLoaded } from "@/services/geospatial/eez-ring";
import {
  captureMapContext,
  intentsToStatePatch,
  planMap,
  validateIntents,
  type IntelligenceMapPlan,
} from "@/services/orchestration";

import {
  CATEGORY_LABEL,
  SEARCH_CATEGORIES,
  clearRecent,
  readQuery,
  readRecent,
  rememberSearch,
  type RecentSearch,
  type SearchCategory,
  type SearchHit,
} from "./search-state";

export interface MaritimeSearchProps {
  readonly service?: SharedGeospatialService;
  readonly vessels?: readonly ResolvableVessel[];
  /** Notified after a question is applied, for the explanation strip. */
  readonly onApplied?: (plan: IntelligenceMapPlan) => void;
  readonly className?: string;
}

export function MaritimeSearch({
  service = sgs,
  vessels = [],
  onApplied,
  className,
}: MaritimeSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SearchCategory>("all");
  const [recent, setRecent] = useState<readonly RecentSearch[]>([]);
  const [outcome, setOutcome] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRecent(readRecent()), []);

  const reading = useMemo(
    () => (open ? readQuery(query, vessels, category) : null),
    [open, query, vessels, category],
  );

  /**
   * Carry out whatever the query resolved to.
   *
   * Always through the dispatcher, never by touching the map. A search
   * box that called `select` directly would be a second selection
   * system, and the drawer would have two things telling it what is
   * chosen.
   */
  const run = useCallback(
    (text: string) => {
      const resolved = readQuery(text, vessels, category);
      if (!resolved) return;

      if (resolved.translation.kind === "ACTION") {
        const result = executeCopilotAction(resolved.translation.action, {
          service,
          confirmed: false,
          knownImos: vessels.map((v) => v.identity.imo),
          /*
           * The fleet the officer is looking at, and the outline the map
           * draws. An approach answer computed against anything else
           * would disagree with the screen it appears on.
           */
          fleet: vessels as readonly Vessel[],
          boundaryRing: eezRingIfLoaded() ?? undefined,
        });
        setOutcome(
          result.ok
            ? (result.answer ?? resolved.translation.speech)
            : (result.reason ?? result.summary),
        );
        if (result.ok) {
          setRecent(rememberSearch(text));
          /*
           * An answer keeps the panel open. Closing on success is right
           * for an instruction — the officer wants to see the map they
           * asked for — and wrong for a question, because the panel is
           * the only place the answer appears and closing it throws the
           * result away at the moment it arrives.
           */
          if (!result.answer) setOpen(false);
        }
        return;
      }

      if (resolved.translation.kind === "UNRESOLVED") {
        setOutcome(resolved.translation.speech);
        return;
      }
      if (resolved.translation.kind === "AMBIGUOUS") {
        setOutcome(
          `I found ${resolved.translation.candidates.length} vessels matching ${resolved.translation.subject}. Choose one below.`,
        );
        return;
      }
      /*
       * A question rather than an instruction, which is what the map
       * plan pipeline is for. Preserved exactly as the previous search
       * ran it — understanding, plan, validate, apply — because nothing
       * reaches the map unvalidated, including a plan this component
       * built itself.
       */
      const state = service.get();
      const plan = planMap(resolved.understanding, { context: captureMapContext(state) });
      const { accepted } = validateIntents(plan.intents, {
        knownLayerIds: layerRegistry.list().map((layer) => layer.id),
      });
      service.update(intentsToStatePatch(accepted, state));
      onApplied?.(plan);
      setOutcome(plan.explanation);
      setRecent(rememberSearch(text));
    },
    [service, vessels, category, onApplied],
  );

  const choose = useCallback(
    (hit: SearchHit) => {
      const action =
        hit.kind === "vessel"
          ? ({ type: "SELECT_VESSEL", imo: hit.imo } as const)
          : ({ type: "NAVIGATE_PLACE", place: hit.id } as const);
      const result = executeCopilotAction(action, {
        service,
        knownImos: vessels.map((v) => v.identity.imo),
      });
      /*
       * Bring the hull into view as well as selecting it. Through the
       * dispatcher, like everything else — a `flyTo` here would be a
       * second camera writer reachable from a search box.
       */
      if (result.ok && hit.kind === "vessel" && hit.coordinates) {
        executeCopilotAction(
          { type: "NAVIGATE_COORDINATES", coordinates: hit.coordinates, zoom: 12 },
          { service },
        );
      }
      if (result.ok) {
        setRecent(rememberSearch(hit.name));
        setOpen(false);
        setQuery("");
      } else {
        setOutcome(result.reason ?? result.summary);
      }
    },
    [service, vessels],
  );

  return (
    <div data-testid="maritime-search" className={cn("pointer-events-auto", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOutcome(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") run(query);
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search vessels, ports, IMO, MMSI or ask a maritime question…"
          aria-label="Search vessels, ports, IMO, MMSI or ask a maritime question"
          className="h-9 pl-8 pr-8 text-[12px]"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOutcome(null);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          data-testid="search-panel"
          className="mt-1.5 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
          <div className="mb-2 flex gap-1">
            {SEARCH_CATEGORIES.map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`search-category-${id}`}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                  category === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {CATEGORY_LABEL[id]}
              </button>
            ))}
          </div>

          {reading?.showInterpretation ? <Interpretation reading={reading} /> : null}

          {outcome ? (
            <p
              data-testid="search-outcome"
              className="mb-2 rounded border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground"
            >
              {outcome}
            </p>
          ) : null}

          {reading && reading.hits.length > 0 ? (
            <ul data-testid="search-results" className="space-y-0.5">
              {reading.hits.map((hit) => (
                <li key={`${hit.kind}-${hit.kind === "vessel" ? hit.imo : hit.id}`}>
                  <button
                    type="button"
                    onClick={() => choose(hit)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                  >
                    {hit.kind === "vessel" ? (
                      <Ship className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <Anchor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">{hit.name}</span>
                      {hit.kind === "vessel" ? (
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          IMO {hit.imo}
                          {hit.mmsi ? ` · MMSI ${hit.mmsi}` : ""}
                          {hit.flag ? ` · ${hit.flag}` : ""}
                        </span>
                      ) : (
                        <span className="block text-[10px] text-muted-foreground">
                          Port or location
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {reading && reading.hits.length === 0 && !outcome ? (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No matching vessel or place. Try a name, IMO, MMSI or a coordinate.
            </p>
          ) : null}

          {!reading && recent.length > 0 ? (
            <div data-testid="search-recent">
              <div className="mb-1 flex items-center justify-between px-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent
                </span>
                <button
                  type="button"
                  onClick={() => setRecent(clearRecent())}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              {/*
                Replayed through the same interpretation path rather than
                restoring an old result, so a recent search cannot show a
                position the fleet has since left behind.
              */}
              {recent.map((entry) => (
                <button
                  key={entry.text}
                  type="button"
                  onClick={() => {
                    setQuery(entry.text);
                    run(entry.text);
                  }}
                  className="block w-full truncate rounded px-2 py-1 text-left text-[11.5px] hover:bg-accent"
                >
                  {entry.text}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the engine actually understood.
 *
 * Every line is read off the `QueryUnderstanding`. Nothing here composes
 * a plausible-sounding description of what probably happened.
 */
function Interpretation({ reading }: { reading: NonNullable<ReturnType<typeof readQuery>> }) {
  const { understanding } = reading;
  return (
    <div
      data-testid="search-understood-as"
      className="mb-2 rounded border border-border bg-muted/30 px-2 py-1.5"
    >
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        Understood as
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        <Tag label={understanding.intent.replace(/-/g, " ")} />
        <Tag label={`scope: ${understanding.scope}`} />
        <Tag label={understanding.timeWindow.label} />
        <Tag label={`confidence ${Math.round(understanding.intentConfidence * 100)}%`} />
      </div>
      {understanding.primaryEntity ? (
        <div className="mt-1 text-[10.5px] text-muted-foreground">
          Subject: {understanding.primaryEntity.text} ({understanding.primaryEntity.kind})
        </div>
      ) : null}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}
