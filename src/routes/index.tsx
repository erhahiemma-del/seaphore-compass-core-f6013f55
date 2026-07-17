import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Mission Control · Seaphore" }],
  }),
  component: MissionControl,
});

function MissionControl() {
  return (
    <AppShell>
      <ModulePlaceholder
        title="Mission Control"
        subtitle="National Overview · Command Center"
        icon={LayoutDashboard}
        description="Mission Control is the officer's national overview. It aggregates mission status, threat posture, and the live intelligence timeline across every domain. This screen — and every operational module — will be built in later sprints. The foundation sprint delivers only the architecture, design system, navigation, authentication, routing, and backend scaffolding."
        capabilities={[
          "National Maritime Risk posture",
          "Live Threat Map",
          "Intelligence Timeline (live updates)",
          "Today's Priorities and Mission Status",
          "Quick access to every Intelligence Center",
          "Natural-language intelligence queries (Copilot)",
        ]}
      />
    </AppShell>
  );
}
