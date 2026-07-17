import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/ownership-intelligence")({
  head: () => ({ meta: [{ title: "Ownership Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Ownership Intelligence"
        subtitle="Beneficial ownership, corporate networks, agent relationships"
        icon={Building2}
      />
    </AppShell>
  ),
});
