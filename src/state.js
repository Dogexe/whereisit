import { DEFAULT_CATEGORIES } from "./categories.js";
import { DEFAULT_ACCOUNT } from "./accounts.js";

// Local (not UTC) "today," used only to seed the initial default field
// values below. new Date().toISOString() converts to UTC first, which
// reads as the wrong calendar day for a user east of UTC (e.g. Bangkok,
// UTC+7) for several hours after their local midnight -- see utils.js's
// localDateIso/localMonthKey for the same logic used everywhere else in
// the app. Duplicated here rather than imported, specifically to avoid a
// circular import: utils.js itself imports `state` from this file.
const now = new Date();
const todayLocalIso = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
const curMonthNumLocal = String(now.getMonth() + 1).padStart(2, "0");

export const state = {
  lang: "th", dark: false,
  // "current" | "linear" -- a bundled visual theme (accent + panel radius/
  // border/shadow + heading weight + nav icons), not an independent accent
  // picker. Device-local only, same treatment as lang/dark immediately
  // above: never synced via Supabase, never touched by
  // wipeLocalAccountData(). See docs/specs/linear-theme.md.
  themeStyle: "current",
  // docs/specs/app-lock.md stage 1: a lightweight, purely client-side PIN
  // gate on the app itself -- not a Supabase auth mechanism. Device-local
  // only, same treatment as lang/dark/themeStyle immediately above: never
  // synced via Supabase, never touched by wipeLocalAccountData() (the PIN
  // locks this device, not this signed-in account, so an account
  // sign-out/switch shouldn't clear or need it).
  pinEnabled: false, pinHash: null, pinSalt: null,
  // pinSetupActive: UI-only, not persisted -- true while Settings'
  // Security section has its inline "set a new PIN" form open, so
  // hasLiveInputRisk() (sync.js) can guard it like every other
  // in-progress form in this app already is.
  pinSetupActive: false,
  tab: "home", insightsTab: "budgets",
  // Budgets and Breakdown ("Categories") tabs each get their own instance
  // of the same pill component (period-picker.js's pillPickerHtml/
  // wirePillPicker) -- independent state since the two tabs don't share
  // one period-picker instance. Tapping the popover's year heading
  // switches to a whole-year view instead of a dedicated "year" mode.
  // Breakdown alone also tracks `insightsBreakdownIsToday`: its pill gets
  // a one-tap "Today" shortcut inside the popover (opts.todayShortcut)
  // that Budgets never needs, layered on top of month/year rather than
  // being a third mode value -- stepping the pill or picking a month/year
  // clears it back to normal browsing.
  insightsBudgetsMode: "month", insightsBudgetsMonthNum: curMonthNumLocal, insightsBudgetsYear: String(now.getFullYear()),
  insightsBudgetsPopoverOpen: false,
  insightsBreakdownMode: "month", insightsBreakdownMonthNum: curMonthNumLocal, insightsBreakdownYear: String(now.getFullYear()),
  insightsBreakdownPopoverOpen: false, insightsBreakdownIsToday: false,
  txFilterType: "all", txFilterMonthNum: "all", txFilterYear: "all", txFilterCategory: new Set(), txFilterAccount: new Set(), txSearch: "", txPeriodMode: "all",
  txFilterAmountMin: null, txFilterAmountMax: null, txFilterDateFrom: "", txFilterDateTo: "", txFilterSheetOpen: false,
  // txPillPopoverOpen: UI-only, not persisted -- same treatment as
  // insightsBudgetsPopoverOpen/insightsBreakdownPopoverOpen. txCustomKind
  // mirrors insightsCustomKind (which half of the Filters sheet's custom
  // date section is shown); txFilterDateFrom/txFilterDateTo (above) are
  // reused as the actual applied values for both single-day and range.
  txPillPopoverOpen: false, txCustomKind: "range",
  insightsFilterCategory: new Set(), insightsFilterSheetOpen: false,
  // Custom date filter, Breakdown-tab-only, lives in the Filters sheet
  // (not a top-level period mode) -- "single" reuses the same from/to
  // pair with from === to rather than a separate field, since every
  // downstream consumer (computeBreakdownForRange) already takes a range.
  insightsCustomKind: "range", insightsFilterDateFrom: "", insightsFilterDateTo: "",
  formType: "expense", formDate: todayLocalIso,
  formCategoryId: (DEFAULT_CATEGORIES.find((c) => c.type === "expense") || {}).id || null, editingId: null, categoryManual: false,
  // formAccountId: stage 4 of docs/specs/multi-account-support.md, set via
  // derived.js's defaultAccountId() at reset/edit time (see add.js), not
  // seeded with a fixed default here -- unlike formCategoryId, the right
  // default depends on the live accounts list, not a fixed constant.
  formAccountId: null,
  // formToAccountId: stage 2 of docs/specs/account-transfers.md -- the Add
  // form's Transfer tab only, the destination account. A transfer's
  // *source* account reuses formAccountId (and account_id) directly, same
  // as any other transaction's account -- this is the only genuinely new
  // field a transfer needs.
  formToAccountId: null,
  // homeSelectedAccountId: UI-only, not persisted -- same treatment as
  // insightsTab. Inert until stage 5 wires Home's account switcher; carried
  // here (not stage 5) only so stage 4's markBillPaid can already read it.
  homeSelectedAccountId: null,
  // addSheetOpen: UI-only, not persisted -- same treatment as
  // txFilterSheetOpen/insightsFilterSheetOpen. Mobile-only (docs/specs/
  // add-transaction-bottom-sheet.md): below 1024px, Add/Edit opens as a
  // bottom sheet instead of navigating state.tab to "add".
  addSheetOpen: false,
  // exportSheetOpen: UI-only, not persisted -- same treatment as
  // txFilterSheetOpen/insightsFilterSheetOpen/addSheetOpen. Settings' three
  // export options (CSV/JSON/Google Sheets) live behind one bottom sheet
  // instead of three separate always-visible rows.
  exportSheetOpen: false,
  // importSheetOpen/importStep/importAccountId/importMapping: UI-only, not
  // persisted -- same treatment as exportSheetOpen (docs/specs/csv-import.md).
  // importStep resets to "pick" every time the sheet opens (import-sheet.js's
  // openImportSheet). The parsed file's own headers/rows/plan are
  // deliberately NOT here -- they live as module-level state inside
  // import-sheet.js instead, per that spec's own decision, since a parsed
  // CSV can be thousands of rows and there's no precedent for bulk parsed
  // data living on this shared object.
  // manageSheetOpen: docs/specs/settings-manage-swipe-and-sheet.md -- UI-only,
  // not persisted, same treatment as addSheetOpen. Layered on top of the six
  // already-existing per-section edit-id fields below (budgetEditId etc.):
  // those say *what* is being edited, this says *whether* that's currently
  // shown as a mobile sheet (true) vs. desktop's inline form (never set,
  // since desktop doesn't use this flag at all).
  manageSheetOpen: false,
  importSheetOpen: false, importStep: "pick", importAccountId: null,
  importMapping: { dateCol: null, amountCol: null, noteCol: null, categoryCol: null, dateFormat: "YYYY-MM-DD" },
  budgetEditId: null, billEditId: null, goalEditId: null, goalContributeId: null, categoryEditId: null, accountEditId: null,
  settingsGroupOpen: { budgets: false, bills: false, goals: false, categories: false, accounts: false },
  // Which section is shown in the right-hand panel of Settings' desktop
  // (1024px+) list-left/detail-right layout -- see styles.css's 1024px
  // block. Purely a UI-state field, same as settingsGroupOpen (not
  // persisted to localStorage); has no effect below 1024px, where every
  // section still just stacks on one page as before.
  settingsActiveSection: "display"
};
export let transactions = [];
export let budgets = [
  { id: "b0", category: "อาหารและเครื่องดื่ม", limit: 3000 },
  { id: "b1", category: "การเดินทาง", limit: 1200 },
  { id: "b2", category: "ช้อปปิ้ง", limit: 1500 },
  { id: "b3", category: "บันเทิง", limit: 800 }
];
export let bills = [
  { id: "bl0", name: "ค่าเช่าห้อง", amount: 8000, day: 1, category: "ที่อยู่อาศัย/ค่าเช่า" },
  { id: "bl1", name: "ค่าอินเทอร์เน็ต", amount: 590, day: 5, category: "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)" },
  { id: "bl2", name: "ประกันสุขภาพ", amount: 1200, day: 15, category: "สุขภาพ" },
  { id: "bl3", name: "Netflix", amount: 349, day: 20, category: "บันเทิง" }
];
export let goals = [];
// Additive-only for now (see docs/specs/custom-categories.md stage 1) --
// nothing reads this yet, existing screens still use the hardcoded
// CATEGORIES strings directly. Sliced so mutating this array can never
// mutate categories.js's own DEFAULT_CATEGORIES export.
export let categories = DEFAULT_CATEGORIES.slice();
// Stage 1 of docs/specs/multi-account-support.md: seeded with one default
// "Cash" account so a fresh, never-signed-in install already has a valid
// account to save transactions against. Object.assign copies it so mutating
// this array's entries can never mutate accounts.js's own DEFAULT_ACCOUNT
// export -- same reasoning as categories' .slice() above.
export let accounts = [Object.assign({}, DEFAULT_ACCOUNT)];

// Reassigning an imported `let` binding from another module isn't allowed in
// ES modules (only mutation is) -- these setters are how storage.js/sync code
// replaces the arrays wholesale (e.g. after a Supabase pull) instead of mutating.
export function setTransactions(arr) { transactions = arr; }
export function setBudgets(arr) { budgets = arr; }
export function setBills(arr) { bills = arr; }
export function setGoals(arr) { goals = arr; }
export function setCategories(arr) { categories = arr; }
export function setAccounts(arr) { accounts = arr; }
