import type { MapProviderComponent } from "./types";
import { MockMapProvider } from "./mock-provider";

/**
 * MapboxProvider — thin shim that satisfies the MapProvider contract.
 *
 * When `VITE_MAPBOX_ACCESS_TOKEN` is available and `react-map-gl` is
 * installed, replace the body with a `<Map/>` tree that translates the
 * incoming markers/overlays. Until then, the mock fallback keeps every
 * feature functional without a paid map key.
 */
export const MapboxProvider: MapProviderComponent = (props) => {
  // TODO: swap for react-map-gl once the access token is provisioned.
  return <MockMapProvider {...props} />;
};
