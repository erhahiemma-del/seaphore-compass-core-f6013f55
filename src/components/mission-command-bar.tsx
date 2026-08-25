import { useCallback, useEffect, useRef, useState } from "react";
import {
  Anchor,
  ArrowRight,
  Box,
  FileText,
  LayoutGrid,
  Locate,

  Mic,
  Receipt,
  Search,
  SearchCheck,
  ShieldAlert,
  Ship,
  Siren,
  Sparkles,
  type LucideIcon,
} from "lucide-react";


import { useCommandDispatch, type EntityType } from "@/lib/command-dispatch";
import {
  DEFAULT_MODE,
  INTELLIGENCE_MODES,
  MODE_BY_KEY,
  stripPrefix,
  type IntelligenceMode,
} from "@/lib/intelligence-modes";
import { cn } from "@/lib/utils";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter-placeholder";

/**
 * Contextual search prompts per Mission Mode. Presentation only: Mission Mode
 * never narrows what the universal search accepts (IMO / MMSI / Vessel /
 * Company / Cargo / Manifest / Port / Location / Event) — it only changes the
 * cue shown to the officer.
 */
const SEARCH_PROMPTS: Partial<Record<EntityType, string[]>> = {
  imo: [
    "Search a vessel, port or maritime event…",
    "Search Nigerian maritime activity…",
    "Search an incident or location…",
  ],
  vessel: ["Search IMO, MMSI or vessel name…", "Search a voyage or vessel movement…"],
  manifest: [
    "Search a manifest or cargo discrepancy…",
    "Search a company, voyage or assessment…",
  ],
  container: [
    "Search a vessel, company or watchlist match…",
    "Search a compliance or risk event…",
  ],
  company: ["Search a vessel, case or evidence record…", "Search an investigation subject…"],
  port: ["Search a port, anchorage or port call…", "Search congestion or arrivals…"],
  bol: ["Search an incident, vessel or location…", "Search an operational event…"],
  voyage: [
    "Search a national maritime trend…",
    "Search a strategic risk or development…",
  ],
};

/**
 * Mission Intelligence Command Bar.
 *
 * The eight chips are interactive intelligence-mode selectors — not
 * decorative filters. Selecting a chip changes the search prefix,
 * placeholder, helper text, suggested queries, and the AI context
 * label passed downstream to Copilot / Gemini.
 *
 * Alt+1…Alt+8 switch modes from anywhere on Mission Control.
 * Per-mode recent searches are preserved in-session (see
 * `useModeHistory`).
 */

const ICONS: Record<IntelligenceMode["icon"], LucideIcon> = {
  overview: LayoutGrid,
  vessel: Ship,
  revenue: Receipt,
  risk: ShieldAlert,
  investigation: SearchCheck,
  port: Anchor,
  incident: Siren,
  briefing: FileText,
};


/**
 * Recent-search chips for the unified Mission Control command bar, shown
 * until this session records searches of its own. Presentation only —
 * clicking one runs the normal dispatch path.
 */
const UNIFIED_RECENT: readonly string[] = [
  "MV Ocean Melody",
  "9328374",
  "CMA CGM Tema",
  "Apapa Port",
  "Lagos Anchorage",
];

const RECENT_ICON: Record<string, LucideIcon> = {
  "MV Ocean Melody": Ship,
  "9328374": Locate,
  "CMA CGM Tema": Ship,
  "Apapa Port": Anchor,
  "Lagos Anchorage": Anchor,
};

/** In-session per-mode search history. Newest first, capped at 8. */
const HISTORY: Record<EntityType, string[]> = {
  imo: [],
  vessel: [],
  company: [],
  manifest: [],
  container: [],
  bol: [],
  voyage: [],
  port: [],
};

function pushHistory(mode: EntityType, query: string) {
  if (!query) return;
  const list = HISTORY[mode].filter((q) => q !== query);
  list.unshift(query);
  HISTORY[mode] = list.slice(0, 8);
}

export interface MissionCommandBarProps {
  /**
   * Mode implied by what the officer currently has selected, or null when
   * the selection implies nothing. Advisory only — a deliberate choice
   * outranks it (see `pinned` below).
   */
  readonly contextMode?: EntityType | null;
  /** Origin recorded on dispatch, so handoffs know where they came from. */
  readonly fromRoute?: string;
  /**
   * Externally pinned mode, when the Mission Mode selector is rendered as
   * its own band (Mission Control). `undefined` keeps the legacy
   * self-contained behaviour for every other caller.
   */
  readonly pinnedMode?: EntityType | null;
  readonly onPinnedModeChange?: (next: EntityType) => void;
  /** Hide the inline mode chips when the selector lives outside this bar. */
  readonly hideModeChips?: boolean;
  /** Hide the suggested-query row to keep the command surface compact. */
  readonly hideSuggestions?: boolean;
  /** Mission Control uses one unified search box; other callers keep prefixes. */
  readonly searchVariant?: "prefixed" | "unified";
}

export function MissionCommandBar({
  contextMode = null,
  fromRoute,
  pinnedMode,
  onPinnedModeChange,
  hideModeChips = false,
  hideSuggestions = false,
  searchVariant = "prefixed",
}: MissionCommandBarProps = {}) {
  const unifiedSearch = searchVariant === "unified";
  /**
   * A mode the officer chose, which context must not overrule.
   *
   * Null means "follow the context". Once a chip is clicked this holds
   * that choice, because someone who deliberately switched to Manifest
   * and then clicks a vessel on the map is still working on manifests —
   * yanking the mode out from under them mid-task is the surprising
   * behaviour worth designing against.
   *
   * The pin clears when the officer deselects, since returning to the
   * global picture is a natural end to whatever they were doing.
   */
  const [internalPinned, setInternalPinned] = useState<EntityType | null>(null);
  const controlled = pinnedMode !== undefined;
  const pinned = controlled ? (pinnedMode ?? null) : internalPinned;
  const setPinned = useCallback(
    (next: EntityType) => {
      if (controlled) onPinnedModeChange?.(next);
      else setInternalPinned(next);
    },
    [controlled, onPinnedModeChange],
  );

  useEffect(() => {
    if (!controlled && contextMode === null) setInternalPinned(null);
  }, [contextMode, controlled]);

  const modeKey = pinned ?? contextMode ?? DEFAULT_MODE;
  const mode = MODE_BY_KEY[modeKey];
  // Track the mode the input's prefix was written for, so a context-driven
  // change re-prefixes without discarding what the officer has typed.
  const prefixedFor = useRef<EntityType>(modeKey);
  const [input, setInput] = useState(unifiedSearch ? "" : mode.prefix);
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useCommandDispatch();

  const focusAfterPrefix = useCallback((prefix: string) => {
    // Wait for React to flush the value, then park the cursor after the prefix.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const pos = prefix.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* noop for input types that don't support selection */
      }
    });
  }, []);

  useEffect(() => {
    if (unifiedSearch) return;
    if (prefixedFor.current === modeKey) return;
    const previous = MODE_BY_KEY[prefixedFor.current];
    prefixedFor.current = modeKey;
    setInput((prev) => MODE_BY_KEY[modeKey].prefix + stripPrefix(prev, previous));
  }, [modeKey, unifiedSearch]);

  const selectMode = useCallback(
    (next: EntityType) => {
      const nextMode = MODE_BY_KEY[next];
      // Clicking a chip is the deliberate act that pins the mode.
      setPinned(next);
      // This path re-prefixes the input itself in prefixed mode, so claim
      // the change here or the context-sync effect below would prefix it a
      // second time.
      prefixedFor.current = next;
      if (unifiedSearch) {
        inputRef.current?.focus();
        return;
      }
      // Preserve any text the officer had typed by re-prefixing it.
      setInput((prev) => {
        const currentMode = MODE_BY_KEY[modeKey];
        const stripped = stripPrefix(prev, currentMode);
        return nextMode.prefix + stripped;
      });
      focusAfterPrefix(nextMode.prefix);
    },
    [modeKey, focusAfterPrefix, setPinned, unifiedSearch],
  );

  // Alt+1..8 shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const n = Number(e.key);
      if (!Number.isFinite(n) || n < 1 || n > INTELLIGENCE_MODES.length) return;
      const target = INTELLIGENCE_MODES.find((m) => m.shortcut === n);
      if (!target) return;
      e.preventDefault();
      selectMode(target.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  const runSearch = (rawInput?: string, suggestion?: string) => {
    const raw = rawInput ?? input;
    const query = suggestion ?? (unifiedSearch ? raw.trim() : stripPrefix(raw, mode));
    if (!query) {
      // Chip-only navigation to the intelligence centre.
      dispatch({ type: modeKey, fromRoute });
      return;
    }
    pushHistory(modeKey, query);
    dispatch({
      query,
      type: modeKey,
      // AI awareness — downstream reasoners (Copilot / Gemini) read this
      // to constrain their answer to the active intelligence domain.
      aiContext: mode.aiContext,
      fromRoute,
    });
  };

  const [cleared, setCleared] = useState(false);
  const history = HISTORY[modeKey];
  /**
   * Recent searches shown before this session has any history of its own.
   * Presentation-only seeds so the row keeps its designed geometry and
   * labels; clicking one runs the real dispatch, and Clear hides the row.
   */
  const recent = history.length > 0 ? history.slice(0, 5) : UNIFIED_RECENT;
  /** A lens is "active" once the officer moves off the default overview. */
  const lensActive = modeKey !== DEFAULT_MODE;
  const showRecent = unifiedSearch ? !cleared : history.length > 0 || !hideSuggestions;

  /**
   * Attract cue only while the field is genuinely idle: empty and unfocused.
   * The first keystroke (or focus) stops it; emptying the field restores it.
   */
  const [focused, setFocused] = useState(false);
  const promptPhrases = SEARCH_PROMPTS[modeKey] ?? SEARCH_PROMPTS[DEFAULT_MODE]!;
  const idleForCue = input === "" && !focused;
  const typedPrompt = useTypewriterPlaceholder(promptPhrases, idleForCue);
  const staticPlaceholder = unifiedSearch
    ? "Search IMO / MMSI / Vessel / Company / Cargo / Manifest / Port / Location / Event"
    : mode.placeholder;

  return (
    <section
      aria-label="Mission Intelligence Command Bar"
      className={cn(
        "flex flex-col gap-2.5",
        !unifiedSearch && "rounded-lg border border-line bg-surface p-3.5 elev-1",
      )}
    >
      {/* SEARCH — the dominant control on Mission Control. */}
      <form
        className={cn(
          "flex h-[52px] items-center gap-3 rounded-[10px] border bg-surface pl-3.5 pr-2 motion-fast",
          lensActive
            ? "border-[color:var(--lens-edge)] shadow-[inset_0_0_0_1px_rgba(14,165,201,0.12)]"
            : "border-line-strong",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <Search
          className={cn(
            "h-[21px] w-[21px] shrink-0 motion-fast",
            lensActive ? "text-[color:var(--lens)]" : "text-[color:var(--navy)]",
          )}
          strokeWidth={1.75}
        />
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            ref={inputRef}
            type="search"
            value={input}
            onChange={(e) => {
              let v = e.target.value;
              // Allow the native search-clear (X) — and any manual empty —
              // to fully clear the field. The prefix is re-injected on the
              // next keystroke or on focus.
              if (v === "") {
                setInput("");
                return;
              }
              // Never let officers erase the prefix by accident while typing.
              if (!unifiedSearch && !v.toUpperCase().startsWith(mode.prefix.toUpperCase())) {
                v = mode.prefix + stripPrefix(v, mode);
              }
              setInput(v);
            }}
            onFocus={() => {
              setFocused(true);
              if (!unifiedSearch && (input === "" || input === mode.prefix)) {
                setInput(mode.prefix);
                focusAfterPrefix(mode.prefix);
              }
            }}
            onBlur={() => setFocused(false)}
            // The animated cue replaces the placeholder while idle; the
            // static text remains for focus, reduced motion and SSR.
            placeholder={idleForCue ? "" : staticPlaceholder}
            aria-label={`Search ${staticPlaceholder ? "" : ""}IMO, MMSI, vessel, company, cargo, manifest, port, location or event — ${mode.aiContext}`}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-[14.5px] font-medium leading-tight text-[color:var(--color-navy)] outline-none",
              "placeholder:font-medium placeholder:text-[color:var(--color-navy)]/45",
            )}
          />
          {idleForCue && (
            <span
              aria-hidden="true"
              data-testid="search-typewriter-cue"
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-[14.5px] font-medium leading-tight text-[color:var(--color-navy)]/45"
            >
              {typedPrompt}
              <span className="ml-[1px] inline-block h-[15px] w-[1.5px] translate-y-[1px] bg-[color:var(--color-navy)]/35" />
            </span>
          )}
        </div>
        {!unifiedSearch && <VoiceButton />}
        {lensActive && (
          <span
            data-testid="mission-mode-search-cue"
            className="hidden shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--lens-edge)] bg-[color:var(--lens-tint)] px-2 py-1 text-[11px] font-semibold text-[color:var(--color-navy)] sm:inline-flex"
            title={`Contextual emphasis: ${mode.contextDomains.join(", ")}`}
          >
            <Sparkles className="h-3 w-3 text-[color:var(--lens)]" strokeWidth={2} />
            {mode.label} focus
          </span>
        )}
        <button
          type="submit"
          className={cn(
            "inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-[color:var(--navy)] px-4 text-[13.5px] font-semibold text-white",
            "shadow-[0_1px_2px_rgba(11,31,58,0.18)] transition-all duration-150 hover:-translate-y-px hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]/40",
          )}
        >
          Investigate
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>

      {/* Recent searches — compact chips beneath the search. */}
      {showRecent && (
        <div className="flex min-h-[28px] flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-semibold text-slate">
            {unifiedSearch || history.length > 0 ? "Recent Searches:" : "Suggested searches"}
          </span>
          {unifiedSearch || history.length > 0
            ? recent.map((q) => {
                const ChipIcon = RECENT_ICON[q] ?? Box;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      const nextInput = unifiedSearch ? q : mode.prefix + q;
                      setInput(nextInput);
                      runSearch(nextInput);
                    }}
                    className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-[color:var(--color-navy)]/85 shadow-[0_1px_1px_rgba(11,31,58,0.04)] motion-fast hover:border-[color:var(--color-blue)]/40 hover:text-[color:var(--color-blue)]"
                  >
                    <ChipIcon className="h-3.5 w-3.5 text-slate" strokeWidth={1.75} />
                    {q}
                  </button>
                );
              })
            : mode.suggestions.slice(0, 4).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => runSearch(undefined, s)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-surface-2/40 px-2.5 py-0.5 text-[11.5px] font-medium text-foreground/75 motion-fast hover:border-[color:var(--color-blue)]/40 hover:text-[color:var(--color-blue)]"
                >
                  <Sparkles className="h-3 w-3 text-[color:var(--color-blue)]" strokeWidth={2} />
                  {s}
                </button>
              ))}
          {unifiedSearch && (
            <button
              type="button"
              onClick={() => setCleared(true)}
              className="ml-1 text-[12px] font-semibold text-[color:var(--ocean)] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* CONTEXTUAL EMPHASIS — mode-driven suggestions. UI only: nothing
          here is a search result, and the universal search is unchanged. */}
      {unifiedSearch && (
        <div
          data-testid="mission-mode-suggestions"
          className="flex min-h-[28px] flex-wrap items-center gap-1.5"
        >
          <span className="mr-0.5 text-[11px] font-semibold text-slate">
            {mode.label} context:
          </span>
          {mode.suggestions.slice(0, 4).map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => {
                setInput(sug);
                runSearch(sug);
              }}
              className={cn(
                "inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium motion-fast",
                lensActive
                  ? "border-[color:var(--lens-edge)] bg-[color:var(--lens-tint)] text-[color:var(--color-navy)] hover:border-[color:var(--lens)]"
                  : "border-line bg-surface text-[color:var(--color-navy)]/80 hover:border-[color:var(--lens-edge)]",
              )}
            >
              <Sparkles
                className={cn("h-3 w-3", lensActive ? "text-[color:var(--lens)]" : "text-slate")}
                strokeWidth={2}
              />
              {sug}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-slate">
            Emphasis: {mode.contextDomains.slice(0, 4).join(" · ")}
          </span>
        </div>
      )}

      {!hideModeChips && <MissionModeBar modeKey={modeKey} onSelect={selectMode} />}
    </section>
  );
}


/**
 * MISSION MODE — the horizontal selector band.
 *
 * The same intelligence-mode engine the command bar has always used
 * (`INTELLIGENCE_MODES`, Alt+1…8); only its placement changed so the
 * approved composition can show it as its own row.
 */
export function MissionModeBar({
  modeKey,
  onSelect,
  className,
}: {
  readonly modeKey: EntityType;
  readonly onSelect: (next: EntityType) => void;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
        Mission mode
      </span>
      <div
        role="tablist"
        aria-label="Intelligence context"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
      >
        {INTELLIGENCE_MODES.map((m) => {
          const Icon = ICONS[m.icon];
          const active = modeKey === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(m.key)}
              title={`${m.label} · Alt+${m.shortcut}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold motion-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lens)]/50",
                active
                  ? "border-[color:var(--lens)] bg-[color:var(--lens)] text-[color:var(--lens-ink)] shadow-[var(--lens-glow)]"
                  : "border-line-strong bg-surface text-[color:var(--color-navy)]/80 hover:-translate-y-px hover:border-[color:var(--lens-edge)] hover:bg-[color:var(--lens-tint)] hover:text-[color:var(--color-navy)]",
              )}
            >
              {/* Non-colour active affordance: a leading marker plus aria-selected. */}
              {active && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--lens-ink)]"
                />
              )}
              <Icon
                className={cn("h-3.5 w-3.5", active ? "opacity-95" : "text-slate")}
                strokeWidth={1.75}
              />
              {m.label}
              {active && <span className="sr-only">(active lens)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VoiceButton() {
  return (
    <button
      type="button"
      aria-label="Voice search"
      className={cn(
        "group flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface",
        "text-slate transition-all duration-200",
        "hover:-translate-y-px hover:scale-[1.04] hover:border-[color:var(--color-blue)]/60 hover:text-[color:var(--color-blue)] hover:shadow-card",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]/40",
      )}
    >
      <Mic className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
