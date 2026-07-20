import { describe, expect, it, beforeEach } from "vitest";

import { useCopilotStore } from "@/stores/copilot.store";

beforeEach(() => {
  useCopilotStore.setState({ open: false, minimized: false, context: null });
});

describe("copilot.store", () => {
  it("opens and closes", () => {
    useCopilotStore.getState().openCopilot();
    expect(useCopilotStore.getState().open).toBe(true);
    useCopilotStore.getState().closeCopilot();
    expect(useCopilotStore.getState().open).toBe(false);
  });

  it("toggles", () => {
    const { toggleCopilot } = useCopilotStore.getState();
    toggleCopilot();
    expect(useCopilotStore.getState().open).toBe(true);
    toggleCopilot();
    expect(useCopilotStore.getState().open).toBe(false);
  });

  it("minimizes and restores while keeping context", () => {
    useCopilotStore.getState().openCopilot({ kind: "vessel", label: "MV Test" });
    useCopilotStore.getState().minimizeCopilot();
    const s1 = useCopilotStore.getState();
    expect(s1.open).toBe(false);
    expect(s1.minimized).toBe(true);
    expect(s1.context?.label).toBe("MV Test");
    useCopilotStore.getState().restoreCopilot();
    const s2 = useCopilotStore.getState();
    expect(s2.open).toBe(true);
    expect(s2.minimized).toBe(false);
  });

  it("openCopilot preserves existing context when called without arg", () => {
    useCopilotStore.getState().setContext({ kind: "port", label: "Apapa" });
    useCopilotStore.getState().openCopilot();
    expect(useCopilotStore.getState().context?.label).toBe("Apapa");
  });
});
