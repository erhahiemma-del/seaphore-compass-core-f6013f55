/**
 * Sprint 12 · Retry with exponential backoff + jitter.
 *
 * `retry()` wraps any async operation with bounded retries and full
 * jitter so retry storms don't align across officers. Callers can mark
 * an error as non-retryable by throwing a `NonRetryableError` — auth /
 * validation errors should never burn the budget.
 */

export class NonRetryableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export interface RetryOptions {
  retries?: number;         // default 3 (Sprint 12 AC)
  baseMs?: number;          // default 100
  maxMs?: number;           // default 5_000
  factor?: number;          // default 2
  jitter?: boolean;         // default true (full jitter)
  signal?: AbortSignal;
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
  isRetryable?: (err: unknown) => boolean;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal?.reason ?? new Error("aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function retry<T>(op: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 100;
  const max = opts.maxMs ?? 5_000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;
  const sleep = opts.sleep ?? defaultSleep;
  const isRetryable = opts.isRetryable ?? ((e) => !(e instanceof NonRetryableError));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new Error("aborted");
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      const cap = Math.min(max, base * Math.pow(factor, attempt));
      const delay = jitter ? Math.floor(Math.random() * cap) : cap;
      opts.onRetry?.(attempt + 1, err, delay);
      await sleep(delay, opts.signal);
    }
  }
  throw lastErr;
}
