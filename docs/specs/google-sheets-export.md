# Spec: Export to Google Sheets

Status: **built and working end-to-end**, verified live with a real
Google account. The Google Cloud Console setup below was completed by
the user (a step Claude can't do on someone else's Google account) and
the real Client ID is now in `sheets-export.js`, replacing the
placeholder. Confirmed live: clicking the row triggers Google's consent
popup requesting only the narrow `drive.file` permission, approving it
creates a new spreadsheet, and it opens automatically in a new tab with
data in place.

The automated browser used for earlier verification steps in this repo
couldn't complete this particular check itself — Google's OAuth popup
was blocked by that browser's popup blocker (confirmed via console:
`GSI_LOGGER: Failed to open popup window`), and granting an OAuth
permission is something to leave to the user's own judgment and account
regardless. The user ran the actual click-through-and-approve flow
themselves in a normal browser and confirmed it worked.

## Goal

Add a one-way "Export to Google Sheets" action next to the existing
CSV/JSON export, so the user can get a live Google Sheet snapshot of
their data without needing to download a file and re-upload it
manually. Lives as a third row in Settings' "Sync & Data" card,
alongside the existing CSV/JSON export rows.

## Decisions (confirmed via interview)

1. **Content**: the exported spreadsheet contains transactions (same
   columns as the CSV export: date, type, category, note, amount) plus
   separate sheet tabs for budgets, bills, and savings goals — a fuller
   snapshot, not just transactions.
2. **Lifecycle**: every click creates a **brand-new spreadsheet**
   (e.g. named "whereisit export 2026-08-25"), never updates or
   overwrites a previous one. Simplest to build, no spreadsheet ID to
   track or persist, no merge/overwrite risk.
3. **Auth independence**: exporting works whether or not the user is
   signed in with Google for Supabase sync — matches the app's
   local-first design where everything else works signed-out too.
4. **Scope**: `https://www.googleapis.com/auth/drive.file`, not the
   broader `.../auth/spreadsheets`. `drive.file` only grants access to
   files the app itself creates, which is exactly what "always create a
   new spreadsheet" needs — and it means Google's consent screen shows
   a narrower, less alarming permission request, and doesn't have the
   same additional-verification burden as requesting broad Sheets
   access would as a personal/low-user-count app.
5. **No new npm dependency**: use Google Identity Services (GIS) for
   auth (a CDN `<script>` tag, same pattern as the existing Supabase JS
   and Lucide CDN tags) and plain `fetch()` calls against the Sheets API
   v4 REST endpoints — not the heavier `gapi` client library, not
   `googleapis` from npm.
6. **New OAuth Client ID**, added to the user's *existing* Google Cloud
   project (already has one, from setting up Supabase's Google
   sign-in) — a separate credential from whatever Supabase uses
   internally, since Supabase's OAuth grant only carries basic
   profile/email scope, not Sheets access.

## What the user needs to do first (Google Cloud Console)

This part cannot be done by Claude — it requires access to the user's
own Google Cloud account.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
   and select the existing project (the one used for Supabase's Google
   sign-in).
2. **APIs & Services → Library**: search for "Google Sheets API" and
   enable it, if not already enabled.
3. **APIs & Services → OAuth consent screen**: confirm the app's own
   Google account is listed as a test user if the app is still in
   "Testing" publishing status (it should already be, from setting up
   Supabase sign-in) — `drive.file` is a narrow-enough scope that it
   should not require moving out of Testing mode for personal use.
4. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID**:
   - Application type: **Web application**
   - Name: anything recognizable, e.g. "whereisit - Sheets export"
   - Authorized JavaScript origins — add both:
     - `https://dogexe.github.io`
     - `http://127.0.0.1:8792` (for local dev testing)
   - No redirect URI needed — Google Identity Services' token-client
     flow only needs the JavaScript origin, not a redirect URI.
5. Copy the generated **Client ID** (looks like
   `123456789-abc...xyz.apps.googleusercontent.com`) and hand it back —
   it replaces the placeholder `GOOGLE_SHEETS_CLIENT_ID` constant at the
   top of `src/sheets-export.js`.

## New behavior

- A new module, `src/sheets-export.js`:
  - Loads the GIS script (`https://accounts.google.com/gsi/client`) —
    added as a `<script>` tag in `index.html`, next to the existing
    Supabase/Lucide CDN tags.
  - `initTokenClient({ client_id: GOOGLE_SHEETS_CLIENT_ID, scope:
    "https://www.googleapis.com/auth/drive.file", callback })` —
    requests an access token via `requestAccessToken()`, which pops
    Google's consent screen the first time in a session; the token is
    kept in a module-level variable (not persisted to `localStorage` —
    it's a short-lived credential) and reused for later exports in the
    same session without re-prompting.
  - `exportToGoogleSheets()`: once a token is available, calls
    `POST https://sheets.googleapis.com/v4/spreadsheets` to create a
    new spreadsheet with four sheets (Transactions, Budgets, Bills,
    Goals), then `POST .../values:batchUpdate` to populate each sheet's
    rows in one call. Every `fetch` call uses an explicit
    `AbortController` timeout (per this repo's external-API-call rule)
    since a hung request would otherwise leave the export stuck with no
    feedback.
  - On success: opens the new spreadsheet in a new tab
    (`created.spreadsheetUrl` from the create response) and shows a
    success toast. On failure (network, revoked consent, rate limit, or
    the client ID still being the unconfigured placeholder): a clear
    failure toast, matching the existing CSV/JSON export's toast
    pattern rather than a silent hang or a raw error.
- **`src/screens/settings.js`**: a new "Export to Google Sheets" row
  (icon-led, matching the CSV/JSON rows) in the "Sync & Data" card,
  wired to call `exportToGoogleSheets()`.

## Out of scope

- No changes to CSV/JSON export.
- No storage of the created spreadsheet's ID anywhere — the app has no
  memory of past exports.
- No changes to Supabase sync or its Google sign-in.

## Verification plan

Once the Client ID is in place: `npm run build`, serve `dist/`, then in
a real browser:

1. Click "Export to Google Sheets" while signed out of Supabase sync —
   confirm it still works (per the auth-independence decision).
2. Confirm the Google consent popup appears, requesting only the
   narrow `drive.file` permission (not full Sheets/Drive access).
3. Confirm a new spreadsheet is created with the right name and all
   four tabs (Transactions, Budgets, Bills, Goals) populated correctly,
   by actually opening the resulting spreadsheet link.
4. Export a second time in the same session — confirm no repeat
   consent prompt (token reuse) and that a *second*, separate
   spreadsheet is created (not an update to the first).
5. Force a failure (e.g. revoke the app's access mid-session via
   [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
   and export again) and confirm the failure toast appears rather than
   a silent hang.
