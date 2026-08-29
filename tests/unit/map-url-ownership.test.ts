/**
 * Which query parameters the map owns.
 *
 * The service writes its own keys and carries anything else through
 * untouched, so a share token or a return path in the URL survives a
 * camera move. Ownership used to be inferred from the keys it had just
 * emitted, which is wrong for every key it writes conditionally: a
 * bearing of zero is not serialised, so a stale `bearing=90` looked like
 * somebody else's parameter and was preserved for ever.
 *
 * The visible symptom was a chart that could not be straightened. An
 * officer resetting a 90° rotation saw the map turn north-up and the URL
 * keep `bearing=90.0`, so the next reload turned it straight back —
 * including through MapLibre's own compass control, which sets the
 * camera and has no idea the URL is lying about it.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

function serviceAt(bearing: number): SharedGeospatialService {
  const service = new SharedGeospatialService();
  service.setCamera({ bearing });
  return service;
}

describe("conditional parameters are still owned", () => {
  it("serialises a bearing that is turned", () => {
    expect(serviceAt(90).toSearchParams().get("bearing")).toBe("90.0");
  });

  /*
   * The omission is correct — a north-up map should not carry a bearing
   * in its URL. What was wrong was treating that omission as evidence
   * the service does not own the key.
   */
  it("omits a bearing that is north-up", () => {
    expect(serviceAt(0).toSearchParams().get("bearing")).toBeNull();
  });

  it("does not reintroduce a stale bearing when the map is straightened", () => {
    const service = serviceAt(90);
    expect(service.toSearchParams().get("bearing")).toBe("90.0");

    service.setCamera({ bearing: 0 });

    // The key must be gone, not carried forward as a foreign parameter.
    expect(service.toSearchParams().get("bearing")).toBeNull();
  });

  it("round-trips a turned chart and then clears it", () => {
    const service = new SharedGeospatialService();
    service.loadFromURL("?view=2D&lat=6.4&lon=3.4&zoom=9&bearing=90");
    expect(service.get().bearing).toBe(90);

    service.setCamera({ bearing: 0 });

    expect(service.get().bearing).toBe(0);
    expect(service.toSearchParams().has("bearing")).toBe(false);
  });

  /*
   * Every conditional key had the same defect latent in it, so the
   * property is asserted rather than just the one instance that bit.
   */
  it("clears every conditionally written key it owns", () => {
    const service = new SharedGeospatialService();
    service.setCamera({ bearing: 45, pitch: 30 });
    const turned = service.toSearchParams();
    expect(turned.has("bearing")).toBe(true);
    expect(turned.has("pitch")).toBe(true);

    service.setCamera({ bearing: 0, pitch: 0 });

    const level = service.toSearchParams();
    expect(level.has("bearing")).toBe(false);
    expect(level.has("pitch")).toBe(false);
  });
});

/*
 * The merge itself, which is where the defect actually lived.
 *
 * The tests above exercise `toSearchParams`, and it was never wrong —
 * it has always omitted a zero bearing. The bug was one step later, in
 * the merge that decides which existing parameters belong to somebody
 * else. Asserting the serialiser therefore proved nothing about it: a
 * mutation restoring the old inference passed the whole file. These
 * drive the real address bar.
 */
describe("the address bar after a straightening", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/maritime?view=2D&lat=6.4&lon=3.4&zoom=9");
  });

  it("removes a stale bearing instead of carrying it as a foreign key", () => {
    window.history.replaceState(
      null,
      "",
      "/maritime?view=2D&lat=6.4&lon=3.4&zoom=9&bearing=90.0&sharetoken=keepme",
    );
    const service = new SharedGeospatialService({ urlSync: true });
    service.loadFromURL(window.location.search);
    expect(service.get().bearing).toBe(90);

    service.setCamera({ bearing: 0 });

    const params = new URLSearchParams(window.location.search);
    // The whole point: the URL must stop saying the chart is turned.
    expect(params.get("bearing")).toBeNull();
    // And a parameter the map genuinely does not own is still carried.
    expect(params.get("sharetoken")).toBe("keepme");
  });

  it("keeps the officer's position while clearing the rotation", () => {
    window.history.replaceState(null, "", "/maritime?view=2D&lat=6.4&lon=3.4&zoom=9&bearing=90.0");
    const service = new SharedGeospatialService({ urlSync: true });
    service.loadFromURL(window.location.search);

    service.setCamera({ bearing: 0 });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("zoom")).toBe("9.0");
    expect(params.get("lat")).toBe("6.4000");
    expect(params.get("lon")).toBe("3.4000");
  });
});
