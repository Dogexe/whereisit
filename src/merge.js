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

// Budgets used to need a separate mergeBudgetsByCategory here, keyed by
// category name instead of id (an incoming row always overwriting
// regardless of updatedAt, tombstones never removing anything) -- not a
// design choice, just a workaround for budgets having no better shared
// key to merge by at the time. Once budgets gained a real categoryId
// (docs/specs/custom-categories.md stage 2), sync.js's pullBudgets moved
// to a plain mergeRowsById call like everything else, since budgets
// already carried their own row id end-to-end (state.js's seed data,
// Settings' edit/delete-by-id) -- category-name-keying was never actually
// necessary, just what an earlier version reached for. Removed here along
// with its dedicated tests (see tests/merge.test.js's history) rather
// than left as unused dead code.
