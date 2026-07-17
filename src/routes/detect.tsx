import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/detect")({
  head: () => ({ meta: [{ title: "Detect · Seaphore" }] }),
  component: () => (
    <AppShell title="Detect" subtitle="Intelligence Feed" mode="light">
      <ModulePlaceholder
        title="Detect"
        subtitle="Intelligence Feed"
        icon={Radar}
        description="Continuous signal surface across every Intelligence Centre. Every row hands off to Investigate with the detecting signal pre-loaded as first evidence."
      />
    </AppShell>
  ),
});
