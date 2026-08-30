/**
 * Calculating a levy from manifest evidence, or refusing to.
 *
 * ## Why the refusal is the important half
 *
 * The rate is the easy part. The dangerous part is the basis: a percentage
 * applied to the wrong number produces a plausible naira figure with a
 * receipt attached, and a receipt is the most authoritative-looking thing
 * this system can emit.
 *
 * The concrete risk here is not hypothetical. The NPA workbook's tonnage
 * column holds `15,000 MTS`, `450 UNITS` and `199 FCL` — metric tons,
 * vehicles and container loads. Every one of those is a quantity. None is
 * money. Three percent of fifteen thousand metric tons is not a sum owed by
 * anybody, and an engine that multiplied it anyway would be inventing a
 * liability against a named vessel and agent.
 *
 * So a basis must state that it is monetary, name its currency, and name
 * where the value came from. Anything else is refused with a reason, and
 * the reason is what an officer reads instead of a number.
 *
 * ## Why the rule is a value, not a constant
 *
 * A rate lives in legislation and changes by amendment. Hard-coding `0.03`
 * would make every historical calculation silently adopt the current rate
 * the moment it changed, rewriting what was owed last year. The rule
 * carries its own version and effective dates so a calculation can be
 * reproduced exactly as it was made.
 */

/** What a figure measures. Only one of these can be charged against. */
export type BasisKind =
  /** A sum of money, with a currency. The only chargeable kind. */
  | "MONETARY"
  /** Tons, units, containers. A quantity is not a value. */
  | "QUANTITY"
  /** A figure whose meaning the source did not state. */
  | "UNSPECIFIED";

/** How far the basis value can be relied on. */
export type BasisConfidence = "DECLARED" | "CORROBORATED" | "ESTIMATED" | "UNVERIFIED";

export interface RevenueBasis {
  readonly kind: BasisKind;
  readonly amount: number | null;
  /** ISO 4217, e.g. `NGN`. Required for a monetary basis. */
  readonly currency: string | null;
  /** The unit, when this is a quantity — `MTS`, `UNITS`, `FCL`. */
  readonly unit: string | null;
  /** Where the figure came from, e.g. `NPA /Tonnage(Import)`. */
  readonly source: string | null;
  readonly confidence: BasisConfidence;
  /** Which manifest field this was read from. */
  readonly field: string;
}

/**
 * A levy rule, as legislated.
 *
 * `version` and the effective dates exist so a calculation made last year
 * can be reproduced under the rule that applied then, rather than silently
 * re-rated when the legislation changes.
 */
export interface RevenueRule {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  /** Fractional, so three percent is 0.03. */
  readonly rate: number;
  readonly effectiveFrom: string;
  /** Null while the rule is still in force. */
  readonly effectiveTo: string | null;
  /** The currency the levy is charged in. */
  readonly currency: string;
  /**
   * What the rate is charged against, in the legislation's own words.
   *
   * Recorded because "three percent" is meaningless without it, and
   * because an officer disputing a figure will ask this first.
   */
  readonly basisDescription: string;
}

export type CalculationOutcome =
  /** A figure was produced, and every input is recorded. */
  | "CALCULATED"
  /** No monetary basis was available. Nothing was calculated. */
  | "NO_MONETARY_BASIS"
  /** The basis is monetary but its currency does not match the rule's. */
  | "CURRENCY_MISMATCH"
  /** The rule was not in force at the relevant date. */
  | "RULE_NOT_IN_FORCE"
  /** The basis carries no usable figure. */
  | "NO_BASIS_VALUE";

export interface RevenueCalculation {
  readonly outcome: CalculationOutcome;
  /** The levy, in the rule's currency. Null unless `CALCULATED`. */
  readonly amount: number | null;
  readonly currency: string | null;
  readonly basis: RevenueBasis;
  readonly rule: RevenueRule;
  /** When the calculation was performed. */
  readonly calculatedAt: string;
  /**
   * The working, in words.
   *
   * Always present, for a refusal as much as a figure: an officer needs to
   * know why there is no number as much as how one was reached.
   */
  readonly explanation: string;
}

/**
 * Apply a levy rule to a basis.
 *
 * `at` is the date the calculation is *for* — not now — so a levy on a
 * historical port call is charged at the rule in force then.
 */
export function calculateLevy(
  basis: RevenueBasis,
  rule: RevenueRule,
  at: string,
): RevenueCalculation {
  const base = { basis, rule, calculatedAt: at, amount: null, currency: null } as const;

  const when = Date.parse(at);
  const from = Date.parse(rule.effectiveFrom);
  const to = rule.effectiveTo ? Date.parse(rule.effectiveTo) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(when) || when < from || when > to) {
    return {
      ...base,
      outcome: "RULE_NOT_IN_FORCE",
      explanation: `Rule ${rule.id} version ${rule.version} applies from ${rule.effectiveFrom}${
        rule.effectiveTo ? ` to ${rule.effectiveTo}` : " onward"
      }, and does not cover ${at}. No levy has been calculated.`,
    };
  }

  /*
   * The refusal that matters. A quantity is not a value, however
   * confidently it was measured: three percent of 15,000 metric tons is
   * not a sum owed by anyone.
   */
  if (basis.kind !== "MONETARY") {
    const measured = basis.unit ? `${basis.amount ?? "?"} ${basis.unit}` : "a quantity";
    return {
      ...base,
      outcome: "NO_MONETARY_BASIS",
      explanation:
        basis.kind === "QUANTITY"
          ? `The only figure available for "${basis.field}" is ${measured}, which measures how much cargo there is rather than what it is worth. ${rule.description} is charged on ${rule.basisDescription}, so no levy can be calculated from this.`
          : `The source did not state what the figure in "${basis.field}" measures, so it cannot be treated as a value. ${rule.description} is charged on ${rule.basisDescription}.`,
    };
  }

  if (basis.amount === null || !Number.isFinite(basis.amount)) {
    return {
      ...base,
      outcome: "NO_BASIS_VALUE",
      explanation: `"${basis.field}" is recorded as a monetary basis but carries no usable figure, so no levy has been calculated.`,
    };
  }

  if (basis.currency !== rule.currency) {
    return {
      ...base,
      outcome: "CURRENCY_MISMATCH",
      explanation: `"${basis.field}" is stated in ${basis.currency ?? "an unnamed currency"} and ${rule.description} is charged in ${rule.currency}. Converting it here would apply an exchange rate nobody authorised, so no levy has been calculated.`,
    };
  }

  const amount = basis.amount * rule.rate;
  const percentage = (rule.rate * 100).toFixed(2).replace(/\.00$/, "");

  return {
    ...base,
    outcome: "CALCULATED",
    amount,
    currency: rule.currency,
    explanation: `${percentage}% of ${basis.amount.toLocaleString()} ${rule.currency}, read from "${basis.field}"${
      basis.source ? ` supplied by ${basis.source}` : ""
    } and ${basis.confidence.toLowerCase()}, under rule ${rule.id} version ${rule.version}.`,
  };
}

/** Whether a calculation has been paid, which is a separate fact entirely. */
export type ReceiptStatus =
  /** A figure has been calculated. Nothing has been paid. */
  | "CALCULATED"
  /** A payment has been recorded against this calculation. */
  | "PAID";

export interface Receipt {
  readonly reference: string;
  readonly issuedAt: string;
  readonly calculation: RevenueCalculation;
  readonly status: ReceiptStatus;
  /**
   * The sentence that keeps the document honest.
   *
   * A receipt is the most authoritative-looking thing this system emits,
   * and a calculation is not a payment. Without this line on its face, a
   * calculated figure would be handed to a vessel's agent as though it
   * settled something.
   */
  readonly statement: string;
}

/**
 * Issue a receipt for a calculation.
 *
 * Only a calculation that produced a figure can be receipted, and a receipt
 * says on its face whether anything was paid. `paidAt` is the only thing
 * that makes it a record of payment — nothing about calculating a levy
 * settles it.
 */
export function issueReceipt(
  calculation: RevenueCalculation,
  reference: string,
  issuedAt: string,
  paidAt: string | null = null,
): Receipt | null {
  // Nothing to receipt. A refusal is not a document.
  if (calculation.outcome !== "CALCULATED") return null;

  const status: ReceiptStatus = paidAt ? "PAID" : "CALCULATED";
  return {
    reference,
    issuedAt,
    calculation,
    status,
    statement:
      status === "PAID"
        ? `Payment of ${calculation.amount?.toLocaleString()} ${calculation.currency} was recorded on ${paidAt}.`
        : `This is a calculation of ${calculation.amount?.toLocaleString()} ${calculation.currency} and is not proof of payment. No payment has been recorded against it.`,
  };
}
