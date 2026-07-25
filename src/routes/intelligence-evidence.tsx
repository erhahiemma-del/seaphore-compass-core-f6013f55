/**
 * /intelligence-evidence — Intelligence Evidence Explorer route.
 *
 * Officer surface: every evidence item that could feed an assessment,
 * projected in the OC-001-compliant Evidence Explorer (List / Graph /
 * Timeline / Source views) with conflict surfacing and per-axis
 * confidence breakdown.
 *
 * URL query params are used as initial filters, so Executive Brief
 * "View Evidence" links can deep-link directly into a filtered view.
 * Recognized params:
 *   ?type=identity           filter to a single evidence type
 *   ?connector=gfw           filter to a connector
 *   ?entity=DONGWON+NO.16    substring match on entity/subject
 *   ?investigation=abc       scope to a workspace
 *   ?confidence=VERIFIED     filter to a chip level
 *   ?mode=graph              initial view mode
 */
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { IntelligenceEvidenceExplorer } from "@/components/intelligence/IntelligenceEvidenceExplorer";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { analyzeOperationalKnowledge } from "@/services/okl";
import { useUipStore } from "@/stores/uip.store";
import { useWorkspaceStore } from "@/stores/workspace.store";
import {
  fromNormalizedEvidence,
  fromOklPattern,
  fromWorkspaceEvidence,
  type EvidenceConfidence,
  type EvidenceType,
  type IntelligenceEvidenceItem,
} from "@/lib/evidence/intelligence-evidence";

interface EvidenceSearch {
  mode?: string;
  type?: string;
  connector?: string;
  entity?: string;
  investigation?: string;
  confidence?: string;
  uip?: string;
}

export const Route = createFileRoute("/intelligence-evidence")({
  validateSearch: (raw: Record<string, unknown>): EvidenceSearch => ({
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
    type: typeof raw.type === "string" ? raw.type : undefined,
    connector: typeof raw.connector === "string" ? raw.connector : undefined,
    entity: typeof raw.entity === "string" ? raw.entity : undefined,
    investigation: typeof raw.investigation === "string" ? raw.investigation : undefined,
    confidence: typeof raw.confidence === "string" ? raw.confidence : undefined,
    uip: typeof raw.uip === "string" ? raw.uip : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Intelligence Evidence Explorer · Seaphore" },
      {
        name: "description",
        content:
          "Explore every evidence item behind an operational assessment across list, graph, timeline, and source views.",
      },
      { property: "og:title", content: "Intelligence Evidence Explorer · Seaphore" },
      {
        property: "og:description",
        content:
          "Investigator surface exposing sanitized evidence, relationships, timelines, and cross-connector conflicts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntelligenceEvidenceRoute,
});

function buildSampleEvidence(): IntelligenceEvidenceItem[] {
  const identity = fromGfwIdentity(
    {
      vesselId: "8e126a2d7-7c99-38e2-0096-cf6a22b81b33",
      name: "DONGWON NO.16",
      mmsi: "440825000",
      flag: "KOR",
      matchFields: "SEVERAL_FIELDS",
      evidenceUrl:
        "https://gateway.api.globalfishingwatch.org/v3/vessels/search?query=440825000",
      collectedAt: "2026-07-25T14:30:15.000Z",
    },
    "DONGWON NO.16",
  );

  const gap = fromGfwGapEvent({
    id: "87ab704a63445d61c846bb2b9f75d8b2",
    vessel: { name: "DONGWON NO.16", ssvid: "440825000", flag: "KOR" },
    start: "2017-01-13T16:51:02.000Z",
    end: "2026-06-13T01:29:22.000Z",
    durationHours: 82496.6,
    intentionalDisabling: true,
    impliedSpeedKnots: 0.045,
    evidenceUrl:
      "https://gateway.api.globalfishingwatch.org/v3/events?datasets%5B0%5D=public-global-gaps-events:latest",
  });

  const report = AISBehaviourAnalyzer.analyse({
    vesselId: "8e126a2d7-7c99-38e2-0096-cf6a22b81b33",
    events: [
      { timestamp: "2017-01-13T16:51:02.000Z", latitude: -9.5437, longitude: 165.1277, weather: "clear" },
      { timestamp: "2026-06-13T01:29:22.000Z", latitude: 36.0, longitude: 120.259, weather: "clear" },
    ],
    gapThresholdHours: 6,
  });
  const continuity = fromAisContinuityReport(report, "DONGWON NO.16");
  const assessment = fromOsaeAssessment(OSAE.publishAisContinuity(report), "DONGWON NO.16");

  // OKL: project detected operational patterns as evidence rows with
  // full officer-facing explainability.
  const okl = analyzeOperationalKnowledge({
    uip: DEMO_UIP,
    historical: DEMO_HISTORICAL,
    investigations: DEMO_INVESTIGATIONS,
    rawEvidence: DEMO_EVIDENCE,
  });
  const oklItems = okl.patterns.map((p) => fromOklPattern(p, "DONGWON NO.16"));

  return [identity, gap, ...continuity, assessment, ...oklItems];
}

const EVIDENCE_TYPES: EvidenceType[] = [
  "ais-continuity",
  "movement",
  "identity",
  "sanctions",
  "ownership",
  "assessment",
  "other",
];
const CONFIDENCE_CHIPS: EvidenceConfidence[] = [
  "VERIFIED",
  "OBSERVED",
  "INFERRED",
  "UNCONFIRMED",
];

function IntelligenceEvidenceRoute() {
  const investigations = useWorkspaceStore((s) => s.investigations);
  const search = Route.useSearch();

  const items = useMemo<IntelligenceEvidenceItem[]>(() => {
    const wsItems = Object.entries(investigations).flatMap(([id, w]) =>
      w.evidence.map((e) => fromWorkspaceEvidence(e, id)),
    );
    return [...buildSampleEvidence(), ...wsItems];
  }, [investigations]);

  const initialFilters = useMemo(() => {
    const types = new Set<EvidenceType>();
    if (search.type && EVIDENCE_TYPES.includes(search.type as EvidenceType)) {
      types.add(search.type as EvidenceType);
    }
    const connectors = new Set<string>();
    if (search.connector) connectors.add(search.connector);
    const investigations = new Set<string>();
    if (search.investigation) investigations.add(search.investigation);
    const confidences = new Set<EvidenceConfidence>();
    if (search.confidence && CONFIDENCE_CHIPS.includes(search.confidence as EvidenceConfidence)) {
      confidences.add(search.confidence as EvidenceConfidence);
    }
    return {
      types,
      connectors,
      investigations,
      confidences,
      entity: search.entity || undefined,
    };
  }, [search]);

  const initialMode =
    search.mode === "graph" || search.mode === "timeline" || search.mode === "source"
      ? search.mode
      : "list";

  return (
    <AppShell title="Intelligence Evidence" subtitle="Explorer · List · Graph · Timeline · Source">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
          Every conclusion in Seaphore is anchored on evidence. Explore evidence
          as a list, a relationship graph, a timeline, or grouped by source.
          Conflicting evidence is surfaced instead of hidden, and every axis of
          the confidence chip is inspectable.
        </p>
        <IntelligenceEvidenceExplorer
          items={items}
          initialFilters={initialFilters}
          initialMode={initialMode}
        />
      </div>
    </AppShell>
  );
}
