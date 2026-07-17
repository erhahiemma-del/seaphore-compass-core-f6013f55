import { createFileRoute } from "@tanstack/react-router";
import { FolderArchive } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/evidence")({
  head: () => ({ meta: [{ title: "Evidence Library · Seaphore" }] }),
  component: () => (
    <AppShell title="Evidence Library" subtitle="Chain-of-custody artefacts" mode="light">
      <ModulePlaceholder title="Evidence Library" subtitle="Investigate stage" icon={FolderArchive} />
    </AppShell>
  ),
});
