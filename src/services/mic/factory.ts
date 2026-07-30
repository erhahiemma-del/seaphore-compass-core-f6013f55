/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A — MIC · Factory
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Factory functions for constructing MicContainers in different
 *  contexts (production, test, lightweight stub). Centralises all
 *  wiring decisions so no caller needs to know about registry classes.
 * ─────────────────────────────────────────────────────────────────────
 */
import { MicContainer, type MicContainerOptions } from "./container";

/**
 * Create a fresh MicContainer. Intended for tests — every test gets
 * isolated state with no shared singletons.
 */
export function createMicContainer(opts: MicContainerOptions = {}): MicContainer {
  return new MicContainer(opts);
}

/**
 * Create a MicContainer with a fixed clock. Useful for deterministic
 * tests that need reproducible timestamps.
 */
export function createMicContainerWithClock(isoNow: string): MicContainer {
  return new MicContainer({ clock: () => isoNow });
}
