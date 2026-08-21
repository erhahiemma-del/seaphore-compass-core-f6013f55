/**
 * Data Sources & Evidence Providers.
 *
 * Reads the existing registries — `listVesselSources()`,
 * `aisProviderRegistry`, `governmentRegistry` — and renders them. It
 * holds no provider metadata of its own, so a provider added anywhere
 * appears here without a UI change, and there is no second list to drift.
 *
 * ## Certified is not connected
 *
 * The connector framework certifies a provider *before registration* —
 * it means the implementation satisfies the contract. It says nothing
 * about whether credentials exist, whether the endpoint answers, or
 * whether the licence permits use. A page that showed CERTIFIED beside a
 * provider awaiting credentials would tell an officer it was live.
 *
 * So certification is never rendered as a status here. Only operational
 * availability is, and it is grouped so the difference is unmissable.
 */
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { collectProviders, type Availability } from "./providers";

const GROUPS: readonly {
  readonly key: Availability;
  readonly label: string;
  readonly note: string;
}[] = [
  {
    key: "ACTIVE",
    label: "Active",
    note: "Authenticated and producing evidence now.",
  },
  {
    key: "AWAITING_CREDENTIALS",
    label: "Awaiting credentials",
    note: "Implemented. Needs a key or account before it can be used.",
  },
  {
    key: "PENDING_INTEGRATION",
    label: "Pending integration",
    note: "Connector or commercial access not yet in place.",
  },
  {
    key: "UNAVAILABLE",
    label: "Unavailable",
    note: "Reachable in principle but currently blocked. The reason is stated.",
  },
];

const TONE: Record<Availability, string> = {
  ACTIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  AWAITING_CREDENTIALS: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  PENDING_INTEGRATION: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  UNAVAILABLE: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};

export function DataSourcesPage() {
  const rows = useMemo(collectProviders, []);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-sm font-semibold tracking-wide">Data Sources & Evidence Providers</h1>
        <p className="text-[12px] text-muted-foreground">
          Read from the provider registries. A source&apos;s presence here does not mean it is
          producing data — availability is stated per provider, and certification is not shown
          because a certified connector may still be awaiting access.
        </p>
      </header>

      {GROUPS.map((group) => {
        const members = rows.filter((row) => row.availability === group.key);
        return (
          <section key={group.key} aria-label={group.label} data-testid={`group-${group.key}`}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {group.label}
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {members.length} · {group.note}
              </span>
            </div>

            {members.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-[11.5px] text-muted-foreground">
                None.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {members.map((row) => (
                  <li
                    key={row.id}
                    data-testid={`provider-${row.id}`}
                    className="rounded-md border border-border/60 bg-background p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{row.name}</span>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          TONE[row.availability],
                        )}
                      >
                        {row.availability.replace(/_/g, " ")}
                      </span>
                    </div>

                    <p className="mt-1 text-[11.5px] text-muted-foreground">{row.capabilities}</p>

                    {row.reason ? (
                      <p className="mt-1 text-[11.5px] text-amber-700">{row.reason}</p>
                    ) : null}

                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Auth · {row.authentication}</span>
                      <span>Provenance · {row.provenance}</span>
                      {row.requires ? <span>Requires · {row.requires}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
