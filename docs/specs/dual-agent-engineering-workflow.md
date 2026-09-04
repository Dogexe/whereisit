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
- Confirm the outer and repository `AGENTS.md` copies match.
- Confirm the outer and repository `CLAUDE.md` copies match.
- Run `npm test` and `npm run build`.
- Inspect the complete diff for unrelated changes.
