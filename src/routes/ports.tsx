import { createFileRoute } from "@tanstack/react-router";
import { Anchor } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/ports")({
  head: () => ({ meta: [{ title: "Port Operations · Seaphore" }] }),
  component: () => (
    <AppShell title="Port Operations" subtitle="Berth, dwell, movement" mode="dark">
      <ModulePlaceholder title="Port Operations" subtitle="Monitor stage" icon={Anchor} />
    </AppShell>
  ),
});
