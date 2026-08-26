/**
 * /revenue-leakage — Revenue Leakage Detection surface (Sprint 1G).
 *
 * Findings are ordered by priority × magnitude × confidence. Enforcement
 * requires officer approval.
 */
import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRevenueLeakageStore } from "@/services/revenue-leakage";
import { useUipStore } from "@/stores/uip.store";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/revenue-leakage")({
  validateSearch: (raw: Record<string, unknown>) => ({
    uip: typeof raw.uip === "string" ? raw.uip : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Revenue Leakage · Seaphore" },
      {
        name: "description",
        content:
          "Automatic detection of revenue leakage across manifests, port fees, cargo declarations, movements, and compliance-linked bypasses.",
      },
      { property: "og:title", content: "Revenue Leakage · Seaphore" },
      {
        property: "og:description",
        content:
          "Explainable, evidence-backed revenue leakage findings prioritized for officer review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RevenueLeakageRoute,
});

const OFFICER = "officer:demo";

function bandColor(p: string) {
  return p === "critical"
    ? "destructive"
    : p === "high"
      ? "default"
      : p === "elevated"
        ? "secondary"
        : "outline";
}

function RevenueLeakageRoute() {
  const { uip: uipParam } = Route.useSearch();
  const uip = useUipStore((s) => {
    if (uipParam) return s.byId[uipParam];
    const latestId = s.order[0];
    return latestId ? s.byId[latestId] : undefined;
  });
  const { findings, scan, approve, dismiss, reset } = useRevenueLeakageStore();

  useEffect(() => {
    reset();
    if (uip && uip.rawEvidence.length > 0) {
      scan(uip.rawEvidence);
    }
  }, [uip, scan, reset]);

  const total = findings.reduce((s, f) => s + f.magnitude, 0);

  return (
    <AppShell
      title="Revenue Leakage"
      subtitle="Detect. Decide. Act — every finding is evidence-backed"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4" /> Detection summary
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">Findings · {findings.length}</Badge>
            <Badge variant="outline">Estimated leakage · {total.toLocaleString()} USD</Badge>
            {uip && (
              <Badge variant="outline" className="font-mono text-[10px]">
                UIP · {uip.id}
              </Badge>
            )}
          </CardContent>
        </Card>

        {!uip && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Coins className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No Unified Intelligence Package loaded</div>
              <div className="max-w-md text-xs text-muted-foreground">
                Revenue Leakage scans only run against live fused evidence. Run a briefing from the
                Copilot to populate this surface.
              </div>
              <Link
                to="/copilot"
                className="mt-2 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Open Copilot
              </Link>
            </CardContent>
          </Card>
        )}

        {findings.map((f) => (
          <Card key={f.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{f.headline}</span>
                <Badge variant={bandColor(f.priority) as never} className="uppercase">
                  {f.priority}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-muted-foreground">{f.explanation}</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{f.category}</Badge>
                <Badge variant="outline">
                  {f.magnitude.toLocaleString()} {f.magnitudeCurrency}
                </Badge>
                <Badge variant="outline">{f.confidence}</Badge>
                <Badge variant="outline">subject: {f.subjectLabel}</Badge>
              </div>
              <section>
                <div className="text-xs font-medium">Factors</div>
                <ul className="text-xs text-muted-foreground">
                  {f.factors.map((x, i) => (
                    <li key={i}>
                      {x.label} · weight {x.weight.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <div className="text-xs font-medium">Citations</div>
                <ul className="text-xs text-muted-foreground">
                  {f.citations.map((c) => (
                    <li key={c.evidenceId}>
                      {c.evidenceId} · {c.source} · {c.grade}
                    </li>
                  ))}
                </ul>
              </section>
              <div className="flex gap-2 pt-2">
                {f.humanApproved ? (
                  <Badge>Approved for enforcement</Badge>
                ) : (
                  <Button size="sm" onClick={() => approve(f.id, OFFICER)}>
                    Approve for enforcement
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss(f.id, OFFICER, "reviewed")}
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
