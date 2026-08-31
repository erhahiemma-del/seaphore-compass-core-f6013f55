/**
 * Intelligence Earth controls (Phase 4A).
 *
 * Presentation only. Every control here changes how the earth is *drawn*
 * — relief, light, atmosphere, water, imagery, and where the camera is
 * looking. None of them change what the map knows: the vessels, findings,
 * selection and provenance all still come from the canonical services, so
 * an officer switching to Flat Earth is looking at the same picture from a
 * different angle rather than at a different product.
 *
 * Rendered as a strip beneath the header rather than a floating widget,
 * so it cannot collide with the map's declared overlay zones — and so it
 * disappears entirely the moment the terrain lens is not mounted.
 */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EARTH_SETTINGS,
  EARTH_CAMERA_PRESETS,
  type EarthSettings,
} from "@/services/geospatial/earth-presets";
import type { MapRenderer } from "@/services/geospatial/renderer";

/**
 * What this panel needs of the mounted renderer.
 *
 * Structural, not a class import: the panel must never pull the Cesium
 * adapter — and therefore Cesium — into the 2D bundle.
 */
export interface EarthController {
  getEarthSettings(): EarthSettings;
  applyEarthSettings(next: Partial<EarthSettings>): EarthSettings;
  flyToPreset(presetId: string): boolean;
}

export function asEarthController(renderer: MapRenderer | undefined): EarthController | null {
  const candidate = renderer as unknown as Partial<EarthController> | undefined;
  if (!candidate || typeof candidate.applyEarthSettings !== "function") return null;
  return candidate as EarthController;
}

export function IntelligenceEarthPanel({
  renderer,
  className,
}: {
  readonly renderer: MapRenderer | undefined;
  readonly className?: string;
}) {
  const controller = asEarthController(renderer);
  const [settings, setSettings] = useState<EarthSettings>(DEFAULT_EARTH_SETTINGS);
  const [preset, setPreset] = useState<string | null>(null);

  // Read the live scene's own settings once it is mounted, so the controls
  // report the earth rather than their own defaults.
  useEffect(() => {
    if (!controller) return;
    try {
      setSettings(controller.getEarthSettings());
    } catch {
      // A viewer mid-mount has nothing to report yet; defaults stand.
    }
  }, [controller]);

  const update = useCallback(
    (next: Partial<EarthSettings>) => {
      if (!controller) return;
      setSettings(controller.applyEarthSettings(next));
    },
    [controller],
  );

  if (!controller) return null;

  const toggles: readonly {
    key: keyof EarthSettings;
    label: string;
    title: string;
    value: boolean;
  }[] = [
    {
      key: "satelliteImagery",
      label: "Satellite",
      title: "High-resolution satellite imagery over the globe",
      value: settings.satelliteImagery,
    },
    {
      key: "atmosphere",
      label: "Atmosphere",
      title: "Sky glow, ground haze and distance fog",
      value: settings.atmosphere,
    },
    {
      key: "ocean",
      label: "Ocean",
      title: "Animated water, shaded from the terrain water mask",
      value: settings.ocean,
    },
    {
      key: "dayNightLighting",
      label: "Day / night",
      title: "Sun-driven lighting, so night is night",
      value: settings.dayNightLighting,
    },
  ];

  return (
    <div
      data-testid="intelligence-earth-panel"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 bg-muted/30 px-3 py-2",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Intelligence Earth
      </span>

      {/* Globe vs Flat: the same scene, morphed, never a second map. */}
      <div
        role="group"
        aria-label="Earth mode"
        className="flex items-center gap-1 rounded-md bg-background p-0.5"
      >
        {(["GLOBE", "FLAT"] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={settings.mode === mode ? "default" : "ghost"}
            aria-pressed={settings.mode === mode}
            className="h-6 px-2 text-[11px]"
            onClick={() => update({ mode })}
            title={
              mode === "GLOBE"
                ? "Round earth — true geometry at global scale"
                : "Flat earth — the same scene morphed to a plane"
            }
          >
            {mode === "GLOBE" ? "Globe" : "Flat Earth"}
          </Button>
        ))}
      </div>

      {/* Relief. 1× is true-to-life, and the label says so. */}
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="whitespace-nowrap">Terrain relief</span>
        <Slider
          aria-label="Terrain exaggeration"
          className="w-28"
          min={0}
          max={3}
          step={0.1}
          value={[settings.terrainExaggeration]}
          onValueChange={([value]) => update({ terrainExaggeration: value })}
        />
        <span
          data-testid="terrain-exaggeration-value"
          className="w-10 font-mono text-foreground tabular-nums"
        >
          {settings.terrainExaggeration.toFixed(1)}×
        </span>
      </label>

      <div className="flex items-center gap-1">
        {toggles.map((toggle) => (
          <Button
            key={toggle.key}
            size="sm"
            variant={toggle.value ? "secondary" : "ghost"}
            aria-pressed={toggle.value}
            title={toggle.title}
            className="h-6 px-2 text-[11px]"
            onClick={() => update({ [toggle.key]: !toggle.value } as Partial<EarthSettings>)}
          >
            {toggle.label}
          </Button>
        ))}
      </div>

      {/*
        Presets descend global → national → terminal, in that order, and
        each one animates: an officer who is dropped somewhere cannot tell
        where they came from, and the flight is what carries the scale.
      */}
      <div className="flex items-center gap-1 overflow-x-auto" aria-label="Camera presets">
        {EARTH_CAMERA_PRESETS.map((candidate) => (
          <Button
            key={candidate.id}
            size="sm"
            variant={preset === candidate.id ? "default" : "outline"}
            className="h-6 shrink-0 px-2 text-[11px]"
            data-testid={`earth-preset-${candidate.id}`}
            onClick={() => {
              if (controller.flyToPreset(candidate.id)) setPreset(candidate.id);
            }}
          >
            {candidate.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
