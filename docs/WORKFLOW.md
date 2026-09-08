# Claude + Codex engineering workflow

This repository uses three clear roles:

- **Maintainer:** decides what to build and whether to merge.
- **Claude Code:** clarifies requirements, writes specs and tickets, and reviews
  completed implementation independently.
- **Codex:** implements one ready ticket, verifies it, and fixes confirmed review
  findings.

The normal path is:

`read current truth → clarify → spec → tickets → implement → verify →
independent review → fix → re-review → maintainer merge → update
persistent project state → next session starts fresh`

**Chat is temporary working context. The repository contains durable
shared memory and current truth.** Anything worth a future session
knowing belongs in `CLAUDE.md`, `docs/SOT.md`, a spec, a ticket, or the
changelog — not only in the conversation that produced it.

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
  `docs/tickets/TICKET_TEMPLATE.md`. Each ticket may start as `Status:
  Draft` with `Codex profile: terra-medium` (the default) while
  requirements are still settling. Before moving a ticket to `Ready`,
  Claude consults the "Codex execution profiles" section of `AGENTS.md`
  — a targeted read of that one section, not the whole file — and confirms
  or updates the profile for the finalized ticket, adding a one-line
  `Profile reason:` only when the profile is non-default (or a reason is
  genuinely useful). The profile is execution metadata for the Codex
  environment; it must never influence acceptance criteria, scope, ticket
  size, or dependency structure. **Claude stops there** — it does not
  start a Codex task unless the maintainer explicitly asks for
  implementation to be delegated.
- The first Claude review of a Codex implementation is always read-only.
  Findings are reported as confirmed defects, kept separate from optional
  suggestions; Codex verifies each confirmed finding against the code
  before fixing it.
- Verification is proportional to the ticket's **risk tier**, not to
  change type alone. Claude assigns the tier when the ticket is created
  (alongside `Codex profile`), using the same categories:

  | Tier | Examples | Default before first handoff |
  |---|---|---|
  | **Low** | docs-only, copy/text, CSS/token-only, small bounded UI wiring, isolated test-only change | No full suite. No browser check unless explicitly required by the ticket or spec. |
  | **Medium** | normal bounded application logic/UI changes | Relevant focused `npm test`. Add `npm run build` only if build/runtime behavior is involved. Add `npm run test:e2e` only if the behavior can't be reasonably covered more cheaply. |
  | **High** | persistence/state ownership, Supabase/sync, auth/security, migrations/schema, concurrency/race conditions, shared primitives with broad blast radius | Full matrix may still be required: `npm test` + `npm run build` + `npm run test:e2e` as relevant. |

  This is the default, not the ceiling: a ticket or spec may explicitly
  declare stronger verification requirements, and the maintainer can
  always request the full gate regardless of tier.

Full verification is a gate, not an inner loop, and — outside the High
tier — not the default gate either. Codex should prefer the cheapest
verification that gives useful evidence for the ticket's actual risk.
While implementing, run at most one narrow relevant check when genuinely
useful — don't run tests/build/e2e after every edit, and don't repeatedly
re-inspect the full diff. Before first handoff, run only what the ticket's
risk tier calls for above; don't automatically run the full
test+build+e2e matrix by default.

"Docs-only" means no application code, tests, build config, workflow
config, or other runtime-affecting file changed. A change meeting that bar
needs no test run at all unless it alters a documented command or behavior
other tooling depends on.

Browser/manual verification is never a default requirement. Do it only
when acceptance genuinely depends on real browser interaction, layout,
focus, keyboard behavior, viewport behavior, or deployed/runtime behavior
— not as routine coverage for every screen change, and not duplicated
across both e2e and a manual check without a specific reason.

**Tool/environment failures:** at most one retry for a verification
failure caused by tooling/environment, and at most one reasonable recovery
attempt. Don't install/reinstall browsers, packages, SDKs, or system
tooling unless the ticket explicitly requires it or the maintainer
approves, and don't enter repeated retry/wait/poll loops. If still
blocked, record the verification as blocked and hand off rather than
escalating retries.

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

For a UI feature the spec also carries a short **`## UX constraints`**
section: follow `docs/UX.md`; name the existing screen/component/pattern
the feature should match and the existing primitive it reuses; state
whether any new design primitive is required (and if so, which decision
authorizes it); and define both mobile and desktop behavior in Thai and
English. Naming the pattern to reuse is Claude's job at spec time, not
Codex's at implementation time.

## 2. Create small tickets

Claude turns the accepted spec into files under `docs/tickets/active/`, using
`docs/tickets/TICKET_TEMPLATE.md`. Each ticket represents one coherent,
reviewable outcome with acceptance criteria, proportional verification,
dependencies, and out-of-scope work, and is marked `Ready` only once its
requirements are unambiguous. Each ticket also carries a `Codex profile`
(assigned per `AGENTS.md`'s "Codex execution profiles" section) — execution
metadata for the Codex environment, never a lever on scope or acceptance
criteria — and a `Risk tier` (Low/Medium/High, per the verification table
above) that sets the default verification the ticket requires. Claude stops
here — implementation starts only once the maintainer explicitly delegates
it.

Claude also fills the ticket's optional `## Implementation guidance`
section from what it actually found while investigating — exact
file/function pointers, the one existing pattern to copy, the relevant
test file, the invariant(s) that bind this change, and explicit "escalate
back to Claude if" triggers. Populate a bullet only from something
actually read; leave it blank rather than guess. This lets Codex skip
`AGENTS.md`'s broader fallback reads for a well-mapped ticket — it's a
navigation shortcut, not a restatement of `ARCHITECTURE.md`/`UX.md`/
`SYNC.md`, and not a substitute for Codex's own judgment once it's in the
code.

## 3. Implement and verify one ticket with Codex

The maintainer (or whatever launches Codex) starts the task using the
ticket's `Codex profile` to pick the model/effort, per `AGENTS.md`. Start a
Codex task with:

```text
Implement docs/tickets/active/WI-XXX.md.

Read only the ticket, its originating spec, relevant source files, and
relevant tests. If the ticket has an Implementation guidance section, verify
its pointers and use it as your starting point instead of AGENTS.md's
broader fallback reads. Skip docs/CHANGELOG.md unless historical context is
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
Read CLAUDE.md and docs/SOT.md, plus docs/UX.md if a screen changed.
Do not modify files.

Check acceptance criteria, correctness, regressions, architecture, persistence
and sync when relevant, test coverage, and scope. Separate confirmed defects
from optional suggestions.
```

The first review is read-only so the reviewer remains independent from the
implementation. The ticket's `## Implementation guidance` section, if any,
is not evidence of correctness — it records where Claude expected the
change to land, not what Codex actually did. Review the diff and the
invariant it names independently, the same as any other claim.

For a UI change, the review also compares the implementation against
`docs/UX.md` and the surrounding existing UI: visual and behavioral
consistency, mobile and desktop behavior, Thai and English layout, and any
unnecessary new CSS variant. **Classify UX findings the same way as any
other:** a violation of a rule documented in `docs/UX.md` is a *defect*; an
undocumented subjective preference is a *suggestion*, never a blocker. If a
finding turns on one of `docs/UX.md`'s open design decisions, it is neither
— raise it as a decision for the maintainer.

## 5. Verify and fix findings with Codex

Resume the same Codex task from step 3 rather than starting a new one — this
keeps its implementation context instead of re-deriving it:

```text
Verify every finding against the implementation. Fix confirmed defects only;
do not adopt optional suggestions unless the ticket requires them. Add regression
coverage where appropriate.
```

Fix the confirmed defect, then run only the narrowest relevant check —
don't rerun a broader suite unless the cumulative fix creates meaningful
regression risk. A documentation-only fix needs no test run at all; a
narrow test-only fix needs only the affected test by default.

Rerun the ticket's full verification gate before completion only when the
fix (or the round as a whole) pushes the change into the High-risk tier —
shared state/persistence/sync, auth/security, migrations/schema,
concurrency, or a shared primitive with broad blast radius — or when the
original gate run is no longer representative of the diff. Judge a
review-fix round with multiple confirmed defects cumulatively, not
fix-by-fix: several individually-narrow fixes across different files or
behaviors can together push a Low/Medium-tier ticket into that territory
even if no single fix would have on its own. When in doubt — or whenever
the maintainer asks for it, regardless of these rules — run the full gate.

A documentation-only fix never needs the full suite rerun — say so
explicitly in the ticket's Review notes.

Claude may then perform a narrow final re-review of the previously confirmed
defects and the ticket's acceptance criteria.

## 6. Merge and complete

The maintainer inspects the diff and decides whether to commit and push. Before
and after pushing to `main`, follow `workflows/release-check.md`; pushing deploys
the application.

After the change is merged:

1. Update the ticket status to `Completed` and move it from
   `docs/tickets/active/` to `docs/tickets/completed/`.
2. Update `docs/SOT.md` if the merge changed current product or technical
   reality — a new capability, a changed technical assumption, a resolved
   limitation, or a change to what's active. Skip this for a meaningless
   internal refactor that doesn't change anything worth knowing about
   current state.
3. Update `docs/CHANGELOG.md` and the originating spec only per their
   existing policies — the changelog when the repository's changelog
   policy says to, the spec only when the settled durable specification
   itself changed (not for every merge that touches its feature).

Source code remains the ultimate executable truth. `docs/SOT.md` is a
concise human/agent-readable summary of important current reality, not a
substitute for inspecting the code.

**Fresh-context principle:** a new agent session should be able to recover
enough context from repository artifacts — `CLAUDE.md`, `docs/SOT.md`,
specs, tickets, the changelog — without depending on the previous chat.
Don't preserve long conversational reasoning just because it occurred;
promote only settled, useful knowledge into the appropriate durable file.
Rejected ideas and exploratory discussion generally shouldn't become
permanent project memory.

## Document ownership

| Artifact | Owns |
| --- | --- |
| `CLAUDE.md` | Always-loaded invariants, Claude's role, and routing to the docs below |
| `docs/ARCHITECTURE.md` | Module boundaries, screens/UI plumbing, standing implementation lessons |
| `docs/UX.md` | Reusable UX / visual / interaction rules, known UI debt, open design decisions |
| `docs/SYNC.md` | Persistence, sync, auth, and the Supabase schema |
| `docs/TESTING.md` | What each test layer covers |
| `AGENTS.md` | Codex entry rules and implementation behavior |
| `docs/SOT.md` | Concise current project/product reality |
| `docs/WORKFLOW.md` | Engineering lifecycle and agent handoffs |
| `docs/ROADMAP.md` | Planned remediation work, its order, and the open product decisions blocking it |
| `docs/AUDIT-*.md` | Point-in-time audit findings and their evidence; ages, so re-verify before acting |
| `docs/specs/` | Durable feature/product behavior |
| `docs/tickets/` | Small execution contracts |
| `docs/CHANGELOG.md` | Historical record of meaningful changes |
| Source code/tests | Executable truth |

If two documents seem to own the same information, fix the ownership rather
than copying the information into both.

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
