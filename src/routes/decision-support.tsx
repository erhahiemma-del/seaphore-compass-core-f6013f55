import { createFileRoute } from "@tanstack/react-router";
import { Gavel } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/decision-support")({
  head: () => ({ meta: [{ title: "Decision Support · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Decision Support"
        subtitle="Officer Decision Workspace"
        icon={Gavel}
        description="Assist, never decide. Seaphore generates system recommendations backed by evidence and rules; the officer is accountable for the decision. Every decision is signed, timestamped, and immutable."
        capabilities={[
          "System-generated recommendation with confidence",
          "Evidence, rules triggered, data sources",
          "Officer decision (approve / hold / request info / escalate / deny)",
          "Officer authentication and signature",
          "Immutable decision audit trail",
        ]}
      />
    </AppShell>
  ),
});
