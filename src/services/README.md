# services/

Thin API layer per **FOLD-3**. Every module in this folder wraps
`createServerFn` handlers from `src/lib/api/*.functions.ts`.

- No `fetch()` or `supabase.from(...)` calls in components.
- Components call these service functions, typically through React Query
  (`queryFn` / `mutationFn`).
- The server-side auth middleware, audit logging, rate limiting, and
  immutability triggers still apply because the underlying `createServerFn`
  handlers are unchanged.
