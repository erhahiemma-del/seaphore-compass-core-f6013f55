export const mockVessels = [
  { id: "v-001", imo: "9319466", name: "MV Sample Alpha", flag: "PA", risk_tier: "low" as const },
  { id: "v-002", imo: "9451233", name: "MV Sample Bravo", flag: "LR", risk_tier: "med" as const },
  { id: "v-003", imo: "9711223", name: "MV Sample Delta", flag: "MT", risk_tier: "high" as const },
] as const;

export type MockVessel = (typeof mockVessels)[number];
