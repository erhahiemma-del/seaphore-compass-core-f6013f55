/**
 * LAYER 2.2 — Context Manager.
 * Maintains session state across a briefing conversation. NEVER modifies
 * briefing content. In-memory per browser tab; server-side persistence is
 * handled by the `intel_briefings.session_id` column.
 */
import type { Briefing, OfficerQuery } from "./types";

interface SessionState {
  session_id: string;
  officer_id: string;
  history: Array<{ query: string; briefing_id: string; at: string }>;
  workspace?: string;
  investigation_id?: string;
}

const SESSIONS = new Map<string, SessionState>();

export function ensureSession(query: OfficerQuery): SessionState {
  const id = query.session_id ?? crypto.randomUUID();
  const existing = SESSIONS.get(id);
  if (existing) return existing;
  const state: SessionState = {
    session_id: id,
    officer_id: query.officer_id,
    history: [],
    workspace: query.context?.workspace,
    investigation_id: query.context?.investigation_id,
  };
  SESSIONS.set(id, state);
  return state;
}

export function appendHistory(session_id: string, query: string, briefing: Briefing): void {
  const s = SESSIONS.get(session_id);
  if (!s) return;
  s.history.push({ query, briefing_id: briefing.id, at: new Date().toISOString() });
}

export function getSession(session_id: string): SessionState | undefined {
  return SESSIONS.get(session_id);
}
