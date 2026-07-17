import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/cargo")({
  head: () => ({ meta: [{ title: "Cargo Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell title="Cargo Intelligence" subtitle="Commodity signals" mode="dark">
      <ModulePlaceholder title="Cargo Intelligence" subtitle="Detect stage" icon={Package} />
    </AppShell>
  ),
});
