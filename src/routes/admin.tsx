import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration · Seaphore" }] }),
  component: () => (
    <AppShell title="Administration" subtitle="System Management" mode="light">
      <ModulePlaceholder title="Administration" subtitle="Self-contained" icon={Settings} />
    </AppShell>
  ),
});
