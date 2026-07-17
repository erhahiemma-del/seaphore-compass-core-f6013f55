import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alerts Center · Seaphore" }] }),
  component: () => (
    <AppShell title="Alerts Center" subtitle="Live and acknowledged alerts" mode="light">
      <ModulePlaceholder title="Alerts Center" subtitle="Monitor stage" icon={BellRing} />
    </AppShell>
  ),
});
