import type { ProviderMeta, SanctionsHit, SanctionsProvider } from "../types";

export const OpenSanctionsMeta: ProviderMeta = {
  id: "opensanctions",
  name: "OpenSanctions",
  kind: "osint",
  defaultConfidence: "OBSERVED",
  citation: "OpenSanctions consolidated sanctions dataset (opensanctions.org)",
};

/**
 * OpenSanctions adapter — mock implementation.
 *
 * Wire the real HTTP client here when the OpenSanctions API key ships as a
 * connector or secret. Keep the interface shape stable so downstream
 * screening features never need to change.
 */
export class OpenSanctionsAdapter implements SanctionsProvider {
  meta = OpenSanctionsMeta;

  async screen(name: string): Promise<SanctionsHit[]> {
    const needle = name.trim().toLowerCase();
    if (!needle) return [];
    // Deterministic mock: return a synthetic hit for names containing 'sanction'.
    if (needle.includes("sanction")) {
      return [
        {
          matchedName: name,
          listName: "OFAC SDN",
          program: "SDGT",
          score: 0.92,
          reference: "OFAC-MOCK-0001",
          source: this.meta,
        },
      ];
    }
    return [];
  }
}

export const openSanctions = new OpenSanctionsAdapter();
