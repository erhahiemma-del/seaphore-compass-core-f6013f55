import { describe, expect, it } from "vitest";
import { appendContinuation, continuationsFor } from "@/lib/copilot/continuations";

describe("continuationsFor", () => {
  it("offers the standard follow-ups for a vessel query", () => {
    expect(continuationsFor("Investigate Ocean Pearl")).toEqual([
      "ownership",
      "sanctions",
      "previous inspections",
      "last known position",
    ]);
  });

  it("stays silent on very short text", () => {
    expect(continuationsFor("MV")).toEqual([]);
  });

  it("waits while the officer is mid-phrase", () => {
    expect(continuationsFor("Investigate the")).toEqual([]);
  });

  it("never repeats something the officer already asked for", () => {
    expect(continuationsFor("Ocean Pearl ownership")).not.toContain("ownership");
  });

  it("adds intent-specific follow-ups", () => {
    expect(continuationsFor("Blue Harbour Ltd shipping company", 8)).toContain("beneficial owners");
  });
});

describe("appendContinuation", () => {
  it("keeps the officer's wording and appends the fragment", () => {
    expect(appendContinuation("Investigate Ocean Pearl", "ownership")).toBe(
      "Investigate Ocean Pearl — check ownership",
    );
  });

  it("flows naturally after a connector", () => {
    expect(appendContinuation("Ocean Pearl ownership and", "sanctions")).toBe(
      "Ocean Pearl ownership and sanctions",
    );
  });
});
