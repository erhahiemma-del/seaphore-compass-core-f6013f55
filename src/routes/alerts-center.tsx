import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/alerts-center")({
  head: () => ({ meta: [{ title: "Alerts Center · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Alerts Center"
        subtitle="Prioritized, acknowledgeable, assignable alerts"
        icon={BellRing}
      />
    </AppShell>
  ),
});
