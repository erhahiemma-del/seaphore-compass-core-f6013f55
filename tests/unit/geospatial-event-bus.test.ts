import { describe, expect, it, vi } from "vitest";

import { MapEventBus } from "@/services/geospatial";

describe("MapEventBus", () => {
  it("delivers a payload to a subscriber", () => {
    const bus = new MapEventBus();
    const handler = vi.fn();
    bus.on("vessel:click", handler);

    bus.emit("vessel:click", { imo: "9411765", position: [3.4, 6.4] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ imo: "9411765", position: [3.4, 6.4] });
  });

  it("delivers to every subscriber in registration order", () => {
    const bus = new MapEventBus();
    const order: string[] = [];
    bus.on("map:click", () => order.push("first"));
    bus.on("map:click", () => order.push("second"));
    bus.on("map:click", () => order.push("third"));

    bus.emit("map:click", { position: [0, 0] });

    expect(order).toEqual(["first", "second", "third"]);
  });

  it("does not deliver events to subscribers of a different event", () => {
    const bus = new MapEventBus();
    const handler = vi.fn();
    bus.on("map:click", handler);

    bus.emit("vessel:click", { imo: "9411765", position: [0, 0] });

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops delivery after unsubscribe", () => {
    const bus = new MapEventBus();
    const handler = vi.fn();
    const off = bus.on("map:ready", handler);

    off();
    bus.emit("map:ready", { renderer: "stub" });

    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount("map:ready")).toBe(0);
  });

  it("tolerates unsubscribing more than once", () => {
    const bus = new MapEventBus();
    const off = bus.on("map:ready", vi.fn());

    off();
    expect(() => off()).not.toThrow();
    expect(bus.listenerCount()).toBe(0);
  });

  it("once() delivers exactly one event then detaches", () => {
    const bus = new MapEventBus();
    const handler = vi.fn();
    bus.once("map:ready", handler);

    bus.emit("map:ready", { renderer: "stub" });
    bus.emit("map:ready", { renderer: "stub" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("map:ready")).toBe(0);
  });

  it("isolates a throwing subscriber so later subscribers still receive the event", () => {
    const reportError = vi.fn();
    const bus = new MapEventBus(reportError);
    const after = vi.fn();

    bus.on("map:click", () => {
      throw new Error("subscriber exploded");
    });
    bus.on("map:click", after);

    expect(() => bus.emit("map:click", { position: [0, 0] })).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toBe("map:click");
  });

  it("reports subscriber failures on the error channel by default", () => {
    const bus = new MapEventBus();
    const onError = vi.fn();
    bus.on("map:error", onError);
    bus.on("map:click", () => {
      throw new Error("boom");
    });

    bus.emit("map:click", { position: [0, 0] });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({
      scope: "event-bus:map:click",
      message: "boom",
    });
  });

  it("does not recurse when an error subscriber itself throws", () => {
    const bus = new MapEventBus();
    bus.on("map:error", () => {
      throw new Error("error handler exploded");
    });

    expect(() => bus.emit("map:error", { scope: "test", message: "initial" })).not.toThrow();
  });

  it("snapshots subscribers so unsubscribing mid-dispatch does not skip anyone", () => {
    const bus = new MapEventBus();
    const second = vi.fn();
    const off2 = bus.on("map:click", () => off2());
    bus.on("map:click", second);

    bus.emit("map:click", { position: [0, 0] });

    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not deliver to a subscriber added during dispatch", () => {
    const bus = new MapEventBus();
    const late = vi.fn();
    bus.on("map:click", () => {
      bus.on("map:click", late);
    });

    bus.emit("map:click", { position: [0, 0] });

    expect(late).not.toHaveBeenCalled();
  });

  it("emitting with no subscribers is a no-op", () => {
    const bus = new MapEventBus();
    expect(() => bus.emit("map:ready", { renderer: "stub" })).not.toThrow();
  });

  it("off() clears one event, or all events when called bare", () => {
    const bus = new MapEventBus();
    bus.on("map:click", vi.fn());
    bus.on("map:ready", vi.fn());

    bus.off("map:click");
    expect(bus.listenerCount("map:click")).toBe(0);
    expect(bus.listenerCount("map:ready")).toBe(1);

    bus.off();
    expect(bus.listenerCount()).toBe(0);
  });

  it("counts listeners per event and in total", () => {
    const bus = new MapEventBus();
    bus.on("map:click", vi.fn());
    bus.on("map:click", vi.fn());
    bus.on("map:ready", vi.fn());

    expect(bus.listenerCount("map:click")).toBe(2);
    expect(bus.listenerCount("map:ready")).toBe(1);
    expect(bus.listenerCount()).toBe(3);
  });
});
