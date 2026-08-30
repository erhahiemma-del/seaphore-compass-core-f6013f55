/**
 * Calculating a levy, and refusing to.
 *
 * The refusals carry more weight here than the arithmetic. A percentage
 * applied to the wrong number produces a plausible naira figure with a
 * receipt attached, and a receipt is the most authoritative-looking thing
 * this system emits — it goes to a vessel's agent with a name on it.
 *
 * The concrete case is the NPA workbook: its tonnage column holds
 * `15,000 MTS`, `450 UNITS` and `199 FCL`. Every one is a quantity and none
 * is money. An engine that charged three percent against them would invent
 * a liability against a named vessel.
 */
import { describe, expect, it } from "vitest";

import {
  calculateLevy,
  issueReceipt,
  type RevenueBasis,
  type RevenueRule,
} from "@/services/revenue/levy-calculation";

/** A rule shaped like the NIMASA levy, used here as a test subject only. */
const RULE: RevenueRule = {
  id: "levy-3pct",
  version: "2026.1",
  description: "The 3% levy",
  rate: 0.03,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  currency: "NGN",
  basisDescription: "gross freight on inbound international cargo",
};

const MONETARY: RevenueBasis = {
  kind: "MONETARY",
  amount: 100_000_000,
  currency: "NGN",
  unit: null,
  source: "Declared freight value",
  confidence: "DECLARED",
  field: "grossFreightValue",
};

/** Exactly what the NPA workbook supplies. */
const NPA_TONNAGE: RevenueBasis = {
  kind: "QUANTITY",
  amount: 15000,
  currency: null,
  unit: "MTS",
  source: "NPA /Tonnage(Import)",
  confidence: "DECLARED",
  field: "Tonnage(Import)",
};

describe("a levy on a monetary basis", () => {
  it("calculates the figure and shows the working", () => {
    const result = calculateLevy(MONETARY, RULE, "2026-08-30T00:00:00.000Z");

    expect(result.outcome).toBe("CALCULATED");
    expect(result.amount).toBe(3_000_000);
    expect(result.currency).toBe("NGN");
    expect(result.explanation).toMatch(/3% of 100,000,000 NGN/);
  });

  /*
   * A figure that cannot be traced to a rule version cannot be defended
   * when it is disputed, and rates change by amendment.
   */
  it("records the rule version that produced it", () => {
    const result = calculateLevy(MONETARY, RULE, "2026-08-30T00:00:00.000Z");

    expect(result.rule.version).toBe("2026.1");
    expect(result.explanation).toMatch(/rule levy-3pct version 2026\.1/);
  });

  it("carries the basis and its source through to the result", () => {
    const result = calculateLevy(MONETARY, RULE, "2026-08-30T00:00:00.000Z");

    expect(result.basis.source).toBe("Declared freight value");
    expect(result.explanation).toMatch(/Declared freight value/);
  });
});

describe("a quantity is never charged against", () => {
  /*
   * The defect this file exists to prevent. Three percent of fifteen
   * thousand metric tons is 450 — a number, in no currency, owed by
   * nobody. Emitting it beside a naira sign would be a fabricated
   * liability.
   */
  it("refuses NPA tonnage outright", () => {
    const result = calculateLevy(NPA_TONNAGE, RULE, "2026-08-30T00:00:00.000Z");

    expect(result.outcome).toBe("NO_MONETARY_BASIS");
    expect(result.amount).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("explains what the figure actually measures", () => {
    const result = calculateLevy(NPA_TONNAGE, RULE, "2026-08-30T00:00:00.000Z");

    expect(result.explanation).toMatch(/15000 MTS/);
    expect(result.explanation).toMatch(/how much cargo there is rather than what it is worth/i);
    // And names what the levy is actually charged on.
    expect(result.explanation).toMatch(/gross freight/i);
  });

  it("refuses vehicle counts and container loads too", () => {
    for (const unit of ["UNITS", "FCL"]) {
      const result = calculateLevy(
        { ...NPA_TONNAGE, amount: 450, unit },
        RULE,
        "2026-08-30T00:00:00.000Z",
      );
      expect(result.outcome).toBe("NO_MONETARY_BASIS");
    }
  });

  /*
   * A figure whose meaning was never stated is not chargeable either. The
   * tempting reading is "probably money"; the correct one is that nobody
   * said.
   */
  it("refuses a figure whose meaning the source did not state", () => {
    const result = calculateLevy(
      { ...MONETARY, kind: "UNSPECIFIED", currency: null },
      RULE,
      "2026-08-30T00:00:00.000Z",
    );

    expect(result.outcome).toBe("NO_MONETARY_BASIS");
    expect(result.explanation).toMatch(/did not state what the figure/i);
  });
});

describe("other refusals", () => {
  /*
   * Converting here would apply an exchange rate nobody authorised, on a
   * date nobody chose, to a figure that ends up on a receipt.
   */
  it("refuses to convert a foreign currency", () => {
    const result = calculateLevy(
      { ...MONETARY, currency: "USD" },
      RULE,
      "2026-08-30T00:00:00.000Z",
    );

    expect(result.outcome).toBe("CURRENCY_MISMATCH");
    expect(result.amount).toBeNull();
    expect(result.explanation).toMatch(/exchange rate nobody authorised/i);
  });

  /*
   * A rate lives in legislation. Charging a 2025 port call at the 2026
   * rate rewrites what was owed.
   */
  it("refuses a date the rule does not cover", () => {
    const result = calculateLevy(MONETARY, RULE, "2025-06-01T00:00:00.000Z");

    expect(result.outcome).toBe("RULE_NOT_IN_FORCE");
    expect(result.amount).toBeNull();
  });

  it("refuses a monetary basis with no figure", () => {
    const result = calculateLevy({ ...MONETARY, amount: null }, RULE, "2026-08-30T00:00:00.000Z");

    expect(result.outcome).toBe("NO_BASIS_VALUE");
  });

  it("always explains itself, whatever the outcome", () => {
    const cases = [
      calculateLevy(NPA_TONNAGE, RULE, "2026-08-30T00:00:00.000Z"),
      calculateLevy({ ...MONETARY, currency: "USD" }, RULE, "2026-08-30T00:00:00.000Z"),
      calculateLevy(MONETARY, RULE, "2025-06-01T00:00:00.000Z"),
      calculateLevy({ ...MONETARY, amount: null }, RULE, "2026-08-30T00:00:00.000Z"),
    ];

    for (const result of cases) {
      expect(result.explanation.length, result.outcome).toBeGreaterThan(40);
    }
  });
});

describe("receipts", () => {
  const calculation = calculateLevy(MONETARY, RULE, "2026-08-30T00:00:00.000Z");

  /*
   * The line that keeps the document honest. A calculated levy handed to
   * an agent without it reads as settled.
   */
  it("says on its face that a calculation is not a payment", () => {
    const receipt = issueReceipt(calculation, "RCT-0001", "2026-08-30T09:00:00.000Z")!;

    expect(receipt.status).toBe("CALCULATED");
    expect(receipt.statement).toMatch(/not proof of payment/i);
    expect(receipt.statement).toMatch(/no payment has been recorded/i);
  });

  it("says a payment was recorded only when one was", () => {
    const receipt = issueReceipt(
      calculation,
      "RCT-0002",
      "2026-08-30T09:00:00.000Z",
      "2026-08-30T11:00:00.000Z",
    )!;

    expect(receipt.status).toBe("PAID");
    expect(receipt.statement).toMatch(/payment of/i);
    expect(receipt.statement).toMatch(/2026-08-30T11:00/);
  });

  /*
   * A refusal is not a document. Issuing a receipt for one would put a
   * reference number and a letterhead on the absence of a figure.
   */
  it("issues nothing for a refusal", () => {
    const refused = calculateLevy(NPA_TONNAGE, RULE, "2026-08-30T00:00:00.000Z");

    expect(issueReceipt(refused, "RCT-0003", "2026-08-30T09:00:00.000Z")).toBeNull();
  });

  it("carries the whole calculation, so the figure can be traced", () => {
    const receipt = issueReceipt(calculation, "RCT-0004", "2026-08-30T09:00:00.000Z")!;

    expect(receipt.calculation.rule.version).toBe("2026.1");
    expect(receipt.calculation.basis.field).toBe("grossFreightValue");
    expect(receipt.calculation.explanation).toBeTruthy();
  });
});
