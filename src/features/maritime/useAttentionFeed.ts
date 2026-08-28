/**
 * The attention feed's scrolling behaviour.
 *
 * An operations feed that moves on its own is useful right up to the
 * moment an officer reaches for it, and then it becomes something they
 * are fighting. Every rule here exists to make sure the officer wins
 * that contest immediately and permanently, and that the system never
 * takes the reading position away from them.
 *
 * ## Pausing is generous; resuming is deliberate
 *
 * Any sign of a human — a pointer entering, a wheel, a touch, a
 * keystroke, a focus landing inside — stops the scroll at once. Nothing
 * restarts it except the officer saying so. An inactivity timer that
 * resumed on its own would eventually move the list while they were
 * still reading it, which is exactly the failure the pause exists to
 * prevent, so there is deliberately no such timer.
 *
 * ## Arrivals never move the viewport
 *
 * While paused, a new alert is announced and not applied. The count at
 * the top changes; the scroll position does not. An officer reading row
 * nine keeps reading row nine.
 *
 * ## One loop
 *
 * A single animation frame drives the whole panel. Per-row timers would
 * scale with the fleet and drift against each other.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Pixels per second. Slow enough to read a row as it passes. */
const SCROLL_SPEED_PX_PER_S = 14;

/** How long the panel rests at each end before continuing. */
const EDGE_PAUSE_MS = 1_600;

export type FeedMotion =
  /** Scrolling on its own. */
  | "LIVE"
  /** An officer touched it. Only they restart it. */
  | "PAUSED"
  /** Nothing to scroll: the list fits. */
  | "IDLE";

export interface AttentionFeed {
  readonly motion: FeedMotion;
  /** Alerts that arrived while paused and have not been looked at. */
  readonly pendingCount: number;
  /** Attach to the scrollable element. */
  readonly listRef: React.RefObject<HTMLUListElement | null>;
  /** Handlers the panel spreads onto its scroll container. */
  readonly handlers: {
    readonly onPointerEnter: () => void;
    readonly onPointerDown: () => void;
    readonly onWheel: () => void;
    readonly onTouchStart: () => void;
    readonly onKeyDown: () => void;
    readonly onFocusCapture: () => void;
  };
  /** Officer resumes deliberately. */
  readonly resume: () => void;
  /** Jump to the newest arrivals and clear the pending badge. */
  readonly showNew: () => void;
  /** Called by the panel when the officer acts on a row. */
  readonly pause: () => void;
}

export interface UseAttentionFeedOptions {
  /** How many alerts the list currently holds. */
  readonly count: number;
  /** Whether the panel is open. A closed panel runs no loop. */
  readonly open: boolean;
  readonly prefersReducedMotion?: boolean;
}

export function useAttentionFeed({
  count,
  open,
  prefersReducedMotion,
}: UseAttentionFeedOptions): AttentionFeed {
  const listRef = useRef<HTMLUListElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const seenCount = useRef(count);

  const pause = useCallback(() => setPaused(true), []);

  /*
   * Arrivals are counted, never applied.
   *
   * While the officer is reading, a new alert becomes a number at the
   * top of the panel and nothing else. When the feed is live there is no
   * reading position to protect, so it simply flows in.
   */
  useEffect(() => {
    if (count > seenCount.current && paused) {
      setPendingCount((pending) => pending + (count - seenCount.current));
    }
    seenCount.current = count;
  }, [count, paused]);

  const reduced =
    prefersReducedMotion ??
    (typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;

    /*
     * Nothing to scroll is a state of its own, not a paused one. The
     * header must be able to say "the list fits" rather than implying
     * the officer stopped something.
     */
    const overflowing = list.scrollHeight - list.clientHeight > 4;
    setScrollable(overflowing);
    if (!overflowing || paused || reduced) return;

    let frame = 0;
    let last = performance.now();
    let restingUntil = 0;
    let direction = 1;

    const step = (now: number) => {
      const list = listRef.current;
      if (!list) return;
      const elapsed = now - last;
      last = now;

      if (now >= restingUntil) {
        list.scrollTop += (direction * (SCROLL_SPEED_PX_PER_S * elapsed)) / 1000;
        const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
        const atStart = list.scrollTop <= 0;
        /*
         * Reverses at the ends rather than jumping back to the top. A
         * jump loses the officer's place in the list even when nobody
         * is touching it, and a feed that teleports reads as broken.
         */
        if (atEnd && direction === 1) {
          direction = -1;
          restingUntil = now + EDGE_PAUSE_MS;
        } else if (atStart && direction === -1) {
          direction = 1;
          restingUntil = now + EDGE_PAUSE_MS;
        }
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    // Cancelled on unmount, on close, on pause, and on reduced motion.
    return () => cancelAnimationFrame(frame);
  }, [open, paused, reduced, count]);

  // Closing the panel forgets the pause: reopening should be live again.
  useEffect(() => {
    if (!open) {
      setPaused(false);
      setPendingCount(0);
    }
  }, [open]);

  const motion: FeedMotion = !scrollable || reduced ? "IDLE" : paused ? "PAUSED" : "LIVE";

  return {
    motion,
    pendingCount,
    listRef,
    handlers: {
      onPointerEnter: pause,
      onPointerDown: pause,
      onWheel: pause,
      onTouchStart: pause,
      onKeyDown: pause,
      onFocusCapture: pause,
    },
    resume: useCallback(() => {
      setPaused(false);
      setPendingCount(0);
    }, []),
    showNew: useCallback(() => {
      // Moves to the newest arrivals because the officer asked. The feed
      // stays paused: they are reading, not watching.
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      setPendingCount(0);
    }, []),
    pause,
  };
}
