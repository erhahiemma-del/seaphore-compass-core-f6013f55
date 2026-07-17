import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CaseHeaderBar } from "@/components/case-header-bar";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { useHandoffContext } from "@/lib/nav-context";

export const Route = createFileRoute("/investigate/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Investigate · Seaphore` }],
  }),
  component: InvestigateWorkspace,
});

function InvestigateWorkspace() {
  const { id } = Route.useParams();
  const ctx = useHandoffContext();
  return (
    <AppShell title="Investigate" subtitle={id} mode="light">
      <CaseHeaderBar
        investigationId={id}
        vessel={ctx.entityId ?? "—"}
        mission={ctx.voyageId ?? "—"}
        officer="Unassigned"
        status="Open"
        risk="MEDIUM"
        confidence={
          (ctx.confidence?.toLowerCase() as
            | "verified"
            | "observed"
            | "inferred"
            | "unconfirmed"
            | undefined) ?? "inferred"
        }
      />
      <ModulePlaceholder
        title="Voyage Workspace"
        subtitle="Investigate stage · knowledge graph, evidence, copilot"
        icon={Search}
        description="This is where officers work a case. The detecting signal from Detect is pre-loaded as the first evidence item. Hand off to Decision Support when ready."
      />
    </AppShell>
  );
}
