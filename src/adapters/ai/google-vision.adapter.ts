/**
 * Google Vision OCR — ACTIVE. Called from a server function that reads the
 * GOOGLE_VISION_API_KEY environment variable. The client-safe adapter here
 * only exposes shape + status; the real HTTP call is made in
 * src/lib/ocr.functions.ts (server function) once wired.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface OcrResult {
  text: string;
  pages: number;
  confidence: number;
}

export class GoogleVisionAdapter extends BaseAdapter {
  constructor() {
    super("google_vision");
  }
  async recognize(_ref: { bucket: string; path: string }): Promise<SourcedResult<OcrResult>> {
    this.assertUsable();
    return this.envelope<OcrResult>(null, new Date().toISOString(), {
      degradedReason: "OCR runs server-side; call via ocr.functions.ts",
    });
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const googleVision = new GoogleVisionAdapter();
