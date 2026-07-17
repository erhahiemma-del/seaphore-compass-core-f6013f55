import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/compliance-intelligence")({
  head: () => ({ meta: [{ title: "Compliance Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell title="Compliance Intelligence" subtitle="Sanctions, controls, screening" mode="dark">
      <ModulePlaceholder title="Compliance Intelligence" subtitle="Sanctions, controls, screening" icon={ShieldCheck} />
    </AppShell>
  ),
});
