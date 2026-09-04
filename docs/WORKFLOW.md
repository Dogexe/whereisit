# Claude + Codex engineering workflow

This repository uses three clear roles:

- **Maintainer:** decides what to build and whether to merge.
- **Claude Code:** clarifies requirements, writes specs and tickets, and reviews
  completed implementation independently.
- **Codex:** implements one ready ticket, verifies it, and fixes confirmed review
  findings.

The normal path is:

`clarify → spec → tickets → implement → review → fix → maintainer merge`

## Choose the smallest useful path

### Tiny, obvious fix

Use `Codex → tests → maintainer review`. A typo or one-line correction usually
does not need a spec or ticket.

### Normal feature or significant behavior change

Use the complete workflow in this document.

### Difficult or intermittent bug

Ask Claude to investigate and identify the root cause first. Turn the confirmed
cause and intended fix into a ticket, then continue with Codex implementation
and Claude review.

## 1. Clarify and specify with Claude

For a non-trivial feature, ask Claude to clarify the goal before editing code:

```text
/spec

Help me clarify this feature. Ask one question at a time. Do not implement it.
When the important decisions are resolved, write the spec in docs/specs/.
```

The spec describes outcomes and constraints, not a line-by-line implementation.
It should cover behavior, edge cases, persistence/sync, offline behavior, i18n,
UI states, testing, and explicit non-goals where relevant.

Before implementation, use `/verify` to define measurable evidence for “done.”

## 2. Create small tickets

Claude turns the accepted spec into files under `docs/tickets/active/`, using
`docs/tickets/TICKET_TEMPLATE.md`.

Each ticket represents one coherent, reviewable outcome. It includes acceptance
criteria, verification, dependencies, and out-of-scope work. A ticket is ready
for Codex only when its status is `Ready` and its requirements are unambiguous.

## 3. Implement one ticket with Codex

Start a Codex task with:

```text
Implement docs/tickets/active/WI-XXX.md.

Follow AGENTS.md. Read the originating spec, CLAUDE.md, relevant code, and
relevant tests. Implement only this ticket and run its required verification.
```

Codex follows `workflows/ship-feature.md`, keeps scope narrow, runs the required
tests, inspects the complete diff, and reports remaining risks. Do not begin with
parallel tickets; learn the handoff loop sequentially first.

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

Return the review findings to the same Codex task:

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

- **Codex cannot run Playwright or open a real browser inside its sandbox**
  (no network access to download Chromium there). Its own verification is
  therefore limited to `npm test` and `npm run build`; `npm run test:e2e`
  and any live/manual browser check are Claude's or the maintainer's
  responsibility to run outside Codex's task, not something to expect back
  in Codex's own verification report. A ticket's verification checklist
  should say so explicitly when it requires e2e or a real-browser check.
- **A backgrounded Codex task doesn't proactively report back when it
  finishes** — retrieving its final output can require repeatedly
  resuming/nudging the relay agent rather than a single wait, especially
  once a long step (like an e2e run) is in progress. Budget for this rather
  than expecting one clean turnaround.

## Later upgrades

Only after several successful sequential tickets should the project consider
GitHub Issues, worktrees, parallel Codex tasks, or ticket automation. None is
required for this workflow to work.
