// Storybook types are optional in this project — fall back to loose typing
// when @storybook/react isn't installed so the app build stays green.
// @ts-expect-error optional peer dep
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";

import { CopilotModal } from "@/components/copilot/CopilotModal";
import { useCopilotStore } from "@/stores/copilot.store";

const meta: Meta<typeof CopilotModal> = {
  title: "Copilot/CopilotModal",
  component: CopilotModal,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof CopilotModal>;

function OpenOnMount({ children }: { children: React.ReactNode }) {
  const openCopilot = useCopilotStore((s) => s.openCopilot);
  useEffect(() => {
    openCopilot();
  }, [openCopilot]);
  return <>{children}</>;
}

export const ZeroState: Story = {
  render: () => (
    <OpenOnMount>
      <CopilotModal initialState="zero" context={null} />
    </OpenOnMount>
  ),
};

export const WithInvestigationContext: Story = {
  render: () => (
    <OpenOnMount>
      <CopilotModal
        initialState="zero"
        context={{
          kind: "investigation",
          label: "CASE-2041 · MV Northern Star",
          detail: "Bonny → Lomé",
        }}
      />
    </OpenOnMount>
  ),
};

export const Streaming: Story = {
  render: () => (
    <OpenOnMount>
      <CopilotModal
        initialState="streaming"
        context={{ kind: "vessel", label: "IMO 9876543 · MV Northern Star" }}
      />
    </OpenOnMount>
  ),
};

export const PortContext: Story = {
  render: () => (
    <OpenOnMount>
      <CopilotModal
        initialState="zero"
        context={{ kind: "port", label: "Apapa (NGAPP)", detail: "8 vessels alongside" }}
        suggestions={[
          "Which berths are over dwell-time threshold?",
          "List sanctioned callers in the last 30 days",
          "Summarise revenue-at-risk for this port",
        ]}
      />
    </OpenOnMount>
  ),
};
