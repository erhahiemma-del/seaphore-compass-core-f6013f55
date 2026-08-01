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
import { UipCanonicalPanel } from "@/components/intelligence/UipCanonicalPanel";
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

/**
 * Build evidence rows from a live Unified Intelligence Package.
 * Runs OKL against the UIP so detected operational patterns are projected
 * alongside their raw evidence. Never uses demo fixtures.
 */
function buildEvidenceFromUip(
  uip: import("@/services/ife/unified").UnifiedIntelligencePackage,
): IntelligenceEvidenceItem[] {
  const raw = uip.rawEvidence.map((e) => fromNormalizedEvidence(e));
  const okl = analyzeOperationalKnowledge({ uip, rawEvidence: uip.rawEvidence });
  const subject =
    uip.fused.stats.canonicalEntities > 0
      ? (uip.rawEvidence[0]?.entity.label ?? undefined)
      : undefined;
  const oklItems = okl.patterns.map((p) => fromOklPattern(p, subject));
  return [...raw, ...oklItems];
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
const CONFIDENCE_CHIPS: EvidenceConfidence[] = ["VERIFIED", "OBSERVED", "INFERRED", "UNCONFIRMED"];

function IntelligenceEvidenceRoute() {
  const investigations = useWorkspaceStore((s) => s.investigations);
  const search = Route.useSearch();
  const uip = useUipStore((s) => {
    if (search.uip) return s.byId[search.uip];
    const latestId = s.order[0];
    return latestId ? s.byId[latestId] : undefined;
  });

  const items = useMemo<IntelligenceEvidenceItem[]>(() => {
    const wsItems = Object.entries(investigations).flatMap(([id, w]) =>
      w.evidence.map((e) => fromWorkspaceEvidence(e, id)),
    );
    const uipItems = uip ? buildEvidenceFromUip(uip) : [];
    return [...uipItems, ...wsItems];
  }, [investigations, uip]);

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
          Every conclusion in Seaphore is anchored on evidence. Explore evidence as a list, a
          relationship graph, a timeline, or grouped by source. Conflicting evidence is surfaced
          instead of hidden, and every axis of the confidence chip is inspectable.
        </p>
        {uip && <UipCanonicalPanel uip={uip} />}
        <IntelligenceEvidenceExplorer
          items={items}
          initialFilters={initialFilters}
          initialMode={initialMode}
        />
      </div>
    </AppShell>
  );
}
