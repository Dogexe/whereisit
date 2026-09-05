# Dual-agent engineering workflow

Status: Adopted

## Goal

Use Claude Code for requirements clarification and independent review, Codex
for implementation, and the maintainer for scope and merge decisions. Preserve
the repository's existing specification, verification, testing, documentation,
and release practices.

## Decisions

- Markdown files in `docs/tickets/` are the initial ticket system.
- Normal features follow: clarify → spec → tickets → implement → review → fix
  → maintainer merge.
- Tiny, obvious fixes may skip the spec and ticket stages.
- Difficult or intermittent bugs begin with investigation before a fix ticket.
- One Codex task implements one ready ticket. Parallel ticket work is deferred
  until the sequential workflow is familiar.
- Claude's first review is read-only and separates confirmed defects from
  optional suggestions. Codex verifies findings before changing code.
- Existing repository test and release SOPs remain authoritative.
- `CLAUDE.md` and `AGENTS.md` are self-contained for this repository — no
  path assumes a parent workspace directory, so a standalone clone works
  unmodified.
- `docs/SOT.md` is a persistent, compact "current state" summary, added so a
  fresh agent session can recover product/technical reality quickly without
  reading the full changelog. It is not a second changelog, spec, or
  backlog — see `docs/WORKFLOW.md`'s Document ownership table. A meaningful
  merge's post-merge step now includes updating it when current reality
  actually changed.

## Acceptance criteria

- Both agent instruction files point to one shared workflow.
- Active and completed ticket locations exist with a reusable template.
- The shared workflow explains responsibilities, handoffs, status changes, and
  verification in plain language.
- A new contributor can copy prompts from the workflow to run a complete cycle.

## Out of scope

- Installing third-party skill packages.
- GitHub Issues, automated ticket movement, worktrees, or parallel agents.
- Changing application behavior, dependencies, or data formats.

## Verification

- Check all referenced files and directories exist.
- `CLAUDE.md` and `AGENTS.md` are self-contained for a standalone clone of
  this repository (no path assumes a parent workspace directory).
- Run `npm test` and `npm run build`.
- Inspect the complete diff for unrelated changes.
