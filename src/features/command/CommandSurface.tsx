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
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
            placeholder={COMMAND_STATE_LABELS.idle}
            className="w-full rounded border border-line bg-surface-2 px-3 py-2 type-small text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-teal)]/40"
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
                className="rounded border border-line px-2 py-0.5 text-[11px] text-foreground hover:bg-surface-2"
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              data-testid="command-recent-clear"
              onClick={onClearRecent}
              className="text-[11px] font-semibold text-slate underline"
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
              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-slate hover:bg-surface-2 hover:text-foreground"
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
  return (
    <button
      type="button"
      data-testid={`command-action-${action.id}`}
      data-availability={action.availability.state}
      disabled={!ready}
      title={availabilityTitle(action)}
      onClick={() => onAction(action.id)}
      className={cn(
        "rounded border px-2 py-1 text-left text-[11px] font-semibold motion-fast",
        ready
          ? "border-line bg-surface-2 text-foreground hover:border-[color:var(--color-teal)]/45"
          : "cursor-not-allowed border-transparent text-slate opacity-60",
      )}
    >
      {action.label}
      <span className="block text-[10px] font-normal text-slate">
        {ready ? action.caption : availabilityTitle(action)}
      </span>
    </button>
  );
}
