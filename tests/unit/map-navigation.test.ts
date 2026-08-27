/**
 * One way to move the map.
 *
 * Global View, the National selector, a port click, a coordinate and
 * eventually a spoken command are the same request: put the camera
 * somewhere and say what the officer is now looking at. Each growing its
 * own camera call is how a map ends up with five ways to fly and four of
 * them subtly wrong.
 *
 * These assert the camera that results, not the shape of a request
 * object — a navigation layer that updated state without moving the map
 * would be the filter defect all over again.
 */
import { describe, expect, it } from "vitest";

import {
  navigateTo,
  navigateToCoordinates,
  navigateToGlobal,
} from "@/services/geospatial/navigation";
import { allPlaces, findPlace, levelForZoom, trailTo } from "@/services/geospatial/places";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";
import { NIGERIAN_PORTS } from "@/services/geospatial/nigerian-ports";

const service = () => new SharedGeospatialService({ urlSync: false });

/* ═══════ 1. It actually moves the camera ═══════ */

describe("navigation moves the camera", () => {
  it("flies to the world", () => {
    const s = service();
    const result = navigateToGlobal("control", s);
    expect(result.ok).toBe(true);
    expect(result.level).toBe("GLOBAL");
    expect(s.get().center).toEqual(result.center);
    expect(s.get().zoom).toBe(result.zoom);
  });

  it("flies to a region, a country and a port through the same call", () => {
    for (const [id, level] of [
      ["west-africa", "REGIONAL"],
      ["nigeria", "COUNTRY"],
      ["rotterdam", "PORT"],
    ] as const) {
      const s = service();
      const result = navigateTo({ place: id, source: "control" }, s);
      expect(result.ok, id).toBe(true);
      expect(result.level, id).toBe(level);
      expect(s.get().center, id).toEqual(findPlace(id)!.center);
    }
  });

  it("reaches a coordinate through the same pipeline", () => {
    /*
     * Present now so the coordinate work cannot arrive later as a second
     * camera implementation.
     */
    const s = service();
    const result = navigateToCoordinates([3.342167, 6.428333], {}, s);
    expect(result.ok).toBe(true);
    expect(s.get().center).toEqual([3.342167, 6.428333]);
    expect(result.level).toBe("LOCAL");
  });

  it("honours an explicit zoom over the declared framing", () => {
    const s = service();
    navigateTo({ place: "nigeria", zoom: 9, source: "search" }, s);
    expect(s.get().zoom).toBe(9);
  });
});

/* ═══════ 2. Scope must not clamp a global flight ═══════ */

describe("scope widens to fit the destination", () => {
  it("lifts a regional scope when the target is outside its bounds", () => {
    /*
     * `maxBounds` is applied as the camera moves, so a flight to
     * Rotterdam issued under the regional scope would be clamped back
     * into the Gulf of Guinea and land nowhere near it.
     */
    const s = service();
    s.setScope("regional");
    navigateTo({ place: "rotterdam", source: "control" }, s);
    expect(s.get().scope).toBe("global");
    expect(s.get().center).toEqual(findPlace("rotterdam")!.center);
  });

  it("leaves a regional scope alone for a destination inside it", () => {
    const s = service();
    s.setScope("regional");
    navigateTo({ place: "nigeria", source: "control" }, s);
    expect(s.get().scope).toBe("regional");
  });

  it("never narrows the scope on its own", () => {
    // An officer who went to Rotterdam has said how they intend to work.
    const s = service();
    navigateTo({ place: "rotterdam", source: "control" }, s);
    navigateTo({ place: "nigeria", source: "control" }, s);
    expect(s.get().scope).toBe("global");
  });
});

/* ═══════ 3. Everything else survives the flight ═══════ */

describe("navigating preserves the officer's working state", () => {
  it("keeps selection, filters, layers and presentation mode", () => {
    const s = service();
    s.select({ kind: "port", id: "NGTIN", focus: [3.342167, 6.428333] });
    s.setFilters({ vesselType: "TANKER" });
    s.setPresentationMode("night-operations");
    const layers = [...s.get().activeLayers];

    navigateToGlobal("control", s);
    navigateTo({ place: "singapore", source: "control" }, s);

    expect(s.get().selection?.id).toBe("NGTIN");
    expect(s.get().filters.vesselType).toBe("TANKER");
    expect(s.get().presentationMode).toBe("night-operations");
    expect([...s.get().activeLayers]).toEqual(layers);
  });

  it("does not change the projection", () => {
    // Navigation is a camera decision. Changing how the map draws would
    // be a second, unasked-for decision riding along with it.
    const s = service();
    s.switchView("GLOBE");
    navigateTo({ place: "nigeria", source: "control" }, s);
    expect(s.get().viewMode).toBe("GLOBE");
  });
});

/* ═══════ 4. Refusals are answers, not exceptions ═══════ */

describe("an unresolvable request is answered, not thrown", () => {
  it("reports an unknown place and leaves the camera alone", () => {
    const s = service();
    const before = s.get().center;
    const result = navigateTo({ place: "atlantis", source: "voice" }, s);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no known place/i);
    expect(s.get().center).toEqual(before);
  });

  it("rejects a non-finite coordinate", () => {
    const s = service();
    const result = navigateTo({ coordinates: [Number.NaN, 5], source: "coordinates" }, s);
    expect(result.ok).toBe(false);
    expect(s.get().center).not.toEqual([Number.NaN, 5]);
  });

  it("rejects a request naming neither a place nor a point", () => {
    expect(navigateTo({ source: "control" }, service()).ok).toBe(false);
  });
});

/* ═══════ 5. The place model ═══════ */

describe("places are geography, not intelligence", () => {
  it("gives every place a distinct id and a finite framing", () => {
    const places = allPlaces();
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
    for (const place of places) {
      expect(Number.isFinite(place.center[0]), place.id).toBe(true);
      expect(Number.isFinite(place.center[1]), place.id).toBe(true);
      expect(place.zoom, place.id).toBeGreaterThan(0);
    }
  });

  it("takes Nigerian ports from the canonical registry rather than restating them", () => {
    // A second coordinate for Apapa is the drift the canonical registry
    // exists to prevent.
    const apapa = findPlace("ngapapa");
    expect(apapa?.center).toEqual(NIGERIAN_PORTS.NGAPAPA!.position);
    expect(apapa?.source).toBe("operator");
  });

  it("offers no navigation target for a port with no published position", () => {
    /*
     * Rivers Port has none. A target that flew an officer to an invented
     * coordinate would be the same fabrication as drawing it.
     */
    expect(findPlace("ngphc")).toBeNull();
  });

  it("marks international harbours as geographic references", () => {
    // They are somewhere to fly to. They carry no berths, calls or
    // activity, because Seaphore observes none.
    expect(findPlace("rotterdam")?.source).toBe("geographic");
  });

  it("resolves a place by name and by id, however it is spelled", () => {
    for (const query of ["gulf-of-guinea", "Gulf of Guinea", "GULF OF GUINEA"]) {
      expect(findPlace(query)?.id, query).toBe("gulf-of-guinea");
    }
  });
});

/* ═══════ 6. The spatial trail ═══════ */

describe("the trail is derived, not maintained", () => {
  it("walks from the world down to a Nigerian port", () => {
    const trail = trailTo(findPlace("ngtin")!).map((p) => p.name);
    expect(trail[0]).toBe("Global");
    expect(trail).toContain("Nigeria");
    expect(trail[trail.length - 1]).toContain("Tin Can");
  });

  it("walks a different continent without special-casing", () => {
    const trail = trailTo(findPlace("rotterdam")!).map((p) => p.id);
    expect(trail).toEqual(["world", "netherlands", "rotterdam"]);
  });

  it("terminates on every place", () => {
    // A cycle in the hierarchy would hang the walk.
    for (const place of allPlaces()) {
      expect(trailTo(place).length, place.id).toBeGreaterThan(0);
    }
  });

  it("reads a level from a hand-panned camera", () => {
    // So the trail follows an officer who dragged the map, not only one
    // who arrived through a control.
    expect(levelForZoom(1.6)).toBe("GLOBAL");
    expect(levelForZoom(6)).toBe("COUNTRY");
    expect(levelForZoom(11)).toBe("PORT");
    expect(levelForZoom(14)).toBe("LOCAL");
  });
});
