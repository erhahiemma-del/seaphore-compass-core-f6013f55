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
    uploading: false,
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}));

import { InvestigationLanding } from "@/components/copilot/InvestigationLanding";

const SUBJECT = "MV Ocean Pearl";

/** The Quick Start contract — label → prompt inserted into the command bar. */
const EXPECTED_PROMPTS: Array<[label: RegExp, prompt: string]> = [
  [/^investigate vessel$/i, `Investigate ${SUBJECT}`],
  [/^ownership$/i, `Explain the ownership structure of ${SUBJECT}`],
  [/^sanctions$/i, `Screen ${SUBJECT} and its operator for sanctions exposure`],
  [/^cargo$/i, `Analyze the cargo and manifests for ${SUBJECT}`],
  [/^ais replay$/i, `Check AIS activity and dark periods for ${SUBJECT}`],
  [/^revenue$/i, `Assess revenue leakage risk for ${SUBJECT}`],
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

describe("InvestigationLanding · Quick Start", () => {
  it("renders exactly six Quick Start actions", () => {
    renderLanding();
    for (const [label] of EXPECTED_PROMPTS) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(EXPECTED_PROMPTS).toHaveLength(6);
  });

  it.each(EXPECTED_PROMPTS)("inserts the correct prompt for %s", (label, prompt) => {
    const { onChange, onSubmit } = renderLanding();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(prompt);
    // Officer decides — a Quick Start card never submits on its own.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the prompt subject-aware", () => {
    const { onChange } = renderLanding({ subject: "MT Niger Runner" });
    fireEvent.click(screen.getByRole("button", { name: /^ownership$/i }));
    expect(onChange).toHaveBeenCalledWith("Explain the ownership structure of MT Niger Runner");
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
