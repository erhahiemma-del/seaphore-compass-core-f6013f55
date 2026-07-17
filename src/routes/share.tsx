import { createFileRoute } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/share")({
  head: () => ({ meta: [{ title: "Share · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Share"
        subtitle="Briefings & Collaboration"
        icon={Share2}
        description="Publish briefings, share investigations, and collaborate with peer agencies — with evidence provenance preserved end to end."
      />
    </AppShell>
  ),
});
