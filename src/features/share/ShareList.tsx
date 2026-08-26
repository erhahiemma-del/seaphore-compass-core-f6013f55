import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { INVESTIGATIONS, RECENT_SHARES } from "@/lib/lifecycle-data";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

export function ShareList() {
  return (
    <AppShell mode="light">
      <DemoDataNotice surface="Share" className="mb-3" />
      <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="type-display text-foreground">Officer-authorised briefings</h1>
            <p className="type-small text-slate">
              No share leaves Seaphore without the evidence envelope and explicit officer
              authorisation.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PanelCard>
            <PanelHead title="Cases Ready to Share" meta={`${INVESTIGATIONS.length} decided`} />
            <ul className="divide-y divide-line">
              {INVESTIGATIONS.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div>
                    <div className="type-mono text-[11px] text-slate">{inv.id}</div>
                    <div className="text-[13px] font-semibold text-foreground">{inv.vessel}</div>
                  </div>
                  <div className="min-w-0 flex-1 text-[11px] text-slate">
                    {inv.mission} · {inv.officer}
                  </div>
                  <Link
                    to="/share/$id"
                    params={{ id: inv.id }}
                    className="rounded-md bg-[color:var(--color-navy)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90"
                  >
                    Prepare briefing →
                  </Link>
                </li>
              ))}
            </ul>
          </PanelCard>

          <PanelCard>
            <PanelHead title="Recent Shares" meta="Last 4 authorised sends" />
            <ul className="divide-y divide-line">
              {RECENT_SHARES.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-[12px]">
                  <div className="min-w-0 flex-1">
                    <div className="type-mono text-[11px] text-slate">{s.investigationId}</div>
                    <div className="truncate font-semibold text-foreground">{s.title}</div>
                    <div className="text-[11px] text-slate">{s.date}</div>
                  </div>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                    style={{ color: "#1E6B3A", backgroundColor: "#1E6B3A14" }}
                  >
                    SENT
                  </span>
                </li>
              ))}
            </ul>
          </PanelCard>
        </div>
      </div>
    </AppShell>
  );
}
