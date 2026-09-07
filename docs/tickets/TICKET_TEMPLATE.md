# WI-XXX — Short title

Status: Draft

Spec: `docs/specs/example.md`

Codex profile: terra-medium

<!--
Codex profile must be one of: luna-low, terra-medium, sol-high, sol-highest.
terra-medium is the default. See AGENTS.md's "Codex execution profiles"
section for the definitions and selection rule. Before moving Status to
Ready, confirm the profile is still appropriate for the finalized ticket.
Add a line "Profile reason: <one sentence>" below Codex profile only when
the profile is non-default (or when a reason is genuinely useful). The
profile is execution metadata only — it must never influence acceptance
criteria, scope, ticket size, or dependencies.
-->

Risk tier: Medium

<!--
Risk tier must be one of: Low, Medium, High. See docs/WORKFLOW.md's
risk-based verification table for the definitions and what each tier
requires by default. Medium is the default. This sets the ticket's default
verification bar in the Verification section below — it is not a lever on
scope or acceptance criteria, and a spec or the maintainer can always
require more than the tier's default.
-->

## Goal

Describe one small, coherent outcome.

## Acceptance criteria

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Existing related behavior remains unchanged.

## UX / design references

<!--
UI tickets only — delete this whole section for non-UI work.
See docs/UX.md for the rules these lines point at.
-->

- Follow `docs/UX.md`.
- Match existing: <screen / component / pattern>
- Reuse: <existing primitive — name the class or helper>
- New design primitives required by this ticket: none
  <!-- If not "none", list each one and the spec decision that authorizes
       it. An explicit "none" makes any new primitive in the diff a defect. -->
- Mobile (<1024px) behavior: <…>
- Desktop (>=1024px) behavior: <…>

## Implementation guidance

<!--
Optional. Fill only from what you actually verified while investigating or
writing this ticket -- pointers, not guesses. Leave a bullet blank rather
than invent it. Codex starts here instead of re-deriving repo structure,
but should inspect beyond this section whenever evidence contradicts it --
this is a shortcut, not a ceiling. Don't restate rules from
ARCHITECTURE.md/UX.md/SYNC.md; name the one relevant rule instead of
copying it. Delete this section entirely if nothing here is actually known
yet.
-->

- Likely files:
- Likely functions/modules:
- Existing pattern to reuse:
- Relevant tests:
- Known invariants:
- Do not change:
- Escalate back to Claude if:

## Verification

<!--
Default verification is set by this ticket's Risk tier — see
docs/WORKFLOW.md's risk-based verification table. Low: no full suite, no
browser check unless explicitly required. Medium: focused npm test; add
npm run build only if build/runtime behavior is involved; add npm run
test:e2e only if the behavior can't be reasonably covered more cheaply.
High: the full matrix below may still be required. Check off only what
the tier (or the spec/maintainer) actually requires — an unchecked box for
a Low/Medium-tier ticket is expected, not a gap.

During a review-fix round, start with focused verification for each
confirmed defect and rerun the full list only when docs/WORKFLOW.md's
full-gate escalation criteria are met (including cumulative risk across
multiple defects in one round). Docs-only and test-only fixes follow the
carve-outs defined there. The maintainer can always request the full gate
regardless of these rules.
-->

- [ ] Relevant automated tests are added or updated.
- [ ] `npm test` (if the tier calls for it)
- [ ] `npm run test:e2e` (only if a screen changes and the behavior can't be reasonably covered more cheaply)
- [ ] `npm run build` (only if build/runtime behavior is involved)
- [ ] Any required real-browser or deployed check from the spec.
- [ ] Complete diff inspected for unrelated changes.

## Out of scope

- State what this ticket deliberately does not change.

## Dependencies

None.

## Review notes

Record confirmed defects and their resolution here. Keep optional suggestions
clearly separate.
