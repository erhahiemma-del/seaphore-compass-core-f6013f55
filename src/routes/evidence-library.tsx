import { createFileRoute } from "@tanstack/react-router";
import { FolderArchive } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/evidence-library")({
  head: () => ({ meta: [{ title: "Evidence Library · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Evidence Library"
        subtitle="Immutable, chain-of-custody-preserved evidence store"
        icon={FolderArchive}
      />
    </AppShell>
  ),
});
