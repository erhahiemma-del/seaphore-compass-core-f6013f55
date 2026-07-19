/**
 * HR-6 — Vessel names in mock and real data are neutral. No vessel is named
 * with words implying guilt. Use synthetic names (e.g. "MV Crimson Endeavour",
 * "MV Ocean Pearl"). This validator is called by seed helpers and any
 * component that renders a vessel name from mock data.
 */

const FORBIDDEN_TOKENS: readonly string[] = [
  "fraudster",
  "criminal",
  "smuggler",
  "pirate",
  "thief",
  "villain",
  "outlaw",
  "convict",
  "felon",
  "crook",
  "scam",
  "illicit",
  "guilty",
];

const NEUTRAL_EXAMPLES: readonly string[] = [
  "MV Crimson Endeavour",
  "MV Ocean Pearl",
  "MV Northern Aurora",
  "MV Cerulean Horizon",
  "MV Amber Meridian",
  "MV Silver Compass",
];

export function isNeutralVesselName(name: string): boolean {
  const lower = name.toLowerCase();
  return !FORBIDDEN_TOKENS.some((t) => lower.includes(t));
}

export function assertNeutralVesselName(name: string): void {
  if (!isNeutralVesselName(name)) {
    throw new Error(
      `[HR-6] Vessel name "${name}" implies guilt. Use a neutral synthetic ` +
        `name, e.g. ${NEUTRAL_EXAMPLES.slice(0, 3).join(", ")}.`,
    );
  }
}

export function neutralVesselNameExamples(): readonly string[] {
  return NEUTRAL_EXAMPLES;
}
