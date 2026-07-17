import { createFileRoute } from "@tanstack/react-router";
import { Ship } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/vessel")({
  head: () => ({ meta: [{ title: "Vessel Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell title="Vessel Intelligence" subtitle="Vessel behaviour & identity" mode="dark">
      <ModulePlaceholder title="Vessel Intelligence" subtitle="Detect stage" icon={Ship} />
    </AppShell>
  ),
});
