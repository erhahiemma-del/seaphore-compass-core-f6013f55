/**
 * The thing that stops Seaphore spending money it has already run out of.
 *
 * Written after an incident rather than in anticipation of one. The
 * coverage engine turned one request per poll into twelve, each billed
 * per vessel found; the map polls every sixty seconds and the position
 * cache expires in the same sixty seconds, so the whole Nigerian coast
 * was re-billed every minute at roughly 1,374 vessels a time. A 20,000
 * request allowance was gone in about thirteen minutes of the map simply
 * being open, and every endpoint then answered 402 — including ones that
 * had worked minutes earlier, which is what made the exhaustion look at
 * first like a routing fault.
 *
 * Cadence was the proximate cause and is fixed in the coverage engine.
 * This is the backstop: whatever any surface asks for, once the provider
 * says it has no allowance left, Seaphore stops asking.
 *
 * ## Why refusing is better than trying
 *
 * A request made against an exhausted allowance costs the same as one
 * made against a healthy one — nothing is returned either way, and the
 * provider still counts it. Continuing to ask is therefore pure loss,
 * and it buries the real reason under a stream of identical failures.
 * Refusing locally is both cheaper and clearer.
 *
 * ## Why it does not reset itself quickly
 *
 * An allowance is topped up by a person, not by waiting. A short cooldown
 * would have Seaphore rediscover the exhaustion every few minutes, each
 * discovery costing another request. The cooldown is therefore long, and
 * `resetDatalasticGovernor` exists so a human who has topped up does not
 * have to wait it out.
 */

/** What the provider is currently able to do for us. */
export type ProviderState =
  | "CONNECTED"
  /** Answering, but something is wrong — failures without a clear cause. */
  | "DEGRADED"
  /** Asked us to slow down. Recovers on its own. */
  | "RATE_LIMITED"
  /** Out of allowance. Does not recover without a person. */
  | "CREDIT_EXHAUSTED"
  | "UNAVAILABLE";

export interface GovernorSnapshot {
  readonly state: ProviderState;
  /** Paid requests actually issued since the last reset. */
  readonly requestsIssued: number;
  /** Requests refused locally before they could cost anything. */
  readonly requestsBlocked: number;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  /** When paid requests may resume, ISO. Null when not blocked. */
  readonly blockedUntil: string | null;
  /** Officer-facing explanation of the current state. */
  readonly reason: string | null;
}

/**
 * How long a credit exhaustion holds.
 *
 * Long on purpose: only a person can top up an allowance, so a short
 * cooldown would merely re-buy the same discovery every few minutes.
 */
const CREDIT_COOLDOWN_MS = 60 * 60_000;

/**
 * How long a rate limit holds when the provider names no Retry-After.
 *
 * Short, because rate limits do clear on their own — this is the one
 * state where waiting is the correct response.
 */
const RATE_LIMIT_COOLDOWN_MS = 60_000;

interface GovernorState {
  state: ProviderState;
  requestsIssued: number;
  requestsBlocked: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  blockedUntilMs: number | null;
  reason: string | null;
}

const governor: GovernorState = {
  state: "CONNECTED",
  requestsIssued: 0,
  requestsBlocked: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  blockedUntilMs: null,
  reason: null,
};

/**
 * Whether a paid request may be made now.
 *
 * Called before the credential is even read, so a blocked provider costs
 * nothing at all — not a socket, not a DNS lookup, and certainly not a
 * request the provider would count.
 */
export function mayIssueRequest(now: number = Date.now()): boolean {
  if (governor.blockedUntilMs === null) return true;
  if (now >= governor.blockedUntilMs) {
    /*
     * The cooldown elapsed. The provider is given one chance to prove it
     * recovered rather than being assumed healthy — the next failure
     * blocks it again immediately.
     */
    governor.blockedUntilMs = null;
    governor.state = "DEGRADED";
    governor.reason =
      "Cooldown elapsed. The next request will test whether the provider recovered.";
    return true;
  }
  governor.requestsBlocked += 1;
  return false;
}

/** Record that a paid request was actually issued. */
export function recordRequestIssued(): void {
  governor.requestsIssued += 1;
}

/** The provider answered usefully. */
export function recordSuccess(at: string): void {
  governor.state = "CONNECTED";
  governor.lastSuccessAt = at;
  governor.blockedUntilMs = null;
  governor.reason = null;
}

export interface FailureInput {
  readonly httpStatus: number | null;
  readonly at: string;
  /** Seconds the provider asked us to wait, when it said. */
  readonly retryAfterSeconds?: number | null;
  readonly now?: number;
}

/**
 * The provider failed, and the failure decides what happens next.
 *
 * The three cases are genuinely different and must not share a response:
 * a rate limit clears itself, an exhausted allowance needs a person, and
 * an outage needs neither but should not be hammered. Collapsing them
 * would either keep spending against an empty account or stop asking a
 * provider that was about to recover.
 */
export function recordFailure(input: FailureInput): ProviderState {
  const now = input.now ?? Date.now();
  governor.lastFailureAt = input.at;

  if (input.httpStatus === 402) {
    governor.state = "CREDIT_EXHAUSTED";
    governor.blockedUntilMs = now + CREDIT_COOLDOWN_MS;
    governor.reason =
      "Datalastic reports no remaining allowance. Paid requests are suspended until it is topped up — this is a billing state, not an empty sea.";
    return governor.state;
  }

  if (input.httpStatus === 429) {
    const wait =
      input.retryAfterSeconds != null && Number.isFinite(input.retryAfterSeconds)
        ? Math.max(input.retryAfterSeconds, 1) * 1000
        : RATE_LIMIT_COOLDOWN_MS;
    governor.state = "RATE_LIMITED";
    governor.blockedUntilMs = now + wait;
    governor.reason = "Datalastic asked Seaphore to slow down. Positions will resume shortly.";
    return governor.state;
  }

  if (input.httpStatus === null || input.httpStatus >= 500) {
    governor.state = "UNAVAILABLE";
    governor.blockedUntilMs = now + RATE_LIMIT_COOLDOWN_MS;
    governor.reason =
      "Datalastic did not answer. Seaphore is not receiving positions — this is a collection failure, not an absence of vessels.";
    return governor.state;
  }

  /*
   * Everything else — a rejected request, an unauthorised credential —
   * is a fault in what Seaphore asked, not in the provider's ability to
   * answer. Blocking would hide a defect behind an outage.
   */
  governor.state = "DEGRADED";
  governor.reason = null;
  return governor.state;
}

export function datalasticGovernor(now: number = Date.now()): GovernorSnapshot {
  return {
    state: governor.state,
    requestsIssued: governor.requestsIssued,
    requestsBlocked: governor.requestsBlocked,
    lastSuccessAt: governor.lastSuccessAt,
    lastFailureAt: governor.lastFailureAt,
    blockedUntil:
      governor.blockedUntilMs === null || now >= governor.blockedUntilMs
        ? null
        : new Date(governor.blockedUntilMs).toISOString(),
    reason: governor.reason,
  };
}

/**
 * Clear the block, for a person who has topped the allowance up.
 *
 * Deliberately manual. Nothing Seaphore can observe tells it an account
 * was refilled, so guessing would just resume spending against an empty
 * one.
 */
export function resetDatalasticGovernor(): void {
  governor.state = "CONNECTED";
  governor.requestsIssued = 0;
  governor.requestsBlocked = 0;
  governor.lastSuccessAt = null;
  governor.lastFailureAt = null;
  governor.blockedUntilMs = null;
  governor.reason = null;
}
