import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, useServerFn } from "@tanstack/react-query";
import { ShieldCheck, Users, AlertCircle, CheckCircle2 } from "lucide-react";
// useServerFn lives in react-start, not react-query — import correctly below.
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
import type { Role } from "@/lib/permissions";

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

function RoleManagementTable() {
  const qc = useQueryClient();
  const listFn = useSF(listUsersWithRoles);
  const setFn = useSF(setUserRoles);
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;

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
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Update failed";
      toast.error("Could not update roles", { description: message });
    },
  });

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

  const users = data ?? [];

  return (
    <div className="space-y-4">
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
            />
          ))}
          {users.length === 0 && (
            <div className="p-8 text-center text-slate">
              No officer profiles found.
            </div>
          )}
        </div>
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

interface UserRowProps {
  user: AdminUserRow;
  disabled: boolean;
  isSelf: boolean;
  onSave: (roles: Role[]) => void;
}

function UserRow({ user, disabled, isSelf, onSave }: UserRowProps) {
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
