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
2. `CLAUDE.md` — always-loaded invariants and routing, plus the two docs it
   points to for detail: `docs/ARCHITECTURE.md` (module boundaries, screens,
   standing implementation lessons) and `docs/SYNC.md` (persistence/sync
   design and the Supabase schema). Read these before touching `src/`; not
   restated here to avoid the files drifting apart.
3. `docs/SOT.md` — a compact summary of what's actually true about the
   product and its technical state right now. Read this for fast context;
   it points back at `CLAUDE.md`/specs/tickets for detail rather than
   restating them, and the code is authoritative if the two ever disagree.
4. The assigned ticket under `docs/tickets/active/`.
5. The ticket's originating spec under `docs/specs/`.
6. `docs/UX.md` — whenever the ticket carries a "UX / design references"
   section, or otherwise changes what a screen renders. It is the
   authoritative source for reusable UX/visual/interaction rules, the
   known drift that must *not* be copied, and the design decisions that
   are deliberately still open.
7. Relevant source and tests for the ticket. Skip `docs/CHANGELOG.md` unless
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
- For UI work, follow `docs/UX.md` and reuse the existing screen/component
  /primitive the ticket names. Don't introduce a new spacing, color,
  typography, radius, icon, or interaction primitive unless the ticket
  explicitly requires it, and don't copy a pattern listed there as known
  UI debt.
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

## Codex execution profiles

**This section is the single authoritative source for Codex profile
definitions and selection.** Every `Ready` ticket carries a `Codex profile`
field, assigned by Claude when the ticket is created (see `docs/WORKFLOW.md`
for when that happens). The profile is a recommendation for the Codex
execution environment — not permission to expand scope, and it must never
change acceptance criteria, scope, ticket size, or dependency structure.

Use exactly one of these four profile names — no arbitrary free-text names:

### `luna-low`

Use for tiny mechanical edits, simple documentation changes, renames,
trivial test additions, and other low-risk, tightly bounded work.

Intended Codex setting: GPT-5.6 Luna, low effort.

### `terra-medium` (default)

Use for normal Ready tickets: clear, bounded implementation work, ordinary
UI changes, ordinary feature work with settled requirements, and
straightforward tests/refactors. This is the default unless the ticket
clearly needs more or less reasoning.

Intended Codex setting: GPT-5.6 Terra, medium effort.

### `sol-high`

Use for difficult debugging, state-management changes, local persistence
changes, Supabase sync changes, database migrations, authentication or
account-isolation work, security-sensitive changes, concurrency or
race-condition issues, subtle regression fixes, large/risky refactors, or
any task whose failure mode isn't yet well understood.

Intended Codex setting: GPT-5.6 Sol, high effort.

### `sol-highest`

Reserved for exceptional work only: unusually difficult architecture
changes, high-consequence migrations, deeply ambiguous bugs after
investigation, or a task where `sol-high` has already failed to produce a
reliable solution. Never select this merely because a task is large — it's
about complexity/consequence or a prior escalation failure, not size.

Intended Codex setting: GPT-5.6 Sol, highest available effort. Do not use
by default.

### Selection rule

Classify in this order, and prefer the lower profile when uncertain between
two unless the risk or complexity clearly justifies escalating:

1. Tiny and mechanical? → `luna-low`
2. Clear, bounded, and ordinary? → `terra-medium`
3. Touches risky state, persistence, sync, migrations, auth, security,
   concurrency, or difficult debugging? → `sol-high`
4. Genuinely exceptional/high-consequence, or `sol-high` already failed?
   → `sol-highest`

### How Codex should interpret the profile

- The ticket's `Codex profile` is a recommended execution profile, not
  permission to expand scope — implement only what the ticket and its spec
  state, regardless of which profile is assigned.
- If the actual configured model/effort in the Codex environment differs
  from the ticket's stated profile, still follow the ticket normally; don't
  treat the mismatch as license to change scope or behavior.
- Report which profile you actually ran under, if that's knowable, alongside
  the rest of your verification report.
- If the assigned profile looks clearly underpowered for risk discovered
  while implementing, flag that in the ticket's Review notes rather than
  silently changing scope or expanding the task yourself.
