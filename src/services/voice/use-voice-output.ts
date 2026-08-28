/**
 * The one place the interface reaches speech synthesis.
 *
 * `VoiceOutputService` existed and was orphaned — Seaphore had listened
 * since voice was built and never once answered aloud. This mounts it,
 * and mounts it exactly once: a component calling `speechSynthesis`
 * directly would be a second voice able to talk over the first, and
 * cancellation would stop only whichever one happened to own the
 * utterance.
 *
 * The service is created lazily and kept for the life of the surface,
 * because voice enumeration is asynchronous in every browser and
 * rebuilding it per render would restart that each time.
 */
import { useEffect, useMemo } from "react";

import { createVoiceOutput, describeVoice, type VoiceOutputService } from "./voice-output";

export function useVoiceOutputService(): VoiceOutputService {
  const service = useMemo(
    () => createVoiceOutput(typeof window === "undefined" ? undefined : window.speechSynthesis),
    [],
  );

  /*
   * Stop talking when the surface goes away. A pending utterance
   * survives navigation otherwise, and the officer hears a sentence
   * about a screen they have already left.
   */
  useEffect(() => () => service.stop(), [service]);

  return service;
}

/** What to show in voice settings. Never claims an accent it does not have. */
export function voiceDescription(service: VoiceOutputService): string {
  return describeVoice(service.selected());
}
