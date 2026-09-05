import test from "node:test";
import assert from "node:assert/strict";
import { topLevelCategories, childrenOf, isParentCategory, ancestorId, eligibleParentOptions, groupedCategories, rowTone } from "../src/categories.js";

// docs/specs/category-nesting.md stage 1: pure helpers over a category's
// optional parentId. Stage 2 adds eligibleParentOptions and its own
// regression test for the caught 3-level-chain gap -- these cover only
// the stage 1 helpers.
const list = [
  { id: "food", type: "expense", parentId: null, deleted: false },
  { id: "groceries", type: "expense", parentId: "food", deleted: false },
  { id: "dining", type: "expense", parentId: "food", deleted: false },
  { id: "deleted-child", type: "expense", parentId: "food", deleted: true },
  { id: "transport", type: "expense", parentId: null, deleted: false },
  { id: "orphan", type: "expense", parentId: "missing-parent", deleted: false }
];

test("rowTone: returns explicit income, expense, and transfer tones", () => {
  assert.deepEqual(rowTone("income"), { bg: "var(--color-income-tint)", color: "var(--color-income-tint-fg)" });
  assert.deepEqual(rowTone("expense"), { bg: "var(--color-accent-tint)", color: "var(--color-accent)" });
  assert.deepEqual(rowTone("transfer"), { bg: "var(--color-chart-5-tint)", color: "var(--color-chart-5-tint-fg)" });
});

test("topLevelCategories: returns only categories with no parentId", () => {
  // "orphan" has a (dangling) parentId set, so it's excluded here even
  // though ancestorId (below) treats it as top-level once its parent
  // can't be resolved -- topLevelCategories is a plain parentId check,
  // not the same fallback-aware resolution.
  const result = topLevelCategories(list).map((c) => c.id);
  assert.deepEqual(result.sort(), ["food", "transport"]);
});

test("childrenOf: returns non-deleted children of a parent", () => {
  const result = childrenOf(list, "food").map((c) => c.id);
  assert.deepEqual(result.sort(), ["dining", "groceries"]);
});

test("childrenOf: excludes soft-deleted children", () => {
  const result = childrenOf(list, "food");
  assert.ok(!result.some((c) => c.id === "deleted-child"));
});

test("childrenOf: a category with no children returns an empty array", () => {
  assert.deepEqual(childrenOf(list, "groceries"), []);
});

test("isParentCategory: true when at least one non-deleted child exists", () => {
  assert.equal(isParentCategory(list, "food"), true);
});

test("isParentCategory: false for a childless category", () => {
  assert.equal(isParentCategory(list, "transport"), false);
});

test("isParentCategory: false when a category's only children are all soft-deleted", () => {
  const onlyDeletedChild = [
    { id: "p", type: "expense", parentId: null, deleted: false },
    { id: "c", type: "expense", parentId: "p", deleted: true }
  ];
  assert.equal(isParentCategory(onlyDeletedChild, "p"), false);
});

test("ancestorId: a top-level category resolves to itself", () => {
  assert.equal(ancestorId(list, "food"), "food");
});

test("ancestorId: a child resolves to its live parent", () => {
  assert.equal(ancestorId(list, "groceries"), "food");
});

test("ancestorId: a dangling parentId (parent doesn't exist) falls back to the category itself", () => {
  assert.equal(ancestorId(list, "orphan"), "orphan");
});

test("ancestorId: a parentId pointing at a soft-deleted category falls back to the category itself", () => {
  const raced = [
    { id: "p", type: "expense", parentId: null, deleted: true },
    { id: "c", type: "expense", parentId: "p", deleted: false }
  ];
  assert.equal(ancestorId(raced, "c"), "c");
});

test("ancestorId: an unknown id is returned unchanged", () => {
  assert.equal(ancestorId(list, "does-not-exist"), "does-not-exist");
});

// docs/specs/category-nesting.md stage 2. A separate list from the stage 1
// tests above: adds an income category and a second top-level expense
// category to exercise eligibleParentOptions' type filter.
const list2 = [
  { id: "food", type: "expense", parentId: null, deleted: false },
  { id: "groceries", type: "expense", parentId: "food", deleted: false },
  { id: "transport", type: "expense", parentId: null, deleted: false },
  { id: "salary", type: "income", parentId: null, deleted: false },
  { id: "deleted-top-level", type: "expense", parentId: null, deleted: true }
];

test("eligibleParentOptions: offers other top-level categories of the same type", () => {
  const result = eligibleParentOptions(list2, "transport", "expense").map((c) => c.id);
  assert.deepEqual(result, ["food"]);
});

test("eligibleParentOptions: excludes the category being edited itself", () => {
  const result = eligibleParentOptions(list2, "food", "expense");
  assert.ok(!result.some((c) => c.id === "food"));
});

test("eligibleParentOptions: excludes a category that already has a parent (blocks picking an existing child as a new parent)", () => {
  const result = eligibleParentOptions(list2, "transport", "expense");
  assert.ok(!result.some((c) => c.id === "groceries"));
});

test("eligibleParentOptions: excludes cross-type categories", () => {
  const result = eligibleParentOptions(list2, "food", "expense");
  assert.ok(!result.some((c) => c.id === "salary"));
});

test("eligibleParentOptions: excludes soft-deleted categories", () => {
  const result = eligibleParentOptions(list2, "transport", "expense");
  assert.ok(!result.some((c) => c.id === "deleted-top-level"));
});

test("regression: eligibleParentOptions alone doesn't stop re-parenting a category that already has children — that's isParentCategory's job, not this filter's", () => {
  // This is the exact gap a first-draft two-check version of the filter
  // missed (see the spec's decisions section): "food" has a child
  // ("groceries") but eligibleParentOptions itself has no way to know
  // that when it's being asked "what can 'transport' pick as a parent" --
  // it correctly still offers "food" here, because from THAT category's
  // perspective food is a perfectly valid, childless-from-its-own-view
  // top-level option. The actual gap-closer is isParentCategory: the
  // caller must check isParentCategory(list, "food") separately and, if
  // true, refuse to let "food" gain a parent of its own at all — this
  // test documents why that second, independent check is required rather
  // than folding it into eligibleParentOptions.
  assert.equal(isParentCategory(list2, "food"), true);
  const optionsForTransport = eligibleParentOptions(list2, "transport", "expense").map((c) => c.id);
  assert.ok(optionsForTransport.includes("food"), "food is still a valid parent choice for a DIFFERENT category");
  // But food itself, being a parent, must never be offered ITS OWN parent
  // field at all -- simulated here the way categoryFormHtml (stage 3)
  // will actually gate it: only compute eligibleParentOptions for "food"
  // if isParentCategory(list2, "food") is false.
  const foodCanBeReParented = !isParentCategory(list2, "food");
  assert.equal(foodCanBeReParented, false);
});

// docs/specs/category-nesting.md stages 3+4: shared by Settings' category
// list and the Add screen's category select.
test("groupedCategories: a child is spliced in immediately after its parent, preserving original order otherwise", () => {
  const list = [
    { id: "transport", parentId: null, deleted: false },
    { id: "food", parentId: null, deleted: false },
    { id: "groceries", parentId: "food", deleted: false },
    { id: "dining", parentId: "food", deleted: false }
  ];
  const result = groupedCategories(list).map((c) => c.id);
  assert.deepEqual(result, ["transport", "food", "groceries", "dining"]);
});

test("groupedCategories: a category with a dangling parentId is treated as top-level, not dropped", () => {
  const list = [
    { id: "orphan", parentId: "missing", deleted: false },
    { id: "food", parentId: null, deleted: false }
  ];
  const result = groupedCategories(list).map((c) => c.id);
  assert.deepEqual(result.sort(), ["food", "orphan"]);
});

test("groupedCategories: a category whose parent is soft-deleted is treated as top-level", () => {
  const list = [
    { id: "p", parentId: null, deleted: true },
    { id: "c", parentId: "p", deleted: false }
  ];
  const result = groupedCategories(list).map((c) => c.id);
  assert.deepEqual(result, ["c"]);
});

test("groupedCategories: multiple children of the same parent keep their own relative order", () => {
  const list = [
    { id: "food", parentId: null, deleted: false },
    { id: "dining", parentId: "food", deleted: false },
    { id: "groceries", parentId: "food", deleted: false }
  ];
  const result = groupedCategories(list).map((c) => c.id);
  assert.deepEqual(result, ["food", "dining", "groceries"]);
});
