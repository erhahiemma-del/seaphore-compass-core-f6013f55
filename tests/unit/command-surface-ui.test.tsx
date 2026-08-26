// @vitest-environment jsdom
/**
 * Command surface — interaction and accessibility.
 *
 * The model tests cover what the surface is told. These cover what it
 * does with a keyboard, which is where a search box is either an
 * operational tool or a mouse-only decoration.
 *
 * The surface takes everything as props, so none of this needs a router,
 * a session or a store — the wiring is the host's concern and is
 * verified separately.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandSurface } from "@/features/command/CommandSurface";
import { buildCommandActions } from "@/features/command/actions";
import { MISSION_MODES } from "@/features/mission-control/modes";
import type { CommandSearchState } from "@/features/command/results";

afterEach(() => cleanup());

const MODE = MISSION_MODES["national-picture"];

const RESULTS: CommandSearchState = {
  state: "results",
  total: 3,
  groups: [
    {
      kind: "vessel",
      results: [
        { id: "v1", kind: "vessel", title: "MV Ocean Melody", score: 1000 },
        { id: "v2", kind: "vessel", title: "MV Ocean Pearl", score: 500 },
      ],
    },
    {
      kind: "port",
      results: [{ id: "p1", kind: "port", title: "Apapa", score: 250 }],
    },
  ],
};

function setup(over: Partial<React.ComponentProps<typeof CommandSurface>> = {}) {
  const onSelectResult = vi.fn();
  const onAction = vi.fn();
  const onRun = vi.fn();
  const onClear = vi.fn();
  const onClearRecent = vi.fn();
  render(
    <CommandSurface
      input="ocean"
      onInput={() => {}}
      state={RESULTS}
      actions={buildCommandActions({ mode: MODE, roles: ["admin"] })}
      cues={{ cues: ["Apapa arrivals"], emphasis: "ports · vessels" }}
      recent={[]}
      onRun={onRun}
      onClear={onClear}
      onClearRecent={onClearRecent}
      onSelectResult={onSelectResult}
      onAction={onAction}
      {...over}
    />,
  );
  return { onSelectResult, onAction, onRun, onClear, onClearRecent };
}

/* ═══════ 18. Keyboard ═══════ */

describe("keyboard navigation", () => {
  it("exposes the input as a combobox controlling the listbox", () => {
    setup();
    const input = screen.getByTestId("command-input");
    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  });

  it("marks the active option without moving focus off the input", () => {
    setup();
    const input = screen.getByTestId("command-input");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Focus must stay put so the officer can keep typing to refine.
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
  });

  it("moves down and wraps through every result across groups", () => {
    const { onSelectResult } = setup();
    const input = screen.getByTestId("command-input");
    // Three results, two groups. Arrowing must cross the group boundary.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("moves up from the first option to the last", () => {
    const { onSelectResult } = setup();
    const input = screen.getByTestId("command-input");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("selects the highlighted result on Enter", () => {
    const { onSelectResult, onRun } = setup();
    const input = screen.getByTestId("command-input");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
    expect(onRun).not.toHaveBeenCalled();
  });

  it("runs the raw query on Enter when there is no list to choose from", () => {
    const { onRun, onSelectResult } = setup({ state: { state: "no-match", query: "zzz" } });
    fireEvent.keyDown(screen.getByTestId("command-input"), { key: "Enter" });
    expect(onRun).toHaveBeenCalled();
    expect(onSelectResult).not.toHaveBeenCalled();
  });

  it("closes the list on Escape before clearing the query", () => {
    // Escaping out of results must not also destroy what was typed.
    const { onClear } = setup();
    const input = screen.getByTestId("command-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClear).not.toHaveBeenCalled();
  });

  it("clears on Escape when no list is open", () => {
    const { onClear } = setup({ state: { state: "no-match", query: "zzz" } });
    fireEvent.keyDown(screen.getByTestId("command-input"), { key: "Escape" });
    expect(onClear).toHaveBeenCalled();
  });

  it("focuses the input on Cmd/Ctrl+K", () => {
    setup();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("command-input"));
  });

  it("selects by mouse as well", () => {
    const { onSelectResult } = setup();
    fireEvent.click(screen.getByTestId("command-result-p1"));
    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });
});

/* ═══════ States and actions ═══════ */

describe("states and actions render honestly", () => {
  it("prints the no-match sentence rather than an empty panel", () => {
    setup({ state: { state: "no-match", query: "zzz" } });
    expect(screen.getByTestId("command-state-no-match")).toHaveTextContent(/evidence gap/i);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("distinguishes auth from failure from unavailability", () => {
    for (const state of [
      { state: "auth-required" },
      { state: "permission-denied" },
      { state: "source-unavailable" },
      { state: "failed" },
    ] as CommandSearchState[]) {
      cleanup();
      setup({ state });
      expect(screen.getByTestId(`command-state-${state.state}`)).toBeInTheDocument();
    }
  });

  it("announces searching to assistive technology", () => {
    setup({ state: { state: "searching" } });
    expect(screen.getByTestId("command-state-searching")).toHaveAttribute("role", "status");
  });

  it("disables an unbuilt shortcut and shows the reason", () => {
    const { onAction } = setup();
    const button = screen.getByTestId("command-action-review-approvals");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-availability", "not-built");
    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("disables actions the officer may not perform", () => {
    cleanup();
    setup({ actions: buildCommandActions({ mode: MODE, roles: ["external_agency"] }) });
    const button = screen.getByTestId("command-action-investigate");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-availability", "permission-denied");
  });

  it("says there are no recent searches rather than showing nothing", () => {
    setup({ recent: [] });
    expect(screen.getByTestId("command-recent-empty")).toBeInTheDocument();
  });

  it("replays a recent search and can clear the list", () => {
    const { onRun, onClearRecent } = setup({ recent: ["Apapa"] });
    fireEvent.click(screen.getByTestId("command-recent"));
    expect(onRun).toHaveBeenCalledWith("Apapa");
    fireEvent.click(screen.getByTestId("command-recent-clear"));
    expect(onClearRecent).toHaveBeenCalled();
  });

  it("runs a lens cue as a search", () => {
    const { onRun } = setup();
    fireEvent.click(screen.getByTestId("command-cue"));
    expect(onRun).toHaveBeenCalledWith("Apapa arrivals");
  });
});

/* ═══════ 17. Stale request cancellation ═══════ */

const listMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/repositories/entity.repository", () => ({
  entityRepository: { list: listMock },
}));

describe("stale responses never overwrite newer ones", () => {
  it("drops a slow answer for an older query", async () => {
    const { useCommandSearch } = await import("@/features/command/useCommandSearch");

    let resolveSlow: (v: unknown) => void = () => {};
    listMock
      .mockImplementationOnce(
        () => new Promise((r) => (resolveSlow = r)), // "apa" — slow
      )
      .mockResolvedValueOnce({
        rows: [{ id: "fast", type: "port", name: "Apapa" }],
        total: 1,
      });

    const { result } = renderHook(() => useCommandSearch());

    // First query starts and hangs.
    act(() => result.current.runNow("apa"));
    // Second query resolves immediately while the first is still in flight.
    await act(async () => {
      result.current.runNow("apapa");
    });
    await waitFor(() => expect(result.current.state.state).toBe("results"));

    // The stale answer lands last and must be ignored.
    await act(async () => {
      resolveSlow({ rows: [{ id: "stale", type: "port", name: "Stale" }], total: 1 });
    });

    const state = result.current.state;
    expect(state.state).toBe("results");
    if (state.state === "results") {
      expect(state.groups[0].results[0].id).toBe("fast");
    }
  });
});
