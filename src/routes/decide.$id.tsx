import { createFileRoute } from "@tanstack/react-router";
import { Gavel } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CaseHeaderBar } from "@/components/case-header-bar";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { useHandoffContext } from "@/lib/nav-context";

export const Route = createFileRoute("/decide/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Decision Support · Seaphore` }],
  }),
  component: DecideWorkspace,
});

function DecideWorkspace() {
  const { id } = Route.useParams();
  const ctx = useHandoffContext();
  return (
    <AppShell title="Decision Support" subtitle={id} mode="light">
      <CaseHeaderBar
        investigationId={id}
        vessel={ctx.entityId ?? "—"}
        mission={ctx.voyageId ?? "—"}
        officer="Unassigned"
        status="Awaiting Decision"
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
        title="Officer Decision"
        subtitle="System recommendation + officer decision + digital signature"
        icon={Gavel}
      />
    </AppShell>
  );
}
