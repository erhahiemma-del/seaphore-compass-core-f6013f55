/**
 * /revenue-leakage — Revenue Leakage Detection surface (Sprint 1G).
 *
 * Findings are ordered by priority × magnitude × confidence. Enforcement
 * requires officer approval.
 */
import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
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

function seedEvidence(): ReadonlyArray<NormalizedEvidence> {
  const vessel = { id: "vessel:9411640", kind: "vessel" as const, label: "DONGWON NO.16" };
  const port = { id: "port:unlocode:NGLOS", kind: "port" as const, label: "Lagos" };
  const iso = new Date("2026-07-25T12:00:00Z").toISOString();
  const base = (over: Partial<NormalizedEvidence>): NormalizedEvidence => ({
    id: over.id ?? "seed",
    source: over.source ?? "customs",
    sourceName: over.sourceName ?? "Customs Declaration",
    grade: over.grade ?? "CORROBORATED",
    entity: over.entity ?? vessel,
    kind: over.kind ?? "cargo",
    fields: over.fields ?? {},
    observedAt: over.observedAt ?? iso,
    retrievedAt: iso,
    freshnessSeconds: 3600,
    hash: "seed",
  });
  return [
    base({
      id: "cargo-manifest-1",
      kind: "cargo",
      grade: "VERIFIED",
      fields: { declaredTonnage: 2000, actualTonnage: 2650, feePerTonne: 20, currency: "USD" },
    }),
    base({
      id: "portcall-1",
      kind: "port-call",
      entity: port,
      grade: "VERIFIED",
      fields: { expectedFee: 45_000, paidFee: 32_000, portCode: "NGLOS", currency: "USD" },
    }),
    base({
      id: "cargo-value-1",
      kind: "cargo",
      grade: "CORROBORATED",
      fields: { declaredValue: 400_000, marketValue: 620_000, dutyRate: 0.08, currency: "USD" },
    }),
    base({
      id: "voyage-1",
      kind: "voyage",
      fields: {
        declaredPort: "NGLOS",
        actualPort: "PGLAE",
        unscheduled: true,
        estimatedFeeLoss: 42_000,
      },
    }),
    base({
      id: "sanc-hit",
      kind: "sanctions",
      source: "opensanctions",
      sourceName: "OpenSanctions",
      grade: "VERIFIED",
      fields: { status: "indirect", hops: 2 },
    }),
    base({
      id: "waiver-1",
      kind: "other",
      fields: { feeWaiver: true, waivedAmount: 55_000, currency: "USD" },
    }),
  ];
}

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
  const { findings, scan, approve, dismiss, reset } = useRevenueLeakageStore();

  useEffect(() => {
    reset();
    scan(seedEvidence());
  }, [scan, reset]);

  const total = findings.reduce((s, f) => s + f.magnitude, 0);

  return (
    <AppShell title="Revenue Leakage" subtitle="Detect. Decide. Act — every finding is evidence-backed">
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
          </CardContent>
        </Card>

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
                <Button size="sm" variant="ghost" onClick={() => dismiss(f.id, OFFICER, "reviewed")}>
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
