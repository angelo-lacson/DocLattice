# Babysit-PR Skill Design

## Overview

A one-shot skill that brings a PR up to date, fixes all CI failures, addresses Claude bot review comments, and ensures component test coverage with documentation screenshots. Invoked as `/babysit-pr <PR-number-or-URL>`.

## Skill Identity

- **Name**: `babysit-pr`
- **Type**: Technique (rigid — follow steps exactly)
- **Location**: `~/.claude/skills/babysit-pr/SKILL.md`
- **Trigger description**: "Use when a PR needs to be brought up to date with main, CI failures fixed, Claude review comments addressed, and missing component tests added."

## Workflow

Linear sequential execution — each step completes before the next starts.

### Step 1: Open PR

- Parse PR number or URL from args
- Resolve repo owner/name: `gh repo view --json nameWithOwner -q .nameWithOwner`
- `gh pr view <number>` to get branch name, base branch, current status
- `gh pr checkout <number>` to switch to the PR branch

### Step 2: Merge Latest Main

- `git fetch origin main`
- `git merge origin/main --no-edit` into the PR branch (accept default merge message)
- If merge conflicts arise: resolve them using systematic debugging principles (understand the conflict, don't blindly accept either side), then run relevant test suites to verify no regressions
- If clean merge: proceed
- Commit any conflict resolutions with a descriptive message
- **Abort condition**: If >10 files have merge conflicts, stop and ask the user (likely a major divergence)

### Step 3: Fix CI/CD Failures

Check CI status via `gh pr checks <number>`. For each failing check, fix in this order:

1. **Linting/formatting**: `pre-commit run --all-files`, then `cd frontend && yarn lint && yarn fix-styles`
2. **Backend tests**: `docker compose -f test.yml run django pytest -n 4 --dist loadscope`
3. **Frontend unit tests**: `cd frontend && yarn test:unit --run` (must use `--run` to prevent watch mode hanging)
4. **Frontend component tests**: `cd frontend && yarn test:ct` (the `test:ct` script already includes `--reporter=list`)

Fix failures iteratively until all pass locally. **Defer component test failures** to Step 5 if they involve files that Step 5 will create or modify.

Commit fixes after each category with a descriptive message (e.g., "Fix linting issues", "Fix failing backend test in test_notifications"). Follow CLAUDE.md commit rules — no AI credit.

**Abort condition**: If failures seem unrelated to the PR's changes, stop and ask the user.

**Scope**: Only linting, backend tests, frontend unit tests, and frontend component tests. Docker builds, redis integration, and infrastructure failures are out of scope.

### Step 4: Address Claude Review Comments

- Fetch PR comments: `gh api repos/{owner}/{repo}/issues/{number}/comments`
  - Note: Claude bot posts issue-level comments (not line-level review comments), so use the **issues** endpoint, not the pulls endpoint
- Filter to comments where `user.login` is `claude[bot]`
- Identify the most recent review
- For each comment, assess and act:
  - **Valid criticism** (even minor): fix it — spelling, naming, style, logic, anything
  - **Invalid criticism**: do not change code; note in final summary with reasoning
  - **Ambiguous**: err on the side of fixing
- Commit all fixes with a descriptive message referencing which review comments were addressed
- **Abort condition**: If a comment would require architectural changes, stop and ask the user

### Step 5: Ensure Component Tests + Screenshots

- Run `git diff main...HEAD --name-only` to find changed/added `.tsx` files
- Filter to component files only (files that export React components — not utility files, type-only files, or test files)
- For each component file, **search existing test files for imports** of that component (don't assume 1:1 naming — tests like `landing-components.ct.tsx` may cover multiple components)
- If no test covers the component:
  - Create component test following project patterns (test wrappers, MockedProvider, Jotai Provider, etc.)
  - Study existing `.ct.tsx` files for mock patterns, query variable matching, and wrapper usage
  - Add `docScreenshot(page, "{area}--{component}--{state}")` call after assertions confirm desired visual state
  - Import `docScreenshot` from `./utils/docScreenshot`
- If test exists but has no `docScreenshot` call: add one
- Run `cd frontend && yarn test:ct` to verify all component tests pass
- Commit new/modified test files with a descriptive message

**Screenshot naming convention**: `{area}--{component}--{state}` — at least 2 segments, 3 recommended. All lowercase alphanumeric with single hyphens within segments.

**Complexity note**: Writing component tests from scratch is non-trivial. If a component requires complex mocking (deeply nested providers, many GraphQL queries, etc.), create a minimal smoke test that mounts and screenshots the component rather than attempting comprehensive behavioral testing.

### Step 6: Checkpoint — Confirm Before Push

- Present summary to user:
  - What was merged (clean or conflicts resolved)
  - What CI failures were fixed and how
  - Which Claude review comments were addressed vs dismissed
  - What component tests were added/updated
  - What screenshots were added
  - List of all commits created during this process
- Wait for user confirmation
- On approval: `git push origin <branch>`
- On rejection: user can request changes before pushing

## Decision Rules

### CI Failure Triage Order

Linting first (cheapest, auto-fixable) > backend tests > frontend unit tests > component tests last (step 5 may add new ones; defer component test failures to step 5 if applicable).

### Claude Comment Assessment

| Assessment | Action |
|-----------|--------|
| Valid (even minor) | Fix the code |
| Invalid | Don't change code, note in summary |
| Ambiguous | Err toward fixing |

### Component Detection Heuristic

Only `.tsx` files that export React components qualify. Exclude:
- Files in `tests/` directories (test files themselves)
- Files that only export types/interfaces
- Utility/helper files without JSX returns

To find existing test coverage: search `.ct.tsx` files for imports of the component, don't rely on filename matching.

## Integration

### Project Conventions Respected

- `test:ct` script already includes `--reporter=list` (prevents hanging)
- `yarn test:unit --run` to prevent watch mode hanging
- `pytest -n 4 --dist loadscope` for parallel backend tests
- Test wrappers for component tests (never mount directly)
- `docScreenshot` from `frontend/tests/utils/docScreenshot.ts`
- No Claude/AI credit in commits (per CLAUDE.md)
- `yarn run prettier` (not `npx prettier`) for frontend formatting

### Existing Skills — Referenced But Not Invoked

- `systematic-debugging`: principles incorporated directly for merge conflict resolution and CI failure diagnosis
- `verification-before-completion`: the checkpoint step serves this purpose

### Tools Used

- `gh` CLI: PR info, CI status, review comments
- `git`: merge, diff, push
- `docker compose -f test.yml`: backend tests
- `yarn`: frontend tests/linting
- `pre-commit`: backend linting/formatting

## Out of Scope

- Creating PRs (use `finishing-a-development-branch`)
- Running pr-review-toolkit (separate concern)
- Docker build or infrastructure CI failures
- Force-push or rebase (uses merge strategy only)
- Recurring/polling behavior (use `/loop` externally if needed)
