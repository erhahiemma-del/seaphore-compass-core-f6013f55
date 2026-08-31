// @vitest-environment jsdom
/**
 * The three states of the 3D credential.
 *
 * Signed out, the capability must stay dormant — no credential request at
 * all, MapLibre left in place, and a configuration state the officer can
 * read. Authenticated with a valid token, Cesium becomes the injected
 * renderer. With an invalid or revoked token, or a renderer that reports
 * an error, MapLibre must come back rather than a blank canvas.
 *
 * And in every one of those states, the token exists only in memory: never
 * in storage, never in a URL.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = {
  status: 0,
  token: 0,
  preference: 0,
  writes: [] as boolean[],
};

let authenticated = true;
let tokenResult: { token: string | null; message: string | null } = {
  token: "ion-secret-token",
  message: null,
};

vi.mock("@/lib/cesium-ion.functions", () => ({
  getCesiumIonStatus: "getCesiumIonStatus",
  getCesiumIonRuntimeToken: "getCesiumIonRuntimeToken",
}));

vi.mock("@/lib/officer-map-preferences.functions", () => ({
  getOfficerMapPreferences: "getOfficerMapPreferences",
  setOfficerTerrainPreference: "setOfficerTerrainPreference",
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => {
    const id = String(fn);
    return async (payload: { data: unknown }) => {
      if (id === "getCesiumIonStatus") {
        calls.status += 1;
        return { configured: tokenResult.token !== null, message: null };
      }
      if (id === "getCesiumIonRuntimeToken") {
        calls.token += 1;
        return tokenResult;
      }
      if (id === "getOfficerMapPreferences") {
        calls.preference += 1;
        return { terrain3d: false };
      }
      calls.writes.push((payload.data as { terrain3d: boolean }).terrain3d);
      return { ok: true };
    };
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useProtectedQueriesEnabled: () => authenticated,
}));

/*
 * The adapter is mocked at the dynamic-import boundary: this suite is about
 * the credential gate and the fallback, not about WebGL.
 */
const rendererConstructions: Array<{ ionToken: string }> = [];
vi.mock("@/services/geospatial/renderers/cesium-renderer", () => ({
  CesiumRenderer: class {
    readonly id = "cesium";
    constructor(options: { ionToken: string }) {
      rendererConstructions.push({ ionToken: options.ionToken });
    }
  },
}));

const { useTerrainPerspective } = await import("@/features/maritime/useTerrainPerspective");
const { useMapSessionStore } = await import("@/services/geospatial/store");

beforeEach(() => {
  calls.status = 0;
  calls.token = 0;
  calls.preference = 0;
  calls.writes = [];
  rendererConstructions.length = 0;
  authenticated = true;
  tokenResult = { token: "ion-secret-token", message: null };
  localStorage.clear();
  sessionStorage.clear();
  useMapSessionStore.setState({ rendererId: "maplibre", rendererStatus: "ready", lastError: null });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("logged out", () => {
  beforeEach(() => {
    authenticated = false;
  });

  it("never requests the credential", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    expect(calls.token).toBe(0);
    expect(calls.status).toBe(0);
    expect(calls.preference).toBe(0);
  });

  it("leaves MapLibre in place by injecting no renderer", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.renderer).toBeUndefined();
    expect(result.current.active).toBe(false);
  });

  it("states a configuration reason rather than failing silently", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.unavailableReason).toContain("Sign in as an officer");
    expect(result.current.unavailableReason).toContain("2D operational map is still live");
  });

  it("does not persist a lens preference for an absent officer", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    expect(calls.writes).toEqual([]);
  });
});

describe("authenticated with a valid token", () => {
  it("mounts Cesium as the injected renderer", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.renderer).toBeDefined());
    expect(result.current.active).toBe(true);
    expect(calls.token).toBe(1);
  });

  it("hands the credential only to the adapter", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(rendererConstructions).toHaveLength(1));
    expect(rendererConstructions[0]?.ionToken).toBe("ion-secret-token");
  });

  it("remembers the lens choice, never the credential", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(calls.writes).toEqual([true]));
    expect(JSON.stringify(localStorage)).not.toContain("ion-secret-token");
    expect(JSON.stringify(sessionStorage)).not.toContain("ion-secret-token");
  });
});

describe("invalid or revoked token", () => {
  it("falls back with a stated reason and no renderer", async () => {
    tokenResult = { token: null, message: "The stored 3D credential was rejected." };
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() =>
      expect(result.current.unavailableReason).toBe("The stored 3D credential was rejected."),
    );
    expect(result.current.renderer).toBeUndefined();
    expect(result.current.active).toBe(false);
  });

  it("offers activation instead of a blank globe", async () => {
    tokenResult = { token: null, message: null };
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.requestActivation).toBe(true));
  });
});

describe("renderer recovery", () => {
  it("restores MapLibre when the mounted adapter reports an error", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.renderer).toBeDefined());

    await act(async () => {
      useMapSessionStore.setState({
        rendererId: "cesium",
        rendererStatus: "error",
        lastError: "Terrain provider unreachable.",
      });
    });

    await waitFor(() => expect(result.current.active).toBe(false));
    expect(result.current.renderer).toBeUndefined();
    expect(result.current.unavailableReason).toContain("2D operational map has been restored");
    expect(result.current.unavailableReason).toContain("Terrain provider unreachable.");
  });

  it("does not leak the credential into the failure message", async () => {
    const { result } = renderHook(() => useTerrainPerspective());
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.renderer).toBeDefined());
    await act(async () => {
      useMapSessionStore.setState({
        rendererId: "cesium",
        rendererStatus: "error",
        lastError: "Terrain provider unreachable.",
      });
    });
    await waitFor(() => expect(result.current.unavailableReason).not.toBeNull());
    expect(result.current.unavailableReason).not.toContain("ion-secret-token");
  });
});
