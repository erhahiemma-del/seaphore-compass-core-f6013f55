/**
 * /investigations-workflow — Structured Investigation Workflow (Sprint 1G).
 *
 * Additive to the existing /investigate case workspace. Provides an
 * evidence-backed stage machine and immutable audit trail per case.
 */
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useInvestigationWorkflowStore,
  type CaseStage,
} from "@/services/investigations-workflow";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/investigations-workflow")({
  head: () => ({
    meta: [
      { title: "Investigation Workflows · Seaphore" },
      {
        name: "description",
        content:
          "Structured investigation workflow — evidence-backed stages, findings, and immutable audit trail for maritime cases.",
      },
      { property: "og:title", content: "Investigation Workflows · Seaphore" },
      {
        property: "og:description",
        content:
          "Evidence-backed investigation stages with officer approval and full audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestigationWorkflowRoute,
});

const OFFICER = "officer:demo";
const NEXT: Record<CaseStage, CaseStage | null> = {
  intake: "evidence",
  evidence: "analysis",
  analysis: "decision",
  decision: "closed",
  closed: null,
};

function InvestigationWorkflowRoute() {
  const { cases, open, linkEvidence, addFinding, approveFinding, advance, reset } =
    useInvestigationWorkflowStore();

  useEffect(() => {
    if (cases.length > 0) return;
    reset();
    const c = open({
      title: "Suspected under-declaration — DONGWON NO.16",
      subject: { kind: "vessel", id: "vessel:9411640", label: "DONGWON NO.16" },
      openedBy: OFFICER,
      priority: "act",
    });
    linkEvidence(c.id, {
      evidenceId: "ais-1",
      source: "gfw",
      sourceName: "Global Fishing Watch",
      grade: "VERIFIED",
      linkedBy: OFFICER,
    });
    addFinding(c.id, {
      label: "AIS gaps overlap unscheduled port call",
      rationale: "Three AIS gaps > 12h in 72h overlap with an unscheduled call at PGLAE.",
      confidence: "CORROBORATED",
      citations: ["ais-1", "voy-3"],
      createdBy: OFFICER,
    });
  }, [cases.length, open, linkEvidence, addFinding, reset]);

  return (
    <AppShell title="Investigation Workflows" subtitle="Evidence-backed cases · immutable audit trail">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" /> Case workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cases advance intake → evidence → analysis → decision → closed. Enforcement-bearing
            findings require explicit officer approval.
          </CardContent>
        </Card>

        {cases.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{c.title}</span>
                <Badge variant="outline" className="uppercase">
                  {c.stage}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {c.subject.kind}: {c.subject.label}
                </Badge>
                <Badge variant="outline">priority: {c.priority}</Badge>
              </div>

              <section>
                <div className="font-medium">Evidence ({c.evidence.length})</div>
                <ul className="text-xs text-muted-foreground">
                  {c.evidence.map((e) => (
                    <li key={e.evidenceId}>
                      {e.evidenceId} · {e.sourceName} · {e.grade}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <div className="font-medium">Findings</div>
                <ul className="space-y-2">
                  {c.findings.map((f) => (
                    <li key={f.id} className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm">{f.label}</div>
                        <div className="text-xs text-muted-foreground">{f.rationale}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {f.confidence}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            cites {f.citations.length}
                          </Badge>
                        </div>
                      </div>
                      {f.officerApproved ? (
                        <Badge className="text-[10px]">Approved</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => approveFinding(c.id, f.id, OFFICER)}>
                          Approve
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <div className="font-medium">Audit trail ({c.auditTrail.length})</div>
                <ol className="text-xs text-muted-foreground">
                  {c.auditTrail.slice(-6).map((a, i) => (
                    <li key={i}>
                      {new Date(a.atISO).toLocaleTimeString()} · {a.actor} · {a.action}
                      {a.note ? ` — ${a.note}` : ""}
                    </li>
                  ))}
                </ol>
              </section>

              <div className="flex gap-2 pt-2">
                {NEXT[c.stage] && (
                  <Button size="sm" onClick={() => advance(c.id, NEXT[c.stage] as CaseStage, OFFICER)}>
                    Advance → {NEXT[c.stage]}
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
