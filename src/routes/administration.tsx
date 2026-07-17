import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/administration")({
  head: () => ({ meta: [{ title: "Administration · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Administration"
        subtitle="System Management · Users, Roles, Rules, Audit"
        icon={Settings}
      />
    </AppShell>
  ),
});
