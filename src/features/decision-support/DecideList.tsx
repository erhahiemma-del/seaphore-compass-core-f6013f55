import { createFileRoute, Link } from "@tanstack/react-router";
import { Gavel } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { INVESTIGATIONS } from "@/lib/lifecycle-data";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

export function DecideList() {
  return (
    <AppShell mode="light" capabilities={{ commandSurface: true, focus: true }}>
      <DemoDataNotice surface="Decision Support" className="mb-3" />
      <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
            <Gavel className="h-5 w-5" />
          </div>
          <div>
            <h1 className="type-display text-foreground">Awaiting Officer Decision</h1>
            <p className="type-small text-slate">
              Every recommendation comes from the system; every decision comes from the officer.
            </p>
          </div>
        </div>

        <PanelCard>
          <PanelHead title="Ready for Decision" meta={`${INVESTIGATIONS.length} cases in review`} />
          <ul className="divide-y divide-line">
            {INVESTIGATIONS.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-4 py-3">
                <div>
                  <div className="type-mono text-[11px] text-slate">{inv.id}</div>
                  <div className="text-[13px] font-semibold text-foreground">{inv.vessel}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-foreground/80">{inv.keySignal}</div>
                  <div className="text-[11px] text-slate">
                    {inv.mission} · {inv.officer}
                  </div>
                </div>
                <RiskPill level={inv.risk} />
                <span className="text-[12px] font-bold text-foreground">{inv.confidencePct}%</span>
                <Link
                  to="/decide/$id"
                  params={{ id: inv.id }}
                  className="rounded-md bg-[color:var(--color-navy)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90"
                >
                  Review case →
                </Link>
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>
    </AppShell>
  );
}
