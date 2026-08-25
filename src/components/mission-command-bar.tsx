import { useCallback, useEffect, useRef, useState } from "react";
import {
  Anchor,
  Box,
  Building2,
  ChevronDown,
  CloudUpload,
  FileText,
  Hash,
  MapPin,
  Mic,
  Package,
  Receipt,
  Route as RouteIcon,
  Search,
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
  hash: Hash,
  anchor: Anchor,
  building: Building2,
  manifest: FileText,
  container: Package,
  bol: Receipt,
  voyage: RouteIcon,
  port: MapPin,
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
}

export function MissionCommandBar({ contextMode = null, fromRoute }: MissionCommandBarProps = {}) {
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
  const [pinned, setPinned] = useState<EntityType | null>(null);

  useEffect(() => {
    if (contextMode === null) setPinned(null);
  }, [contextMode]);

  const modeKey = pinned ?? contextMode ?? DEFAULT_MODE;
  const mode = MODE_BY_KEY[modeKey];
  // Track the mode the input's prefix was written for, so a context-driven
  // change re-prefixes without discarding what the officer has typed.
  const prefixedFor = useRef<EntityType>(modeKey);
  const [input, setInput] = useState(mode.prefix);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    if (prefixedFor.current === modeKey) return;
    const previous = MODE_BY_KEY[prefixedFor.current];
    prefixedFor.current = modeKey;
    setInput((prev) => MODE_BY_KEY[modeKey].prefix + stripPrefix(prev, previous));
  }, [modeKey]);

  const selectMode = useCallback(
    (next: EntityType) => {
      const nextMode = MODE_BY_KEY[next];
      // Clicking a chip is the deliberate act that pins the mode.
      setPinned(next);
      // This path re-prefixes the input itself, so claim the change here
      // or the context-sync effect below would prefix it a second time.
      prefixedFor.current = next;
      // Preserve any text the officer had typed by re-prefixing it.
      setInput((prev) => {
        const currentMode = MODE_BY_KEY[modeKey];
        const stripped = stripPrefix(prev, currentMode);
        return nextMode.prefix + stripped;
      });
      focusAfterPrefix(nextMode.prefix);
    },
    [modeKey, focusAfterPrefix],
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
    const query = suggestion ?? stripPrefix(raw, mode);
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

  const history = HISTORY[modeKey];

  return (
    <section
      aria-label="Mission Intelligence Command Bar"
      className="grid gap-5 rounded-lg border border-line bg-surface p-5 elev-1 lg:grid-cols-[minmax(0,1fr)_auto]"
    >
      {/* Search + chips column */}
      <div className="flex min-w-0 flex-col gap-5">
        <form
          className="flex items-start gap-5 pl-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <Search className="mt-1 h-7 w-7 shrink-0 text-slate" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
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
                if (!v.toUpperCase().startsWith(mode.prefix.toUpperCase())) {
                  v = mode.prefix + stripPrefix(v, mode);
                }
                setInput(v);
              }}
              onFocus={() => {
                // If empty-ish, snap cursor after the prefix.
                if (input === "" || input === mode.prefix) {
                  setInput(mode.prefix);
                  focusAfterPrefix(mode.prefix);
                }
              }}
              placeholder={mode.placeholder}
              aria-label={`Search — ${mode.aiContext}`}
              className={cn(
                "w-full bg-transparent text-[20px] font-semibold leading-tight tracking-tight text-[color:var(--color-navy)] outline-none",
                "placeholder:font-semibold placeholder:text-[color:var(--color-navy)]/40",
              )}
            />
            <div className="mt-2 text-[14px] text-slate">{mode.helper}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <VoiceButton />
            <CopilotButton />
          </div>
        </form>

        <div
          role="tablist"
          aria-label="Intelligence context"
          className="flex flex-wrap items-center gap-2 pl-2"
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
                onClick={() => selectMode(m.key)}
                title={`${m.label} · Alt+${m.shortcut}`}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold motion-fast",
                  active
                    ? "border-[color:var(--navy)] bg-[color:var(--navy)] text-white"
                    : "border-line bg-surface-2 text-slate hover:border-[color:var(--ocean)]/50 hover:bg-surface-3 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {m.label}
                <span
                  aria-hidden
                  className={cn(
                    "ml-1 rounded-sm px-1 text-[10px] font-semibold leading-none",
                    active ? "bg-white/18 text-white/90" : "bg-[color:var(--surface-3)] text-slate",
                  )}
                >
                  ⌥{m.shortcut}
                </span>
              </button>
            );
          })}
        </div>

        {/* Suggested queries + recent history */}
        <div className="flex flex-col gap-2 pl-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
              Suggested
            </span>
            {mode.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => runSearch(undefined, s)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-surface-2/40 px-3 py-1 text-[12px] text-foreground/75",
                  "transition-all duration-150 hover:-translate-y-px hover:border-[color:var(--color-blue)]/40 hover:bg-[color:var(--color-blue)]/5 hover:text-[color:var(--color-blue)]",
                )}
              >
                <Sparkles className="h-3 w-3 text-[color:var(--color-blue)]" strokeWidth={2} />
                {s}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
                Recent · {mode.label}
              </span>
              {history.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(mode.prefix + q);
                    runSearch(mode.prefix + q);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line/50 bg-surface px-3 py-1 text-[12px] text-foreground/70 hover:border-[color:var(--color-blue)]/40 hover:text-[color:var(--color-blue)]"
                >
                  <Box className="h-3 w-3 text-slate" strokeWidth={1.75} />
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload manifest card */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn(
          "group flex min-w-[260px] items-center gap-4 rounded-xl border border-line bg-surface-2/40 p-5 text-left transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-[color:var(--color-blue)]/60 hover:bg-[color:var(--color-blue)]/5 hover:shadow-pop",
        )}
      >
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]",
            "transition-colors duration-200 group-hover:bg-[color:var(--color-blue)]/15",
          )}
        >
          <CloudUpload className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold text-[color:var(--color-navy)]">
            Upload Manifest
          </span>
          <span className="mt-0.5 text-[12px] text-slate">
            Drag &amp; Drop or PDF · Excel · JPG · PNG
          </span>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
          className="hidden"
        />
      </button>
    </section>
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

function CopilotButton() {
  return (
    <button
      type="button"
      className={cn(
        "group inline-flex h-12 items-center gap-2 rounded-full border px-4",
        "border-[color:var(--color-blue)]/25 bg-[color:var(--color-blue)]/5",
        "text-[13px] font-semibold text-[color:var(--color-navy)] transition-all duration-200",
        "hover:-translate-y-px hover:border-[color:var(--color-blue)]/50 hover:bg-[color:var(--color-blue)]/10 hover:shadow-[0_0_0_4px_rgba(59,130,246,0.08)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]/40",
      )}
    >
      <Sparkles className="h-4 w-4 text-[color:var(--color-blue)]" strokeWidth={2} />
      AI Copilot
      <ChevronDown className="h-3.5 w-3.5 text-slate" strokeWidth={2} />
    </button>
  );
}
