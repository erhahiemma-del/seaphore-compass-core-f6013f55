import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Administration = () => (
    <AppShell title="Administration" subtitle="System Management" mode="light">
      <ModulePlaceholder title="Administration" subtitle="Self-contained" icon={Settings} />
    </AppShell>
  );
