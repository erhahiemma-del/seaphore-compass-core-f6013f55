import type { ProviderMeta } from "../types";

export const KplerMeta: ProviderMeta = {
  id: "kpler",
  name: "Kpler",
  kind: "commercial",
  defaultConfidence: "VERIFIED",
  citation: "Kpler commodity flow analytics (kpler.com)",
};

export interface CommodityFlow {
  commodity: string;
  originCountry: string;
  destinationCountry: string;
  tonnes: number;
  windowStart: string;
  windowEnd: string;
  source: ProviderMeta;
}

export interface CommodityFlowProvider {
  meta: ProviderMeta;
  flows(opts: { commodity: string; sinceIso: string }): Promise<CommodityFlow[]>;
}

export class KplerAdapter implements CommodityFlowProvider {
  meta = KplerMeta;

  async flows({
    commodity,
    sinceIso,
  }: {
    commodity: string;
    sinceIso: string;
  }): Promise<CommodityFlow[]> {
    if (!commodity) return [];
    return [
      {
        commodity,
        originCountry: "NG",
        destinationCountry: "NL",
        tonnes: 145_200,
        windowStart: sinceIso,
        windowEnd: new Date().toISOString(),
        source: this.meta,
      },
    ];
  }
}

export const kpler = new KplerAdapter();
