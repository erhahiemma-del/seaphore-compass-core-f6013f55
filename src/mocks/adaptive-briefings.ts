import type { AdaptiveBriefingData } from "@/components/copilot/briefing";
import lookup from "./briefings/lookup-ownership.json";
import assessment from "./briefings/assessment-sanctions.json";
import investigation from "./briefings/investigation-revenue.json";
import forecast from "./briefings/forecast-piracy.json";
import manifest from "./briefings/manifest-crosscheck.json";

/**
 * The 5 sample briefings that exercise every renderer branch.
 * Cast is safe: JSON schema mirrors the AdaptiveBriefingData contract.
 */
export const SAMPLE_BRIEFINGS: AdaptiveBriefingData[] = [
  lookup as unknown as AdaptiveBriefingData,
  assessment as unknown as AdaptiveBriefingData,
  investigation as unknown as AdaptiveBriefingData,
  forecast as unknown as AdaptiveBriefingData,
  manifest as unknown as AdaptiveBriefingData,
];

export const SAMPLE_BRIEFINGS_BY_ID = Object.fromEntries(
  SAMPLE_BRIEFINGS.map((b) => [b.id, b]),
) as Record<string, AdaptiveBriefingData>;
