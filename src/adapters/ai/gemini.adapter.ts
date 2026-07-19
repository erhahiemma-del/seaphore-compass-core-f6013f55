/**
 * Google Gemini 1.5 Pro — ACTIVE. Real inference is done through the
 * Lovable AI Gateway (uses LOVABLE_API_KEY, requires no direct Google key).
 * Adapter only carries citation / confidence for status chips.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface AiReasoning {
  promptId: string;
  output: string;
  model: string;
}

export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super("gemini");
  }
  attach(reasoning: AiReasoning): SourcedResult<AiReasoning> {
    this.assertUsable();
    return this.envelope<AiReasoning>(reasoning, new Date().toISOString(), { inferred: true });
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const gemini = new GeminiAdapter();
