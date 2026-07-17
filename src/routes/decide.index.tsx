import { createFileRoute } from "@tanstack/react-router";
import { Gavel } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/decide/")({
  head: () => ({ meta: [{ title: "Decision Support · Seaphore" }] }),
  component: () => (
    <AppShell title="Decision Support" subtitle="Officer Workspace" mode="light">
      <ModulePlaceholder
        title="Decision Support"
        subtitle="Pick a case to review the system recommendation"
        icon={Gavel}
        description="Officers land here from Investigate. Every recommendation comes from the system; every decision comes from the officer."
      />
    </AppShell>
  ),
});
