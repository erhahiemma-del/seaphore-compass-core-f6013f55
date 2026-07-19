/**
 * Data Source Matrix registry — resolve a matrix `id` to a live BaseAdapter.
 * Feature code should call `getAdapter('spire')` (etc.) rather than importing
 * concrete adapter classes, so the surface remains swappable.
 */
import type { BaseAdapter } from "./base-adapter";
import { DATA_SOURCE_MATRIX } from "./matrix";

import { spire } from "./ais/spire.adapter";
import { datalastic } from "./ais/datalastic.adapter";
import { imoGisis } from "./reference/imo-gisis.adapter";
import { cacNigeria } from "./registries/cac-nigeria.adapter";
import { ofacUn } from "./registries/ofac-un.adapter";
import { flagRegistry } from "./registries/flag-registry.adapter";
import { companiesHouse } from "./registries/companies-house.adapter";
import { manifestUpload, bolUpload } from "./uploads/user-uploads.adapter";
import { volza } from "./trade/volza.adapter";
import { portCongestion } from "./models/port-congestion.adapter";
import { nimasaLevy } from "./internal/nimasa-levy.adapter";
import { platts } from "./market/platts.adapter";
import { piInsurance } from "./insurance/pi-insurance.adapter";
import { weather } from "./weather/weather.adapter";
import { googleVision } from "./ai/google-vision.adapter";
import { gemini } from "./ai/gemini.adapter";

const MATRIX_ADAPTERS: Record<string, BaseAdapter> = {
  spire,
  datalastic,
  imo_gisis: imoGisis,
  cac_nigeria: cacNigeria,
  sanctions: ofacUn,
  manifest_upload: manifestUpload,
  bol_upload: bolUpload,
  volza,
  port_congestion: portCongestion,
  nimasa_levy: nimasaLevy,
  platts,
  flag_registry: flagRegistry,
  companies_house: companiesHouse,
  pi_insurance: piInsurance,
  weather,
  google_vision: googleVision,
  gemini,
};

// Sanity: every matrix row must have an adapter.
for (const entry of DATA_SOURCE_MATRIX) {
  if (!MATRIX_ADAPTERS[entry.id]) {
    console.error(`[Seaphore] Missing adapter for matrix id: ${entry.id}`);
  }
}

export function getAdapter(id: string): BaseAdapter {
  const a = MATRIX_ADAPTERS[id];
  if (!a) throw new Error(`[Seaphore] No adapter registered for source "${id}"`);
  return a;
}

export function listAdapters(): { id: string; adapter: BaseAdapter }[] {
  return Object.entries(MATRIX_ADAPTERS).map(([id, adapter]) => ({ id, adapter }));
}
