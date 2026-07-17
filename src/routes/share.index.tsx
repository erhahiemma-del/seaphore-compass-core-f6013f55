import { createFileRoute } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/share/")({
  head: () => ({ meta: [{ title: "Share · Seaphore" }] }),
  component: () => (
    <AppShell title="Share" subtitle="Briefings & Collaboration" mode="light">
      <ModulePlaceholder
        title="Share"
        subtitle="Officer-authorised briefings only"
        icon={Share2}
        description="No share leaves Seaphore without the evidence envelope and explicit officer authorisation."
      />
    </AppShell>
  ),
});
