import { DEFAULT_CATEGORIES } from "./categories.js";

export const state = {
  lang: "th", dark: false,
  tab: "home", insightsTab: "budgets",
  insightsMonthNum: new Date().toISOString().slice(5, 7), insightsYear: String(new Date().getFullYear()), insightsPeriodMode: "month",
  txFilterType: "all", txFilterMonthNum: "all", txFilterYear: "all", txFilterCategory: new Set(), txSearch: "", txPeriodMode: "all",
  txFilterAmountMin: null, txFilterAmountMax: null, txFilterDateFrom: "", txFilterDateTo: "", txFilterSheetOpen: false,
  insightsFilterCategory: new Set(), insightsFilterSheetOpen: false,
  insightsFilterDateFrom: "", insightsFilterDateTo: "",
  formType: "expense", formDate: new Date().toISOString().slice(0, 10),
  formCategoryId: (DEFAULT_CATEGORIES.find((c) => c.type === "expense") || {}).id || null, editingId: null, categoryManual: false,
  budgetEditId: null, billEditId: null, goalEditId: null, goalContributeId: null, categoryEditId: null,
  settingsGroupOpen: { budgets: false, bills: false, goals: false, categories: false },
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

// Reassigning an imported `let` binding from another module isn't allowed in
// ES modules (only mutation is) -- these setters are how storage.js/sync code
// replaces the arrays wholesale (e.g. after a Supabase pull) instead of mutating.
export function setTransactions(arr) { transactions = arr; }
export function setBudgets(arr) { budgets = arr; }
export function setBills(arr) { bills = arr; }
export function setGoals(arr) { goals = arr; }
export function setCategories(arr) { categories = arr; }
