/**
 * Sprint 11 · Metrics registry — counters, gauges, and histograms with
 * percentile snapshots (p50/p90/p95/p99).
 *
 * Bucketless streaming histogram: keeps up to `capacity` samples per series
 * (default 4096) with reservoir sampling. Fine for a dashboard reading the
 * last few minutes; the Prometheus adapter (out of scope for Sprint 11) can
 * later scrape the same registry.
 */
export interface HistogramSnapshot {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export interface MetricsSnapshot {
  readonly counters: Readonly<Record<string, number>>;
  readonly gauges: Readonly<Record<string, number>>;
  readonly histograms: Readonly<Record<string, HistogramSnapshot>>;
}

export interface MetricsRegistry {
  incr(name: string, value?: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  observe(name: string, value: number, labels?: Record<string, string>): void;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

function labelKey(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? name : `${name}{${keys.map((k) => `${k}="${labels[k]}"`).join(",")}}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export function createMetricsRegistry(capacity = 4096): MetricsRegistry {
  const counters = new Map<string, number>();
  const gauges = new Map<string, number>();
  const histograms = new Map<string, { samples: number[]; seen: number }>();

  return {
    incr(name, value = 1, labels) {
      const k = labelKey(name, labels);
      counters.set(k, (counters.get(k) ?? 0) + value);
    },
    gauge(name, value, labels) {
      gauges.set(labelKey(name, labels), value);
    },
    observe(name, value, labels) {
      const k = labelKey(name, labels);
      let series = histograms.get(k);
      if (!series) {
        series = { samples: [], seen: 0 };
        histograms.set(k, series);
      }
      series.seen++;
      if (series.samples.length < capacity) {
        series.samples.push(value);
      } else {
        // Reservoir sampling
        const r = Math.floor(Math.random() * series.seen);
        if (r < capacity) series.samples[r] = value;
      }
    },
    snapshot() {
      const hist: Record<string, HistogramSnapshot> = {};
      for (const [name, s] of histograms) {
        if (s.samples.length === 0) continue;
        const sorted = s.samples.slice().sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        hist[name] = {
          count: s.seen,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: sum / sorted.length,
          p50: percentile(sorted, 50),
          p90: percentile(sorted, 90),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
        };
      }
      return {
        counters: Object.fromEntries(counters),
        gauges: Object.fromEntries(gauges),
        histograms: hist,
      };
    },
    reset() {
      counters.clear();
      gauges.clear();
      histograms.clear();
    },
  };
}
