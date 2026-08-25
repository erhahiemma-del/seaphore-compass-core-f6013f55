/**
 * GIP — Map Event Bus.
 *
 * A typed publish/subscribe channel decoupling the map renderer from every
 * consumer of map interaction. The renderer emits; panels, docks, and future
 * intelligence surfaces subscribe. Neither side holds a reference to the
 * other, which is what lets the MapLibre adapter be swapped, stubbed, or
 * omitted entirely without touching consumers.
 *
 * Design rules:
 *   - Fully typed: `on("vessel:click", …)` gives the handler a
 *     `VesselClickEvent`, and an unknown event name is a compile error.
 *   - Handler isolation: one throwing subscriber never prevents the others
 *     from receiving the event, and never propagates into the renderer's
 *     interaction loop.
 *   - Synchronous delivery: handlers run in registration order so tests are
 *     deterministic and no scheduling assumptions leak into consumers.
 *
 * Sprint G5.5.1 — transport only. The bus carries events; it never
 * interprets them.
 */
import type { LonLat, Unsubscribe } from "./types";

/** Emitted once the renderer has finished initialising and is drawable. */
export interface MapReadyEvent {
  /** Identifier of the adapter that became ready, e.g. `"maplibre"`. */
  readonly renderer: string;
}

/** Emitted after the camera settles following a pan/zoom/rotate. */
export interface MapMoveEvent {
  readonly center: LonLat;
  readonly zoom: number;
  readonly pitch: number;
  readonly bearing: number;
}

/** Emitted when the officer clicks the basemap away from any feature. */
export interface MapClickEvent {
  readonly position: LonLat;
}

/** Emitted when a vessel marker is clicked. */
export interface VesselClickEvent {
  readonly imo: string;
  readonly position: LonLat;
}

/** Emitted when the pointer enters or leaves a vessel marker. */
export interface VesselHoverEvent {
  readonly imo: string | null;
  readonly position: LonLat | null;
}

/** Emitted when a logical layer is switched on or off. */
export interface LayerVisibilityEvent {
  readonly layerId: string;
  readonly visible: boolean;
}

/** Emitted after the update engine has applied a batch to the renderer. */
export interface VesselsAppliedEvent {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly total: number;
}

/** Emitted when a renderer or data-source operation fails. */
export interface MapErrorEvent {
  readonly scope: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * The complete event vocabulary of the operational map.
 *
 * Extending the map is the supported way to add new events — adding a key
 * here makes it immediately available to `on`/`emit` with full type safety.
 */
/**
 * A voyage endpoint was clicked.
 *
 * Carries the voyage's identity, never the record. The host resolves it
 * against the voyage feed, exactly as `vessel:click` is resolved against
 * the update engine — so the drawer can never show a staler copy than
 * the map.
 */
export interface VoyageClickEvent {
  readonly voyageId: string;
  readonly voyageNumber: string | null;
}

/** A port symbol was clicked. Carries identity, never the port record. */
export interface PortClickEvent {
  readonly portId: string;
  readonly position: LonLat;
}

/** An anchorage symbol was clicked. */
export interface AnchorageClickEvent {
  readonly anchorageId: string;
  /** Port the anchorage serves, when the registry records one. */
  readonly portId: string | null;
  readonly position: LonLat;
}

export interface MapEventMap {
  "map:ready": MapReadyEvent;
  "map:move": MapMoveEvent;
  "map:click": MapClickEvent;
  "vessel:click": VesselClickEvent;
  "voyage:click": VoyageClickEvent;
  "port:click": PortClickEvent;
  "anchorage:click": AnchorageClickEvent;
  "vessel:hover": VesselHoverEvent;
  "layer:visibility": LayerVisibilityEvent;
  "vessels:applied": VesselsAppliedEvent;
  "map:error": MapErrorEvent;
}

/** Any valid event name. */
export type MapEventName = keyof MapEventMap;

/** Handler signature for a given event name. */
export type MapEventHandler<K extends MapEventName> = (payload: MapEventMap[K]) => void;

/**
 * Called when a subscriber throws. Defaults to reporting on the bus's own
 * `map:error` channel; injectable so tests can assert on failures and hosts
 * can route them to observability.
 */
export type EventBusErrorReporter = (event: MapEventName, error: unknown) => void;

export class MapEventBus {
  private readonly handlers = new Map<MapEventName, Set<(payload: never) => void>>();
  private readonly reportError: EventBusErrorReporter;

  constructor(reportError?: EventBusErrorReporter) {
    this.reportError =
      reportError ??
      ((event, error) => {
        // Re-entrancy guard: reporting an error on the error channel must not
        // recurse if an error handler itself throws.
        if (event === "map:error") return;
        this.emit("map:error", {
          scope: `event-bus:${event}`,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      });
  }

  /**
   * Subscribe to an event. Returns an unsubscribe handle; calling it more
   * than once is safe.
   */
  on<K extends MapEventName>(event: K, handler: MapEventHandler<K>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const erased = handler as (payload: never) => void;
    set.add(erased);
    return () => {
      set.delete(erased);
      if (set.size === 0) this.handlers.delete(event);
    };
  }

  /** Subscribe for a single delivery, then unsubscribe automatically. */
  once<K extends MapEventName>(event: K, handler: MapEventHandler<K>): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /**
   * Publish an event to every current subscriber, in registration order.
   *
   * Subscribers are snapshotted before dispatch, so a handler that
   * subscribes or unsubscribes during delivery does not affect the batch in
   * flight. A throwing handler is reported and delivery continues.
   */
  emit<K extends MapEventName>(event: K, payload: MapEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        (handler as MapEventHandler<K>)(payload);
      } catch (error) {
        this.reportError(event, error);
      }
    }
  }

  /** Remove every subscriber for one event, or for all events. */
  off(event?: MapEventName): void {
    if (event === undefined) this.handlers.clear();
    else this.handlers.delete(event);
  }

  /** Number of subscribers for one event, or across all events. */
  listenerCount(event?: MapEventName): number {
    if (event !== undefined) return this.handlers.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this.handlers.values()) total += set.size;
    return total;
  }
}

/**
 * Process-wide bus used by the operational map.
 *
 * Prefer injecting a `MapEventBus` where practical — construct a fresh
 * instance per test to keep cases isolated.
 */
export const mapEventBus = new MapEventBus();
