/**
 * Intelligence Earth — camera presets and earth settings (Phase 4A).
 *
 * Engine-agnostic by construction: a preset is a camera pose in the same
 * `MapCamera` vocabulary both renderers already speak, and the settings
 * are a small record of *presentation* facts. Nothing here holds vessel
 * state, selection, or provenance — those stay with the canonical
 * services, which is what lets the terrain lens draw the same picture.
 */
import type { LonLat } from "./types";

export interface EarthCameraPreset {
  readonly id: string;
  /** Officer-facing label, as it appears in the control. */
  readonly label: string;
  readonly center: LonLat;
  /** Web-mercator zoom, translated to camera height by the adapter. */
  readonly zoom: number;
  /**
   * Tilt in the `MapCamera` convention both renderers share: 0 looks
   * straight down, larger values lean towards the horizon. Wide scales
   * stay near 0 so the whole earth is in frame; port scales lean over so
   * relief and quay structure read as depth.
   */
  readonly pitch: number;
  readonly bearing: number;
}

/**
 * Presets run global → national → terminal, in that order.
 *
 * The order is the operational one: an officer descends from the world to
 * a berth, and a list that mixed scales would make the descent a search.
 */
export const EARTH_CAMERA_PRESETS: readonly EarthCameraPreset[] = [
  { id: "global", label: "Global", center: [10, 5], zoom: 0.5, pitch: 0, bearing: 0 },
  { id: "africa", label: "Africa", center: [18, 3], zoom: 2.1, pitch: 5, bearing: 0 },
  { id: "west-africa", label: "West Africa", center: [3, 5], zoom: 4.1, pitch: 12, bearing: 0 },
  { id: "nigeria", label: "Nigeria", center: [8.1, 8.6], zoom: 5.8, pitch: 20, bearing: 0 },
  { id: "lagos", label: "Lagos", center: [3.39, 6.45], zoom: 10.5, pitch: 35, bearing: 0 },
  { id: "apapa", label: "Apapa Port", center: [3.363, 6.446], zoom: 14.2, pitch: 50, bearing: 20 },
  {
    id: "tin-can-island",
    label: "Tin Can Island",
    center: [3.341, 6.436],
    zoom: 14.2,
    pitch: 50,
    bearing: 340,
  },
  { id: "onne", label: "Onne", center: [7.157, 4.674], zoom: 14, pitch: 50, bearing: 0 },
  { id: "bonny", label: "Bonny", center: [7.171, 4.427], zoom: 13.4, pitch: 50, bearing: 0 },
  { id: "warri", label: "Warri", center: [5.741, 5.532], zoom: 13.4, pitch: 50, bearing: 0 },
  { id: "calabar", label: "Calabar", center: [8.322, 4.965], zoom: 13.4, pitch: 50, bearing: 0 },
];

export function earthPreset(id: string): EarthCameraPreset | undefined {
  return EARTH_CAMERA_PRESETS.find((preset) => preset.id === id);
}

/** How the earth is drawn. Presentation only — never what the map knows. */
export interface EarthSettings {
  /** GLOBE is the round earth; FLAT is Cesium's 2D morph of the same scene. */
  readonly mode: "GLOBE" | "FLAT";
  /** Relief multiplier, 0–3. 1 is true-to-life; 0 flattens terrain. */
  readonly terrainExaggeration: number;
  /** Sun-driven shading, so night is night. */
  readonly dayNightLighting: boolean;
  /** Sky glow, ground haze and distance fog. */
  readonly atmosphere: boolean;
  /** Animated water on the terrain's own water mask. */
  readonly ocean: boolean;
  /** High-resolution Ion satellite imagery over the ellipsoid base. */
  readonly satelliteImagery: boolean;
}

export const DEFAULT_EARTH_SETTINGS: EarthSettings = {
  mode: "GLOBE",
  terrainExaggeration: 1,
  dayNightLighting: true,
  atmosphere: true,
  ocean: true,
  satelliteImagery: true,
};

/** 0–3, finite, and never a NaN slid in from a URL or a stray input. */
export function clampExaggeration(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EARTH_SETTINGS.terrainExaggeration;
  return Math.max(0, Math.min(3, Math.round(value * 10) / 10));
}
