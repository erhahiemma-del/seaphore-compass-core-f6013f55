/**
 * SPRINT CAP-02 — Cargo Intelligence Workspace shell.
 *
 * Six operational intelligence centres over CAPABILITY.CARGO. The shell
 * owns navigation only; every number comes from the Canonical UIP via
 * `cargo-workspace-projection.ts`.
 */
import { Link } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { PanelCard } from "@/components/panel-card";
import {
  CARGO_CENTRES,
  type CargoCentreDefinition,
} from "@/lib/intelligence/cargo-workspace-projection";
import { CargoCentreStateChip, CargoCentreView } from "./CargoCentreView";
import { useCargoCentreProjection, useCargoWorkspaceProjections } from "./use-cargo-projection";
import { cn } from "@/lib/utils";

function CentreTabs({ activeSlug }: { activeSlug: string | null }) {
  return (
    <nav aria-label="Cargo intelligence centres" className="flex flex-wrap gap-2">
      {CARGO_CENTRES.map((c) => (
        <Link
          key={c.id}
          to="/cargo-workspace/$centre"
          params={{ centre: c.slug }}
          className={cn(
            "rounded-md border px-3 py-1.5 type-small font-semibold motion-fast",
            activeSlug === c.slug
              ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
              : "border-line bg-surface text-foreground/80 hover:bg-surface-2",
          )}
        >
          {c.title}
        </Link>
      ))}
    </nav>
  );
}

export function CargoWorkspaceOverview() {
  const { projections } = useCargoWorkspaceProjections();
  return (
    <AppShell
      title="Cargo Intelligence Workspace"
      subtitle="CAPABILITY.CARGO · six operational intelligence centres"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-5">
        <CentreTabs activeSlug={null} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projections.map((p) => (
            <Link
              key={p.centre.id}
              to="/cargo-workspace/$centre"
              params={{ centre: p.centre.slug }}
              className="block"
            >
              <PanelCard className="h-full motion-fast hover:border-[color:var(--color-blue)]/40">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="type-h6 font-semibold text-foreground">{p.centre.title}</h2>
                  <CargoCentreStateChip projection={p} />
                </div>
                <p className="mt-1 type-small text-slate">{p.centre.subtitle}</p>
                <p className="mt-2 type-small text-foreground/80">
                  {p.data
                    ? `${p.data.evidenceCount} evidence record${p.data.evidenceCount === 1 ? "" : "s"} projected from the Canonical UIP.`
                    : p.stateDetail}
                </p>
              </PanelCard>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export function CargoCentreScreen({ centre }: { centre: CargoCentreDefinition }) {
  const { projection } = useCargoCentreProjection(centre);
  return (
    <AppShell title={centre.title} subtitle={centre.subtitle}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-5">
        <CentreTabs activeSlug={centre.slug} />
        <CargoCentreView projection={projection} />
      </div>
    </AppShell>
  );
}
