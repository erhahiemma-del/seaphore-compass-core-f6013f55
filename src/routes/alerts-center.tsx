import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/alerts-center")({
  head: () => ({ meta: [{ title: "Alerts Center · Seaphore" }] }),
  component: () => (
    <AppShell title="Alerts Center" subtitle="Live alerts across every intelligence domain" mode="dark">
      <ModulePlaceholder title="Alerts Center" subtitle="Live alerts across every intelligence domain" icon={BellRing} />
    </AppShell>
  ),
});
