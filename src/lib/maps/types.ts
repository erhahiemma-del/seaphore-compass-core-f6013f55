/**
 * Map abstraction layer.
 *
 * Every map feature (Mission Control, Detect, Ports Centre) MUST render via
 * a `MapProvider`. This lets the platform swap between Google Maps, Mapbox,
 * MapLibre, or the built-in mock SVG without touching feature code.
 */

import type { ReactNode } from "react";

export type LatLng = { lat: number; lng: number };

export interface MapMarker {
  id: string;
  position: LatLng;
  label?: string;
  color?: string;
  /** Optional radius in pixels for scale/impact styling. */
  radius?: number;
  onClick?: () => void;
}

export interface MapViewport {
  center: LatLng;
  zoom: number;
}

export interface MapProviderProps {
  viewport: MapViewport;
  markers?: MapMarker[];
  /** Free-form provider-specific overlays (heatmaps, polylines) as ReactNodes. */
  overlays?: ReactNode;
  onViewportChange?: (v: MapViewport) => void;
  className?: string;
}

/** A map provider is a React component that satisfies the props contract above. */
export type MapProviderComponent = (props: MapProviderProps) => JSX.Element;

export type MapProviderName = "mock" | "google" | "mapbox";
