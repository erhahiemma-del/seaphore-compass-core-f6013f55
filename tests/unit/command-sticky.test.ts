/**
 * CommandInput sticky contract.
 *
 * The shadcn `CommandInput` wrapper must render with `sticky top-0` layering
 * and an opaque `bg-popover` background so the search box stays pinned when
 * its parent `Command` scrolls. There is no in-product consumer of the
 * primitive today, so we assert the contract at the source level — a
 * lightweight regression guard that runs in the standard vitest suite.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../../src/components/ui/command.tsx"), "utf8");

describe("CommandInput sticky styling", () => {
  it("wraps the input in a sticky, opaque, top-anchored container", () => {
    // The wrapper is the div immediately preceding <CommandPrimitive.Input>.
    // Assert every class the sticky contract depends on is present in-order-agnostic.
    expect(source).toMatch(/sticky\s+top-0/);
    expect(source).toMatch(/bg-popover/);
    expect(source).toMatch(/z-10/);
    // Border ensures visual separation from scrolling options.
    expect(source).toMatch(/border-b/);
  });

  it("exposes a debounce channel for downstream queries", () => {
    expect(source).toMatch(/onDebouncedValueChange/);
    expect(source).toMatch(/debounceMs/);
  });
});
