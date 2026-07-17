import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/manifest")({
  head: () => ({ meta: [{ title: "Manifest Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell title="Manifest Intelligence" subtitle="Declared vs actual" mode="dark">
      <ModulePlaceholder title="Manifest Intelligence" subtitle="Detect stage" icon={FileText} />
    </AppShell>
  ),
});
