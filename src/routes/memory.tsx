import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/memory")({
  head: () => ({ meta: [{ title: "Institutional Memory · Seaphore" }] }),
  component: () => (
    <AppShell title="Institutional Memory" subtitle="Knowledge & Learning" mode="light">
      <ModulePlaceholder
        title="Institutional Memory"
        subtitle="Closed cases feed forward"
        icon={Library}
        description="Every closed investigation becomes a searchable precedent. Hands off to Investigate for any entity, or back to Mission Control."
      />
    </AppShell>
  ),
});
