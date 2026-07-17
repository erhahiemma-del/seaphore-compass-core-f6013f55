import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/cargo-intelligence")({
  head: () => ({ meta: [{ title: "Cargo Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Cargo Intelligence"
        subtitle="Container movements, seal integrity, cargo changes"
        icon={Package}
      />
    </AppShell>
  ),
});
