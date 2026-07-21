
# Authentication Overhaul + Dev Auth Mode

## Root cause (current instability)

1. **Server functions require a real Supabase JWT.** The `requireSupabaseAuth` middleware validates a 3-part JWT via `getClaims`. In Dev Bypass, `buildMockSession()` produces `access_token: "dev-bypass-token"` (not a JWT), so `attachSupabaseAuth` either attaches nothing or attaches a token that fails validation → every protected server fn returns `401 Unauthorized`. Individual features have been patched ad-hoc to fall back to direct Supabase calls, which is why the fixes keep repeating for each new page.
2. **No real dev users exist.** Bypass fabricates a mock session client-side only; the DB has no matching `auth.users` row, so RLS-scoped reads that filter on `auth.uid()` return empty and role lookups miss.
3. **Auth state race.** `useAuth` starts a 4-second fallback timer that force-enables bypass when Supabase is slow — this silently masks real auth failures in dev and can flip state mid-render.
4. **Two competing "dev mode" concepts** (env `VITE_DEV_BYPASS_AUTH` + persisted store) with no single source of truth, and production has no hard guard beyond `import.meta.env.PROD`.

## Fix strategy

Stop faking sessions on the client. Instead, seed **real** Supabase users for the four roles and use `signInWithPassword` under the hood for one-click dev login. That means every existing code path (server fns, RLS, role hooks) works unmodified — the only dev-specific surface is the login UI + a command palette.

## Deliverables

### 1. Real dev users (migration)
- Migration seeds four confirmed users in `auth.users` (`admin@seaphore.local`, `director@…`, `officer@…`, `analyst@…`) with a known dev password from `DEV_SEED_PASSWORD` env (fallback constant), plus their `user_roles` rows.
- Migration is idempotent and gated: only inserts rows whose emails end in `@seaphore.local`. Safe in prod (creates locked accounts with a random-per-project password if the env is unset; documented as "dev accounts — rotate or delete in prod").

### 2. Single dev-mode source of truth
- New `src/lib/dev/env.ts` exporting `IS_DEV_BUILD = !import.meta.env.PROD` and `DEV_AUTH_ENABLED = IS_DEV_BUILD` (tree-shaken to `false` in prod). All dev code imports from here.
- Delete the client-side "mock session" path: `buildMockSession`, `MOCK_OFFICER_ID`, `useIsDevBypass`, `DEV_ENV_BYPASS`. Rip out the per-feature `devBypass` branches in Administration, AdministrationCenter, CopilotWorkspace, admin/osint — they become unnecessary once real sessions exist.

### 3. New dev-only auth module `src/lib/dev/quick-login.ts`
- `quickLoginAs(role)` → `supabase.auth.signInWithPassword({...})`, then navigates to the role's landing page. Guarded by `if (!DEV_AUTH_ENABLED) throw`. Target < 300 ms (single round trip).
- Rich diagnostics: on failure returns `{ stage, message, cause, fix }` shown in the Diagnostics panel.

### 4. Auth page changes (UI preserved)
- Keep existing background, glassmorphism, branding, layout, role tabs.
- Under the tabs in dev builds: replace the password form with a **Quick Development Access Panel** — four role cards (Administrator/Director/Officer/Analyst) each showing role, permissions summary, landing page, and a "Quick Login" button that calls `quickLoginAs`.
- In prod builds the file's dev branch is dead-code-eliminated (`if (DEV_AUTH_ENABLED)` around the panel + import).

### 5. Hidden Dev Command Palette (Ctrl+Shift+D)
- New `src/components/dev/DevCommandPalette.tsx` mounted from `__root.tsx` behind `{DEV_AUTH_ENABLED && <DevCommandPalette />}`.
- Commands: Login as {role} ×4, Reset Session, Clear Cache (queryClient.clear + localStorage prune), Seed Demo Data (calls existing seed fns), Open Diagnostics, View Session/Role/Permissions.

### 6. Auth Diagnostics Panel
- `src/components/dev/AuthDiagnostics.tsx` — opened from command palette. Shows: provider, env, session state, current user, role, JWT decoded header/expiry, Supabase URL reachability (ping `auth/v1/health`), DB connection (SELECT 1 via RPC), role resolution, RequireAuth state, last redirect target, error stack, suggested fix.

### 7. Session lifecycle cleanup
- Remove `useAuth`'s 4-second bypass fallback. Real errors surface into diagnostics instead of silently switching modes.
- `performLogout` unchanged — already correct.

### 8. Production safety
- Wrap every dev import site with `DEV_AUTH_ENABLED &&` so Vite/Rollup tree-shakes the dev modules out of the prod bundle.
- Add build check: `scripts/verify-prod-bundle.mjs` greps the built assets for `@seaphore.local`, `DevCommandPalette`, `quickLoginAs` — fails CI if found. Wired into the existing `.github/workflows/ci.yml`.
- Migration's dev users only work in prod if someone knows the seed password; document rotating/deleting after deployment.

## Files touched (summary)

- **New**: `supabase migration seed_dev_users`, `src/lib/dev/env.ts`, `src/lib/dev/quick-login.ts`, `src/lib/dev/diagnostics.ts`, `src/components/dev/DevCommandPalette.tsx`, `src/components/dev/AuthDiagnostics.tsx`, `src/components/dev/QuickAccessPanel.tsx`, `scripts/verify-prod-bundle.mjs`.
- **Modified**: `src/routes/auth.tsx` (swap in QuickAccessPanel in dev), `src/hooks/use-auth.ts` (drop bypass fallback + mock session), `src/routes/__root.tsx` (mount palette), `src/features/administration/Administration.tsx`, `src/features/administration/AdministrationCenter.tsx`, `src/components/copilot/CopilotWorkspace.tsx`, `src/routes/admin.osint.tsx`, `src/hooks/use-permissions.ts` (remove devBypass forks), `src/stores/dev-mode.store.ts` (deprecate/remove), `src/lib/dev/dev-mode.ts` (deprecate/remove), `src/lib/dev/role-dashboards.ts` (add landing paths).
- **Delete**: legacy mock-session helpers after references are cleared.

## Validation

For each of Administrator, Director, Officer, Analyst:
1. Click role card on `/auth` → lands on the role's dashboard in <300 ms.
2. Refresh → session persists (real Supabase session in localStorage).
3. Navigate to Administration / Mission Control / Copilot — server fns succeed (no 401), RLS returns proper rows.
4. Logout → cache cleared, returns to `/auth`.
5. Ctrl+Shift+D opens palette, diagnostics show live JWT + role.
6. Production build: `scripts/verify-prod-bundle.mjs` passes; `/auth` renders the original password form only.

## Technical notes

- **Why real users beats mock sessions**: eliminates the entire `devBypass` branching pattern that's been creeping through the codebase. One integration point (Supabase) instead of two auth realities.
- **Password**: uses `DEV_SEED_PASSWORD` env (Lovable Cloud secret) or a strong default. Migration inserts via `auth.admin_create_user`-equivalent SQL using `crypt()` from `pgcrypto`.
- **Landing pages**: Administrator→`/`, Director→`/`, Officer→`/`, Analyst→`/detect` (mapped in `role-dashboards.ts`; brief supports the requested `/dashboard`, `/executive`, `/operations`, `/analytics` names but those routes don't exist yet in Seaphore — we map to nearest existing routes and can add aliases if you want the exact paths).
