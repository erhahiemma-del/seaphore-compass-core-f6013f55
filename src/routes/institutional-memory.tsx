import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/institutional-memory")({
  head: () => ({ meta: [{ title: "Institutional Memory · Seaphore" }] }),
  component: () => (
    <AppShell title="Institutional Memory" subtitle="Knowledge & Learning" mode="light">
      <ModulePlaceholder title="Institutional Memory" subtitle="Knowledge & Learning" icon={Library} />
    </AppShell>
  ),
});
