/**
 * Opening a port through the canonical dispatcher.
 *
 * Search used to dispatch only `NAVIGATE_PLACE` for a port result, which
 * moves the camera and selects nothing — so searching "Apapa" centred on
 * the port while the drawer went on describing the previously selected
 * vessel. Measured in the browser: camera at Apapa, drawer still showing
 * RIVER THAMES.
 *
 * The fix had to go through the same dispatcher the map uses rather than
 * calling `select` from the search box, or search becomes a second way of
 * choosing an entity and the two drift.
 */
import { describe, expect, it, vi } from "vitest";

import { executeCopilotAction } from "@/services/copilot/copilot-actions";

function serviceSpy() {
  return {
    select: vi.fn(),
    clearSelection: vi.fn(),
    update: vi.fn(),
    setCamera: vi.fn(),
    get: vi.fn(() => ({})),
  } as unknown as Parameters<typeof executeCopilotAction>[1]["service"] & {
    select: ReturnType<typeof vi.fn>;
  };
}

describe("SELECT_PORT", () => {
  it("selects a port held in the register", () => {
    const service = serviceSpy();

    const result = executeCopilotAction({ type: "SELECT_PORT", unlocode: "NGLOS" }, { service });

    expect(result.ok).toBe(true);
    expect(service.select).toHaveBeenCalledTimes(1);
    const selection = service.select.mock.calls[0]![0] as { kind: string; id: string };
    expect(selection.kind).toBe("port");
  });

  /*
   * Kamsar is a real port with a valid UNLOCODE, outside this register.
   * Announcing success and opening an empty panel would be worse than
   * saying plainly that Seaphore holds no record for it.
   */
  it("refuses a valid port outside the register, and says why", () => {
    const service = serviceSpy();

    const result = executeCopilotAction({ type: "SELECT_PORT", unlocode: "GNKMR" }, { service });

    expect(result.ok).toBe(false);
    expect(service.select).not.toHaveBeenCalled();
    expect(result.reason).toMatch(/may be a real port/i);
    expect(result.reason).toMatch(/no record/i);
  });

  it("refuses an identifier that is not a port at all", () => {
    const service = serviceSpy();

    const result = executeCopilotAction({ type: "SELECT_PORT", unlocode: "ZZZZZ" }, { service });

    expect(result.ok).toBe(false);
    expect(service.select).not.toHaveBeenCalled();
  });

  /*
   * Opening a port is navigation, not a write. Gating it behind a
   * confirmation would make the gate meaningless by using it for
   * something reversible by looking elsewhere.
   */
  it("needs no confirmation", () => {
    const service = serviceSpy();
    const result = executeCopilotAction({ type: "SELECT_PORT", unlocode: "NGLOS" }, { service });

    expect(result.ok).toBe(true);
  });
});
