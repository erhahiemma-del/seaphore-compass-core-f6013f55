import { useCallback, useEffect, useRef, useState } from "react";
import {
  Anchor,
  ArrowRight,
  Box,
  FileText,
  LayoutGrid,
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
  const showRecent = unifiedSearch ? !cleared : history.length > 0 || !hideSuggestions;

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
        className="flex h-[52px] items-center gap-3 rounded-[10px] border border-line-strong bg-surface pl-3.5 pr-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <Search
          className="h-[21px] w-[21px] shrink-0 text-[color:var(--navy)]"
          strokeWidth={1.75}
        />
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
            if (!unifiedSearch && (input === "" || input === mode.prefix)) {
              setInput(mode.prefix);
              focusAfterPrefix(mode.prefix);
            }
          }}
          placeholder={
            unifiedSearch
              ? "Search IMO / MMSI / Vessel / Company / Cargo / Manifest / Port / Location / Event"
              : mode.placeholder
          }
          aria-label={`Search — ${mode.aiContext}`}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[14.5px] font-medium leading-tight text-[color:var(--color-navy)] outline-none",
            "placeholder:font-medium placeholder:text-[color:var(--color-navy)]/45",
          )}
        />
        {!unifiedSearch && <VoiceButton />}
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
                active
                  ? "border-[color:var(--navy)] bg-[color:var(--navy)] text-white shadow-card"
                  : "border-line bg-surface-2 text-slate hover:-translate-y-px hover:border-[color:var(--ocean)]/50 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {m.label}
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
