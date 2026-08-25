// Fetches every row for a query in pages, since Supabase caps a single
// select() at 1000 rows and returns no error when it silently truncates --
// a table with more rows than that would otherwise return an arbitrary
// subset with nothing indicating anything was cut off. That's especially
// dangerous combined with the watermark (src/watermark.js): advancing the
// watermark to the newest updated_at in an arbitrarily-truncated page would
// permanently exclude whatever didn't make it into that page from every
// future pull.
//
// Takes an injectable `fetchPage(offset, limit)` function rather than a
// Supabase query builder directly, so the paging/accumulation logic here
// can be unit-tested with a fake page source, independent of the real
// network client.

export const PAGE_SIZE = 1000;

// fetchPage(offset, limit) => Promise<{ data, error }>, mirroring
// Supabase's own .range()-based response shape.
//
// Returns { data, error }: on success, `data` is every row across every
// consecutive page (in order, concatenated), determined complete once a
// page returns fewer than `pageSize` rows. On failure, `error` is the
// first page's error and `data` is null -- the rows from any pages
// fetched before the failure are deliberately discarded rather than
// partially applied, so a caller that bails out on `error` (skipping the
// merge and leaving the watermark untouched) is guaranteed to retry the
// *whole* range next time instead of resuming from an uncertain partial
// state.
export async function fetchAllPages(fetchPage, pageSize = PAGE_SIZE) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await fetchPage(offset, pageSize);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return { data: all, error: null };
}
