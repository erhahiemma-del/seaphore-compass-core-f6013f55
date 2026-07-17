import { createFileRoute } from "@tanstack/react-router";
import { Ship } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/vessel-intelligence")({
  head: () => ({ meta: [{ title: "Vessel Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Vessel Intelligence"
        subtitle="AIS gaps, movement anomalies, vessel history"
        icon={Ship}
      />
    </AppShell>
  ),
});
