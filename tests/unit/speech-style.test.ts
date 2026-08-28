/**
 * How Seaphore sounds, held to the same standard as what it says.
 *
 * Two failures these guard. The first is the one that produced a male
 * voice: selection had no gender criterion at all, so `find` returned
 * whichever name came first in the platform's array — George, on this
 * machine, ahead of Hazel and Susan. The second is quieter: a screen
 * string read aloud verbatim, degree signs and acronyms and all.
 */
import { describe, expect, it } from "vitest";

import {
  CALM_DELIVERY,
  deliveryFor,
  speakable,
  spokenCoordinates,
  spokenHeading,
  spokenIdentifier,
} from "@/services/voice/speech-style";
import { isLikelyFemale, selectVoice } from "@/services/voice/voice-output";

const voice = (name: string, lang: string) => ({ name, lang });

describe("a female voice is preferred, within its locale", () => {
  it("takes the female voice rather than the first in the list", () => {
    /*
     * The exact arrangement on this machine, and the exact bug: George
     * sits ahead of Hazel and Susan, and array order was the only thing
     * deciding.
     */
    const chosen = selectVoice([
      voice("Microsoft George - English (United Kingdom)", "en-GB"),
      voice("Microsoft Hazel - English (United Kingdom)", "en-GB"),
      voice("Microsoft Susan - English (United Kingdom)", "en-GB"),
    ]);
    expect(chosen?.name).toContain("Hazel");
  });

  it("never lets gender outrank the accent ladder", () => {
    /*
     * A female American voice must not beat a West African one. The
     * accent an officer hears is the judgement the ladder encodes, and
     * chasing a voice across locales would quietly undo it.
     */
    const chosen = selectVoice([
      voice("Microsoft Zira - English (United States)", "en-US"),
      voice("Kwame - English (Ghana)", "en-GH"),
    ]);
    expect(chosen?.lang).toBe("en-GH");
  });

  it("still prefers a genuine Nigerian voice over any other", () => {
    const chosen = selectVoice([
      voice("Microsoft Hazel - English (United Kingdom)", "en-GB"),
      voice("Ezinne", "en-NG"),
    ]);
    expect(chosen?.lang).toBe("en-NG");
    expect(chosen?.quality).toBe("EXACT_LOCALE");
  });

  it("falls back to a male voice rather than going silent", () => {
    // Better a voice of the wrong kind than no answer at all.
    const chosen = selectVoice([voice("Microsoft David - English (United States)", "en-US")]);
    expect(chosen?.name).toContain("David");
  });

  it("treats an unrecognised name as unknown, not as female", () => {
    // The API exposes no gender field; this is a name heuristic and must
    // not pretend to more certainty than that.
    expect(isLikelyFemale("Microsoft George")).toBe(false);
    expect(isLikelyFemale("Voice 7")).toBe(false);
    expect(isLikelyFemale("Microsoft Hazel")).toBe(true);
  });
});

describe("delivery is chosen, not inherited", () => {
  it("speaks slightly below the browser default", () => {
    /*
     * Rate 1.0 with no shaping is the flat, clipped cadence people call
     * robotic. Leaving it unset is not neutral — it is a choice.
     */
    expect(CALM_DELIVERY.rate).toBeLessThan(1);
    expect(CALM_DELIVERY.rate).toBeGreaterThan(0.85);
  });

  it("keeps pitch level rather than brightening it", () => {
    // Raising pitch to sound "warmer" produces the phone-menu register.
    expect(CALM_DELIVERY.pitch).toBe(1);
  });

  it("changes delivery for an alert without performing urgency", () => {
    const alert = deliveryFor("ALERT");
    expect(alert.rate).toBeGreaterThan(CALM_DELIVERY.rate);
    // A small change. An audibly agitated assistant adds pressure.
    expect(alert.rate - CALM_DELIVERY.rate).toBeLessThan(0.2);
    expect(alert.pitch).toBeLessThan(1.1);
  });
});

describe("it says things the way a person would", () => {
  it("reads a bearing as digits, keeping the leading zero", () => {
    // Mariners say "zero four nine", not "forty-nine".
    expect(spokenHeading(49)).toBe("zero four nine");
    expect(spokenHeading(360)).toBe("zero zero zero");
  });

  it("groups an identifier so it can be written down", () => {
    expect(spokenIdentifier("9312473")).toBe("nine three one, two four seven, three");
  });

  it("leaves a non-numeric identifier alone", () => {
    // SIM-0015 is not a number an officer transcribes digit by digit.
    expect(spokenIdentifier("SIM-0015")).toBe("SIM-0015");
  });

  it("says a position in degrees and minutes", () => {
    expect(spokenCoordinates(6.4272, 3.2578)).toBe(
      "6 degrees 26 minutes north, 3 degrees 15 minutes east",
    );
  });

  it("says southern and western hemispheres correctly", () => {
    expect(spokenCoordinates(-6.5, -3.5)).toContain("south");
    expect(spokenCoordinates(-6.5, -3.5)).toContain("west");
  });
});

describe("nothing typographic reaches the synthesiser", () => {
  it("never reads a degree sign aloud", () => {
    expect(speakable("6.4272° N")).not.toContain("°");
    expect(speakable("6.4272° N")).toContain("degrees");
  });

  it("spells the acronyms an officer spells", () => {
    expect(speakable("IMO 9312473")).toContain("I M O");
    expect(speakable("MMSI 538006644")).toContain("M M S I");
  });

  it("leaves NIMASA as a word", () => {
    // It is pronounced, not spelled. Splitting it would be wrong.
    expect(speakable("NIMASA officer")).toContain("NIMASA");
  });

  it("expands the units rather than reading the abbreviation", () => {
    expect(speakable("7.0 kn")).toContain("knots");
    expect(speakable("96 NM")).toContain("nautical miles");
  });

  it("turns separators into pauses instead of characters", () => {
    const said = speakable("TANKER · IMO SIM-0015 · NG");
    expect(said).not.toContain("·");
    expect(said).toContain(",");
  });
});
