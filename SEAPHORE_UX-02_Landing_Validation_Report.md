# SEAPHORE · UX-02 Investigation Landing — Validation Report

**Scope:** NIMASA Copilot empty state (`/copilot` → `InvestigationLanding`)
**Date:** 2026-07-26
**Method:** Automated UI tests (Vitest + Testing Library) and browser tests (Playwright, Chromium)
**Verdict:** PASS — with one documented viewport caveat.

---

## 1. What was validated

| # | Claim under test | Result |
|---|---|---|
| 1 | The empty state is fully usable without scrolling | PASS at ≥ 900 px viewport height (see §4) |
| 2 | Exactly six Quick Start cards render | PASS |
| 3 | Each card inserts the correct, subject-aware prompt | PASS (6/6) |
| 4 | A card stages the prompt and never auto-submits | PASS |
| 5 | Focus returns to the command bar after a card click | PASS |
| 6 | Enter submits, Shift+Enter inserts a newline | PASS |

---

## 2. Quick Start prompt contract

Prompts are personalised with the active investigation subject (`{subject}`, e.g. *MV Ocean Pearl*).

| Card | Prompt inserted into the command bar |
|---|---|
| Investigate Vessel | `Investigate {subject}` |
| Ownership | `Explain the ownership structure of {subject}` |
| Sanctions | `Screen {subject} and its operator for sanctions exposure` |
| Cargo | `Analyze the cargo and manifests for {subject}` |
| AIS Replay | `Check AIS activity and dark periods for {subject}` |
| Revenue | `Assess revenue leakage risk for {subject}` |

Every card routes through the same `onSubmit` path as typed input — the single canonical pipeline (SSOT) is preserved. Clicking a card is a *recommendation*: the officer reviews the wording and presses Enter. **System recommends; officer decides.**

---

## 3. Test assets

| File | Type | Tests |
|---|---|---|
| `tests/unit/investigation-landing.test.tsx` | Vitest + jsdom (no network, hooks stubbed) | 10 |
| `tests/e2e/investigation-landing.spec.ts` | Playwright (dev-bypass officer session) | 7 |

Run them with:

```bash
bun run test:unit            # or: bunx vitest run tests/unit/investigation-landing.test.tsx
bunx playwright test tests/e2e/investigation-landing.spec.ts
```

Stable hooks added for testing only (no behavioural change):
`data-testid="investigation-landing"`, `data-testid="quick-start-grid"`, `data-testid="copilot-workspace-scroll"`.

### Latest run

```
tests/unit/investigation-landing.test.tsx   10 passed
tests/e2e/investigation-landing.spec.ts      7 passed  (chromium, 28.1s)
```

---

## 4. No-scroll finding (measured, not assumed)

The workspace column (`copilot-workspace-scroll`) reports **`scrollHeight === clientHeight`** in the empty state at every viewport tested — the column itself never produces a scrollbar.

Visibility of the last Quick Start row against the browser viewport:

| Viewport | Bottom edge of last card | Fits without scrolling |
|---|---|---|
| 1440 × 900 (laptop baseline) | inside viewport | Yes |
| 1280 × 1800 (tall desktop) | inside viewport | Yes |
| 1280 × 720 (short laptop) | ≈ 767 px (≈ 47 px below the fold) | No — page-level scroll of ~47 px |

**Assertion in CI:** the empty-state test pins the honest baseline of **1440 × 900** and asserts both that the workspace column does not overflow and that the last Quick Start card's bottom edge is inside the viewport.

**Caveat (open, documented):** on 720 px-tall windows the six-card row sits marginally below the fold because of the fixed chrome above it (app header, orchestration bar, intelligence ribbon). This is a layout-density question for the surrounding shell rather than the landing component, and is not addressed by this sprint.

---

Evidence first. Explainable always. Officer decides.
