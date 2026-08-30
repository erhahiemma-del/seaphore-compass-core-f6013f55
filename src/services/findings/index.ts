/**
 * The intelligence finding projection.
 *
 * Presentation only. No provider is called from here, no state decided,
 * no alert raised. Each provider domain keeps its own engine, store and
 * severity — this layer exists so one surface can list them together.
 */
export * from "./finding";
export * from "./record";
export * from "./map-features";
export * from "./from-sanctions";
export * from "./from-arrival";
export * from "./corroboration";
