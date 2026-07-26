// @vitest-environment jsdom
/**
 * Sprint UX-02 · Investigation Landing — Quick Start contract.
 *
 * Lightweight UI tests (no network, no pipeline) that lock the six
 * Quick Start actions to the exact prompts they must insert into the
 * command bar. The landing is presentation-only: clicking a card must
 * *stage* the prompt for officer review, never auto-submit it
 * (System recommends; officer decides).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The landing pulls in browser-only capabilities (microphone + storage
// uploads). Both are stubbed so these tests stay fast and hermetic.
vi.mock("@/hooks/use-voice-dictation", () => ({
  useVoiceDictation: () => ({
    state: "idle" as const,
    level: 0,
    supported: false,
    toggle: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-officer-attachments", () => ({
  ATTACHMENT_ACCEPT: ".pdf,.csv",
  formatBytes: (n: number) => `${n} B`,
  useOfficerAttachments: () => ({
    attachments: [],
    items: [],
    uploading: false,
    add: vi.fn(),
    retry: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}));

import { InvestigationLanding } from "@/components/copilot/InvestigationLanding";

const SUBJECT = "MV Ocean Pearl";

/**
 * Sprint UX-04 — Smart Prompt Chip contract. A chip is assistive only: it
 * inserts an editable starter prompt and never filters or locks the query.
 */
const EXPECTED_CHIPS: Array<[label: RegExp, starter: string]> = [
  [/^imo$/i, "Investigate IMO "],
  [/^vessel$/i, "Investigate vessel "],
  [/^company$/i, "Investigate company "],
  [/^manifest$/i, "Analyze manifest "],
  [/^container$/i, "Trace container "],
  [/^bol$/i, "Check bill of lading "],
  [/^voyage$/i, "Show previous voyages of "],
  [/^port$/i, "Show activity at port "],
];

function renderLanding(overrides: Partial<React.ComponentProps<typeof InvestigationLanding>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(
    <InvestigationLanding
      subject={SUBJECT}
      value=""
      onChange={onChange}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { ...utils, onChange, onSubmit };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("InvestigationLanding · Smart Prompt Chips", () => {
  it("renders every assistive chip", () => {
    renderLanding();
    for (const [label] of EXPECTED_CHIPS) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(EXPECTED_CHIPS).toHaveLength(8);
  });

  it.each(EXPECTED_CHIPS)("inserts an editable starter prompt for %s", (label, starter) => {
    const { onChange, onSubmit } = renderLanding();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onChange).toHaveBeenCalledWith(starter);
    // Officer decides — a chip never submits on its own.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the starter prompt when the same chip is clicked again", () => {
    const chip = () => screen.getByRole("button", { name: /^imo$/i });
    const { onChange, rerender } = renderLanding();
    fireEvent.click(chip());
    expect(onChange).toHaveBeenLastCalledWith("Investigate IMO ");
    rerender(
      <InvestigationLanding
        subject={SUBJECT}
        value="Investigate IMO "
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.click(chip());
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("leaves no chip selected by default — a valid state", () => {
    renderLanding();
    for (const [label] of EXPECTED_CHIPS) {
      expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe(
        "false",
      );
    }
  });
});

describe("InvestigationLanding · command bar", () => {
  it("submits on Enter and inserts a newline on Shift+Enter", () => {
    const { onSubmit } = renderLanding({ value: "Investigate MV Ocean Pearl" });
    const input = screen.getByLabelText(/investigation query/i);

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("Investigate MV Ocean Pearl", []);
  });

  it("blocks submission while a run is pending", () => {
    const { onSubmit } = renderLanding({ value: "Investigate MV Ocean Pearl", pending: true });
    fireEvent.keyDown(screen.getByLabelText(/investigation query/i), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("InvestigationLanding · detected intent", () => {
  it("surfaces a dismissible intent hint for free text", () => {
    renderLanding({ value: "Who owns Ocean Pearl?" });
    expect(screen.getByTestId("intent-badge").textContent).toContain("Company Investigation");
    fireEvent.click(screen.getByRole("button", { name: /dismiss detected intent/i }));
    expect(screen.queryByTestId("intent-badge")).toBeNull();
  });

  it("shows no hint when the box is empty", () => {
    renderLanding();
    expect(screen.queryByTestId("intent-badge")).toBeNull();
  });
});
