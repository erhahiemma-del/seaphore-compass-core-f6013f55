# Contributing

## One-time local setup

This repository normalizes all text files to **LF**, in the repository and in the
working tree, via [`.gitattributes`](.gitattributes). Git for Windows ships
`core.autocrlf=true` in its **system** config (`C:\Program Files\Git\etc\gitconfig`),
which fights that policy and silently re-dirties hundreds of files. Disable it for
this repository:

```bash
git config --local core.autocrlf false
```

This is `--local`, so it applies to this clone only and leaves your other
repositories untouched.

### Symptom this prevents

If you see a wall of warnings like:

```
warning: in the working copy of 'src/...', LF will be replaced by CRLF the next time Git touches it
```

or `git status` reports hundreds of modified files while `git diff` shows no content
change, your line endings are unnormalized. Run the command above, then renormalize:

```bash
git add --renormalize .
```

Commit the result **on its own**, with no other changes. Renormalization touches
many files at once and is unreviewable if mixed with logic changes.

## Formatting

Formatting is owned by Prettier and enforced in CI by `bun run format:check`.

```bash
bun run format        # write
bun run format:check  # verify (this is what CI runs)
```

Never mix a formatting change with a behavioral change in the same commit.

## Toolchain

| Tool     | Pinned in      | Status                         |
| -------- | -------------- | ------------------------------ |
| Bun      | `.bun-version` | pinned exactly                 |
| Prettier | `package.json` | **not yet pinned** (`^3.7.3`)  |
| ESLint   | `package.json` | **not yet pinned** (`^9.32.0`) |

CI reads the Bun version from `.bun-version`, so local and CI installs resolve
identically.

Prettier and ESLint are still on caret ranges and **should be pinned exactly**.
A floating formatter version reformats the entire repository the moment a patch
release changes a default, producing hundred-file diffs that conflict with
everything in flight. Pinning them requires updating the recorded specifiers in
`bun.lock` in the same change, so it is deliberately left to a follow-up commit.

## Branching (Claude / Lovable / GitHub)

Lovable syncs bidirectionally with `main`. Two writers on one branch is the main
source of conflicts in this repository, so:

1. **Lovable owns `main`.** Do not commit directly to `main` from a local clone.
2. Branch from a freshly pulled `main`; prefix agent-assisted branches `claude/`.
3. **Rebase, don't merge** (`git pull --rebase`). Merge commits against a branch
   Lovable rewrites reproduce the same conflicts repeatedly.
4. Do not run Lovable and a local agent against the working tree concurrently.
   Sequence them.
5. Keep branches short-lived. Conflict volume scales with how long a branch
   stays open.

## Validation

```bash
bun run validate
```

Runs lint, typecheck, unit tests, and build — the same sequence as CI.
