import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { INVESTIGATIONS } from "@/lib/lifecycle-data";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

export function InvestigateList() {
  return (
    <AppShell mode="light">
      <DemoDataNotice surface="Investigate" className="mb-3" />
      <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <h1 className="type-display text-foreground">Open Investigations</h1>
            <p className="type-small text-slate">
              Every case opens with entity, voyage, and detecting-signal context pre-loaded.
            </p>
          </div>
        </div>

        <PanelCard>
          <PanelHead
            title="Active Cases"
            meta={`${INVESTIGATIONS.length} open · sorted by urgency`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="type-label bg-surface-2 text-slate">
                <tr>
                  <th className="px-3 py-2 text-left">Case</th>
                  <th className="px-3 py-2 text-left">Mission</th>
                  <th className="px-3 py-2 text-left">Vessel · IMO</th>
                  <th className="px-3 py-2 text-left">Risk</th>
                  <th className="px-3 py-2 text-left">Confidence</th>
                  <th className="px-3 py-2 text-left">Officer</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {INVESTIGATIONS.map((inv) => (
                  <tr key={inv.id} className="border-t border-line hover:bg-surface-2/50">
                    <td className="px-3 py-2 type-mono font-semibold">{inv.id}</td>
                    <td className="px-3 py-2 text-foreground/85">{inv.mission}</td>
                    <td className="px-3 py-2 font-semibold text-foreground">
                      {inv.vessel} · <span className="type-mono text-slate">IMO {inv.imo}</span>
                    </td>
                    <td className="px-3 py-2">
                      <RiskPill level={inv.risk} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="mr-2 text-foreground font-semibold">
                        {inv.confidencePct}%
                      </span>
                      <ConfidenceChip tier="inferred" size={9} />
                    </td>
                    <td className="px-3 py-2 text-foreground/80">{inv.officer}</td>
                    <td className="px-3 py-2 text-slate">{inv.status}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/investigate/$id"
                        params={{ id: inv.id }}
                        className="inline-flex items-center rounded-md bg-[color:var(--color-navy)] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90"
                      >
                        Open workspace →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>
    </AppShell>
  );
}
