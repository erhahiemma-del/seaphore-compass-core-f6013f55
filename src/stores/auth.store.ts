/**
 * auth.store — officer session & role snapshot.
 *
 * Source of truth for auth is Supabase (`supabase.auth`). This store
 * mirrors the current officer for UI purposes only. Do not use it for
 * authorization — RLS + server-side `requireSupabaseAuth` remain
 * authoritative.
 */
import { create } from "zustand";

export type OfficerRole = "analyst" | "officer" | "director" | "admin";

export interface AuthOfficer {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: OfficerRole | null;
}

interface AuthState {
  officer: AuthOfficer | null;
  ready: boolean;
  setOfficer: (o: AuthOfficer | null) => void;
  setReady: (v: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  officer: null,
  ready: false,
  setOfficer: (officer) => set({ officer }),
  setReady: (ready) => set({ ready }),
  clear: () => set({ officer: null }),
}));
