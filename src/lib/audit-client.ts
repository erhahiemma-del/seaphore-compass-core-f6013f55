/**
 * Client-side entry point for the append-only audit log.
 *
 * `writeAuditLog` is guarded by `requireSupabaseAuth`, so calling it
 * without a session throws "Unauthorized: No authorization header
 * provided" — a server 500 that surfaces as an unhandled runtime error.
 * An audit entry is a record of an officer's action; with no signed-in
 * officer there is nothing truthful to record, so the write is skipped
 * rather than attempted and failed.
 *
 * The result says which happened. Callers never treat audit as a gate.
 */
import { supabase } from "@/integrations/supabase/client";
import { writeAuditLog, type AuditInput } from "@/lib/audit.functions";

export type AuditOutcome =
  | { readonly persisted: true; readonly id: string; readonly at: string }
  | { readonly persisted: false; readonly reason: string };

export async function recordAudit(input: AuditInput): Promise<AuditOutcome> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    return { persisted: false, reason: "No signed-in officer: audit entry not written." };
  }

  try {
    const row = await writeAuditLog({ data: input });
    return { persisted: true, id: row.id, at: row.at };
  } catch (error) {
    return {
      persisted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
