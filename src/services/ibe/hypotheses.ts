/**
 * IBE · Hypothesis Reasoning (Phase 7).
 *
 * Extract candidate hypotheses from an OIE briefing and merge them
 * with anything already tracked on the mission. Never invents facts:
 * every supporting statement is drawn verbatim from the briefing or
 * from prior conversation.
 */
import type { OIEResult } from "@/services/oie/types";
import type { MissionContext } from "@/stores/mission-context.store";
import type { IbeHypothesis } from "./types";

const DOMAIN_PATTERNS: Array<{ re: RegExp; domain: IbeHypothesis["domain"]; statement: string }> = [
  {
    re: /sanction|ofac|un\b|eu\b|designated/i,
    domain: "sanctions",
    statement: "Possible sanctions exposure through vessel, cargo or ownership.",
  },
  {
    re: /ownership|beneficial|shell|nominee|layered/i,
    domain: "ownership",
    statement: "Possible ownership concealment across the corporate chain.",
  },
  {
    re: /revenue|levy|declaration|under-declared|leakage/i,
    domain: "revenue",
    statement: "Possible revenue leakage against declared cargo.",
  },
  {
    re: /ais|dark|gap|spoofed|manipulat/i,
    domain: "ais",
    statement: "Possible AIS manipulation or unreported movement.",
  },
  {
    re: /manifest|cargo|declared|hs code/i,
    domain: "cargo",
    statement: "Possible cargo mis-declaration against the manifest.",
  },
];

function confidenceFromBadge(badge: string): IbeHypothesis["confidence"] {
  switch (badge) {
    case "High Confidence":
      return "leading";
    case "Medium Confidence":
      return "credible";
    case "Low Confidence":
      return "possible";
    default:
      return "weak";
  }
}

function isHypothesis(x: unknown): x is IbeHypothesis {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as { id?: unknown }).id === "string" &&
    typeof (x as { statement?: unknown }).statement === "string"
  );
}

export function readMissionHypotheses(mission: MissionContext | null): IbeHypothesis[] {
  return (mission?.hypotheses ?? []).filter(isHypothesis);
}

export function deriveHypotheses(
  query: string,
  oie: OIEResult | null,
  existing: IbeHypothesis[],
): IbeHypothesis[] {
  if (oie?.kind !== "briefing") return existing;
  const badge = oie.humanResponse.confidenceAssessment?.badge ?? "Insufficient Evidence";
  const findings = (oie.humanResponse.keyFindings ?? []).map((f) => f.text);
  const gaps = oie.humanResponse.informationStillNeeded ?? [];
  const now = Date.now();
  const merged = new Map<string, IbeHypothesis>();
  existing.forEach((h) => merged.set(h.id, h));

  const combined = `${query}\n${findings.join("\n")}`;
  for (const p of DOMAIN_PATTERNS) {
    if (!p.re.test(combined)) continue;
    const id = `hyp-${p.domain}`;
    const supporting = findings.filter((f) => p.re.test(f));
    if (!supporting.length && !p.re.test(query)) continue;
    const prev = merged.get(id);
    const record: IbeHypothesis = {
      id,
      domain: p.domain,
      statement: prev?.statement ?? p.statement,
      supporting: Array.from(new Set([...(prev?.supporting ?? []), ...supporting])).slice(0, 6),
      contradicting: prev?.contradicting ?? [],
      confidence: confidenceFromBadge(badge),
      nextEvidenceNeeded: Array.from(
        new Set([...(prev?.nextEvidenceNeeded ?? []), ...gaps]),
      ).slice(0, 4),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    merged.set(id, record);
  }
  return Array.from(merged.values());
}
