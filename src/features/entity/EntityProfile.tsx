import { createFileRoute, useParams } from "@tanstack/react-router";
import { Fingerprint } from "lucide-react";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { useHandoffContext } from "@/lib/nav-context";

export function EntityProfile() {
  const { id } = useParams({ from: "/entity/$id" });
  const ctx = useHandoffContext();
  return (
    <AppShell title="Entity Profile" subtitle={id} mode="light">
      <ModulePlaceholder
        title={id}
        subtitle={`Entity flyout · arrived from ${ctx.fromStage ?? "direct link"}`}
        icon={Fingerprint}
        description="Entity 360° view — identity, aliases, relationships, signals, and knowledge-graph handoff. All data carries confidence."
      />
    </AppShell>
  );
}
