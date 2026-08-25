// Tracks the newest `updated_at` timestamp seen per table, so a pull can ask
// Supabase for only the rows changed since last time (.gt("updated_at", ...))
// instead of refetching the whole table every 25s. The watermark is derived
// exclusively from the updated_at values Supabase itself returns in a pull's
// response -- never from the local device clock, which can drift from
// Postgres's and would risk silently skipping rows written in the gap
// between a drifted-ahead local clock and the actual server time.
//
// Persisted to localStorage so the incremental pull survives a reload
// instead of falling back to a full pull every time the app boots. A table
// with no stored watermark yet (fresh install, or after resetWatermark())
// falls back to an unfiltered full pull, which is also how the watermark
// gets established in the first place.

const WATERMARK_KEY = "expense_tracker_watermark_v1";
const TABLES = ["transactions", "budgets", "bills", "goals"];

const watermark = { transactions: null, budgets: null, bills: null, goals: null };

function persist() {
  try {
    window.localStorage.setItem(WATERMARK_KEY, JSON.stringify(watermark));
  } catch (e) { /* best-effort: worst case the next pull fetches more rows
    than strictly necessary, not a correctness issue */ }
}

export function loadWatermark() {
  try {
    const raw = window.localStorage.getItem(WATERMARK_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    TABLES.forEach((t) => { if (typeof obj[t] === "string") watermark[t] = obj[t]; });
  } catch (e) { /* ignore corrupt data, fall back to a full pull */ }
}

export function getWatermark(table) {
  return watermark[table];
}

// Advances the table's watermark to the newest `updated_at` string found in
// `rows` -- the rows a pull actually received back from Supabase -- never
// past what the server itself reported. ISO 8601 timestamps (what Supabase
// returns for a timestamptz column) sort correctly with plain string
// comparison, so this doesn't need to parse them into Dates. A no-op when
// `rows` is empty (nothing new was seen).
export function advanceWatermark(table, rows) {
  if (!rows || !rows.length) return;
  const newest = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), watermark[table] || "");
  if (newest && newest !== watermark[table]) {
    watermark[table] = newest;
    persist();
  }
}

// Called alongside markAllPending() on a genuine new sign-in -- if a
// different account signs in on this device, a watermark left over from the
// previous account would incorrectly filter out that account's own
// (unrelated, differently-timestamped) rows on its first pull. Resetting
// forces one full unfiltered pull, the download-side counterpart to
// markAllPending()'s one full upload.
export function resetWatermark() {
  TABLES.forEach((t) => { watermark[t] = null; });
  persist();
}
