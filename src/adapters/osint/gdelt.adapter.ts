import type { ProviderMeta } from "../types";

export const GdeltMeta: ProviderMeta = {
  id: "gdelt",
  name: "GDELT",
  kind: "osint",
  defaultConfidence: "INFERRED",
  citation: "GDELT Project global news event stream (gdeltproject.org)",
};

export interface NewsEvent {
  title: string;
  url: string;
  publishedAt: string;
  tone?: number;
  entities: string[];
  source: ProviderMeta;
}

export interface NewsProvider {
  meta: ProviderMeta;
  search(query: string, sinceIso?: string): Promise<NewsEvent[]>;
}

export class GdeltAdapter implements NewsProvider {
  meta = GdeltMeta;

  async search(query: string): Promise<NewsEvent[]> {
    if (!query.trim()) return [];
    // Mock feed — replace with GDELT DOC 2.0 API integration.
    return [
      {
        title: `Gulf of Guinea maritime activity referencing ${query}`,
        url: "https://example.com/gdelt-mock",
        publishedAt: new Date().toISOString(),
        tone: -1.2,
        entities: [query],
        source: this.meta,
      },
    ];
  }
}

export const gdelt = new GdeltAdapter();
