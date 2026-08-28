/**
 * Speaking to Seaphore without a microphone.
 *
 * The voice loop could not be verified by anyone who cannot talk: capture
 * is genuine — MediaRecorder, a WAV, a transcription endpoint — so every
 * check downstream of it was unreachable in an automated session, and
 * "the Copilot understands follow-up questions" stayed an assertion
 * rather than an observation.
 *
 * This opens one door, at exactly one place: the normalised transcript,
 * the same string the transcription endpoint returns. Everything after
 * it — interpretation, entity resolution, pronouns, clarification,
 * confirmation, `executeCopilotAction`, the spoken response — runs
 * untouched. That is the entire point. A harness with its own execution
 * path would verify itself and tell you nothing about the product.
 *
 * ## It cannot reach production
 *
 * Guarded on `import.meta.env.DEV`, so the branch is eliminated from the
 * production bundle rather than merely being hard to find. The bundle
 * verification gate checks for exactly this class of leak.
 *
 * ## What it does not prove
 *
 * Nothing about the microphone, the transcription round trip, or whether
 * any sound actually leaves the speakers. Those need an officer.
 */

/** Transcripts supplied on the URL, in order, for a scripted conversation. */
export function devTranscriptsFrom(search: string): readonly string[] {
  if (!import.meta.env.DEV || !search) return [];
  const params = new URLSearchParams(search);
  /*
   * Repeatable, because the interesting behaviour is conversational: a
   * clarification followed by an answer, or a proposal followed by a
   * yes, cannot be expressed as a single utterance.
   */
  return params
    .getAll("devTranscript")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Whether the harness is available at all on this build. */
export function devHarnessEnabled(): boolean {
  return import.meta.env.DEV === true;
}
