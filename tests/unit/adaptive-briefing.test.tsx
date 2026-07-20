import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());

import { AdaptiveBriefing } from "@/components/copilot/briefing";
import { SAMPLE_BRIEFINGS } from "@/mocks/adaptive-briefings";

describe("AdaptiveBriefing", () => {
  it("renders the immutable footer on every briefing", () => {
    for (const b of SAMPLE_BRIEFINGS) {
      const { unmount, container } = render(<AdaptiveBriefing briefing={b} />);
      expect(container.textContent).toMatch(
        /evidence first\. explainable always\. officer decides\./i,
      );
      unmount();
    }
  });

  it("omits sections whose payloads are missing or empty (lookup)", () => {
    const { container } = render(<AdaptiveBriefing briefing={SAMPLE_BRIEFINGS[0]} />);
    expect(container.textContent).not.toMatch(/decision impact/i);
    expect(container.textContent).not.toMatch(/counter-hypotheses/i);
    expect(container.textContent).not.toMatch(/officer actions/i);
  });

  it("renders all headline sections for the sanctions assessment", () => {
    const { container } = render(<AdaptiveBriefing briefing={SAMPLE_BRIEFINGS[1]} />);
    for (const label of [
      /executive assessment/i,
      /critical findings/i,
      /analytical conclusion/i,
      /decision impact/i,
      /officer actions/i,
      /next intelligence questions/i,
    ]) {
      expect(container.textContent).toMatch(label);
    }
  });

  it("keeps officer actions disabled until the officer agrees or modifies", () => {
    render(<AdaptiveBriefing briefing={SAMPLE_BRIEFINGS[1]} />);
    const first = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(first.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^agree$/i }));
    const after = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(after.disabled).toBe(false);
  });

  it("exposes all 4 override options on the Human Override Bar", () => {
    render(<AdaptiveBriefing briefing={SAMPLE_BRIEFINGS[1]} />);
    for (const label of ["agree", "disagree", "modify", "dismiss"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") }),
      ).toBeTruthy();
    }
  });

  it("fires onOverride with the chosen decision", async () => {
    const onOverride = vi.fn();
    render(<AdaptiveBriefing briefing={SAMPLE_BRIEFINGS[1]} onOverride={onOverride} />);
    fireEvent.click(screen.getByRole("button", { name: /^disagree$/i }));
    expect(onOverride).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "disagree", actionsAccepted: [] }),
    );
  });

  it("renders 5 distinct sample briefings without crashing", () => {
    for (const b of SAMPLE_BRIEFINGS) {
      const { unmount } = render(<AdaptiveBriefing briefing={b} />);
      expect(screen.getByLabelText(new RegExp(`Briefing ${b.id}`, "i"))).toBeTruthy();
      unmount();
    }
  });
});
