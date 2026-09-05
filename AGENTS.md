# AGENTS.md

This file provides guidance to Codex when working with code in this
repository: รายรับ-รายจ่าย / "whereisit", deployed at
https://dogexe.github.io/whereisit/. In this project's workflow, Claude Code
owns clarification, specs, and independent review; Codex owns implementation,
testing, and review-fix work. See `docs/WORKFLOW.md` for the full lifecycle.

This file is self-contained for a standalone clone of this repository — no
path here assumes anything outside `whereisit/`.

## Read in this order

1. This file.
2. `CLAUDE.md` — architecture, module boundaries, persistence/sync design,
   the Supabase schema, and every standing implementation lesson this
   project has learned the hard way. Read this before touching `src/`; it is
   not restated here to avoid the two files drifting apart.
3. `docs/SOT.md` — a compact summary of what's actually true about the
   product and its technical state right now. Read this for fast context;
   it points back at `CLAUDE.md`/specs/tickets for detail rather than
   restating them, and the code is authoritative if the two ever disagree.
4. The assigned ticket under `docs/tickets/active/`.
5. The ticket's originating spec under `docs/specs/`.
6. Relevant source and tests for the ticket. Skip `docs/CHANGELOG.md` unless
   historical context is genuinely needed.

Consult `docs/WORKFLOW.md` only when process/handoff details are actually
needed (e.g. the exact build/test commands, the proportional verification
matrix, or how a review-fix round is supposed to work) — it is not required
reading for every ticket.

## Codex's responsibilities

Implementation, testing, and review-fix implementation — not scoping, and
not review. Concretely, on every ticket:

- Work one `Ready` ticket at a time; don't start a second while one is open.
- Don't invent requirements beyond what the ticket and its spec state.
- Don't expand scope silently — if something looks missing, flag it in the
  ticket's Review notes rather than building it unasked.
- Don't weaken or delete an existing test to make a change pass.
- Don't refactor unrelated code while implementing a ticket.
- Run the verification the ticket requires — `docs/WORKFLOW.md`'s
  proportional matrix is the source of truth (`npm test` for pure logic,
  add `npm run build` for state/storage/sync, add `npm run test:e2e` for
  anything touching a screen).
- Inspect the complete diff before finishing — a clean test run is not proof
  nothing unrelated changed.
- Report what verification was actually performed and any unresolved risks;
  don't claim a check happened that didn't.

For a review-fix round: verify each finding against the implementation
yourself before fixing it — a Claude finding is not automatically correct.
Fix confirmed defects, and explain in the ticket's Review notes why any
finding was rejected. Don't adopt optional suggestions unless the ticket
requires them, and don't fold in unrelated cleanup.

## Running and testing locally

See `CLAUDE.md`'s "Running locally" section for the build/serve commands and
exactly what each test layer covers.
