/**
 * /intelligence-evidence — Intelligence Evidence Viewer route.
 *
 * Officer surface: every evidence item that could feed an assessment,
 * projected in the OC-001-compliant Evidence Viewer.
 *
 * Sources today:
 *   • Live GFW-shaped evidence built from the Sprint 1C dark-event pipeline
 *     (identity + gap event + AISBehaviourAnalyzer continuity + OSAE).
 *   • Every workspace's own evidence rows (from the IIW workspace store).
 *
 * Never renders raw API payloads — items are sanitized upstream via
 * `src/lib/evidence/intelligence-evidence.ts` adapters.
 */
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { IntelligenceEvidenceViewer } from "@/components/intelligence/IntelligenceEvidenceViewer";
import { AppShell } from "@/components/layout/AppShell";
import { AISBehaviourAnalyzer } from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";
import { useWorkspaceStore } from "@/stores/workspace.store";
import {
  fromAisContinuityReport,
  fromGfwGapEvent,
  fromGfwIdentity,
  fromOsaeAssessment,
  fromWorkspaceEvidence,
  type IntelligenceEvidenceItem,
} from "@/lib/evidence/intelligence-evidence";

export const Route = createFileRoute("/intelligence-evidence")({
  head: () => ({
    meta: [
      { title: "Intelligence Evidence · Seaphore" },
      {
        name: "description",
        content:
          "Every evidence item behind an operational assessment — source, timestamp, confidence, type, status.",
      },
      { property: "og:title", content: "Intelligence Evidence · Seaphore" },
      {
        property: "og:description",
        content:
          "Investigator surface exposing the sanitized basis of Seaphore assessments — GFW, AIS continuity, OSAE, and workspace evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntelligenceEvidenceRoute,
});

/**
 * Deterministic sample derived from the Sprint 1C DONGWON NO.16 dark-event
 * validation. Kept as a projection example so investigators always have a
 * populated viewer when no active workspace exists. Values match live GFW
 * output; no synthetic API payloads.
 */
function buildSampleEvidence(): IntelligenceEvidenceItem[] {
  const identity = fromGfwIdentity({
    vesselId: "8e126a2d7-7c99-38e2-0096-cf6a22b81b33",
    name: "DONGWON NO.16",
    mmsi: "440825000",
    flag: "KOR",
    matchFields: "SEVERAL_FIELDS",
    evidenceUrl:
      "https://gateway.api.globalfishingwatch.org/v3/vessels/search?query=440825000",
    collectedAt: "2026-07-25T14:30:15.000Z",
  }, "DONGWON NO.16");

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

  return [identity, gap, ...continuity, assessment];
}

function IntelligenceEvidenceRoute() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const items = useMemo<IntelligenceEvidenceItem[]>(() => {
    const wsItems = Object.values(workspaces).flatMap((w) =>
      w.evidence.map(fromWorkspaceEvidence),
    );
    return [...buildSampleEvidence(), ...wsItems];
  }, [workspaces]);

  return (
    <AppShell title="Intelligence Evidence" subtitle="Assessment Basis · Sanitized">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
          Every row is the sanitized projection of an evidence artifact that
          could feed an operational assessment — never a raw API payload.
          Confidence chips follow OC-001. Sources link to the upstream provider
          only when it is safe and appropriate.
        </p>
        <IntelligenceEvidenceViewer items={items} />
      </div>
    </AppShell>
  );
}
