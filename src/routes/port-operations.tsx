import { createFileRoute } from "@tanstack/react-router";
import { Anchor } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/port-operations")({
  head: () => ({ meta: [{ title: "Port Operations · Seaphore" }] }),
  component: () => (
    <AppShell title="Port Operations" subtitle="Congestion, port state control, throughput" mode="dark">
      <ModulePlaceholder title="Port Operations" subtitle="Congestion index, port state control, throughput" icon={Anchor} />
    </AppShell>
  ),
});
