import type { ReactNode } from "react";

/**
 * MapToolbar — top-strip controls for map surfaces (Mission Control,
 * Ports, Vessel). Owns layout only; caller supplies controls.
 */
export function MapToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 text-[12px]">
      {children}
    </div>
  );
}
