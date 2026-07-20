import type { Meta, StoryObj } from "@storybook/react";
import { AdaptiveBriefing } from "./AdaptiveBriefing";
import { SAMPLE_BRIEFINGS } from "@/mocks/adaptive-briefings";

const meta: Meta<typeof AdaptiveBriefing> = {
  title: "Copilot/Briefing/AdaptiveBriefing",
  component: AdaptiveBriefing,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AdaptiveBriefing>;

export const Lookup: Story = { args: { briefing: SAMPLE_BRIEFINGS[0] } };
export const AssessmentSanctions: Story = { args: { briefing: SAMPLE_BRIEFINGS[1] } };
export const InvestigationRevenue: Story = { args: { briefing: SAMPLE_BRIEFINGS[2] } };
export const ForecastPiracy: Story = { args: { briefing: SAMPLE_BRIEFINGS[3] } };
export const ManifestCrosscheck: Story = { args: { briefing: SAMPLE_BRIEFINGS[4] } };
