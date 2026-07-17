import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/compliance-intelligence")({
  head: () => ({ meta: [{ title: "Compliance Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Compliance Intelligence"
        subtitle="Sanctions watch, high-risk countries, compliance alerts"
        icon={ShieldCheck}
      />
    </AppShell>
  ),
});
