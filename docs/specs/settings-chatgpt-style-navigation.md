# Spec: Settings — ChatGPT-style profile header, grouped cards, and sub-page navigation

Status: **Specified, not implemented.** Written from a reference
screenshot of ChatGPT's mobile Settings screen supplied by the
maintainer, via the `/spec` interview in `docs/WORKFLOW.md`.

Tickets: `WI-008` (navigation model), `WI-009` (visual language),
`WI-010` (expand-in-place display rows). They are strictly ordered —
see **Sequencing** below.

## Goal

Replace Settings' current "one long scrolling page of stacked panels,
with `<details>` accordions for the Manage sections" with the structure
the reference screenshot uses:

- a centered profile header (large avatar + name) instead of a screen
  title and a left-aligned profile row,
- gray section labels above grouped rounded cards,
- flat monochrome outline icons on Settings' own chrome rows,
- rows that show their current value on a second line,
- a `›` chevron on rows that navigate to a **real sub-page** with a
  back arrow, and a `⌄` chevron on rows that expand in place,
- a red destructive **Log out** row at the bottom of the list.

This supersedes `docs/specs/settings-redesign-concept-b.md`'s "Concept
A (grouped navigation / drill-down sub-pages) was previewed earlier and
explicitly not chosen" — that decision was reversed deliberately by the
maintainer during this spec's interview, with the screenshot as the
reference. Concept B's collapsible `<details>` groups are retired by
`WI-008`; everything else Concept B established (the `.list-card` /
`.toggle-row` row primitives, and the *purpose* of
`settingsGroupOpen`) is either kept or explicitly replaced below.

## Decisions settled in the interview

Each of these was chosen by the maintainer against alternatives; they
are not defaults to be re-litigated at implementation time.

1. **Drill-down navigation, not just a restyle.** Manage sections stop
   being inline accordions and become real sub-pages with a back arrow.
2. **What drills vs. what expands.** Budgets, Bills, Goals, Categories,
   Accounts and Security become sub-pages (`›`). Language, Appearance
   (dark mode) and Accent color stay on the root list as
   expand-in-place rows (`⌄`), matching the screenshot's own Appearance
   / Accent color rows. Hide amounts stays a plain switch row. Sync
   status, Bill reminders, Install app, Export and Import stay as
   inline rows on the root list — Export/Import already open their own
   bottom sheets and gain nothing from a sub-page.
3. **Real history entries.** Opening a sub-page pushes a
   `history.pushState` entry so the Android hardware back button and
   browser Back return to the Settings root instead of leaving the app.
   This is the app's first `popstate` handling; it is deliberately
   scoped to Settings sub-pages only. Main tab switches stay
   history-less, which is a known inconsistency accepted for now (see
   **Known ceilings**).
4. **Desktop keeps its master–detail split.** One state field
   (`state.settingsSubPage`) drives both renderings: below 1024px its
   value means "which sub-page is open", at 1024px+ the identical value
   means "which detail pane the nav column has selected". Desktop never
   shows a back arrow and never pushes history.
5. **Flat monochrome icons in Settings only.** Settings' own chrome
   rows drop `iconAvatar()`'s tinted coral circle for a bare `icon()`
   glyph. Transaction rows, category rows, Home and Insights keep their
   tinted avatars, because there the tint encodes the category's own
   color and is real data, not decoration. This narrows — for Settings'
   chrome rows only — the app-wide convention
   `docs/specs/settings-manage-row-icons.md` established; that spec's
   actual subject (icons on individual Budget/Bill *data* rows inside
   the Manage lists) is untouched and keeps its avatars.
6. **Centered profile header, no ✎ badge.** Large centered Google photo
   (or initial fallback) with the display name beneath it. No edit
   badge: name and photo come from Google and there is nothing to edit,
   and a badge that looks tappable but isn't is a false affordance.
   Signed out, the same slot shows a neutral placeholder avatar, the
   "not signed in" label, and the existing Sign-in-with-Google button.
7. **A real Log out row.** Sign-out moves out of the profile header
   into a standalone red row at the very bottom of the list, rendered
   only when signed in. Explicitly requested by the maintainer.
8. **The mobile Manage sheet stays.** Add/Edit forms on a Manage
   sub-page still open in the existing shared bottom sheet
   (`renderManageSheet`,
   `docs/specs/settings-manage-swipe-and-sheet.md`). No change to the
   six `xFormHtml()` modules, their save/delete functions, or
   `wireInlineCrud`. Bottom sheets are already this app's mobile form
   pattern (the Add screen uses one).

## Target structure

### Root list (below 1024px)

```
        (avatar)                 ← centered, 72px, Google photo or initial
        Kon Esan                 ← display name; signed out: placeholder
                                   + "not signed in" + Sign in button

  DISPLAY                        ← .settings-section-label
  ┌──────────────────────────┐
  │ ☾  Appearance         ⌄ │   expand in place, subtitle = current value
  │    Dark                  │
  │ ⌾  Accent color       ⌄ │   expand in place, subtitle = ● Coral
  │ 🌐 Language           ⌄ │   expand in place, subtitle = ไทย
  │ 👁 Hide amounts     [o] │   plain switch row, no chevron
  └──────────────────────────┘

  SYNC & DATA
  ┌──────────────────────────┐
  │ ☁  <sync status>  [Sync] │   unchanged behavior
  │ 🔔 Bill reminders   [o] │   unchanged behavior
  │ ⤓  Install app           │   conditional, unchanged
  │ ⭳  Export             › │   opens the existing export sheet
  │ ⭱  Import             › │   opens the existing import sheet
  └──────────────────────────┘

  MANAGE
  ┌──────────────────────────┐
  │ 👛 Budgets       3    › │   sub-page
  │ 🧾 Bills         2    › │   sub-page
  │ 🎯 Goals         1    › │   sub-page
  │ ▦  Categories   18    › │   sub-page
  │ 🏦 Accounts      3    › │   sub-page
  └──────────────────────────┘

  ┌──────────────────────────┐
  │ 🛡 App lock           › │   sub-page (today's Security panel)
  │ ⓘ  Privacy policy     ↗ │   existing external link, as a row
  └──────────────────────────┘

  ┌──────────────────────────┐
  │ ⇥  Log out               │   red, signed-in only
  └──────────────────────────┘

  <footer note>
```

### Sub-page (below 1024px)

```
  ┌──────────────────────────┐
  │ ←   Budgets          +  │   back arrow, title, section's own Add btn
  ├──────────────────────────┤
  │ (the section's existing rows, completely unchanged)
```

The back arrow and the sub-page header exist only below 1024px.

### Desktop (1024px and up)

Structurally unchanged from today: the profile header sits above a
`.settings-layout` split, with the nav column on the left and one
detail panel on the right. The nav column keeps listing every section
including Display and Sync (which are root-inline on mobile), and
`state.settingsSubPage` selects the visible panel exactly as
`state.settingsActiveSection` does today. Desktop gains the new visual
language from `WI-009` but no new navigation behavior.

## State and navigation model

`state.settingsActiveSection` (default `"display"`) is replaced by
`state.settingsSubPage` (default `null`):

| Value | Below 1024px | 1024px and up |
|---|---|---|
| `null` | root list | detail pane shows `display` |
| `"budgets"` … `"accounts"`, `"security"` | that sub-page | that detail pane |
| `"display"`, `"sync"` | (not reachable — they live on the root list) | that detail pane |

`state.settingsGroupOpen` is deleted along with the `<details>` groups
it existed to keep open across re-renders; a sub-page cannot collapse
under itself, so nothing replaces it.

History handling, all of it inside `settings.js`:

- Opening a sub-page below 1024px: set `state.settingsSubPage`, then
  `history.pushState({ settingsSubPage: <id> }, "")` — **no URL
  change**. A same-URL entry is enough for Back to fire `popstate`, and
  avoids inventing a routing scheme that GitHub Pages would have to
  serve and that would imply a shareable deep link this app cannot
  honor after a refresh.
- Closing a sub-page by any deliberate means (back arrow, switching
  main tab away from Settings) calls `history.back()` and does nothing
  else. All actual state clearing happens in one place: the `popstate`
  handler. This keeps a tapped back arrow and a hardware Back on
  exactly the same code path, so they cannot drift.
- The `popstate` handler clears `state.settingsSubPage` and re-renders.
  It must be a no-op when no sub-page is open, so it never interferes
  with the OAuth `history.replaceState` calls already in `main.js:74`
  and `main.js:109`.
- Above 1024px no history entry is ever pushed, because no navigation
  happens — only which pane is visible changes.

## Files this touches

- **`src/screens/settings.js`** — the root list / sub-page split, the
  centered profile header, the Log out row, the history handling, and
  the removal of the `<details>` accordion markup.
- **`src/state.js`** — `settingsActiveSection` → `settingsSubPage`;
  delete `settingsGroupOpen`.
- **`styles.css`** — new grouped-card / row / sub-page-header rules;
  retire `.settings-group*` and `.settings-badge-count`; update the
  1024px block's `[data-active]` selectors to the new field's values.
- **`src/i18n.js`** — new strings only (listed per ticket).
- **`e2e/helpers.js`, `e2e/accounts.spec.js`, `e2e/pin-lock.spec.js`,
  `e2e/category-nesting.spec.js`, `e2e/csv-import.spec.js`** — these
  select `.settings-nav-item[data-settings-section=…]` and
  `.settings-group[data-group="accounts"] summary .label`, both of
  which this spec removes or renames. Updating them is part of
  `WI-008`, not follow-up work.

## Explicitly out of scope

- No schema, storage, or sync changes. No Supabase migration.
- No changes to `wireInlineCrud`, `renderManageSheet`, the six
  `xFormHtml()` modules, or any save/delete/contribute function.
- No changes to `manage-row-swipe.js` or `tx-row.js` — the swipe
  behavior on Manage rows carries into the sub-pages untouched (this is
  what makes `WI-005` independent of this spec; see **Sequencing**).
- No editable display name or avatar. Decision 6 rejected the ✎ badge;
  if that is ever wanted it is a new synced field and needs its own
  spec.
- No `iconAvatar()` changes outside Settings' chrome rows.
- No history integration for main tab switches.
- No URL-addressable / refreshable deep links into a sub-page.

## Known ceilings (deliberate, not defects)

- **Refreshing while a sub-page is open returns to the Settings root.**
  Accepted: there is no URL to restore from, by decision 3.
- **A stale history entry survives leaving the Settings tab.** Mitigated
  by having tab-switch call `history.back()` too, but a race (e.g.
  rapid double tab switch) can still leave one extra entry, costing one
  extra Back press before the app exits. Not worth a history-stack
  bookkeeping layer for a single-level sub-page.
- **Main tabs remain history-less**, so Back from the Settings *root*
  still exits the app rather than returning to Home. Fixing that is a
  router-wide change and is deliberately not in this spec.

## Sequencing

1. **`WI-005` first** (already `Ready`, unrelated files). Its
   acceptance criterion "Desktop (1024px+) Settings layout is
   pixel-unchanged" is true today and becomes ambiguous once `WI-009`
   restyles that layout, so it should land before this spec's tickets
   rather than after.
2. **`WI-008`** — navigation model. Ships functional sub-pages while
   deliberately reusing today's existing row styling, so the diff is
   structural only and reviewable as such.
3. **`WI-009`** — visual language, applied to the structure `WI-008`
   produced.
4. **`WI-010`** — expand-in-place Appearance / Accent color / Language
   rows.

Each ticket must leave `npm test`, `npm run test:e2e` and
`npm run build` green on its own.

## Verification plan

Per `docs/WORKFLOW.md`'s proportional matrix this is a **Screen / UI**
change, so every ticket requires `npm test` + `npm run test:e2e` +
`npm run build`. Beyond that, and per this project's standing rule that
navigation-ordering behavior must be verified against a real browser
rather than read off the code:

1. **Hardware/browser Back (WI-008, mandatory real-browser check).**
   Build, serve `dist/`, open at a mobile viewport, drill into a Manage
   sub-page, press browser Back: must return to the Settings root, not
   leave the app. Then press Back again from the root: must leave as
   before. Repeat for the on-screen back arrow and confirm both paths
   land in the identical state.
2. **Navigation ordering (WI-008).** With a sub-page open, switch to
   another main tab, then press Back — confirm the app does not jump
   back into Settings unexpectedly, and that `state.settingsSubPage` is
   clear. This is the ordering-race class this project's rules call out
   specifically, and it only surfaces by triggering it live.
3. **Desktop parity (WI-008/WI-009).** At 1280px confirm the nav column
   still selects panels for all sections, no back arrow appears, and no
   history entry is pushed (press Back from a selected pane — it must
   leave the app, not switch panes).
4. **Every existing Settings action still works** after each ticket:
   sign in/out, language, accent, dark mode, hide amounts, sync now,
   bill reminders, install prompt, export, import, PIN set/remove, and
   add/edit/delete for all five Manage sections including the mobile
   sheet's icon picker.
5. **Contrast (WI-009).** The new flat monochrome icons, the gray
   section labels, and the red Log out row must each be measured with
   `getComputedStyle` + relative luminance in **both** themes — 4.5:1
   for text, 3:1 for icons. This project has shipped two separate
   contrast regressions in exactly this spot before
   (`docs/specs/settings-spacing-and-contrast.md`), including one where
   a theme-aware token paired with a theme-invariant background made the
   "fix" silently do nothing. Do not accept a screenshot as proof.
6. **Spacing (WI-009).** New gaps must come from the existing
   `--space-*` scale; verify the rendered values with
   `getBoundingClientRect`, same method as the three prior spacing
   passes.
