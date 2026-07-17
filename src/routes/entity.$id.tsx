import { createFileRoute } from "@tanstack/react-router";
import { Fingerprint } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { useHandoffContext } from "@/lib/nav-context";

export const Route = createFileRoute("/entity/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Entity · Seaphore` }],
  }),
  component: EntityProfile,
});

function EntityProfile() {
  const { id } = Route.useParams();
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
