import type { MapProviderComponent } from "./types";

/**
 * MockMapProvider — deterministic SVG map used as the default when no
 * commercial map key is available. Renders markers on a Gulf-of-Guinea-shaped
 * canvas so demos, tests, and offline builds behave identically.
 */
export const MockMapProvider: MapProviderComponent = ({
  viewport,
  markers = [],
  overlays,
  className,
}) => {
  const width = 800;
  const height = 480;
  const project = (lat: number, lng: number) => {
    // Simple equirectangular projection centered on the current viewport.
    const dx = (lng - viewport.center.lng) * viewport.zoom * 20;
    const dy = (viewport.center.lat - lat) * viewport.zoom * 20;
    return { x: width / 2 + dx, y: height / 2 + dy };
  };

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full bg-[color:var(--surface-2)] rounded-md"
      >
        <rect width={width} height={height} fill="hsl(210 40% 12%)" />
        <text x={16} y={24} fill="hsl(200 30% 70%)" fontSize={11} fontFamily="ui-monospace">
          Mock map · replace with Google or Mapbox provider
        </text>
        {markers.map((m) => {
          const { x, y } = project(m.position.lat, m.position.lng);
          return (
            <g key={m.id} onClick={m.onClick} className={m.onClick ? "cursor-pointer" : ""}>
              <circle
                cx={x}
                cy={y}
                r={m.radius ?? 6}
                fill={m.color ?? "hsl(200 90% 60%)"}
                opacity={0.9}
              />
              {m.label ? (
                <text x={x + 10} y={y + 4} fill="hsl(200 30% 90%)" fontSize={11}>
                  {m.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {overlays}
      </svg>
    </div>
  );
};
