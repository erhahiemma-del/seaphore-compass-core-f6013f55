import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MapProviderComponent, MapProviderName } from "./types";
import { MockMapProvider } from "./mock-provider";
import { GoogleMapsProvider } from "./google-provider";
import { MapboxProvider } from "./mapbox-provider";

const registry: Record<MapProviderName, MapProviderComponent> = {
  mock: MockMapProvider,
  google: GoogleMapsProvider,
  mapbox: MapboxProvider,
};

const MapProviderContext = createContext<MapProviderComponent>(MockMapProvider);

export function MapProviderRoot({
  provider = "mock",
  children,
}: {
  provider?: MapProviderName;
  children: ReactNode;
}) {
  const Component = useMemo(() => registry[provider] ?? MockMapProvider, [provider]);
  return <MapProviderContext.Provider value={Component}>{children}</MapProviderContext.Provider>;
}

export function useMapProvider(): MapProviderComponent {
  return useContext(MapProviderContext);
}
