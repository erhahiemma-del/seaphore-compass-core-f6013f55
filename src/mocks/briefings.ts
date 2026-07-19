export const mockBriefings = [
  {
    id: "brf-0001",
    query: "Assess ownership network for IMO 9319466",
    mode: "assessment" as const,
    classification: "OFFICIAL",
    confidence_tier: "high" as const,
    latency_ms: 1240,
  },
  {
    id: "brf-0002",
    query: "Forecast revenue leakage next quarter",
    mode: "forecast" as const,
    classification: "OFFICIAL-SENSITIVE",
    confidence_tier: "medium" as const,
    latency_ms: 3210,
  },
] as const;

export type MockBriefing = (typeof mockBriefings)[number];
