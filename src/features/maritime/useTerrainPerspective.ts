/**
 * The 3D Terrain Perspective, as an officer capability.
 *
 * Owns exactly three facts: whether the officer asked for the terrain
 * view, whether a Cesium Ion credential exists to serve it, and the
 * renderer instance to hand `MapCanvas` when both are true. It owns no
 * vessels, no selection and no camera — those stay with the canonical
 * services, which is what lets the same picture be drawn by either
 * engine.
 *
 * The token is fetched per session from an authenticated server function
 * and kept in memory only. It is never written to storage, never placed
 * in a URL, and never bundled.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  getCesiumIonRuntimeToken,
  getCesiumIonStatus,
  type CesiumIonStatus,
} from "@/lib/cesium-ion.functions";
import { mapEventBus } from "@/services/geospatial/event-bus";
import type { MapRenderer } from "@/services/geospatial/renderer";

export interface TerrainPerspective {
  /** True when the Cesium adapter should be the mounted renderer. */
  readonly active: boolean;
  readonly loading: boolean;
  /** Credential state, or null before the first check. */
  readonly status: CesiumIonStatus | null;
  /** Why the terrain view cannot be shown, in officer language. */
  readonly unavailableReason: string | null;
  /** The adapter to inject, or undefined to leave MapLibre in place. */
  readonly renderer: MapRenderer | undefined;
  readonly requestActivation: boolean;
  toggle(): void;
  disable(): void;
  dismissActivation(): void;
  refresh(): void;
}

export function useTerrainPerspective(): TerrainPerspective {
  const readStatus = useServerFn(getCesiumIonStatus);
  const readToken = useServerFn(getCesiumIonRuntimeToken);

  const [status, setStatus] = useState<CesiumIonStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wanted, setWanted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [requestActivation, setRequestActivation] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Credential state is read once per session, and again after activation.
  useEffect(() => {
    let cancelled = false;
    void readStatus({ data: undefined })
      .then((next) => {
        if (!cancelled) setStatus(next as CesiumIonStatus);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(null);
          setUnavailableReason("Could not check the 3D credential from this session.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [readStatus, nonce]);

  const toggle = useCallback(() => {
    if (wanted) {
      setWanted(false);
      return;
    }
    setUnavailableReason(null);
    if (token) {
      setWanted(true);
      return;
    }
    setLoading(true);
    void readToken({ data: undefined })
      .then((result) => {
        const value = (result as { token: string | null; message: string | null }) ?? null;
        if (value?.token) {
          setToken(value.token);
          setWanted(true);
          return;
        }
        // No credential is a configuration state, not a data outage —
        // so the officer is offered activation rather than an empty globe.
        setUnavailableReason(value?.message ?? "No Cesium Ion token is configured.");
        setRequestActivation(true);
      })
      .catch(() => {
        setUnavailableReason("The 3D credential could not be retrieved for this session.");
      })
      .finally(() => setLoading(false));
  }, [readToken, token, wanted]);

  const disable = useCallback(() => setWanted(false), []);
  const dismissActivation = useCallback(() => setRequestActivation(false), []);

  /*
   * Constructed lazily, and only once per token.
   *
   * The Cesium module is dynamically imported inside the adapter, so
   * nothing about the 3D engine is evaluated — on the server or in the
   * browser — until an officer actually asks for the terrain view.
   */
  const [renderer, setRenderer] = useState<MapRenderer | undefined>(undefined);
  useEffect(() => {
    if (!wanted || !token) {
      setRenderer(undefined);
      return;
    }
    let cancelled = false;
    void import("@/services/geospatial/renderers/cesium-renderer").then(({ CesiumRenderer }) => {
      if (cancelled) return;
      setRenderer(new CesiumRenderer({ bus: mapEventBus, ionToken: token }));
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, token]);

  return {
    active: Boolean(wanted && renderer),
    loading,
    status,
    unavailableReason,
    renderer,
    requestActivation,
    toggle,
    disable,
    dismissActivation,
    refresh,
  };
}
