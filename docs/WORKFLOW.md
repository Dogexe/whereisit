# Claude + Codex engineering workflow

This repository uses three clear roles:

- **Maintainer:** decides what to build and whether to merge.
- **Claude Code:** clarifies requirements, writes specs and tickets, and reviews
  completed implementation independently.
- **Codex:** implements one ready ticket, verifies it, and fixes confirmed review
  findings.

The normal path is:

`clarify → spec → tickets → implement → review → fix → maintainer merge`

## Standing defaults

These apply automatically, every session — the maintainer does not need to
restate them in the prompt.

- Claude Code loads `CLAUDE.md` on every session start in this repo and
  follows this file for any non-trivial feature or significant bug.
- **Minimum prompt to start a normal feature:**

  ```text
  /spec

  I want [feature].
  Do not implement it yet.
  ```

  On seeing this, Claude clarifies requirements one question at a time,
  writes or updates the spec in `docs/specs/`, defines measurable
  verification for it (see `/verify`), and creates one or more small
  `Ready` tickets under `docs/tickets/active/` using
  `docs/tickets/TICKET_TEMPLATE.md`. **Claude stops there** — it does not
  start a Codex task unless the maintainer explicitly asks for
  implementation to be delegated.
- The first Claude review of a Codex implementation is always read-only.
  Findings are reported as confirmed defects, kept separate from optional
  suggestions; Codex verifies each confirmed finding against the code
  before fixing it.
- Verification is proportional to what changed:

  | Change type | Required |
  |---|---|
  | Pure logic | `npm test` |
  | State / storage / sync | `npm test` + `npm run build` |
  | Screen / UI | `npm test` + `npm run test:e2e` + `npm run build` |
  | Anything this project's own rules call out | add the real-browser or deployed check they require |

## Choose the smallest useful path

### Tiny, obvious fix

Use `Codex → tests → maintainer review`. A typo or one-line correction usually
does not need a spec or ticket.

### Normal feature or significant behavior change

Use the complete workflow below, starting from the minimum prompt in
**Standing defaults**.

### Difficult or intermittent bug

Ask Claude to investigate and identify the root cause first. Turn the confirmed
cause and intended fix into a ticket, then continue with Codex implementation
and Claude review.

## 1. Clarify and specify with Claude

Send the minimum prompt from **Standing defaults**. The resulting spec
describes outcomes and constraints, not a line-by-line implementation — it
covers behavior, edge cases, persistence/sync, offline behavior, i18n, UI
states, testing, and explicit non-goals where relevant.

## 2. Create small tickets

Claude turns the accepted spec into files under `docs/tickets/active/`, using
`docs/tickets/TICKET_TEMPLATE.md`. Each ticket represents one coherent,
reviewable outcome with acceptance criteria, proportional verification,
dependencies, and out-of-scope work, and is marked `Ready` only once its
requirements are unambiguous. Claude stops here — implementation starts only
once the maintainer explicitly delegates it.

## 3. Implement and verify one ticket with Codex

Start a Codex task with:

```text
Implement docs/tickets/active/WI-XXX.md.

Read only the ticket, its originating spec, relevant source files, and
relevant tests. Skip docs/CHANGELOG.md unless historical context is
genuinely needed. Implement only this ticket and run the verification it
requires.
```

Codex follows `workflows/ship-feature.md`, keeps scope narrow, runs the
required verification, inspects the complete diff, and reports remaining
risks. Do not begin with parallel tickets; learn the handoff loop
sequentially first.

## 4. Review independently with Claude

Use a fresh Claude session when practical:

```text
Review docs/tickets/active/WI-XXX.md against its spec and the current git diff.
Read CLAUDE.md and docs/WORKFLOW.md. Do not modify files.

Check acceptance criteria, correctness, regressions, architecture, persistence
and sync when relevant, test coverage, and scope. Separate confirmed defects
from optional suggestions.
```

The first review is read-only so the reviewer remains independent from the
implementation.

## 5. Verify and fix findings with Codex

Resume the same Codex task from step 3 rather than starting a new one — this
keeps its implementation context instead of re-deriving it:

```text
Verify every finding against the implementation. Fix confirmed defects only;
do not adopt optional suggestions unless the ticket requires them. Add regression
coverage where appropriate, then rerun the ticket's verification.
```

Claude may then perform a narrow final re-review of the previously confirmed
defects and the ticket's acceptance criteria.

## 6. Merge and complete

The maintainer inspects the diff and decides whether to commit and push. Before
and after pushing to `main`, follow `workflows/release-check.md`; pushing deploys
the application.

After the change is merged, update the ticket status to `Completed` and move it
from `docs/tickets/active/` to `docs/tickets/completed/`. Keep the originating
spec and `docs/CHANGELOG.md` current with what actually shipped.

## Known limitations

- **Codex can run Playwright and open a real browser**, given browser-launch
  permission — a prior version of this document said Codex could never do
  this at all, which was wrong. The actual failure observed was
  `browserType.launch: spawn EPERM`; once browser-launch permission was
  granted and the task rerun, all 15 E2E tests passed in the same
  environment. If a Codex task hits that error, grant browser-launch
  permission and rerun it rather than assuming e2e must be delegated
  elsewhere. Only hand `npm run test:e2e` to Claude or the maintainer
  instead when a specific environment genuinely cannot launch Chromium.
- **A backgrounded Codex task doesn't proactively report back when it
  finishes** — retrieving its final output can require repeatedly
  resuming/nudging the relay agent rather than a single wait, especially
  once a long step (like an e2e run) is in progress. Budget for this rather
  than expecting one clean turnaround.

## Later upgrades

Only after several successful sequential tickets should the project consider
GitHub Issues, worktrees, parallel Codex tasks, or ticket automation. None is
required for this workflow to work.
