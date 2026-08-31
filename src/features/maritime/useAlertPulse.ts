/**
 * One clock for every attention ring on the map.
 *
 * A pulse per alert is the obvious implementation and the wrong one: it
 * scales with the fleet, and twenty-seven `setInterval`s drifting against
 * each other produce a map that shimmers rather than one that breathes.
 * The phase is a property of the *layer*, so one animation frame repaints
 * every alerting vessel at once and the cost does not grow with the
 * number of alerts.
 *
 * ## Reduced motion is a full stop, not a slower pulse
 *
 * An officer who has asked their system not to animate has asked for a
 * reason, and honouring it half-way is worse than not at all. Under
 * `prefers-reduced-motion` the clock never starts and the ring is painted
 * once at full strength — the alert stays exactly as visible, it simply
 * stops moving. Emphasis carries it instead of motion, which is also why
 * the ring's severity is legible from radius and stroke width without
 * animation.
 */
import { useEffect } from "react";

/** Seconds for one complete breath. Slow enough to read as calm. */
const PERIOD_MS = 2_600;

export interface AlertPulseTarget {
  /**
   * Paint the ring at a phase between 0 and 1.
   *
   * Optional, because the attention ring is a renderer *capability* like
   * every other optional hook on the seam (`setVoyageData`,
   * `setPortInfrastructure`, `setLayerOpacity`). A renderer that cannot
   * pulse must degrade to "the ring does not breathe" — calling a method
   * it never claimed threw a TypeError out of the animation frame, which
   * tore down the map the moment a second engine was mounted.
   */
  setAlertPulse?(phase: number): void;
}

export interface UseAlertPulseOptions {
  /** The renderer. Null before it mounts. */
  readonly target: AlertPulseTarget | null;
  /** Whether anything is actually alerting. No alerts, no clock. */
  readonly active: boolean;
  /** Injectable so a test can assert the loop without a browser. */
  readonly prefersReducedMotion?: boolean;
}

/**
 * Drive the attention ring.
 *
 * Runs only while something is alerting: with an empty attention list
 * there is nothing to animate, and a loop that ran anyway would burn a
 * frame every 16ms to repaint nothing.
 */
export function useAlertPulse({
  target,
  active,
  prefersReducedMotion,
}: UseAlertPulseOptions): void {
  useEffect(() => {
    if (!target?.setAlertPulse) return;
    const paint = target.setAlertPulse.bind(target);

    const reduced =
      prefersReducedMotion ??
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

    if (!active || reduced) {
      /*
       * Painted once at full strength rather than left wherever the last
       * frame happened to stop. A ring frozen mid-fade would read as a
       * fading alert, which is the one thing it must never look like.
       */
      paint(1);
      return;
    }

    let frame = 0;
    const started = performance.now();

    const step = (now: number) => {
      /*
       * A cosine rather than a sawtooth: the ring eases at both ends, so
       * it reads as breathing instead of blinking. Blinking is what a
       * fault indicator does, and this is not a fault.
       */
      const elapsed = (now - started) % PERIOD_MS;
      const phase = (1 - Math.cos((elapsed / PERIOD_MS) * Math.PI * 2)) / 2;
      paint(phase);
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    // Cancelled on unmount, on the last alert clearing, and on the
    // renderer going away. No orphan loop can outlive any of those.
    return () => cancelAnimationFrame(frame);
  }, [target, active, prefersReducedMotion]);
}
