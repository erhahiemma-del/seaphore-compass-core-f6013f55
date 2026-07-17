import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/detect")({
  head: () => ({ meta: [{ title: "Detect · Seaphore" }] }),
  component: () => (
    <AppShell title="Detect" subtitle="Intelligence Feed & Anomaly Detection" mode="light">
      <ModulePlaceholder
        title="Detect"
        subtitle="Intelligence Feed & Anomaly Detection"
        icon={Radar}
      />
    </AppShell>
  ),
});
