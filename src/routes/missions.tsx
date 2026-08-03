/**
 * /missions — AI-Assisted Mission Planning surface (Sprint 1G).
 *
 * OPERATIONAL RUNTIME CONTRACT (Sprint Operational Runtime):
 *   Mission Plans are ONLY ever created via the sanctioned bridge
 *   `createMissionFromInvestigation` — which itself gates on an approved
 *   decision, recommendation, or linked OKL pattern on an Investigation
 *   Workspace. This route does NOT create missions; it renders and
 *   advances the ones the bridge produced.
 *
 * Every recommendation is derived from evidence and requires explicit
 * officer approval before the mission can move to execution.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMissionStore } from "@/services/mission";
import { Target, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/missions")({
  head: () => ({
    meta: [
      { title: "Mission Planning · Seaphore" },
      {
        name: "description",
        content:
          "AI-assisted maritime mission planning — objectives, tasking, resource allocation, timeline, and evidence-backed recommendations under officer approval.",
      },
      { property: "og:title", content: "Mission Planning · Seaphore" },
      {
        property: "og:description",
        content:
          "Plan, approve, and monitor maritime missions with explainable, evidence-backed recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MissionsRoute,
});

const OFFICER = "officer:demo";

function MissionsRoute() {
  const { plans, submitForApproval, approve, execute, complete, approveRecommendation } =
    useMissionStore();

  return (
    <AppShell title="Mission Planning" subtitle="AI-assisted planning under officer approval">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" /> Mission Planner
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Missions may only be created from an Investigation Workspace with an officer-approved
              decision, recommendation, or linked OKL pattern. Every recommendation is derived from
              evidence and requires explicit officer approval before the mission can move to
              execution.
            </p>
            <p className="text-xs">
              Every plan on this page traces back to a Canonical UIP → Investigation → Mission chain
              via <code>sourceUipId</code> / <code>sourceInvestigationId</code>.
            </p>
          </CardContent>
        </Card>

        {plans.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <p className="mb-3">No mission plans yet.</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/investigations">
                  Open Investigation Workspace <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
              <p className="mt-3 text-xs">
                Bridge a mission from an investigation once an approved decision, recommendation, or
                OKL pattern link exists.
              </p>
            </CardContent>
          </Card>
        )}

        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{p.name}</span>
                <Badge variant="outline" className="uppercase">
                  {p.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{p.type}</Badge>
                {p.subjects.map((s) => (
                  <Badge key={s.id} variant="outline">
                    {s.kind}: {s.label}
                  </Badge>
                ))}
                {p.sourceInvestigationId && (
                  <Badge variant="outline" className="text-[10px]">
                    inv {p.sourceInvestigationId.slice(-6)}
                  </Badge>
                )}
                {p.sourceUipId && (
                  <Badge variant="outline" className="text-[10px]">
                    UIP {p.sourceUipId.slice(-6)}
                  </Badge>
                )}
              </div>

              <section>
                <div className="font-medium">Objectives</div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {p.objectives.map((o) => (
                    <li key={o.id}>{o.label}</li>
                  ))}
                </ul>
              </section>

              <section>
                <div className="font-medium">Resources</div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {p.resources.map((r, i) => (
                    <li key={i}>
                      {r.quantity}× {r.label} <span className="text-xs">({r.kind})</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <div className="font-medium">Timeline</div>
                <ol className="text-xs text-muted-foreground">
                  {p.timeline.map((t, i) => (
                    <li key={i}>
                      T+{t.atHour}h — {t.label} <span className="opacity-60">({t.kind})</span>
                    </li>
                  ))}
                </ol>
              </section>

              {p.recommendations.length > 0 && (
                <section className="rounded border border-border p-3">
                  <div className="font-medium">Recommendations · officer approval required</div>
                  <ul className="mt-2 space-y-2">
                    {p.recommendations.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm">{r.label}</div>
                          <div className="text-xs text-muted-foreground">{r.rationale}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {r.confidence}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              cites {r.citations.length}
                            </Badge>
                          </div>
                        </div>
                        {r.humanApproved ? (
                          <Badge className="text-[10px]">Approved</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveRecommendation(p.id, r.id, OFFICER)}
                          >
                            Approve
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {p.status === "draft" && (
                  <Button size="sm" onClick={() => submitForApproval(p.id, OFFICER)}>
                    Submit for approval
                  </Button>
                )}
                {p.status === "pending-approval" && (
                  <Button size="sm" onClick={() => approve(p.id, OFFICER)}>
                    Approve mission
                  </Button>
                )}
                {p.status === "approved" && (
                  <Button size="sm" onClick={() => execute(p.id, OFFICER)}>
                    Begin execution
                  </Button>
                )}
                {p.status === "executing" && (
                  <Button size="sm" variant="outline" onClick={() => complete(p.id, OFFICER)}>
                    Mark complete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
