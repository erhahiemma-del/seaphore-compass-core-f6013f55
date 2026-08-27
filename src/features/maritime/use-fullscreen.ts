/**
 * Full screen for the map workspace.
 *
 * The browser's own Fullscreen API where it exists, and a fixed-position
 * fallback where it does not — Safari on iOS refuses it outright, and a
 * control that simply failed there would be the placeholder this exists
 * to remove.
 *
 * Nothing here touches the map. Fullscreen is a property of a DOM
 * element, so the camera, the selection, the focus subject and the
 * filters are untouched by definition: the same canvas is still mounted,
 * it is merely larger. That is the whole reason to do it this way rather
 * than routing to a dedicated screen.
 *
 * `Esc` is not bound here. The browser already exits fullscreen on it and
 * fires `fullscreenchange`, which this listens to — binding a second
 * handler would mean two things racing to leave one state.
 */
import { useCallback, useEffect, useState } from "react";

/** Element-level fullscreen, including the vendor spellings still in the wild. */
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

function nativeSupported(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenDocument;
  return Boolean(document.fullscreenEnabled || typeof doc.webkitExitFullscreen === "function");
}

function currentElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export interface FullscreenState {
  /** Whether the workspace is currently expanded, by either mechanism. */
  readonly active: boolean;
  /**
   * Whether the browser's own fullscreen is available.
   *
   * False does not mean the control is useless — the fallback still
   * expands the workspace to the viewport. It only means the browser
   * chrome stays.
   */
  readonly native: boolean;
  readonly toggle: () => void;
}

export function useFullscreen(target: React.RefObject<HTMLElement | null>): FullscreenState {
  const [active, setActive] = useState(false);
  const [native] = useState(nativeSupported);

  /*
   * The browser is the authority on whether we are fullscreen, not this
   * hook. An officer can leave with Esc, the window chrome or a gesture
   * none of which routes through `toggle`, and a local boolean would
   * then describe a state the page is no longer in.
   */
  useEffect(() => {
    const sync = () => {
      const element = target.current;
      setActive(Boolean(element && currentElement() === element));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [target]);

  const toggle = useCallback(() => {
    const element = target.current as FullscreenElement | null;
    if (!element) return;

    /*
     * Already expanded by the fallback, so collapse the same way.
     *
     * Checked before anything else because `native` being true says only
     * that the API exists, not that this document may use it. Under a
     * permissions policy the request is rejected and we land in the
     * fallback anyway — and retrying the rejected request on the next
     * click left the officer unable to leave. Measured: entering worked,
     * exiting did nothing at all.
     */
    if (element.classList.contains("seaphore-fullscreen-fallback")) {
      element.classList.remove("seaphore-fullscreen-fallback");
      setActive(false);
      return;
    }

    if (!native) {
      // Fallback: expand to the viewport. The map is resized by its own
      // ResizeObserver, so nothing here needs to know about MapLibre.
      setActive((expanded) => {
        element.classList.toggle("seaphore-fullscreen-fallback", !expanded);
        return !expanded;
      });
      return;
    }

    if (currentElement() === element) {
      const doc = document as FullscreenDocument;
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }
    /*
     * Rejection is normal rather than exceptional — a permissions policy
     * or a gesture the browser did not consider user-initiated will
     * refuse. Falling back keeps the control doing something rather than
     * appearing to do nothing.
     */
    void Promise.resolve(
      element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.(),
    )?.catch(() => {
      element.classList.add("seaphore-fullscreen-fallback");
      setActive(true);
    });
  }, [native, target]);

  return { active, native, toggle };
}
