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

## Verification

- [ ] Relevant automated tests are added or updated.
- [ ] `npm test`
- [ ] `npm run test:e2e` if a screen changes.
- [ ] `npm run build`
- [ ] Any required real-browser or deployed check from the spec.
- [ ] Complete diff inspected for unrelated changes.

## Out of scope

- State what this ticket deliberately does not change.

## Dependencies

None.

## Review notes

Record confirmed defects and their resolution here. Keep optional suggestions
clearly separate.
