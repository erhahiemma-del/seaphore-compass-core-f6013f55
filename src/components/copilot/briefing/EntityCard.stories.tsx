import type { Meta, StoryObj } from "@storybook/react";
import { EntityCard } from "./EntityCard";

const meta: Meta<typeof EntityCard> = {
  title: "Copilot/Briefing/EntityCard",
  component: EntityCard,
};
export default meta;

export const Vessel: StoryObj<typeof EntityCard> = {
  args: {
    entity: {
      id: "vsl",
      type: "vessel",
      name: "MT ATLANTIC HORIZON",
      identifiers: [
        { label: "IMO", value: "9319466" },
        { label: "MMSI", value: "636017890" },
      ],
      flag: "Liberia",
      role: "Registered vessel",
      riskTier: "medium",
      lastSeen: "2026-07-18",
    },
    onOpen: () => {},
  },
};

export const Company: StoryObj<typeof EntityCard> = {
  args: {
    entity: {
      id: "org",
      type: "company",
      name: "Horizon Shipping Ltd",
      identifiers: [{ label: "LEI", value: "254900MYQXP7T3F0U411" }],
      flag: "Marshall Islands",
      role: "Registered owner",
      riskTier: "high",
    },
    onOpen: () => {},
  },
};
