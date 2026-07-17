import { createFileRoute } from "@tanstack/react-router";
import { Gavel } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/decision-support")({
  head: () => ({ meta: [{ title: "Decision Support · Seaphore" }] }),
  component: () => (
    <AppShell title="Decision Support" subtitle="Recommendations & Officer Decisions" mode="light">
      <ModulePlaceholder title="Decision Support" subtitle="Recommendations & Officer Decisions" icon={Gavel} />
    </AppShell>
  ),
});
