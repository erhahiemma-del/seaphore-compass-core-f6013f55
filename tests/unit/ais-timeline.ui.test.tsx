// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineStrip, type TimelineEvent } from "@/components/intelligence/TimelineStrip";

afterEach(() => cleanup());

const AIS_EVENTS: TimelineEvent[] = [
  {
    id: "e1",
    at: "2026-07-20T09:15:00Z",
    label: "AIS ping — Lagos Anchorage",
    confidence: "observed",
  },
  { id: "e2", at: "2026-07-21T04:00:00Z", label: "Course change — 210°", confidence: "observed" },
  { id: "e3", at: "2026-07-19T22:45:00Z", label: "AIS gap ended", confidence: "inferred" },
  { id: "e4", at: "2026-07-22T11:30:00Z", label: "Port call — Apapa", confidence: "verified" },
];

describe("AIS TimelineStrip", () => {
  it("renders events newest-to-oldest regardless of input order", () => {
    render(<TimelineStrip events={AIS_EVENTS} />);
    const list = screen.getByTestId("ais-timeline");
    const items = within(list).getAllByRole("listitem");
    const timestamps = items.map((li) => new Date(li.getAttribute("data-at")!).getTime());
    // Strictly descending — newest first.
    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i - 1]).toBeGreaterThan(timestamps[i]);
    }
    // Every input event is represented exactly once (order irrelevant here).
    expect(items).toHaveLength(AIS_EVENTS.length);
  });

  it("collapses events sharing an identical ISO instant into a single visual card", () => {
    const dupInstant = "2026-07-21T04:00:00Z";
    const events: TimelineEvent[] = [
      ...AIS_EVENTS,
      { id: "e2-dup-a", at: dupInstant, label: "Course change — 210° (duplicate feed)" },
      { id: "e2-dup-b", at: dupInstant, label: "Course change — 210° (mirror)" },
    ];
    render(<TimelineStrip events={events} />);

    const items = within(screen.getByTestId("ais-timeline")).getAllByRole("listitem");
    // 4 unique instants remain — the three duplicates collapse into one card.
    expect(items).toHaveLength(4);

    // Duplicates should not appear as their own DOM nodes.
    expect(screen.queryByTestId("ais-timeline-item-e2-dup-a")).toBeNull();
    expect(screen.queryByTestId("ais-timeline-item-e2-dup-b")).toBeNull();

    // The surviving card exposes a +N badge counting the collapsed duplicates.
    const badge = screen.getByTestId("ais-timeline-dupe-e2");
    expect(badge.textContent).toBe("+2");
    expect(badge.getAttribute("aria-label")).toMatch(/2 additional events/i);
  });

  it("does not render a duplicate badge when every instant is unique", () => {
    render(<TimelineStrip events={AIS_EVENTS} />);
    for (const ev of AIS_EVENTS) {
      expect(screen.queryByTestId(`ais-timeline-dupe-${ev.id}`)).toBeNull();
    }
  });

  it("keeps click-through wired to the surviving card after de-duplication", () => {
    const dupInstant = "2026-07-21T04:00:00Z";
    const events: TimelineEvent[] = [
      ...AIS_EVENTS,
      { id: "e2-dup", at: dupInstant, label: "Course change — 210° (duplicate)" },
    ];
    const onSelect = vi.fn();
    render(<TimelineStrip events={events} onSelect={onSelect} />);
    const button = within(screen.getByTestId("ais-timeline-item-e2")).getByRole("button");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("e2");
  });

  it("shows the empty state when no events are provided", () => {
    render(<TimelineStrip events={[]} />);
    expect(screen.queryByTestId("ais-timeline")).toBeNull();
    expect(screen.getByText(/no events observed/i)).toBeInTheDocument();
  });
});
