import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Fingerprint, Network, Search } from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { useHandoffContext } from "@/lib/nav-context";
import { useEntityRegistry } from "./use-entity-registry";
import { answerEntityQuestion, buildEntityGraphView, buildEntityProfile } from "@/services/eie";

const COPILOT_QUESTIONS = [
  "Show vessel profile",
  "Show owner",
  "Show related companies",
  "Show connected containers",
  "Show manifest history",
  "Show investigation history",
];

export function EntityProfile() {
  const { id } = useParams({ from: "/entity/$id" });
  const ctx = useHandoffContext();
  const { registry, revision } = useEntityRegistry();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [graphQuery, setGraphQuery] = useState("");
  const [question, setQuestion] = useState<string | null>(null);

  const profile = useMemo(
    () => buildEntityProfile(registry, id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, id, revision],
  );
  const graph = useMemo(
    () => buildEntityGraphView(registry, { focusId: id, expanded, query: graphQuery }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, id, expanded, graphQuery, revision],
  );
  const answer = useMemo(
    () => (question ? answerEntityQuestion(registry, `${question} ${id}`, { stickyFocusId: id }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, id, question, revision],
  );

  if (!profile) {
    return (
      <AppShell title="Entity Profile" subtitle={id} mode="light">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="h-4 w-4" /> {id}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              No evidence for this entity has been acquired in this session, so the Entity
              Intelligence Engine has nothing to project. This is a stated gap, not an empty result.
            </p>
            <p>
              Run an intelligence query in the Copilot for this entity; the resulting Unified
              Intelligence Package hydrates the Entity Registry automatically.
            </p>
            <p className="text-xs">Arrived from {ctx.fromStage ?? "direct link"}.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const { entity, risk } = profile;

  return (
    <AppShell title={entity.label} subtitle={`${entity.type} · ${entity.id}`} mode="light">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Fingerprint className="h-4 w-4" /> {entity.label}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {entity.sources.length} source(s) · {entity.evidence.length} evidence record(s) ·
                arrived from {ctx.fromStage ?? "direct link"}
              </p>
            </div>
            <ConfidenceChip tier={entity.confidenceTier} />
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {profile.summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </CardContent>
        </Card>

        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="relationships">Relationships</TabsTrigger>
            <TabsTrigger value="graph">Knowledge Graph</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="copilot">Copilot</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-2">
            {profile.timeline.length === 0 ? (
              <EmptyNote text="No dated evidence — no timeline can be reconstructed." />
            ) : (
              profile.timeline.map((e) => (
                <Card key={`${e.at}-${e.kind}`}>
                  <CardContent className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {e.label} · <span className="font-mono text-xs">{e.at}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {e.evidenceIds.join(", ")}
                      </p>
                    </div>
                    <Badge variant="outline">{e.grade}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="relationships" className="space-y-2">
            {profile.related.length === 0 ? (
              <EmptyNote text="No record names a counterparty for this entity." />
            ) : (
              profile.related.map((r) => (
                <Card key={r.relationship.id}>
                  <CardContent className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {r.outbound ? "→" : "←"} {r.counterpart.label}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({r.relationship.type.replace(/_/g, " ")})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{r.relationship.explanation}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {r.relationship.timestamp} · {r.relationship.evidenceIds.join(", ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{r.relationship.grade}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {(r.relationship.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="graph" className="space-y-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={graphQuery}
                onChange={(e) => setGraphQuery(e.target.value)}
                placeholder="Search nodes on canvas…"
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={() => setExpanded([])}>
                Collapse all
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {graph.nodes.length} node(s) · {graph.edges.length} relationship(s)
              {graph.truncated ? " · view truncated for readability" : ""}
            </p>
            {graph.nodes.map((n) => (
              <Card
                key={n.entity.id}
                className={n.matchesQuery ? "border-primary" : undefined}
              >
                <CardContent className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Network className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{n.entity.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {n.entity.type} · {n.hops} hop(s) · degree {n.degree}
                    </span>
                    <Badge variant="outline">{n.entity.grade}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant={n.expanded ? "secondary" : "outline"}
                    onClick={() =>
                      setExpanded((prev) =>
                        prev.includes(n.entity.id)
                          ? prev.filter((x) => x !== n.entity.id)
                          : [...prev, n.entity.id],
                      )
                    }
                  >
                    {n.expanded
                      ? "Collapse"
                      : `Expand${n.hiddenNeighbours ? ` (+${n.hiddenNeighbours})` : ""}`}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="evidence" className="space-y-2">
            {profile.evidence.map((e) => (
              <Card key={e.evidenceId}>
                <CardContent className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="font-mono text-xs">{e.evidenceId}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.sourceName} · {e.kind} · {e.observedAt}
                  </span>
                  <Badge variant="outline">{e.grade}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="risk" className="space-y-2">
            <Card>
              <CardContent className="space-y-2 py-3 text-sm">
                <p>
                  {risk.score === null
                    ? "No numeric risk score is published for this entity — risk is unknown, not zero."
                    : `Risk score ${risk.score} · ${risk.tier}`}{" "}
                  <Badge variant="outline">{risk.grade}</Badge>
                </p>
                {risk.drivers.length === 0 ? (
                  <EmptyNote text="No sanctions or compliance evidence reached this entity." />
                ) : (
                  risk.drivers.map((d) => (
                    <p key={d.label} className="text-xs text-muted-foreground">
                      {d.label} · {d.grade} · {d.evidenceIds.join(", ")}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Related investigations</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {profile.investigations.length === 0 ? (
                  <EmptyNote text="No investigation references this entity yet." />
                ) : (
                  profile.investigations.map((i) => <p key={i.id}>{i.title}</p>)
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Stated gaps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                {profile.gaps.map((g) => (
                  <p key={g}>{g}</p>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="copilot" className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {COPILOT_QUESTIONS.map((q) => (
                <Button
                  key={q}
                  size="sm"
                  variant={question === q ? "secondary" : "outline"}
                  onClick={() => setQuestion(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
            {answer && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">{answer.headline}</CardTitle>
                  <Badge variant="outline">{answer.grade}</Badge>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {answer.lines.length === 0 ? (
                    <EmptyNote text="No evidence answers this question for this entity." />
                  ) : (
                    answer.lines.map((l) => <p key={l}>{l}</p>)
                  )}
                  {answer.citations.length > 0 && (
                    <p className="pt-2 font-mono text-[10px] text-muted-foreground">
                      Citations: {answer.citations.join(", ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}
