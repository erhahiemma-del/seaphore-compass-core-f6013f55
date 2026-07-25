/**
 * Deterministic cadence math shared by UI and backend.
 * Mirrors `public.mibc_next_run` in SQL — keep the two in sync.
 */

import type { ReportCadence } from "@/services/mibc";

export type RecurringCadence = Exclude<ReportCadence, "ON_DEMAND">;

export const RECURRING_CADENCES: readonly RecurringCadence[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
];

export const CADENCE_LABEL: Record<RecurringCadence, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

export function nextRunAt(cadence: RecurringCadence, from: Date = new Date()): Date {
  const d = new Date(from);
  switch (cadence) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case "MONTHLY":
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    case "QUARTERLY":
      d.setUTCMonth(d.getUTCMonth() + 3);
      return d;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = t - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  if (min < 1) return diff >= 0 ? "in <1 min" : "just now";
  if (min < 60) return diff >= 0 ? `in ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return diff >= 0 ? `in ${hr} h` : `${hr} h ago`;
  const day = Math.round(hr / 24);
  return diff >= 0 ? `in ${day} d` : `${day} d ago`;
}
