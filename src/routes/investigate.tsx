import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/investigate")({
  head: () => ({ meta: [{ title: "Investigate · Seaphore" }] }),
  component: () => (
    <AppShell title="Investigate" subtitle="Case Workspace" mode="light">
      <ModulePlaceholder title="Investigate" subtitle="Case Workspace" icon={Search} />
    </AppShell>
  ),
});
