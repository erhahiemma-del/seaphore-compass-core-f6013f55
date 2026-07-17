import { createFileRoute } from "@tanstack/react-router";
import { FolderArchive } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/evidence-library")({
  head: () => ({ meta: [{ title: "Evidence Library · Seaphore" }] }),
  component: () => (
    <AppShell title="Evidence Library" subtitle="Source-of-truth artefacts" mode="dark">
      <ModulePlaceholder title="Evidence Library" subtitle="Source-of-truth artefacts" icon={FolderArchive} />
    </AppShell>
  ),
});
