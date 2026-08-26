/**
 * The command surface.
 *
 * Structure and interaction only — the visual pass is a later phase, so
 * this uses the existing semantic tokens and keeps the reference's
 * layout order without committing to its treatment. The `data-testid`
 * landmarks are what has to survive that pass.
 *
 * ## Accessibility is the interaction model, not a coat of paint
 *
 * A search box that returns a list the officer navigates with arrows is
 * a combobox, so it is built as one: `role="combobox"` on the input with
 * `aria-expanded` and `aria-controls`, `role="listbox"` on the results,
 * `role="option"` with `aria-selected` on each, and
 * `aria-activedescendant` pointing at the highlighted row. Focus never
 * leaves the input while arrowing, which is what lets someone keep
 * typing to refine.
 *
 * Selection is marked with `aria-selected` and a border as well as a
 * background, so it does not depend on colour alone.
 *
 * ## It renders decisions; it makes none
 *
 * Ranking, grouping, permission and availability all arrive settled.
 * There is no `can()` call here, no fetch, and no fallback that could
 * turn an unavailable state into an empty one.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { useTypewriterPrompt } from "./useTypewriterPrompt";

import { cn } from "@/lib/utils";

import { COMMAND_STATE_LABELS, type CommandResult, type CommandSearchState } from "./results";
import type { CommandAction, CommandActionId } from "./actions";
import type { ModeSearchCues } from "./suggestions";

const KIND_LABEL: Record<string, string> = {
  vessel: "Vessels",
  voyage: "Voyages",
  company: "Companies",
  person: "People",
  port: "Ports",
  container: "Containers",
  cargo_item: "Cargo",
  document: "Documents",
  manifest: "Manifests",
  agency: "Agencies",
  intelligence_report: "Intelligence reports",
  signal: "Signals",
  regulation: "Regulations",
};

/** Flatten groups into the order the arrow keys traverse. */
function flatten(state: CommandSearchState): readonly CommandResult[] {
  return state.state === "results" ? state.groups.flatMap((g) => g.results) : [];
}

/**
 * A restrained accent per action, so three cards in a row do not read as
 * one control repeated.
 *
 * Semantic rather than decorative: operational green for taking a
 * document in, intelligence purple for opening a case, report amber for
 * producing one. They tint a border and an icon on hover and nothing
 * else — the cards still belong to one visual system.
 */
const ACTION_ACCENT: Readonly<Partial<Record<CommandActionId, string>>> = {
  "upload-manifest": "#0E7C7B",
  "create-investigation": "#7C3AED",
  "generate-report": "#F59E0B",
};

function availabilityTitle(action: CommandAction): string | undefined {
  switch (action.availability.state) {
    case "ready":
      return undefined;
    case "permission-denied":
      return `Requires ${action.availability.permission}`;
    case "not-built":
    case "no-context":
      return action.availability.detail;
  }
}

export interface CommandSurfaceProps {
  readonly input: string;
  readonly onInput: (value: string) => void;
  readonly state: CommandSearchState;
  readonly actions: readonly CommandAction[];
  readonly cues: ModeSearchCues;
  /**
   * Rotating placeholder phrases for the active lens.
   *
   * Optional, and empty means no rotation. The prompt is presentation:
   * a caller that supplies none gets the plain static label, which is
   * what this surface showed before the cycle existed.
   */
  readonly prompts?: readonly string[];
  /** Shown when motion is reduced, or while the officer is typing. */
  readonly staticPrompt?: string;
  readonly recent: readonly string[];
  readonly onRun: (value?: string) => void;
  readonly onClear: () => void;
  readonly onClearRecent: () => void;
  readonly onSelectResult: (result: CommandResult) => void;
  readonly onAction: (id: CommandActionId) => void;
  readonly className?: string;
}

export function CommandSurface({
  input,
  onInput,
  state,
  actions,
  cues,
  prompts = [],
  staticPrompt = COMMAND_STATE_LABELS.idle,
  recent,
  onRun,
  onClear,
  onClearRecent,
  onSelectResult,
  onAction,
  className,
}: CommandSurfaceProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  /*
   * Whether the *input* has DOM focus — not the officer's focus subject,
   * which lives in `focus-subject.store` and is a different idea
   * entirely. Named in full because the short form collides with that
   * vocabulary, and a guard exists precisely to stop this surface
   * growing a second notion of "focus".
   */
  const [inputFocused, setInputFocused] = useState(false);

  /*
   * The prompt cycles only while the box is genuinely idle.
   *
   * Focus or a single character switches it off, and the hook tears its
   * timer down rather than pausing it — so no scheduled tick can land
   * after the officer has started typing. The animation never writes to
   * the input; it only supplies a placeholder, which is the strongest
   * form of "the officer has priority" available here.
   */
  const idle = !inputFocused && input.length === 0;
  const promptText = useTypewriterPrompt({
    phrases: prompts,
    fallback: staticPrompt,
    enabled: idle,
  });

  const results = useMemo(() => flatten(state), [state]);
  const open = state.state === "results" && results.length > 0;

  // A new result set invalidates the old highlight position.
  useEffect(() => setActive(0), [state]);

  /*
   * Cmd/Ctrl+K focuses the input.
   *
   * One listener, added once. The alternative pattern — a listener per
   * interactive element — is what the phase brief means by unnecessary
   * global listeners.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // First press closes the list; a second clears the box. Escaping
      // out of a result list should not also destroy the query.
      if (open) setActive(-1);
      else onClear();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[active];
      if (open && chosen) onSelectResult(chosen);
      else onRun();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const primary = actions.filter((a) => a.group === "primary");
  const shortcuts = actions.filter((a) => a.group === "shortcut");

  return (
    <section
      data-testid="command-surface"
      aria-label="Command surface"
      className={cn("flex flex-col gap-2 rounded-lg border border-line bg-surface p-3", className)}
    >
      {/* ── Search + primary actions ── */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[260px] flex-1">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            aria-label="Search entities"
            data-testid="command-input"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={promptText}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            /*
             * The placeholder changes while idle, so it is announced
             * once as a stable label instead. A live-updating
             * placeholder read aloud on every keystroke would be
             * unusable with a screen reader.
             */
            title={staticPrompt}
            className={cn(
              "w-full rounded-md border bg-surface px-3 py-2 type-small text-foreground outline-none",
              "border-line motion-fast placeholder:text-slate/70",
              "hover:border-slate/45",
              "focus-visible:border-[color:var(--color-blue)] focus-visible:ring-2",
              "focus-visible:ring-[color:var(--color-blue)]/25",
            )}
          />

          {/*
            Every non-result state prints its own sentence. There is no
            branch that renders an empty list silently.
          */}
          {state.state !== "results" && state.state !== "idle" && (
            <p
              data-testid={`command-state-${state.state}`}
              role={state.state === "searching" ? "status" : undefined}
              className="mt-1 type-small text-slate"
            >
              {COMMAND_STATE_LABELS[state.state] ?? state.state}
              {"detail" in state && state.detail ? ` — ${state.detail}` : ""}
            </p>
          )}

          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Search results"
              data-testid="command-results"
              className="absolute z-20 mt-1 max-h-[320px] w-full overflow-y-auto rounded border border-line bg-surface elev-2"
            >
              {state.state === "results" &&
                state.groups.map((group) => (
                  <li key={group.kind} role="presentation">
                    <div className="type-label px-3 py-1 text-slate">
                      {KIND_LABEL[group.kind] ?? group.kind}
                    </div>
                    <ul role="presentation">
                      {group.results.map((r) => {
                        const index = results.indexOf(r);
                        const selected = index === active;
                        return (
                          <li
                            key={r.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={selected}
                            data-testid={`command-result-${r.id}`}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => onSelectResult(r)}
                            className={cn(
                              "cursor-pointer border-l-2 px-3 py-1.5",
                              selected
                                ? "border-[color:var(--color-teal)] bg-surface-2"
                                : "border-transparent",
                            )}
                          >
                            <div className="type-small font-semibold text-foreground">
                              {r.title}
                            </div>
                            <div className="type-small text-slate">
                              {r.matchedAlias ? `alias: ${r.matchedAlias}` : null}
                              {r.confidence ? ` · ${r.confidence}` : null}
                              {r.source ? ` · ${r.source}` : null}
                              {/* Undefined means the column is absent; only a real list prints. */}
                              {r.evidenceCount !== undefined
                                ? ` · ${r.evidenceCount} evidence`
                                : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {primary.map((a) => (
          <ActionButton key={a.id} action={a} onAction={onAction} />
        ))}
      </div>

      {/* ── Recent searches + shortcuts ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-label text-slate">Recent</span>
        {recent.length === 0 ? (
          <span data-testid="command-recent-empty" className="type-small text-slate">
            No recent searches
          </span>
        ) : (
          <>
            {recent.map((q) => (
              <button
                key={q}
                type="button"
                data-testid="command-recent"
                onClick={() => onRun(q)}
                title={`Search again: ${q}`}
                className={cn(
                  "rounded-full border border-line px-2.5 py-0.5 text-[11px] text-foreground",
                  "transition-[transform,border-color,background-color] duration-150 ease-out",
                  "hover:-translate-y-px hover:border-[color:var(--color-blue)]",
                  "hover:bg-[color:var(--color-blue)]/[0.06]",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-[color:var(--color-blue)]/40",
                )}
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              data-testid="command-recent-clear"
              onClick={onClearRecent}
              /*
               * No confirmation. Recent searches are a convenience, not a
               * record — losing them costs a retype, and a dialog for
               * that teaches officers to dismiss dialogs.
               */
              className={cn(
                "rounded text-[11px] font-semibold text-slate underline underline-offset-2",
                "transition-colors duration-150 ease-out hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-[color:var(--color-blue)]/40",
              )}
            >
              Clear
            </button>
          </>
        )}

        <span className="type-label ml-auto text-slate">Shortcuts</span>
        {shortcuts.map((a) => (
          <ActionButton key={a.id} action={a} onAction={onAction} />
        ))}
      </div>

      {/* ── Lens cues ── */}
      {cues.cues.length > 0 && (
        <div data-testid="command-cues" className="flex flex-wrap items-center gap-2">
          <span className="type-label text-slate">{cues.emphasis}</span>
          {cues.cues.map((c) => (
            <button
              key={c}
              type="button"
              data-testid="command-cue"
              onClick={() => onRun(c)}
              className={cn(
                "rounded-full border border-line px-2.5 py-0.5 text-[11px] text-slate",
                "transition-[transform,border-color,color] duration-150 ease-out",
                "hover:-translate-y-px hover:border-[color:var(--color-blue)] hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-[color:var(--color-blue)]/40",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionButton({
  action,
  onAction,
}: {
  readonly action: CommandAction;
  readonly onAction: (id: CommandActionId) => void;
}) {
  const ready = action.availability.state === "ready";
  /*
   * Investigate carries the primary weight.
   *
   * Presentation only, and deliberately not a field on the action model:
   * which action leads is a question about this surface, not about what
   * the action is. The model still decides availability and order, and
   * the lens still reorders — a promoted action simply renders filled
   * when it is the one Investigate.
   *
   * Without this every action rendered byte-identically — same
   * background, border, weight and size — so the row read as four equal
   * options and the officer's most common next step had no more presence
   * than "Generate Report". Filled navy is the same primary treatment the
   * reference uses.
   */
  const primary = ready && action.id === "investigate";
  const accent = ACTION_ACCENT[action.id];
  return (
    <button
      type="button"
      data-testid={`command-action-${action.id}`}
      data-availability={action.availability.state}
      data-emphasis={primary ? "primary" : "default"}
      disabled={!ready}
      title={availabilityTitle(action)}
      onClick={() => onAction(action.id)}
      style={
        accent && ready && !primary ? ({ "--action-accent": accent } as CSSProperties) : undefined
      }
      className={cn(
        "group rounded-md border px-2.5 py-1.5 text-left text-[11px] font-semibold",
        // One motion language: 180ms out, a short press, no bounce.
        "transition-[transform,box-shadow,border-color,background-color] duration-[180ms] ease-out",
        "active:translate-y-0 active:duration-[100ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]/40",
        primary && [
          "border-[color:var(--color-navy)] bg-[color:var(--color-navy)] text-white",
          "hover:-translate-y-px hover:bg-[color:var(--color-blue)] hover:shadow-pop",
        ],
        ready &&
          !primary && [
            "border-line bg-surface text-foreground",
            // The accent is per action, so the three cards do not read as
            // one repeated control. Restrained: it moves the border and
            // the icon, never the whole card.
            "hover:-translate-y-px hover:shadow-pop",
            accent
              ? "hover:border-[color:var(--action-accent)]"
              : "hover:border-[color:var(--color-blue)]",
          ],
        /*
         * Unavailable must not look pressable. No lift, no shadow, no
         * pointer — a control that animates under the cursor and then
         * does nothing is worse than one that plainly cannot be used.
         */
        !ready && "cursor-not-allowed border-transparent text-slate opacity-60",
      )}
    >
      {action.label}
      <span
        className={cn("block text-[10px] font-normal", primary ? "text-white/70" : "text-slate")}
      >
        {ready ? action.caption : availabilityTitle(action)}
      </span>
    </button>
  );
}
