# Seaphore — NIMASA Copilot

> Maritime Intelligence Operating System.
> _Evidence first. Explainable always. Officer decides._

Production stack: **React 18 · TypeScript (strict) · TanStack Start · Vite · Tailwind v4 · Supabase (Lovable Cloud)**.

Note on package manager: this project runs on **Bun** (Lovable's sandbox
default). Sprint 0 called for pnpm; we adapted to keep the running app
intact. All commands below are `bun` — swap to `pnpm` locally if you prefer,
the lockfile ignores it.

## Getting started

```bash
bun install
bun run dev          # http://localhost:8080
```

## Scripts

| Script              | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `bun run dev`       | Vite dev server                                              |
| `bun run build`     | Production build                                             |
| `bun run lint`      | ESLint (flat config, `eslint.config.js`) + Prettier          |
| `bun run lint:fix`  | Auto-fix                                                     |
| `bun run format`    | Prettier over the tree                                       |
| `bun run typecheck` | `tsgo --noEmit` (strict mode enforced)                       |
| `bun run test:unit` | Vitest suite in `tests/unit/`                                |
| `bun run test:e2e`  | Playwright suite in `tests/e2e/`                             |
| `bun run validate`  | Lint + typecheck + unit tests + build (mirrors CI)           |
| `bun run storybook` | Storybook on `:6006` — see `.storybook/README.md` to install |

## Project layout

```text
.
├── .github/workflows/     # CI (lint, typecheck, tests, build) + CodeQL
├── .husky/                # pre-commit → lint-staged, commit-msg → WIP guard
├── .storybook/            # main.ts, preview.ts, README (install steps)
├── src/
│   ├── routes/            # TanStack file-based routes (pages + /api/*)
│   ├── components/        # Presentational + shadcn/ui primitives
│   ├── features/          # Vertical slices (investigate, decide, share, …)
│   ├── services/          # Domain services (orchestration engine, adapters)
│   ├── lib/               # Cross-cutting utilities + server functions
│   ├── design-tokens/     # tokens.json (source of truth) + typed accessor
│   ├── mocks/             # Deterministic fixtures for tests + Storybook
│   ├── integrations/      # Auto-generated Supabase clients (do not edit)
│   └── styles.css         # Tailwind v4 @import + @theme (mirrors tokens.json)
├── supabase/migrations/   # Schema + RLS + grants
└── tests/
    ├── unit/              # Vitest
    └── e2e/               # Playwright
```

## Design tokens

`src/design-tokens/tokens.json` is the single source of truth for colours,
typography, spacing, radius, shadow, and z-index. Every visual constant used
in the app must exist here first, then be mirrored into `@theme` in
`src/styles.css` (Tailwind v4 CSS-first config). **No inline styles, no
hardcoded hex values in components.**

Import in TS with `import tokens from "@/design-tokens/tokens.json"` (or the
typed accessor at `src/design-tokens/index.ts`).

## Mock data

`src/mocks/` provides deterministic fixtures (`vessels`, `briefings`,
`officers`, …) for Vitest and Storybook. Never import mocks from route
loaders or product code — real data always flows through Supabase
repositories in `src/services/repositories/`.

## Quality gates

- **TypeScript strict** — enforced by `tsconfig.json`; `bun run typecheck` blocks regressions.
- **ESLint** — flat config at `eslint.config.js` (React, hooks, prettier).
- **Prettier** — `.prettierrc`, run via `bun run format` or the lint pipeline.
- **Husky** — `pre-commit` runs `lint-staged`; `commit-msg` blocks `WIP!/fixup!/squash!` messages.
- **CI** — `.github/workflows/ci.yml` runs lint → typecheck → unit → build on every PR and push to `main`.
- **CodeQL** — weekly + on push to `main`.

## The rules that never change

Every screen carries the immutable footer:

> **Evidence first. Explainable always. Officer decides.**

Every displayed number wears a **confidence chip** (VERIFIED / OBSERVED /
INFERRED / UNCONFIRMED). Every recommendation is officer-actionable. See the
Orchestration Engine (`src/services/orchestration/`) and the 12 Honesty Rules
in `src/lib/compliance/rules.ts`.
