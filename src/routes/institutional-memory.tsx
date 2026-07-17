import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/institutional-memory")({
  head: () => ({ meta: [{ title: "Institutional Memory · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Institutional Memory"
        subtitle="Knowledge & Learning"
        icon={Library}
        description="Seaphore learns. Every closed case, every decision outcome, every pattern feeds the institutional memory that improves future detection and recommendation."
      />
    </AppShell>
  ),
});
