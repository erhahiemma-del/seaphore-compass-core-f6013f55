import { createFileRoute } from "@tanstack/react-router";
import { DollarSign } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/revenue")({
  head: () => ({ meta: [{ title: "Revenue Intelligence · Seaphore" }] }),
  component: () => (
    <AppShell title="Revenue Intelligence" subtitle="Duties & valuation" mode="dark">
      <ModulePlaceholder title="Revenue Intelligence" subtitle="Detect stage" icon={DollarSign} />
    </AppShell>
  ),
});
