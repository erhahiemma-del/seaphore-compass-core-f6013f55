import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/investigate")({
  head: () => ({ meta: [{ title: "Investigate · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Investigate"
        subtitle="Case Workspace"
        icon={Search}
        description="The officer's investigation workspace — timeline, evidence, knowledge graph, historical similarity, and AI findings for a single voyage, entity, or event."
        capabilities={[
          "Voyage / entity / event case workspace",
          "Knowledge graph of relationships",
          "Evidence, documents, officer notes",
          "AI findings and rules-triggered signals",
          "Case progress across the intelligence lifecycle",
        ]}
      />
    </AppShell>
  ),
});
