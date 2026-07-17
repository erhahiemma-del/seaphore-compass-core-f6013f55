import { createFileRoute } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CaseHeaderBar } from "@/components/case-header-bar";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { useHandoffContext } from "@/lib/nav-context";

export const Route = createFileRoute("/share/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Share · Seaphore` }],
  }),
  component: ShareWorkspace,
});

function ShareWorkspace() {
  const { id } = Route.useParams();
  const ctx = useHandoffContext();
  return (
    <AppShell title="Share" subtitle={id} mode="light">
      <CaseHeaderBar
        investigationId={id}
        vessel={ctx.entityId ?? "—"}
        mission={ctx.voyageId ?? "—"}
        officer="Unassigned"
        status="Awaiting Authorisation"
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
        title="Briefing Package"
        subtitle="Evidence envelope · officer authorisation gate"
        icon={Share2}
      />
    </AppShell>
  );
}
