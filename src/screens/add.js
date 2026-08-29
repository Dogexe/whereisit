import { L } from "../i18n.js";
import { state, transactions, setTransactions } from "../state.js";
import { $, uid, escapeHtml, dateLabel, formatDateTyping, parseDateText, optionsHtml, refreshIcons } from "../utils.js";
import { CATEGORIES, guessCategory } from "../categories.js";
import { checkBudgetAlert } from "../derived.js";
import { saveToStorage } from "../storage.js";
import { pushTx, pushDeleteTx, syncNow } from "../sync.js";
import { showToast } from "../toast.js";
import { setTab, renderScreen } from "./router.js";

export function resetForm() {
  state.formType = "expense";
  state.formDate = new Date().toISOString().slice(0, 10);
  state.formCategory = CATEGORIES.expense[0];
  state.editingId = null;
  state.categoryManual = false;
}
export function editTx(id) {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  state.editingId = id;
  state.formType = tx.type;
  state.formDate = tx.date;
  state.formCategory = tx.category;
  state.categoryManual = true;
  setTab("add");
}
export function deleteTx(id) {
  if (state.editingId === id) resetForm();
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  setTransactions(transactions.filter((t) => t.id !== id));
  saveToStorage();
  renderScreen();
  tx.updatedAt = Date.now();
  pushDeleteTx(tx).then(() => syncNow());
  showToast(L().toastDeleted, () => {
    const restored = Object.assign({}, tx, { updatedAt: Date.now() });
    transactions.push(restored);
    saveToStorage();
    renderScreen();
    pushTx(restored).then(() => syncNow());
  });
}
export function renderFormCategoryOptions(select) {
  const opts = state.formType === "income" ? CATEGORIES.income : CATEGORIES.expense;
  select.innerHTML = optionsHtml(opts, state.formCategory);
}
export function renderAdd() {
  const l = L();
  const isEditing = !!state.editingId;
  $("screen").innerHTML = `
    <h2 class="screen-title">${escapeHtml(isEditing ? l.editTitle : l.addTitle)}</h2>
    <form class="add-form" id="addForm">
      <div class="field">
        <label>${escapeHtml(l.typeLabel)}</label>
        <div class="tabs block" role="radiogroup">
          <label class="tab-opt"><input type="radio" name="form-type" value="expense" ${state.formType === "expense" ? "checked" : ""}>${escapeHtml(l.expenseLabel)}</label>
          <label class="tab-opt"><input type="radio" name="form-type" value="income" ${state.formType === "income" ? "checked" : ""}>${escapeHtml(l.incomeLabel)}</label>
        </div>
      </div>
      <div class="field">
        <label for="txDateText">${escapeHtml(l.dateLabel)}</label>
        <div class="date-input-wrap">
          <div class="input-wrap">
            <input type="text" id="txDateText" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" value="${dateLabel(state.formDate)}" required>
          </div>
          <svg class="date-icon icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <input class="date-native-overlay" type="date" id="txDateNative" value="${state.formDate}" tabindex="-1" aria-hidden="true">
        </div>
      </div>
      <div class="field">
        <label for="txCategory">${escapeHtml(l.categoryLabel)}</label>
        <select class="input" id="txCategory" required></select>
      </div>
      <div class="field">
        <label for="txAmount">${escapeHtml(l.amountLabel)}</label>
        <div class="input-wrap"><span class="prefix">฿</span><input type="number" id="txAmount" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="field">
        <label for="txNote">${escapeHtml(l.noteLabel)}</label>
        <div class="input-wrap"><input type="text" id="txNote" placeholder="${escapeHtml(l.notePlaceholder)}"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${escapeHtml(isEditing ? l.saveEditBtn : l.saveBtn)}</button>
      ${isEditing ? `<button type="button" class="btn btn-secondary btn-block" id="cancelEditBtn">${escapeHtml(l.cancelEditBtn)}</button>` : ""}
    </form>
  `;
  renderFormCategoryOptions($("txCategory"));
  if (isEditing) {
    const tx = transactions.find((t) => t.id === state.editingId);
    if (tx) { $("txAmount").value = tx.amount; $("txNote").value = tx.note || ""; }
  }
  document.querySelectorAll('input[name="form-type"]').forEach((r) => r.addEventListener("change", (e) => {
    state.formType = e.target.value;
    const guess = state.categoryManual ? state.formCategory : guessCategory($("txNote").value, state.formType);
    const opts = state.formType === "income" ? CATEGORIES.income : CATEGORIES.expense;
    state.formCategory = (guess && opts.includes(guess)) ? guess : opts[0];
    renderFormCategoryOptions($("txCategory"));
  }));
  $("txCategory").addEventListener("change", (e) => { state.formCategory = e.target.value; state.categoryManual = true; });
  $("txDateText").addEventListener("input", function () { this.value = formatDateTyping(this.value); });
  $("txDateText").addEventListener("change", function () {
    const iso = parseDateText(this.value);
    if (iso) { state.formDate = iso; $("txDateNative").value = iso; }
    else { this.value = dateLabel(state.formDate); }
  });
  $("txDateNative").addEventListener("change", function () {
    if (this.value) { state.formDate = this.value; $("txDateText").value = dateLabel(this.value); }
  });
  $("txAmount").addEventListener("input", function () {
    this.closest(".input-wrap").classList.remove("has-error");
    this.removeAttribute("aria-invalid");
  });
  $("txNote").addEventListener("input", function () {
    if (state.categoryManual) return;
    const guess = guessCategory(this.value, state.formType);
    if (guess) { state.formCategory = guess; $("txCategory").value = guess; }
  });
  if (isEditing) $("cancelEditBtn").addEventListener("click", () => { resetForm(); setTab("transactions"); });
  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const date = state.formDate;
    const amount = parseFloat($("txAmount").value);
    if (!date || !amount || amount <= 0) {
      $("txAmount").closest(".input-wrap").classList.add("has-error");
      $("txAmount").setAttribute("aria-invalid", "true");
      showToast(L().toastInvalidAmount);
      return;
    }
    const note = $("txNote").value.trim();
    const category = $("txCategory").value;
    let savedTx = null;
    if (state.editingId) {
      const idx = transactions.findIndex((t) => t.id === state.editingId);
      if (idx >= 0) {
        transactions[idx] = Object.assign({}, transactions[idx], { type: state.formType, date, category, amount, note, updatedAt: Date.now() });
        savedTx = transactions[idx];
      }
      showToast(L().toastEdited);
    } else {
      savedTx = { id: uid(), type: state.formType, date, category, amount, note, updatedAt: Date.now() };
      transactions.push(savedTx);
      showToast(checkBudgetAlert(savedTx) || L().toastAdded);
    }
    saveToStorage();
    resetForm();
    setTab("transactions");
    if (savedTx) pushTx(savedTx).then(() => syncNow());
  });
  refreshIcons();
}
