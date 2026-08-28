// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AttentionCentre } from "@/features/maritime/AttentionCentre";
import type { AlertPresentation } from "@/services/alerts";

/**
 * The attention feed's behaviour under a human.
 *
 * An operations feed that moves on its own is useful until an officer
 * reaches for it, and then it becomes something they are fighting. These
 * assert that the officer wins that contest immediately, that nothing
 * restarts the motion except them, and that an arriving alert never
 * takes their reading position away.
 */
afterEach(cleanup);

function presentation(n: number): AlertPresentation {
  return {
    alertId: `alert_${n}`,
    imo: `SIM-${String(n).padStart(4, "0")}`,
    vesselName: `Vessel ${n}`,
    condition: "APPROACHING_24H",
    severity: "URGENT",
    lifecycleState: "OPEN",
    acknowledged: false,
    visualState: "ACTIVE",
    remindable: true,
    displayPriority: n,
    headline: "Approaching within 24 hours",
    arrivalLine: "Approximately 18 hours · Estimated",
    reason: "Vessel meets the current 24-hour operational approach threshold.",
    provenance: {
      source: "simulated",
      positionAge: "Fresh",
      arrivalBasis: "Estimated",
      boundaryAccuracy: "Approximate",
    },
    assessmentUnavailable: false,
    actions: ["ACKNOWLEDGE", "ADD_UPDATE", "RESOLVE"],
  };
}

function renderCentre(
  count: number,
  extra: Partial<React.ComponentProps<typeof AttentionCentre>> = {},
) {
  const alerts = Array.from({ length: count }, (_, i) => presentation(i + 1));
  const view = render(
    <AttentionCentre
      alerts={alerts}
      counts={{ URGENT: count, ATTENTION: 0, WATCH: 0 }}
      assessable
      unassessableCount={0}
      onView={vi.fn()}
      onAcknowledge={vi.fn()}
      {...extra}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Attention centre/ }));
  return { view, alerts };
}

/**
 * jsdom reports every element as zero-height, so the feed would always
 * conclude the list fits and no motion state could ever be exercised.
 *
 * Patched on the prototype and before render, because the component
 * measures overflow while mounting — overriding the instance afterwards
 * would be measuring a list the effect had already read.
 */
function withOverflowingList() {
  Object.defineProperty(HTMLUListElement.prototype, "scrollHeight", {
    value: 800,
    configurable: true,
  });
  Object.defineProperty(HTMLUListElement.prototype, "clientHeight", {
    value: 200,
    configurable: true,
  });
}

function list(): HTMLElement {
  const found = document.querySelector("ul");
  if (!found) throw new Error("no list");
  return found as HTMLElement;
}

describe("the feed reports its own motion", () => {
  it("says the list fits when there is nothing to scroll", () => {
    renderCentre(2);

    // Not "paused": nobody stopped anything, and implying they did would
    // send an officer looking for a resume control that should not exist.
    expect(screen.getByTestId("feed-motion")).toHaveTextContent("All alerts visible");
    expect(screen.queryByRole("button", { name: /Resume live watch/ })).not.toBeInTheDocument();
  });

  it("goes live once the list overflows", async () => {
    withOverflowingList();
    renderCentre(30);

    expect(screen.getByTestId("feed-motion")).toHaveTextContent("Live watch");
  });
});

describe("a human always wins", () => {
  const interactions: ReadonlyArray<[string, (list: HTMLElement) => void]> = [
    ["pointer entering", (list) => fireEvent.pointerEnter(list)],
    ["a wheel", (list) => fireEvent.wheel(list)],
    ["a touch", (list) => fireEvent.touchStart(list)],
    ["a key", (list) => fireEvent.keyDown(list, { key: "ArrowDown" })],
    ["a pointer press", (list) => fireEvent.pointerDown(list)],
  ];

  for (const [name, act_] of interactions) {
    it(`pauses on ${name}`, async () => {
      withOverflowingList();
      renderCentre(30);

      await act(async () => {
        act_(list());
      });

      expect(screen.getByTestId("feed-motion")).toHaveTextContent("Paused");
    });
  }

  it("offers a deliberate resume, and nothing else restarts it", async () => {
    withOverflowingList();
    renderCentre(30);
    await act(async () => {
      fireEvent.wheel(list());
    });
    expect(screen.getByTestId("feed-motion")).toHaveTextContent("Paused");

    /*
     * Time passing must not resume it. An inactivity timer would
     * eventually move the list while the officer was still reading,
     * which is the failure the pause exists to prevent. Asserted by
     * waiting real time rather than by faking it, because a fake clock
     * would not advance a timer this code is supposed not to have.
     */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(screen.getByTestId("feed-motion")).toHaveTextContent("Paused");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Resume live watch/ }));
    });
    expect(screen.getByTestId("feed-motion")).not.toHaveTextContent("Paused");
  });

  it("pauses when the officer acts on a row", async () => {
    const onView = vi.fn();
    withOverflowingList();
    renderCentre(30, { onView });

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    });

    expect(onView).toHaveBeenCalledWith("SIM-0001");
    expect(screen.getByTestId("feed-motion")).toHaveTextContent("Paused");
  });
});

describe("arrivals never move the officer", () => {
  it("announces new alerts instead of applying them", async () => {
    withOverflowingList();
    const { view } = renderCentre(30);
    await act(async () => {
      fireEvent.pointerEnter(list());
    });
    expect(screen.queryByTestId("attention-new")).not.toBeInTheDocument();

    const more = Array.from({ length: 32 }, (_, i) => presentation(i + 1));
    await act(async () => {
      view.rerender(
        <AttentionCentre
          alerts={more}
          counts={{ URGENT: 32, ATTENTION: 0, WATCH: 0 }}
          assessable
          unassessableCount={0}
          onView={vi.fn()}
          onAcknowledge={vi.fn()}
        />,
      );
    });

    // Announced, and the officer decides when to look.
    expect(screen.getByTestId("attention-new")).toHaveTextContent("2 new alerts");
    expect(screen.getByTestId("feed-motion")).toHaveTextContent("Paused");
  });

  it("does not announce arrivals while the feed is live", async () => {
    withOverflowingList();
    const { view } = renderCentre(30);

    const more = Array.from({ length: 31 }, (_, i) => presentation(i + 1));
    await act(async () => {
      view.rerender(
        <AttentionCentre
          alerts={more}
          counts={{ URGENT: 31, ATTENTION: 0, WATCH: 0 }}
          assessable
          unassessableCount={0}
          onView={vi.fn()}
          onAcknowledge={vi.fn()}
        />,
      );
    });

    // Nothing is being read, so there is no reading position to protect.
    expect(screen.queryByTestId("attention-new")).not.toBeInTheDocument();
  });
});

describe("session honesty", () => {
  it("says alerts are not stored", () => {
    renderCentre(1);

    expect(screen.getByText(/not stored/)).toBeInTheDocument();
  });

  it("says nothing about storage once alerts are durable", () => {
    renderCentre(1, { durable: true });

    expect(screen.queryByText(/not stored/)).not.toBeInTheDocument();
  });
});
