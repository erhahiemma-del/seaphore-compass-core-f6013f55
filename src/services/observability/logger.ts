/**
 * Sprint 11 · Async structured logger (Pino-shaped, dependency-free).
 *
 * `.info(msg, fields)` returns immediately — records queue and are flushed
 * on the next microtask, so hot paths never block on serialisation or
 * subscriber fan-out. Subscribers (dashboard sink, alert engine, load-test
 * observer) are pushed to a plain array; failing subscribers are isolated.
 */
import type { LogLevel, LogRecord } from "./types";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
  subscribe(fn: (r: LogRecord) => void): () => void;
  /** Test/shutdown helper — await the async buffer. */
  flush(): Promise<void>;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface Options {
  minLevel?: LogLevel;
  bindings?: Record<string, unknown>;
  /** Sampling for debug/info: 0..1 (default 1). Errors + warns never sampled. */
  sample?: number;
}

export function createLogger(opts: Options = {}): Logger {
  const minLevel = LEVELS[opts.minLevel ?? "info"];
  const bindings = opts.bindings ?? {};
  const sample = opts.sample ?? 1;
  const subscribers = new Set<(r: LogRecord) => void>();
  let queue: LogRecord[] = [];
  let scheduled: Promise<void> | null = null;

  function schedule(): Promise<void> {
    if (scheduled) return scheduled;
    scheduled = Promise.resolve().then(() => {
      const drain = queue;
      queue = [];
      scheduled = null;
      for (const r of drain) {
        for (const fn of subscribers) {
          try {
            fn(r);
          } catch {
            /* subscriber isolation */
          }
        }
      }
    });
    return scheduled;
  }

  function emit(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    if (LEVELS[level] < minLevel) return;
    if ((level === "debug" || level === "info") && sample < 1 && Math.random() > sample) return;
    const rec: LogRecord = Object.freeze({
      at: new Date().toISOString(),
      level,
      msg,
      fields: Object.freeze({ ...bindings, ...fields }),
    });
    queue.push(rec);
    void schedule();
  }

  const log: Logger = {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child(more) {
      const sub = createLogger({
        minLevel: opts.minLevel,
        bindings: { ...bindings, ...more },
        sample,
      });
      // Bubble child records through the parent's subscribers.
      sub.subscribe((r) => {
        for (const fn of subscribers) {
          try {
            fn(r);
          } catch {
            /* noop */
          }
        }
      });
      return sub;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    async flush() {
      while (queue.length || scheduled) {
        await (scheduled ?? Promise.resolve());
      }
    },
  };
  return log;
}
