import type { Meta, StoryObj } from "@storybook/react";
import { PatternCard } from "./PatternCard";

const meta: Meta<typeof PatternCard> = {
  title: "Copilot/Briefing/PatternCard",
  component: PatternCard,
};
export default meta;

export const Material: StoryObj<typeof PatternCard> = {
  args: {
    pattern: {
      id: "p1",
      pattern: "Same surveyor signs off on every under-reported shipment",
      significance: "material",
      caseRefs: ["CASE-2024-118"],
      observedCount: 11,
      firstSeen: "2026-07-02",
      lastSeen: "2026-07-28",
    },
  },
};

export const Notable: StoryObj<typeof PatternCard> = {
  args: {
    pattern: {
      id: "p2",
      pattern: "Historical Q3 uplift of 22–35% versus Q2",
      significance: "notable",
      observedCount: 5,
    },
  },
};
