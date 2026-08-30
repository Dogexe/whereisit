// Ledger accounts (cash/bank/credit card), stage 1 of
// docs/specs/multi-account-support.md -- deliberately named accounts.js
// (plural), not account.js: that name is already taken by an existing,
// unrelated module tracking the *signed-in Google identity* for
// cross-device account-switch isolation (accountDisplayName,
// shouldWipeLocalData), already imported by settings.js. A same-name file
// or export here would collide with that import.

// The ~15-icon-choice pattern categories.js's CATEGORY_ICON_CHOICES
// established, but a small curated set specific to what an account
// actually is (a place money sits), not a spending category.
export const ACCOUNT_ICON_CHOICES = ["wallet", "credit-card", "piggy-bank", "landmark"];

// Fixed id (not uid()), on purpose: the one-time backfill (stage 2) creates
// this exact account on any device that doesn't have one yet. Two devices
// backfilling independently before ever syncing must land on the *same*
// default account id, or they'd end up with two duplicate "Cash" accounts
// that later need reconciling by hand.
export const DEFAULT_ACCOUNT = { id: "acc0", name: "เงินสด", icon: "wallet", openingBalance: 0, archived: false };

export function accountNameById(accountsList, id, fallback) {
  const a = accountsList.find((x) => x.id === id);
  return a ? a.name : fallback;
}
