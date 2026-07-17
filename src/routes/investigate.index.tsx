import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/investigate/")({
  head: () => ({ meta: [{ title: "Investigate · Seaphore" }] }),
  component: () => (
    <AppShell title="Investigate" subtitle="Case Workspace" mode="light">
      <ModulePlaceholder
        title="Investigate"
        subtitle="Open a case to enter the voyage workspace"
        icon={Search}
        description="Case list lands here in a future sprint. Every case opens with entity, voyage, and detecting-signal context already pre-loaded — officers never enter an empty workspace."
      />
    </AppShell>
  ),
});
