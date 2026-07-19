import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Users,
  AlertCircle,
  CheckCircle2,
  History,
  RefreshCw,
  X,
  Minus,
  Plus,
  Download,
} from "lucide-react";
import { useServerFn as useSF } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { RequirePermission } from "@/components/require-permission";
import { usePermission } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  listUsersWithRoles,
  setUserRoles,
  type AdminUserRow,
} from "@/lib/admin-roles.functions";
import {
  listRoleAuditLog,
  type RoleAuditEntry,
} from "@/lib/admin-audit.functions";
import type { Role } from "@/lib/permissions";
import { QUERY_KEYS } from "@/lib/query-keys";

const ALL_ROLES: Role[] = ["analyst", "officer", "director", "admin"];

const ROLE_LABEL: Record<Role, string> = {
  analyst: "Analyst",
  officer: "Officer",
  director: "Director",
  admin: "Administrator",
};

const ROLE_DESC: Record<Role, string> = {
  analyst: "Read entities, add evidence, create investigations",
  officer: "Submit decisions, close/escalate investigations",
  director: "Team & full audit visibility, sensitive briefings",
  admin: "User & role management, system-wide access",
};

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportAuditCsv(
  entries: RoleAuditEntry[],
  filteredUser: AdminUserRow | null,
): void {
  if (entries.length === 0) return;
  const header = [
    "timestamp_utc",
    "actor_name",
    "actor_email",
    "actor_id",
    "target_name",
    "target_email",
    "target_id",
    "roles_added",
    "roles_removed",
    "ip_address",
    "rule_refs",
    "audit_id",
  ];
  const rows = entries.map((e) => [
    new Date(e.at).toISOString(),
    e.actor.fullName ?? "",
    e.actor.email ?? "",
    e.actor.id ?? "",
    e.target.fullName ?? "",
    e.target.email ?? "",
    e.target.id ?? "",
    e.added.join("|"),
    e.removed.join("|"),
    e.ipAddress ?? "",
    e.ruleRefs.join("|"),
    e.id,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map(csvField).join(","))
    .join("\r\n");
  // BOM for Excel UTF-8 compatibility.
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const scope = filteredUser
    ? `-${(filteredUser.fullName ?? filteredUser.email ?? filteredUser.id)
        .replace(/[^a-z0-9]+/gi, "_")
        .toLowerCase()}`
    : "";
  const a = document.createElement("a");
  a.href = url;
  a.download = `seaphore-role-audit${scope}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("Audit trail exported", {
    description: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} downloaded as CSV.`,
  });
}

export const Administration = () => {
  const allowed = usePermission("role.manage");
  return (
    <AppShell title="Administration" subtitle="Role & Access Management" mode="light">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="type-h2 text-foreground">Role Management</h1>
            <p className="type-small text-slate max-w-2xl">
              Assign Seaphore roles to officer profiles. Access is enforced by
              Row-Level Security; this screen is available to Administrators
              only. All changes are recorded in the immutable audit log
              (HR-9, PERM-1).
            </p>
          </div>
        </header>

        <RequirePermission
          permission="role.manage"
          fallback={<AccessDenied />}
        >
          {allowed ? <RoleManagementTable /> : null}
        </RequirePermission>
      </div>
    </AppShell>
  );
};

function AccessDenied() {
  return (
    <div className="rounded-lg border border-line bg-surface-1 p-8 text-center">
      <AlertCircle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
      <p className="type-body text-foreground">Administrator role required.</p>
      <p className="type-small text-slate mt-1">
        Contact your system administrator to request access.
      </p>
    </div>
  );
}

export function RoleManagementTable() {
  const qc = useQueryClient();
  const listFn = useSF(listUsersWithRoles);
  const setFn = useSF(setUserRoles);
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;

  const [auditFilterUserId, setAuditFilterUserId] = useState<string | null>(null);
  const auditRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users-with-roles"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (input: { userId: string; roles: Role[] }) =>
      setFn({ data: input }),
    onSuccess: (_res, vars) => {
      toast.success("Roles updated", {
        description: `${vars.roles.length} role(s) assigned.`,
      });
      qc.invalidateQueries({ queryKey: ["admin", "users-with-roles"] });
      qc.invalidateQueries({ queryKey: ["auth", "roles"] });
      qc.invalidateQueries({ queryKey: ["admin", "role-audit"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Update failed";
      toast.error("Could not update roles", { description: message });
    },
  });

  const users = data ?? [];
  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  );

  const openHistoryFor = (userId: string | null) => {
    setAuditFilterUserId(userId);
    // Defer scroll until the panel re-renders with the new filter.
    requestAnimationFrame(() => {
      auditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-line bg-surface-1 p-8 text-center text-slate">
        Loading officers…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/5 p-6">
        <p className="type-body text-danger">Failed to load users.</p>
        <p className="type-small text-slate mt-1">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RoleLegend />
      <div className="rounded-lg border border-line bg-surface-1 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
          <Users className="h-4 w-4 text-slate" />
          <span className="type-label text-foreground">
            {users.length} officer profile{users.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="divide-y divide-line">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              disabled={mutation.isPending}
              isSelf={user.id === currentUserId}
              onSave={(roles) =>
                mutation.mutate({ userId: user.id, roles })
              }
              onViewHistory={() => openHistoryFor(user.id)}
            />
          ))}
          {users.length === 0 && (
            <div className="p-8 text-center text-slate">
              No officer profiles found.
            </div>
          )}
        </div>
      </div>

      <div ref={auditRef}>
        <AuditTrailPanel
          filterUserId={auditFilterUserId}
          onClearFilter={() => setAuditFilterUserId(null)}
          usersById={usersById}
        />
      </div>
    </div>
  );
}

function RoleLegend() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {ALL_ROLES.map((r) => (
        <div
          key={r}
          className="rounded-md border border-line bg-surface-1 p-3"
        >
          <div className="type-label text-foreground">{ROLE_LABEL[r]}</div>
          <div className="type-small text-slate mt-0.5">{ROLE_DESC[r]}</div>
        </div>
      ))}
    </div>
  );
}

interface AuditTrailPanelProps {
  filterUserId: string | null;
  onClearFilter: () => void;
  usersById: Map<string, AdminUserRow>;
}

function AuditTrailPanel({
  filterUserId,
  onClearFilter,
  usersById,
}: AuditTrailPanelProps) {
  const listAuditFn = useSF(listRoleAuditLog);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "role-audit", filterUserId ?? "all"],
    queryFn: () =>
      listAuditFn({ data: filterUserId ? { targetUserId: filterUserId } : {} }),
    staleTime: 15_000,
  });

  const entries = data ?? [];
  const filteredUser = filterUserId ? usersById.get(filterUserId) : null;

  return (
    <section className="rounded-lg border border-line bg-surface-1 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
        <History className="h-4 w-4 text-slate" />
        <div className="flex-1 min-w-0">
          <div className="type-label text-foreground">
            Role Change Audit Trail
          </div>
          <div className="type-small text-slate">
            Immutable record of every role grant and revocation
            (HR-9, PERM-1).
          </div>
        </div>
        {filterUserId && (
          <Badge variant="secondary" className="gap-1">
            Filtered:&nbsp;
            <span className="truncate max-w-[16ch]">
              {filteredUser?.fullName ?? filteredUser?.email ?? filterUserId.slice(0, 8)}
            </span>
            <button
              onClick={onClearFilter}
              className="ml-1 hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportAuditCsv(entries, filteredUser ?? null)}
          disabled={entries.length === 0}
          title="Download audit trail as CSV for compliance sharing"
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Export CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate">Loading audit trail…</div>
      ) : error ? (
        <div className="p-6 text-danger">
          {error instanceof Error ? error.message : "Failed to load audit trail"}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-slate">
          No role changes recorded yet.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <AuditEntryRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditEntryRow({ entry }: { entry: RoleAuditEntry }) {
  const when = new Date(entry.at);
  const whenStr = `${when.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  const actorLabel =
    entry.actor.fullName ??
    entry.actor.email ??
    (entry.actor.id ? `${entry.actor.id.slice(0, 8)}…` : "Unknown");
  const targetLabel =
    entry.target.fullName ??
    entry.target.email ??
    `${entry.target.id.slice(0, 8)}…`;

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="type-body text-foreground">
            <span className="font-medium">{actorLabel}</span>{" "}
            <span className="text-slate">changed roles for</span>{" "}
            <span className="font-medium">{targetLabel}</span>
          </div>
          <div className="type-small text-slate mt-0.5">
            {whenStr}
            {entry.ipAddress && entry.ipAddress !== "server" && (
              <> · IP {entry.ipAddress}</>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.ruleRefs.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px]">
              {r}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.added.length === 0 && entry.removed.length === 0 && (
          <span className="type-small text-slate">No net change recorded.</span>
        )}
        {entry.added.map((r) => (
          <span
            key={`a-${r}`}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 type-small text-emerald-700 dark:text-emerald-300"
          >
            <Plus className="h-3 w-3" />
            {ROLE_LABEL[r] ?? r}
          </span>
        ))}
        {entry.removed.map((r) => (
          <span
            key={`r-${r}`}
            className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-0.5 type-small text-danger"
          >
            <Minus className="h-3 w-3" />
            {ROLE_LABEL[r] ?? r}
          </span>
        ))}
      </div>
    </li>
  );
}

interface UserRowProps {
  user: AdminUserRow;
  disabled: boolean;
  isSelf: boolean;
  onSave: (roles: Role[]) => void;
  onViewHistory: () => void;
}

function UserRow({ user, disabled, isSelf, onSave, onViewHistory }: UserRowProps) {
  const [selected, setSelected] = useState<Set<Role>>(new Set(user.roles));
  const original = useMemo(() => new Set(user.roles), [user.roles]);

  const dirty = useMemo(() => {
    if (selected.size !== original.size) return true;
    for (const r of selected) if (!original.has(r)) return true;
    return false;
  }, [selected, original]);

  const toggle = (role: Role, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(role);
      else next.delete(role);
      return next;
    });
  };

  const wouldRevokeOwnAdmin =
    isSelf && original.has("admin") && !selected.has("admin");

  return (
    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="type-body text-foreground truncate">
            {user.fullName ?? user.email ?? user.id}
          </span>
          {isSelf && (
            <Badge variant="outline" className="text-xs">You</Badge>
          )}
          {user.rank && (
            <Badge variant="secondary" className="text-xs">{user.rank}</Badge>
          )}
        </div>
        <div className="type-small text-slate truncate">
          {user.email ?? "—"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {ALL_ROLES.map((r) => {
          const id = `role-${user.id}-${r}`;
          return (
            <label
              key={r}
              htmlFor={id}
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 cursor-pointer hover:bg-surface-3"
            >
              <Checkbox
                id={id}
                checked={selected.has(r)}
                disabled={disabled}
                onCheckedChange={(v) => toggle(r, v === true)}
              />
              <span className="type-small text-foreground">{ROLE_LABEL[r]}</span>
            </label>
          );
        })}

        <Button
          size="sm"
          variant="ghost"
          onClick={onViewHistory}
          title="View this officer's role change history"
        >
          <History className="mr-1 h-3.5 w-3.5" />
          History
        </Button>

        <Button
          size="sm"
          disabled={!dirty || disabled || wouldRevokeOwnAdmin}
          onClick={() => onSave([...selected])}
        >
          {dirty ? (
            "Save"
          ) : (
            <>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Saved
            </>
          )}
        </Button>
      </div>

      {wouldRevokeOwnAdmin && (
        <p className="type-small text-danger lg:basis-full">
          You cannot revoke your own Administrator role.
        </p>
      )}
    </div>
  );
}
