import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/ownership-intelligence")({
  head: () => ({ meta: [{ title: "Ownership Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell title="Ownership Intelligence" subtitle="Beneficial ownership, networks, ties" mode="dark">
      <ModulePlaceholder title="Ownership Intelligence" subtitle="Beneficial ownership, networks, ties" icon={Building2} />
    </AppShell>
  ),
});
