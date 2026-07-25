/**
 * useOklAutoPersistOnClose — auto-ingest hook (Sprint 2.4).
 *
 * Subscribes to workspace state and, the moment an investigation transitions
 * to CLOSED (or is already closed on mount and hasn't yet been ingested),
 * runs `persistInvestigationToOkl`. Persists an "ingested" marker in
 * localStorage per investigation id + stageHistory length so we never
 * double-ingest the same close event, but a *new* close (e.g. reopened then
 * closed again with more evidence) is treated as a new version.
 *
 * Silently no-ops if the user is unauthenticated — the server function will
 * reject with 401 and we swallow the error client-side.
 */
import { useEffect, useRef } from "react";
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { persistInvestigationToOkl } from "./persist-ingest";
import { toast } from "sonner";

const STORAGE_KEY = "seaphore.okl.ingested";

function readIngested(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIngested(id: string, marker: string) {
  try {
    const cur = readIngested();
    cur[id] = marker;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}

function markerFor(ws: InvestigationWorkspace): string {
  const closes = (ws.stageHistory ?? []).filter((s) => s.to === "CLOSED").length;
  return `${ws.status}::closes=${closes}::updated=${ws.updatedAt}`;
}

export function useOklAutoPersistOnClose(ws: InvestigationWorkspace | undefined) {
  const inflight = useRef<string | null>(null);

  useEffect(() => {
    if (!ws) return;
    if (ws.status !== "CLOSED") return;
    const marker = markerFor(ws);
    const existing = readIngested()[ws.id];
    if (existing === marker) return;
    if (inflight.current === marker) return;
    inflight.current = marker;

    persistInvestigationToOkl(ws)
      .then((res) => {
        writeIngested(ws.id, marker);
        toast.success(
          `Investigation persisted to Operational Knowledge (v${res.version}, ${res.recordCount} records).`,
        );
      })
      .catch((e: unknown) => {
        // Silent 401 on unauthenticated preview sessions; surface other errors.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/Unauthorized|401/i.test(msg)) {
          toast.error(`OKL ingest failed: ${msg}`);
        }
      })
      .finally(() => {
        inflight.current = null;
      });
  }, [ws]);
}
