/**
 * Sprint 8 · Deterministic mock model — used by the test suite and by the
 * dev/no-key fallback. Produces schema-valid JSON without any LLM call.
 *
 * The mock reads the injected `evidence.ranked[]` from the user prompt
 * (JSON-embedded) and synthesises an assessment + why-chain + counter-
 * hypothesis grounded in real evidence ids, so retry / validation logic
 * exercises correctly in tests.
 */
import type { ModelClient, ModelTier } from "./types";
import { bandOf } from "./confidence";

interface MockOptions {
  readonly id?: string;
  readonly tier?: ModelTier;
  /** Deliberately break the first N responses to exercise retries. */
  readonly failFirstN?: number;
  /** Override statement generation for targeted tests. */
  readonly assessmentStatement?: (topEvidenceId: string) => string;
}

interface EmbeddedEvidence {
  id: string;
  attribute: string;
  value: unknown;
  confidence: number;
  conflictsWith?: string[];
}

interface EmbeddedBundle {
  ranked: EmbeddedEvidence[];
  conflicts: Array<{ a: { id: string }; b: { id: string }; attribute: string }>;
  anchor: number;
}

function extractBundle(userPrompt: string): EmbeddedBundle | null {
  const start = userPrompt.indexOf("<evidence>");
  const end = userPrompt.indexOf("</evidence>");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(userPrompt.slice(start + "<evidence>".length, end));
  } catch {
    return null;
  }
}

export function createMockModel(opts: MockOptions = {}): ModelClient & { calls: number } {
  const id = opts.id ?? "mock/deterministic-1";
  const tier: ModelTier = opts.tier ?? "tier2";
  let calls = 0;

  const client: ModelClient & { calls: number } = {
    id,
    tier,
    get calls() {
      return calls;
    },
    async complete({ user }) {
      const attempt = ++calls;
      if (opts.failFirstN && attempt <= opts.failFirstN) {
        return { text: "not json — deliberate failure for retry test" };
      }

      const bundle = extractBundle(user);
      const items = bundle?.ranked ?? [];
      const top = items[0];
      if (!top) {
        return {
          text: JSON.stringify({
            assessment: {
              statement: "Insufficient evidence to form an assessment.",
              confidence: 0.1,
              band: "insufficient",
            },
            recommendation: {
              action: "Officer may request additional evidence retrieval.",
              confidence: 0.1,
              rationale: "No ranked evidence supplied.",
            },
            whyChain: [],
            counterHypotheses: [],
            citations: [],
          }),
        };
      }

      const anchor = bundle?.anchor ?? top.confidence;
      const assessmentConf = Math.max(0, Math.min(1, anchor * 0.879)); // matches ladder rec/evidence ratio proxy
      const band = bandOf(assessmentConf);

      const statement = opts.assessmentStatement
        ? opts.assessmentStatement(top.id)
        : `Records indicate ${top.attribute} = ${JSON.stringify(top.value)} (evidence ${top.id}).`;

      const whyChain = items.slice(0, Math.min(3, items.length)).map((e, i) => ({
        step: i + 1,
        statement: `Observed ${e.attribute} from source-scored evidence ${e.id}.`,
        evidenceIds: [e.id],
        confidence: Math.max(0, Math.min(1, e.confidence)),
      }));

      // Conflict-side inclusion — Layer 2.3 requires both sides
      const conflict = bundle?.conflicts?.[0];
      if (conflict) {
        whyChain.push({
          step: whyChain.length + 1,
          statement: `Contradicting record present for ${conflict.attribute} — both sides retained.`,
          evidenceIds: [conflict.a.id, conflict.b.id],
          confidence: 0.5,
        });
      }

      const counterHypotheses =
        band === "high" || band === "medium"
          ? [
              {
                statement: `Alternative reading: the ${top.attribute} value may reflect a benign reporting variance rather than an anomaly.`,
                likelihood: 0.35,
                refutingEvidenceIds: items.slice(0, 2).map((e) => e.id),
              },
            ]
          : [];

      const citations = Array.from(new Set(whyChain.flatMap((s) => s.evidenceIds)));

      return {
        text: JSON.stringify({
          assessment: { statement, confidence: round3(assessmentConf), band },
          recommendation: {
            action: "Officer may open an investigation and request corroborating sources.",
            confidence: round3(assessmentConf * 0.92),
            rationale: `Grounded in ${citations.length} cited evidence items with anchor confidence ${round3(anchor)}.`,
          },
          whyChain,
          counterHypotheses,
          citations,
        }),
      };
    },
  };
  return client;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
