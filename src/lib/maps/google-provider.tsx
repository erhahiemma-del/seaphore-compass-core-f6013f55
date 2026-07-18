import type { MapProviderComponent } from "./types";
import { MockMapProvider } from "./mock-provider";

/**
 * GoogleMapsProvider — thin shim that satisfies the MapProvider contract.
 *
 * When `VITE_GOOGLE_MAPS_API_KEY` is available and `@vis.gl/react-google-maps`
 * is installed, replace the body with a `<APIProvider><Map/></APIProvider>`
 * tree that translates the incoming markers/overlays. Until then, the mock
 * fallback keeps every feature functional without a paid map key.
 */
export const GoogleMapsProvider: MapProviderComponent = (props) => {
  // TODO: swap for @vis.gl/react-google-maps once the API key is provisioned.
  return <MockMapProvider {...props} />;
};
