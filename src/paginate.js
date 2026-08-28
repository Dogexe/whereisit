// Fetches every row for a query in pages, since Supabase caps a single
// select() at 1000 rows and returns no error when it silently truncates --
// a table with more rows than that would otherwise return an arbitrary
// subset with nothing indicating anything was cut off. That's especially
// dangerous combined with the watermark (src/watermark.js): advancing the
// watermark to the newest updated_at in an arbitrarily-truncated page would
// permanently exclude whatever didn't make it into that page from every
// future pull.
//
// Uses keyset (cursor) pagination, not offset (.range(offset, offset+n)).
// Offset pagination assumes the ordered result set doesn't change shape
// between page requests -- but rows can be updated by another device in
// the gap between two page fetches. If a row already fetched in page 1
// gets a newer updated_at (moving it later in the sort order, past the
// page boundary), every row after the old boundary shifts one position
// earlier; an offset-based page 2 would then re-read from the *positional*
// offset 1000, silently skipping whatever row now sits there instead of
// the one that was originally at that position. A skipped row can in turn
// make advanceWatermark() advance past it, excluding it from every future
// pull permanently -- the same class of silent, unrecoverable miss the
// .gte()-vs-.gt() fix (sync.js) exists to prevent, just triggered by page
// mutation instead of an exact timestamp tie.
//
// Keyset pagination instead anchors each page on the *value* of the last
// row already fetched -- "give me everything after (updated_at, id) =
// cursor" -- which stays correct regardless of how many rows exist before
// or after that value, or how they move around, as long as a row's own
// updated_at never moves backward (it doesn't: every write path stamps it
// with Date.now() at write time, monotonically non-decreasing per row). A
// row already behind the cursor can't later un-pass it, and a row still
// ahead of the cursor can only move further ahead, never behind it.
//
// Takes an injectable `fetchPage(cursor, limit)` function rather than a
// Supabase query builder directly, so the paging/accumulation logic here
// can be unit-tested with a fake page source, independent of the real
// network client.
//
// PAGE_SIZE must stay strictly below the Supabase project's own `max-rows`
// setting (dashboard default: 1000). fetchAllPages below decides a page is
// the last one when it returns fewer than `pageSize` rows -- that's only a
// valid signal if the server is *capable* of returning a full `pageSize`
// page. If `max-rows` were ever configured lower than PAGE_SIZE, every
// query would be silently truncated to `max-rows` regardless of what this
// code asked for, so a genuinely full page would come back short, get
// misread as end-of-data, and the pull would silently truncate -- the
// exact failure keyset pagination exists to prevent, reintroduced through
// a dashboard setting instead of a code bug. Keeping PAGE_SIZE comfortably
// below the default `max-rows` (500, not 1000) means a short page still
// reliably means end-of-data even if the project's `max-rows` is ever
// lowered somewhat, not just left at its default.
export const PAGE_SIZE = 500;

// fetchPage(cursor, limit) => Promise<{ data, error }>. `cursor` is null
// for the first page, then `{ updatedAt, id }` of the last row of the
// previous page for every page after -- the caller is expected to filter
// to rows strictly after that (updatedAt, id) pair, ordered the same way.
//
// Returns { data, error }: on success, `data` is every row across every
// consecutive page (in order, concatenated), determined complete once a
// page returns fewer than `pageSize` rows. On failure, `error` is the
// failing page's error and `data` is null -- the rows from any pages
// fetched before the failure are deliberately discarded rather than
// partially applied, so a caller that bails out on `error` (skipping the
// merge and leaving the watermark untouched) is guaranteed to retry the
// *whole* range next time instead of resuming from an uncertain partial
// state.
export async function fetchAllPages(fetchPage, pageSize = PAGE_SIZE) {
  const all = [];
  let cursor = null;
  while (true) {
    const { data, error } = await fetchPage(cursor, pageSize);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    const last = rows[rows.length - 1];
    cursor = { updatedAt: last.updated_at, id: last.id };
  }
  return { data: all, error: null };
}
