/**
 * What a vessel picture is allowed to claim.
 *
 * A photograph reads as evidence. A picture of *some* tanker above the
 * name of *this* tanker reads as a picture of this one, which makes the
 * image the most persuasive way this application could mislead an
 * officer. The resolver exists so the ordering from "photograph of this
 * hull" down to "figure depicting nothing" lives in one place, and these
 * tests hold the claims each step is permitted to make.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  IMAGE_KIND_BADGE,
  depictsThisVessel,
  isSafeImageUrl,
  resolveVesselImage,
} from "@/services/geospatial/vessel-imagery";
import type { VesselIdentity } from "@/services/geospatial/vessel";

const HEADER = readFileSync(
  resolve(process.cwd(), "src/features/maritime/VesselImageHeader.tsx"),
  "utf8",
);

function identity(over: Partial<VesselIdentity> = {}): VesselIdentity {
  return { imo: "SIM-0015", name: "Opobo Pioneer", type: "TANKER", ...over };
}

describe("resolution steps down, and says so", () => {
  it("calls a dated capture a photograph of this vessel", () => {
    const image = resolveVesselImage(identity(), {
      imageUrl: "https://example.org/a.jpg",
      imageCapturedAt: "2026-01-02T00:00:00Z",
    });
    expect(image.kind).toBe("OBSERVED");
    expect(depictsThisVessel(image.kind)).toBe(true);
  });

  it("will not call an undated provider image live", () => {
    /*
     * Without a capture date the picture may be years old or may be the
     * sister ship. It is still *for* this vessel, so it is not demoted
     * to a class reference — but it does not get to claim to be live.
     */
    const image = resolveVesselImage(identity(), { photoUrl: "https://example.org/a.jpg" });
    expect(image.kind).toBe("PROVIDER");
    expect(IMAGE_KIND_BADGE[image.kind]).not.toMatch(/live/i);
  });

  it("falls to a class reference when no picture exists", () => {
    const image = resolveVesselImage(identity());
    expect(image.kind).toBe("DEFAULT_TYPE");
    expect(image.category).toBe("TANKER");
    expect(depictsThisVessel(image.kind)).toBe(false);
  });

  it("falls to a generic figure when the class is unknown too", () => {
    const image = resolveVesselImage(identity({ type: undefined }));
    expect(image.kind).toBe("GENERIC_FALLBACK");
    expect(image.category).toBe("UNKNOWN");
  });

  it("retires a URL that already failed this session", () => {
    // A link that 404s will 404 again; retrying makes the panel flicker
    // through a broken state every time the officer returns.
    const failed = new Set(["https://example.org/gone.jpg"]);
    const image = resolveVesselImage(
      identity(),
      { imageUrl: "https://example.org/gone.jpg" },
      failed,
    );
    expect(image.kind).toBe("DEFAULT_TYPE");
  });

  it("reads every provider spelling of the same field", () => {
    // So no UI component ever learns a provider's field names.
    for (const field of ["image", "imageUrl", "photo", "photoUrl", "vesselImage", "thumbnail"]) {
      const image = resolveVesselImage(identity(), { [field]: "https://example.org/a.jpg" });
      expect(image.kind, field).toBe("PROVIDER");
    }
  });
});

describe("a fallback is never dressed as a photograph", () => {
  it("gives no fallback a badge claiming live or observed", () => {
    for (const kind of ["DEFAULT_TYPE", "GENERIC_FALLBACK"] as const) {
      const badge = IMAGE_KIND_BADGE[kind].toLowerCase();
      expect(badge, kind).not.toContain("live");
      expect(badge, kind).not.toContain("observed");
      expect(badge, kind).not.toContain("real-time");
    }
  });

  it("tells a screen reader the same thing the badge tells everyone else", () => {
    /*
     * Alt text is where this is most easily forgotten, and a screen
     * reader user has no badge to fall back on.
     */
    const reference = resolveVesselImage(identity());
    expect(reference.alt).toContain("Representative");
    expect(reference.alt).toContain("Not a photograph of Opobo Pioneer");

    const real = resolveVesselImage(identity(), {
      imageUrl: "https://example.org/a.jpg",
      imageCapturedAt: "2026-01-02T00:00:00Z",
    });
    expect(real.alt).toBe("Opobo Pioneer, tanker");
  });

  it("never leaves alt text empty or generic", () => {
    for (const type of ["TANKER", "CONTAINER", undefined] as const) {
      const image = resolveVesselImage(identity({ type }));
      expect(image.alt.trim().length).toBeGreaterThan(10);
      expect(["image", "vessel", "placeholder"]).not.toContain(image.alt.toLowerCase());
    }
  });
});

describe("a provider URL is untrusted input", () => {
  it("accepts only https and inline images", () => {
    expect(isSafeImageUrl("https://example.org/a.jpg")).toBe(true);
    expect(isSafeImageUrl("data:image/png;base64,AAA")).toBe(true);
  });

  it("refuses a script URL in an image position", () => {
    /*
     * `javascript:` in an image slot is a script execution primitive
     * rather than a broken picture.
     */
    for (const hostile of [
      "javascript:alert(1)",
      "  javascript:alert(1)",
      "file:///etc/passwd",
      "",
    ]) {
      expect(isSafeImageUrl(hostile), hostile).toBe(false);
    }
    const image = resolveVesselImage(identity(), { imageUrl: "javascript:alert(1)" });
    expect(image.kind).toBe("DEFAULT_TYPE");
    expect(image.url).toBeUndefined();
  });
});

describe("the header behaves under load and under races", () => {
  it("checks a completed load against the vessel still selected", () => {
    /*
     * An officer clicking A then B faster than the network answers would
     * otherwise see A's photograph land under B's name.
     */
    const code = HEADER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("currentImo.current !== identity.imo");
  });

  it("reserves the picture area before anything loads", () => {
    // So the identity fields below never jump when an image arrives.
    expect(HEADER).toContain("aspect-[16/9]");
    expect(HEADER).toContain("vessel-image-skeleton");
  });

  it("draws the class references rather than fetching them", () => {
    /*
     * A stock photograph of a real tanker used as a stand-in is a picture
     * of a specific, identifiable ship shown under another vessel's name.
     * A drawn silhouette depicts no particular hull.
     */
    expect(HEADER).toContain("<svg");
    expect(HEADER).not.toContain("base64,");
  });

  it("opens the larger view without leaving the map", () => {
    // Navigating away to see a picture would cost the selection and
    // remount the canvas.
    const code = HEADER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("vessel-image-expanded");
    for (const forbidden of ["navigate(", "useNavigate", "createFileRoute"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("closes on Escape", () => {
    expect(HEADER).toContain('event.key === "Escape"');
  });
});
