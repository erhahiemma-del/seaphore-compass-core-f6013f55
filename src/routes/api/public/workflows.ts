/**
 * LAYER 5.3 — Workflow Contracts (server routes for external callers only).
 *
 * These endpoints wrap the Policy Engine so any invocation is validated
 * before an audit event is emitted. Each maps to a workflow row in the spec:
 *   Open Investigation, Notify Customs, Request Manifest, Assign Officer,
 *   Freeze Clearance.
 *
 * Every write is audited via emitEvent → orchestration_events.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Permission } from "@/services/orchestration/policy-engine";

interface WorkflowBody {
  officer_id: string;
  investigation_id?: string;
  workflow: "case.create" | "notification.customs" | "request.document" | "officer.assign" | "clearance.freeze";
  payload?: Record<string, unknown>;
}

const PERMISSION_MAP: Record<WorkflowBody["workflow"], Permission> = {
  "case.create": "CAN_CREATE_CASE",
  "notification.customs": "CAN_NOTIFY_CUSTOMS",
  "request.document": "CAN_REQUEST_DOCUMENTS",
  "officer.assign": "CAN_ASSIGN_OFFICERS",
  "clearance.freeze": "CAN_FREEZE_CLEARANCE",
};

const AUDIT_MAP: Record<WorkflowBody["workflow"], string> = {
  "case.create": "CaseCreated",
  "notification.customs": "NotificationSent",
  "request.document": "DocumentRequested",
  "officer.assign": "OfficerAssigned",
  "clearance.freeze": "ClearanceFrozen",
};

export const Route = createFileRoute("/api/public/workflows")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Bearer verification — only trusted callers with the workflow secret may invoke.
        const secret = process.env.WORKFLOW_INBOUND_SECRET;
        const provided = request.headers.get("x-workflow-secret");
        if (secret && provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: WorkflowBody;
        try {
          body = (await request.json()) as WorkflowBody;
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }

        if (!body?.officer_id || !PERMISSION_MAP[body.workflow]) {
          return Response.json({ error: "officer_id and known workflow required" }, { status: 400 });
        }

        // Verify officer holds the required role (server-side, service role).
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", body.officer_id);
        const permission = PERMISSION_MAP[body.workflow];
        const allowedRolesByPermission: Record<Permission, string[]> = {
          CAN_CREATE_CASE: ["officer", "director", "admin"],
          CAN_NOTIFY_CUSTOMS: ["officer", "director", "admin"],
          CAN_REQUEST_DOCUMENTS: ["analyst", "officer", "director", "admin"],
          CAN_ASSIGN_OFFICERS: ["director", "admin"],
          CAN_FREEZE_CLEARANCE: ["director", "admin"],
        };
        const held = (roles ?? []).map((r) => r.role as string);
        const permitted = allowedRolesByPermission[permission].some((r) => held.includes(r));
        if (!permitted) {
          return Response.json({ error: `Permission denied: ${permission}` }, { status: 403 });
        }

        // Emit audit event through the orchestration bus.
        const { error } = await supabaseAdmin.from("orchestration_events").insert({
          event_type: "officer.actioned",
          entity_ids: [],
          payload: {
            workflow: body.workflow,
            audit: AUDIT_MAP[body.workflow],
            investigation_id: body.investigation_id ?? null,
            body: body.payload ?? {},
          } as never,
          emitted_by: body.officer_id,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ ok: true, audit: AUDIT_MAP[body.workflow] });
      },
    },
  },
});
