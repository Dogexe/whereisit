import { transactions, budgets, bills, goals } from "./state.js";
import { L } from "./i18n.js";
import { showToast } from "./toast.js";

// Public browser OAuth client ID -- not a secret, same treatment as
// SUPABASE_ANON_KEY in sync.js. Replace with the real Client ID from
// Google Cloud Console once created; see
// docs/specs/google-sheets-export.md for exact setup steps.
const GOOGLE_SHEETS_CLIENT_ID = "639941680335-9qbo20f7g1l4ok2venlf0rd6bkhtmh0u.apps.googleusercontent.com";
// drive.file (not the broader spreadsheets scope) -- only grants access
// to files this app creates, which is all "always create a new sheet"
// ever needs, and keeps Google's consent screen narrow.
const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FETCH_TIMEOUT_MS = 15000;
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GIS_LOAD_TIMEOUT_MS = 15000;

let tokenClient = null;
let cachedToken = null; // { accessToken, expiresAt }
let gisLoadPromise = null;

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(() => clearTimeout(timer));
}

// Google Identity Services is only needed for this Sheets export flow, not
// on every page load -- unlike Supabase/Lucide, it's fetched on demand
// (the first time a user actually clicks "Export to Google Sheets") rather
// than via a <script> tag in index.html. Cached as a module-level promise
// so a second export click while the script is still loading (or after it
// already has) reuses the same load instead of injecting duplicate tags.
function loadGisScript() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Google Identity Services script load timed out")), GIS_LOAD_TIMEOUT_MS);
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error("Google Identity Services script failed to load")); };
    document.head.appendChild(script);
  }).catch((err) => { gisLoadPromise = null; throw err; });
  return gisLoadPromise;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) return cachedToken.accessToken;
  await loadGisScript();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_SHEETS_CLIENT_ID,
      scope: SHEETS_SCOPE,
      callback: () => {}
    });
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      cachedToken = { accessToken: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 };
      resolve(resp.access_token);
    };
    tokenClient.error_callback = (err) => reject(new Error((err && err.type) || "auth_failed"));
    tokenClient.requestAccessToken();
  });
}

function txSheetRows() {
  const l = L();
  const header = [l.csvDate, l.csvType, l.csvCategory, l.csvNote, l.csvAmount];
  const rows = transactions.slice().sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.type === "income" ? l.incomeLabel : l.expenseLabel, t.category, t.note || "", t.amount]);
  return [header, ...rows];
}
function budgetSheetRows() {
  const l = L();
  return [[l.categoryLabel, l.limitLabel], ...budgets.map((b) => [b.category, b.limit])];
}
function billSheetRows() {
  const l = L();
  return [[l.billNameLabel, l.categoryLabel, l.amountLabel, l.billDayLabel], ...bills.map((b) => [b.name, b.category, b.amount, b.day])];
}
function goalSheetRows() {
  const l = L();
  return [[l.goalNameLabel, l.targetLabel, l.savedLabel], ...goals.map((g) => [g.name, g.target, g.saved])];
}

export async function exportToGoogleSheets() {
  const l = L();
  if (GOOGLE_SHEETS_CLIENT_ID.indexOf("REPLACE_WITH") === 0) {
    showToast(l.toastSheetsError);
    return;
  }
  showToast(l.toastSheetsExporting);
  try {
    const token = await getAccessToken();
    const title = "whereisit export " + new Date().toISOString().slice(0, 10);
    const createRes = await fetchWithTimeout("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: "Transactions" } },
          { properties: { title: "Budgets" } },
          { properties: { title: "Bills" } },
          { properties: { title: "Goals" } }
        ]
      })
    });
    if (!createRes.ok) throw new Error("create failed: " + createRes.status);
    const created = await createRes.json();

    const updateRes = await fetchWithTimeout(
      "https://sheets.googleapis.com/v4/spreadsheets/" + created.spreadsheetId + "/values:batchUpdate",
      {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [
            { range: "Transactions!A1", values: txSheetRows() },
            { range: "Budgets!A1", values: budgetSheetRows() },
            { range: "Bills!A1", values: billSheetRows() },
            { range: "Goals!A1", values: goalSheetRows() }
          ]
        })
      }
    );
    if (!updateRes.ok) throw new Error("populate failed: " + updateRes.status);

    window.open(created.spreadsheetUrl, "_blank", "noopener");
    showToast(l.toastSheetsSuccess);
  } catch (err) {
    showToast(l.toastSheetsError);
  }
}
