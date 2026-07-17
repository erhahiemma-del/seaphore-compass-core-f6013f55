import { createFileRoute } from "@tanstack/react-router";
import { DollarSign } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/revenue-intelligence")({
  head: () => ({ meta: [{ title: "Revenue Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Revenue Intelligence"
        subtitle="Under-declaration, revenue leakage, recovery"
        icon={DollarSign}
      />
    </AppShell>
  ),
});
