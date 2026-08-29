export const CATEGORIES = {
  income: ["เงินเดือน", "โบนัส/รายได้พิเศษ", "ธุรกิจ/ฟรีแลนซ์", "ดอกเบี้ย/เงินลงทุน", "อื่นๆ (รายรับ)"],
  expense: ["อาหารและเครื่องดื่ม", "การเดินทาง", "ที่อยู่อาศัย/ค่าเช่า", "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)", "ช้อปปิ้ง", "บันเทิง", "สุขภาพ", "การศึกษา", "ผ่อนชำระ/หนี้สิน", "ออมเงิน/ลงทุน", "อื่นๆ (รายจ่าย)"]
};
export const CATEGORY_KEYWORDS = {
  expense: [
    ["อาหารและเครื่องดื่ม", ["ข้าว", "กาแฟ", "อาหาร", "กิน", "ก๋วยเตี๋ยว", "ชานม", "เครื่องดื่ม", "สตาร์บัค", "บุฟเฟ่ต์", "ร้านอาหาร", "ของกิน", "ขนม", "ก๋วยจั๊บ", "ส้มตำ"]],
    ["การเดินทาง", ["แท็กซี่", "taxi", "bts", "mrt", "รถไฟฟ้า", "น้ำมัน", "วินมอไซค์", "grab", "แกร็บ", "ค่ารถ", "ทางด่วน", "ที่จอดรถ", "ตั๋วเครื่องบิน", "รถทัวร์"]],
    ["ที่อยู่อาศัย/ค่าเช่า", ["ค่าเช่า", "ค่าห้อง", "ค่าบ้าน", "หอพัก", "คอนโด"]],
    ["สาธารณูปโภค (ไฟ/น้ำ/เน็ต)", ["ค่าไฟ", "ค่าน้ำ", "ค่าเน็ต", "อินเทอร์เน็ต", "ไวไฟ", "wifi", "ค่ามือถือ", "ค่าโทรศัพท์"]],
    ["ช้อปปิ้ง", ["ช้อปปิ้ง", "ซื้อของ", "เสื้อผ้า", "shopee", "lazada", "ช็อปปี้", "ลาซาด้า", "รองเท้า"]],
    ["บันเทิง", ["หนัง", "เกม", "คอนเสิร์ต", "netflix", "ดูหนัง", "เที่ยว", "สวนสนุก"]],
    ["สุขภาพ", ["หมอ", "ยา", "โรงพยาบาล", "คลินิก", "ฟิตเนส", "ประกันสุขภาพ"]],
    ["การศึกษา", ["เรียน", "หนังสือ", "คอร์ส", "ค่าเทอม", "อบรม"]],
    ["ผ่อนชำระ/หนี้สิน", ["ผ่อน", "หนี้", "บัตรเครดิต", "สินเชื่อ"]],
    ["ออมเงิน/ลงทุน", ["ออมเงิน", "ลงทุน", "หุ้น", "กองทุน"]]
  ],
  income: [
    ["เงินเดือน", ["เงินเดือน", "salary"]],
    ["โบนัส/รายได้พิเศษ", ["โบนัส", "bonus", "รายได้พิเศษ"]],
    ["ธุรกิจ/ฟรีแลนซ์", ["ฟรีแลนซ์", "freelance", "ธุรกิจ", "ขายของ"]],
    ["ดอกเบี้ย/เงินลงทุน", ["ดอกเบี้ย", "ปันผล"]]
  ]
};
export const CATEGORY_ICON = {
  "เงินเดือน": "briefcase", "โบนัส/รายได้พิเศษ": "gift", "ธุรกิจ/ฟรีแลนซ์": "laptop", "ดอกเบี้ย/เงินลงทุน": "trending-up", "อื่นๆ (รายรับ)": "plus-circle",
  "อาหารและเครื่องดื่ม": "utensils", "การเดินทาง": "car", "ที่อยู่อาศัย/ค่าเช่า": "home", "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)": "zap", "ช้อปปิ้ง": "shopping-bag",
  "บันเทิง": "tv", "สุขภาพ": "heart-pulse", "การศึกษา": "book-open", "ผ่อนชำระ/หนี้สิน": "credit-card", "ออมเงิน/ลงทุน": "piggy-bank", "อื่นๆ (รายจ่าย)": "more-horizontal"
};
export function iconFor(cat) { return CATEGORY_ICON[cat] || "circle"; }

// Fixed slugs for today's 16 built-in categories, assigned once here so
// they stay stable across a rename (see docs/specs/custom-categories.md
// stage 1) -- guessCategory's keyword matching and any other lookup that
// needs "the built-in food category specifically" keys off these ids,
// never the display name, which is the whole point: renaming a built-in
// must not break anything keyed to it. Built by mapping over CATEGORIES/
// CATEGORY_ICON directly (not retyped by hand) so this can never drift
// out of sync with them or introduce a Thai-text transcription error.
const DEFAULT_SLUGS = {
  income: ["salary", "bonus", "business", "interest", "other"],
  expense: ["food", "transport", "housing", "utilities", "shopping", "entertainment", "health", "education", "debt", "savings", "other"]
};
export const DEFAULT_CATEGORIES = ["income", "expense"].flatMap((type) =>
  CATEGORIES[type].map((name, i) => ({
    id: `default-${type}-${DEFAULT_SLUGS[type][i]}`, type, name, icon: CATEGORY_ICON[name], sortOrder: i
  }))
);
// Stage 4 of docs/specs/custom-categories.md: guessCategory returns a
// categoryId, not a display name, so it keeps working after a rename.
// CATEGORY_KEYWORDS itself stays name-keyed (untouched, so its Thai
// keyword lists never need retyping) -- this re-keys it to ids exactly
// once here, resolved against DEFAULT_CATEGORIES specifically (the fixed,
// never-renamed original list), never the live/renamable `categories`
// state array. That's what makes the id lookup immune to a later rename:
// it's baked in at module load, not recomputed against whatever the
// category is currently called.
const DEFAULT_ID_BY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, c.id]));
function keyedByCategoryId(entries) {
  return entries.map(([name, words]) => [DEFAULT_ID_BY_NAME.get(name), words]);
}
const CATEGORY_KEYWORDS_BY_ID = {
  expense: keyedByCategoryId(CATEGORY_KEYWORDS.expense),
  income: keyedByCategoryId(CATEGORY_KEYWORDS.income)
};
export function guessCategory(note, type) {
  if (!note) return null;
  const text = note.toLowerCase();
  for (const [id, words] of (CATEGORY_KEYWORDS_BY_ID[type] || [])) {
    if (words.some((w) => text.includes(w.toLowerCase()))) return id;
  }
  return null;
}
// Icon choices offered when adding/editing a category (Settings, stage 3
// of docs/specs/custom-categories.md) -- per that spec's interview, this
// is deliberately the ~16 icons already used by a built-in category, not
// the app's full icon sprite, so every offered icon is already visually
// established as "a category icon" rather than pulling in chrome icons
// (pencil, search, settings...) that would look out of place here.
// Deduped defensively even though today's 16 defaults happen to use 16
// distinct icons.
export const CATEGORY_ICON_CHOICES = Array.from(new Set(DEFAULT_CATEGORIES.map((c) => c.icon)));
export function rowTone(type) { return type === "income" ? { bg: "var(--color-income-tint)", color: "var(--color-income)" } : { bg: "var(--color-accent-tint)", color: "var(--color-accent)" }; }

// Stage 2 of docs/specs/custom-categories.md: transactions/budgets/bills
// are moving from storing a category by name to referencing it by a
// stable categoryId, but not every row has one yet (pre-migration rows
// until the one-time backfill runs, or -- until a later stage moves the
// Add screen itself to writing categoryId directly -- any row created in
// the gap between this stage and that one). Pure and dependency-free
// (takes the categories list as a parameter rather than importing
// state.js) so both derived.js's read path and sync.js's backfill can
// share the exact same matching logic instead of two copies drifting
// apart.
export function findCategoryId(categoriesList, name, type) {
  const match = categoriesList.find((c) => c.name === name && c.type === type && !c.deleted);
  return match ? match.id : null;
}
export function categoryDisplayName(categoriesList, id, fallback) {
  const c = categoriesList.find((x) => x.id === id);
  return c ? c.name : fallback;
}
export const GOAL_ICONS = ["flag", "piggy-bank", "plane", "shield", "gift", "target"];
export const GOAL_TONES = [
  { bg: "var(--color-accent-tint)", color: "var(--color-accent)" },
  { bg: "var(--color-income-tint)", color: "var(--color-income)" },
  { bg: "var(--color-warning-tint)", color: "var(--color-warning-text)" }
];
