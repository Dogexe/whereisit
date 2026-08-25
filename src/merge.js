// Pure last-write-wins merge logic for the sync pull path, extracted out of
// sync.js so it can be unit-tested without a network connection, Supabase
// client, or localStorage. Given the current local array and the rows a pull
// returned, each function returns the merged array -- no side effects.

// Used by transactions, bills, and goals: all three key rows by `id` and
// resolve conflicts by comparing `updatedAt` (local) against `updated_at`
// (incoming row). A `deleted:true` incoming row removes the local row
// outright (a tombstone), regardless of timestamp.
export function mergeRowsById(local, incomingRows, rowToObj) {
  const byId = new Map(local.map((item) => [item.id, item]));
  (incomingRows || []).forEach((r) => {
    if (r.deleted) { byId.delete(r.id); return; }
    const rTime = new Date(r.updated_at).getTime();
    const existing = byId.get(r.id);
    if (!existing || (existing.updatedAt || 0) < rTime) byId.set(r.id, rowToObj(r));
  });
  return Array.from(byId.values());
}

// Budgets merge differently from the other three tables -- a known quirk in
// the original implementation, preserved here exactly rather than fixed:
// - Keyed by `category` name, not `id`.
// - No `updatedAt` comparison: an incoming non-deleted row always overwrites
//   the local row for that category, even if the local edit is newer.
// - A `deleted:true` incoming row is a no-op, not a removal -- a budget
//   deleted on another device is never removed locally by a pull.
// - An empty `incomingRows` array short-circuits to "nothing to merge" and
//   returns `local` unchanged, rather than emptying the local list (which
//   `mergeRowsById` would do, since an empty incoming array has no tombstones
//   to remove anything either way -- but this bails out even before trying).
export function mergeBudgetsByCategory(local, incomingRows, rowToObj) {
  if (!incomingRows || !incomingRows.length) return local;
  const byCat = new Map(local.map((b) => [b.category, b]));
  incomingRows.forEach((r) => {
    if (r.deleted) return;
    byCat.set(r.category, rowToObj(r));
  });
  return Array.from(byCat.values());
}
