/**
 * Unit tests for the Mission Intelligence Command Bar dispatcher.
 *
 * Covers:
 *  - Pattern detection (IMO, container, BOL, voyage, fallback vessel)
 *  - Pinned chip precedence over auto-detection
 *  - Correct destination route + handoff search context per input
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

import {
  detectEntityType,
  useCommandDispatch,
  TYPE_ROUTE,
  type EntityType,
} from "@/lib/command-dispatch";

beforeEach(() => {
  navigateMock.mockReset();
});

describe("detectEntityType", () => {
  it("detects IMO numbers (7 digits)", () => {
    expect(detectEntityType("9074729")).toBe("imo");
    expect(detectEntityType("  1234567 ")).toBe("imo");
  });

  it("rejects non-7-digit numeric strings as IMO", () => {
    expect(detectEntityType("123456")).toBe("vessel");
    expect(detectEntityType("12345678")).toBe("vessel");
  });

  it("detects ISO 6346 container IDs (AAAA9999999)", () => {
    expect(detectEntityType("MSKU1234567")).toBe("container");
    expect(detectEntityType("msku1234567")).toBe("container");
  });

  it("detects Bill of Lading codes", () => {
    expect(detectEntityType("BOL-ABC1234")).toBe("bol");
    expect(detectEntityType("BL 9X8Y7Z")).toBe("bol");
    expect(detectEntityType("bolabcd")).toBe("bol");
  });

  it("detects voyage codes", () => {
    expect(detectEntityType("V-ABC123")).toBe("voyage");
    expect(detectEntityType("VY-1234")).toBe("voyage");
    expect(detectEntityType("VO 9AB")).toBe("voyage");
  });

  it("falls back to vessel for free-text queries", () => {
    expect(detectEntityType("Ocean Trader")).toBe("vessel");
    expect(detectEntityType("")).toBe("vessel");
  });
});

describe("TYPE_ROUTE mapping", () => {
  it("routes every entity type to a canonical Intelligence Centre", () => {
    const expected: Record<EntityType, string> = {
      imo: "/vessel",
      vessel: "/vessel",
      voyage: "/vessel",
      company: "/ownership",
      manifest: "/manifest",
      container: "/cargo",
      bol: "/cargo",
      port: "/ports",
    };
    expect(TYPE_ROUTE).toEqual(expected);
  });
});

describe("useCommandDispatch", () => {
  const dispatch = () => useCommandDispatch();

  it("routes an IMO query to /vessel with handoff context", () => {
    dispatch()({ query: "9074729" });
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/vessel",
      search: {
        fromStage: "Monitor",
        fromRoute: "/",
        type: "imo",
        q: "9074729",
      },
    });
  });

  it("routes a container query to /cargo", () => {
    dispatch()({ query: "MSKU1234567" });
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/cargo",
        search: expect.objectContaining({ type: "container", q: "MSKU1234567" }),
      }),
    );
  });

  it("routes a BOL query to /cargo", () => {
    dispatch()({ query: "BOL-ABC1234" });
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/cargo",
        search: expect.objectContaining({ type: "bol" }),
      }),
    );
  });

  it("routes a voyage query to /vessel", () => {
    dispatch()({ query: "VY-2026041" });
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/vessel",
        search: expect.objectContaining({ type: "voyage" }),
      }),
    );
  });

  it("honors a pinned chip over auto-detection", () => {
    // "9074729" looks like an IMO, but officer pinned the company chip.
    dispatch()({ query: "9074729", type: "company" });
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/ownership",
      search: {
        fromStage: "Monitor",
        fromRoute: "/",
        type: "company",
        q: "9074729",
      },
    });
  });

  it("supports chip-only navigation with no query", () => {
    dispatch()({ type: "port" });
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/ports",
      search: {
        fromStage: "Monitor",
        fromRoute: "/",
        type: "port",
      },
    });
  });

  it("defaults to /vessel when neither query nor chip is provided", () => {
    dispatch()({});
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/vessel",
      search: {
        fromStage: "Monitor",
        fromRoute: "/",
        type: "vessel",
      },
    });
  });

  it("trims whitespace from the query before dispatching", () => {
    dispatch()({ query: "   Ocean Trader   " });
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ q: "Ocean Trader", type: "vessel" }),
      }),
    );
  });

  it("always stamps fromStage=Monitor and fromRoute=/ for audit context", () => {
    dispatch()({ query: "MSKU1234567" });
    const call = navigateMock.mock.calls[0][0];
    expect(call.search.fromStage).toBe("Monitor");
    expect(call.search.fromRoute).toBe("/");
  });
});
