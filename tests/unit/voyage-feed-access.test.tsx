// @vitest-environment jsdom
/**
 * "We cannot read the register" is not "there are no voyages".
 *
 * The voyage register is a protected read: without a session the server
 * function rejects the call before it reaches the database. The hook has
 * always modelled that correctly — `unavailable` when there is no session,
 * `empty` only when a query succeeded and returned nothing.
 *
 * What was missing was a test, and the cost of that was real. Every browser
 * check of this application has run signed out, so the drawer said "Voyage
 * records could not be read", and that was repeatedly reported as though
 * the register were broken and manifests were architecturally unreachable.
 * The register was fine. The session was absent.
 *
 * So this pins the distinction that misled: an unauthenticated read must
 * never present as an empty register, and the reason must say which it is.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ session: null as unknown, loading: false }));
const listVoyages = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/services/repositories/voyage.repository", () => ({
  voyageRepository: { list: listVoyages },
}));

import { useVoyages } from "@/features/maritime/useVoyages";

afterEach(() => {
  auth.session = null;
  auth.loading = false;
  listVoyages.mockReset();
});

describe("reading the voyage register without a session", () => {
  it("reports the register as unavailable, never as empty", async () => {
    const { result } = renderHook(() => useVoyages());

    await waitFor(() => expect(result.current.status).not.toBe("loading"));

    expect(result.current.status).toBe("unavailable");
    // `empty` would say the register holds no voyages, which nobody checked.
    expect(result.current.status).not.toBe("empty");
    expect(result.current.voyages).toHaveLength(0);
  });

  it("says the session is what is missing", async () => {
    const { result } = renderHook(() => useVoyages());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    expect(result.current.error).toMatch(/no authenticated session/i);
  });

  /*
   * The read must not be attempted at all. Firing an unauthorised request
   * costs a rejection and teaches whoever reads the log that the register
   * is failing rather than that nobody is signed in.
   */
  it("does not call the repository at all", async () => {
    const { result } = renderHook(() => useVoyages());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    expect(listVoyages).not.toHaveBeenCalled();
  });
});

describe("reading it with a session", () => {
  /*
   * The other half of the distinction. A successful query that returns
   * nothing is a genuine statement about the register, and it must not be
   * confused with having been unable to ask.
   */
  it("reports an empty register as empty when the query succeeded", async () => {
    auth.session = { user: { id: "officer" } };
    listVoyages.mockResolvedValue({ rows: [] });

    const { result } = renderHook(() => useVoyages());

    await waitFor(() => expect(result.current.status).not.toBe("loading"));

    expect(result.current.status).toBe("empty");
    expect(result.current.error).toBeNull();
    expect(listVoyages).toHaveBeenCalled();
  });

  /*
   * And the register is readable when there is a session — the fact this
   * whole file exists to establish. Manifests hang off voyages, so a
   * signed-in officer is not blocked from them by this hook.
   */
  it("returns voyages when the register holds them", async () => {
    auth.session = { user: { id: "officer" } };
    listVoyages.mockResolvedValue({
      rows: [{ id: "voyage-1", voyage_number: "VY-001", status: "planned" }],
    });

    const { result } = renderHook(() => useVoyages());

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.voyages.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
  });

  it("reports a failed read as unavailable rather than empty", async () => {
    auth.session = { user: { id: "officer" } };
    listVoyages.mockRejectedValue(new Error("row level security"));

    const { result } = renderHook(() => useVoyages());

    await waitFor(() => expect(result.current.status).not.toBe("loading"));

    expect(result.current.status).toBe("unavailable");
    expect(result.current.voyages).toHaveLength(0);
  });
});
