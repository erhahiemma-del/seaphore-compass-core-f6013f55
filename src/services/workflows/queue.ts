/**
 * Sprint 9 · Async in-memory job queue.
 *
 * Bounded-concurrency FIFO with backoff. Bull/BullMQ can slot in behind this
 * interface later (Sprint 12). Every enqueued job returns a promise so tests
 * can await settlement without polling.
 */
export interface QueueJob<T> {
  readonly id: string;
  run(): Promise<T>;
}

export interface Queue {
  enqueue<T>(job: QueueJob<T>): Promise<T>;
  size(): number;
}

export interface QueueOptions {
  readonly concurrency?: number;
}

export function createMemoryQueue(opts: QueueOptions = {}): Queue {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  let running = 0;
  const pending: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (running < concurrency) {
      running++;
      return;
    }
    await new Promise<void>((resolve) => pending.push(resolve));
    running++;
  }
  function release(): void {
    running--;
    const next = pending.shift();
    if (next) next();
  }

  return {
    async enqueue<T>(job: QueueJob<T>): Promise<T> {
      await acquire();
      try {
        return await job.run();
      } finally {
        release();
      }
    },
    size() {
      return running + pending.length;
    },
  };
}
