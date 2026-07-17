import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/detect")({
  head: () => ({ meta: [{ title: "Detect · Seaphore" }] }),
  component: () => (
    <AppShell>
      <ModulePlaceholder
        title="Detect"
        subtitle="Intelligence Feed & Anomaly Detection"
        icon={Radar}
        description="Detect surfaces system-detected signals across all intelligence domains — manifests, cargo, revenue, vessel movement, port operations, ownership, and compliance. Every signal carries a confidence tier from the OC-001 ladder."
        capabilities={[
          "Cross-domain signal timeline",
          "Signals by domain and type",
          "Signal risk heatmap",
          "Top high-risk signals with evidence links",
          "AI signal summary (Copilot insights)",
        ]}
      />
    </AppShell>
  ),
});
