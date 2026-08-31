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
 * in a URL, and never bundled. What *is* persisted is the officer's lens
 * choice — a single boolean on their own row — so the perspective follows
 * them across sessions and devices without the credential doing the same.
 *
 * Failure is never allowed to become a blank map. A Cesium mount or
 * runtime error is reported by the renderer through the map session
 * store, and this hook reads it and drops back to MapLibre with the
 * reason stated rather than leaving a dead canvas on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  getCesiumIonRuntimeToken,
  getCesiumIonStatus,
  type CesiumIonStatus,
} from "@/lib/cesium-ion.functions";
import {
  getOfficerMapPreferences,
  setOfficerTerrainPreference,
} from "@/lib/officer-map-preferences.functions";
import { useProtectedQueriesEnabled } from "@/hooks/use-auth";
import { mapEventBus } from "@/services/geospatial/event-bus";
import type { MapRenderer } from "@/services/geospatial/renderer";
import { useMapSessionStore } from "@/services/geospatial/store";

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
  const readPreference = useServerFn(getOfficerMapPreferences);
  const writePreference = useServerFn(setOfficerTerrainPreference);

  const [status, setStatus] = useState<CesiumIonStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wanted, setWanted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [requestActivation, setRequestActivation] = useState(false);
  const [nonce, setNonce] = useState(0);

  /*
   * The credential and the officer's own preference are both protected
   * reads. Asking for them before a session exists produces an
   * Unauthorized throw for a question nobody asked — so the terrain
   * capability simply stays dormant until the officer is authenticated.
   */
  const authenticated = useProtectedQueriesEnabled();

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Credential state is read once per session, and again after activation.
  useEffect(() => {
    if (!authenticated) return;
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
  }, [authenticated, readStatus, nonce]);

  /** Persist the lens choice. Never the credential. */
  const remember = useCallback(
    (next: boolean) => {
      void writePreference({ data: { terrain3d: next } }).catch(() => {
        // A preference that will not store is a lost convenience, not a
        // failed capability — the officer keeps the view they asked for.
      });
    },
    [writePreference],
  );

  const activate = useCallback(
    (options: { readonly persist: boolean; readonly offerActivation: boolean }) => {
      setUnavailableReason(null);
      if (token) {
        setWanted(true);
        if (options.persist) remember(true);
        return;
      }
      setLoading(true);
      void readToken({ data: undefined })
        .then((result) => {
          const value = (result as { token: string | null; message: string | null }) ?? null;
          if (value?.token) {
            setToken(value.token);
            setWanted(true);
            if (options.persist) remember(true);
            return;
          }
          // No credential is a configuration state, not a data outage —
          // so the officer is offered activation rather than an empty globe.
          setUnavailableReason(value?.message ?? "No Cesium Ion token is configured.");
          if (options.offerActivation) setRequestActivation(true);
        })
        .catch(() => {
          setUnavailableReason("The 3D credential could not be retrieved for this session.");
        })
        .finally(() => setLoading(false));
    },
    [readToken, remember, token],
  );

  const toggle = useCallback(() => {
    if (wanted) {
      setWanted(false);
      remember(false);
      return;
    }
    activate({ persist: true, offerActivation: true });
  }, [activate, remember, wanted]);

  const disable = useCallback(() => setWanted(false), []);
  const dismissActivation = useCallback(() => setRequestActivation(false), []);

  /*
   * Restore the officer's own lens, once per session.
   *
   * Restoration is silent about missing credentials: an officer returning
   * to a deployment whose token was revoked should get the operational
   * map, not a modal they did not ask for.
   */
  const restored = useRef(false);
  useEffect(() => {
    if (!authenticated || restored.current) return;
    restored.current = true;
    void readPreference({ data: undefined })
      .then((result) => {
        if ((result as { terrain3d?: boolean } | null)?.terrain3d) {
          activate({ persist: false, offerActivation: false });
        }
      })
      .catch(() => {
        // No stored preference reachable: the 2D operational map stands.
      });
  }, [activate, authenticated, readPreference]);

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
    void import("@/services/geospatial/renderers/cesium-renderer")
      .then(({ CesiumRenderer }) => {
        if (cancelled) return;
        setRenderer(new CesiumRenderer({ bus: mapEventBus, ionToken: token }));
      })
      .catch(() => {
        if (cancelled) return;
        // The engine itself could not be loaded. MapLibre stays mounted.
        setWanted(false);
        setUnavailableReason(
          "The 3D engine could not be loaded in this browser. The 2D operational map is still live.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, token]);

  /*
   * Fallback, read from the renderer's own session state.
   *
   * `MapCanvas` records the mounted adapter and its status; a Cesium
   * mount that throws, or a runtime error the adapter reports, lands here
   * as `error`. Dropping `wanted` unmounts the adapter and returns the
   * MapLibre default, so the officer never faces a blank canvas.
   */
  const rendererId = useMapSessionStore((s) => s.rendererId);
  const rendererStatus = useMapSessionStore((s) => s.rendererStatus);
  const lastError = useMapSessionStore((s) => s.lastError);
  useEffect(() => {
    if (!wanted || rendererId !== "cesium" || rendererStatus !== "error") return;
    setWanted(false);
    setUnavailableReason(
      `The 3D view failed and the 2D operational map has been restored${
        lastError ? `: ${lastError}` : "."
      }`,
    );
  }, [lastError, rendererId, rendererStatus, wanted]);

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
