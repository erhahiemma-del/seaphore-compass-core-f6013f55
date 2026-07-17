import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/manifest-intelligence")({
  head: () => ({ meta: [{ title: "Manifest Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Manifest Intelligence"
        subtitle="Bill of Lading, cargo declarations, HS-code integrity"
        icon={FileText}
      />
    </AppShell>
  ),
});
