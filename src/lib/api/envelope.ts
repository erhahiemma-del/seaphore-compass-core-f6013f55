/**
 * API-7: every response envelope carries data, confidence?, sources[],
 * pagination?, and requestId (for audit correlation).
 */
export interface ApiEnvelope<T> {
  data: T;
  confidence?: "verified" | "observed" | "inferred" | "unconfirmed";
  sources: string[];
  pagination?: { page: number; pageSize: number; total: number };
  requestId: string;
}

export function envelope<T>(
  data: T,
  opts: Partial<Omit<ApiEnvelope<T>, "data" | "requestId">> = {},
): ApiEnvelope<T> {
  return {
    data,
    confidence: opts.confidence,
    sources: opts.sources ?? [],
    pagination: opts.pagination,
    requestId: crypto.randomUUID(),
  };
}
