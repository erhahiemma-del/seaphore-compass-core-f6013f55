# Seaphore · Security Audit Report Template

Sprint 12 · Production Hardening. Fill in **Status** (Pass / Warn / Fail),
**Evidence** (file path, migration id, PR link), and **Owner** for every row
before a production deploy.

> Evidence first. Explainable always. Officer decides.

## 1. Boundary (Volume I · Layer 5.1)

| #   | Control                                                                                   | Status | Evidence                | Owner |
| --- | ----------------------------------------------------------------------------------------- | ------ | ----------------------- | ----- |
| B-1 | All privileged tables enable RLS with least-privilege policies                            |        | `supabase/migrations/*` |       |
| B-2 | `GRANT` statements match RLS policies (no anon leaks)                                     |        | migration diff          |       |
| B-3 | `has_role()` is `SECURITY DEFINER` and role table is auth-only                            |        | `user_roles` policies   |       |
| B-4 | Service-role client (`supabaseAdmin`) never imported at module scope of `*.functions.ts`  |        | ripgrep report          |       |
| B-5 | Public API prefix (`/api/public/*`) validates caller (HMAC, apikey, or webhook signature) |        | route handlers          |       |

## 2. Input handling (OWASP A03 · Injection)

| #   | Control                                                                               | Status | Evidence                             | Owner |
| --- | ------------------------------------------------------------------------------------- | ------ | ------------------------------------ | ----- |
| I-1 | Every server function uses `.inputValidator()` with a Zod schema                      |        | grep `createServerFn`                |       |
| I-2 | No string-concatenated SQL — all queries parameterised via Supabase client            |        | ripgrep `raw\(`                      |       |
| I-3 | Identifier whitelists via `assertSafeIdent()` for dynamic `ORDER BY` / column names   |        | `src/services/hardening/security.ts` |       |
| I-4 | Text rendering escapes untrusted content (`escapeHtml`, no `dangerouslySetInnerHTML`) |        | ripgrep                              |       |
| I-5 | File uploads bounded by size, mime, and hash-checked                                  |        | evidence upload path                 |       |

## 3. AuthN / AuthZ (OWASP A01 / A07)

| #   | Control                                                                   | Status | Evidence                | Owner |
| --- | ------------------------------------------------------------------------- | ------ | ----------------------- | ----- |
| A-1 | Session TTL ≤ 30 min with silent refresh; MFA required for Director/Admin |        | `RequireAuth.tsx`       |       |
| A-2 | Policy Engine (Sprint 10) evaluated before every mutating workflow        |        | `src/services/policy/*` |       |
| A-3 | Officer role changes require Administrator + audit entry                  |        | Administration audit    |       |
| A-4 | JWT bearer attached only to same-origin server-function calls             |        | `src/start.ts`          |       |
| A-5 | Password policy enforces HIBP + length; social sign-in providers pinned   |        | Auth settings           |       |

## 4. Cryptography and secrets (OWASP A02 / A08)

| #   | Control                                                                 | Status | Evidence            | Owner |
| --- | ----------------------------------------------------------------------- | ------ | ------------------- | ----- |
| C-1 | Secrets stored via `add_secret` / `generate_secret` — none committed    |        | `.env` diff         |       |
| C-2 | Backup archives encrypted with AES-256 and passphrase rotated quarterly |        | `scripts/backup.sh` |       |
| C-3 | Shared-secret compares use `timingSafeEqual`                            |        | ripgrep             |       |
| C-4 | TLS enforced end-to-end; HSTS set via `SECURITY_HEADERS`                |        | headers audit       |       |

## 5. Resilience (OWASP A04 · Insecure Design)

| #   | Control                                                                         | Status | Evidence                  | Owner |
| --- | ------------------------------------------------------------------------------- | ------ | ------------------------- | ----- |
| R-1 | External-API calls wrapped in `retry()` with bounded budget                     |        | usage sites               |       |
| R-2 | Each external dependency has a named circuit breaker (`hardening.breakers`)     |        | breaker registry          |       |
| R-3 | Rate limiter applied to Copilot query endpoint (`copilotLimiter`)               |        | rate limits config        |       |
| R-4 | Cache TTLs match Layer 2.11 freshness requirements (entity ≤60s, evidence ≤30s) |        | `CACHE_TTLS`              |       |
| R-5 | Offline mode banner and read-only guardrails wired to UI                        |        | `ModeManager` subscribers |       |

## 6. Logging and detection (OWASP A09)

| #   | Control                                                                   | Status | Evidence                        | Owner |
| --- | ------------------------------------------------------------------------- | ------ | ------------------------------- | ----- |
| L-1 | Every mutation writes an immutable `audit_log` row                        |        | triggers + `audit_log` policies |       |
| L-2 | Structured logs (Sprint 11) scrub PII via `officerHash` and `scrub()`     |        | observability config            |       |
| L-3 | Alert rules cover high error rate, slow p95, disagree ratio, offline mode |        | `defaultRules()`                |       |
| L-4 | Circuit-breaker state changes emit alerts to ops channel                  |        | subscriber wiring               |       |

## 7. Disaster recovery

| #   | Control                                                   | Status | Evidence         | Owner |
| --- | --------------------------------------------------------- | ------ | ---------------- | ----- |
| D-1 | `scripts/backup.sh` runs monthly (`pg_cron` schedule)     |        | `cron.job` table |       |
| D-2 | Retention policy enforces 12 months; older backups pruned |        | backup listing   |       |
| D-3 | Restore drill executed and documented in last 90 days     |        | drill runbook    |       |
| D-4 | Backup passphrase stored in secure key store, not repo    |        | secrets manifest |       |

## 8. Load and capacity

| #   | Control                                       | Status | Evidence                             | Owner |
| --- | --------------------------------------------- | ------ | ------------------------------------ | ----- |
| P-1 | 100-officer load test passes with p95 < 3 s   |        | `scripts/loadtest-copilot.ts` output |       |
| P-2 | Cache hit ratio ≥ 60% under load              |        | observability snapshot               |       |
| P-3 | No circuit breakers stuck OPEN after test run |        | breaker registry snapshot            |       |

## Sign-off

- Security lead: __________________ Date: ______
- Ops lead: __________________ Date: ______
- Officer lead: __________________ Date: ______

Any Fail blocks release. Warns require a tracked mitigation ticket linked
from the row above.
