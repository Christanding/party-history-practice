(function () {
  const banks = [
    { id: "party", name: "原题库", questions: window.QUESTIONS || [], storeKey: "party-history-practice-v1" },
    { id: "chaoxing", name: "学习通题库", questions: window.CHAOXING_QUESTIONS || [], storeKey: "party-history-chaoxing-v1" },
    { id: "embedded", name: "嵌入式基础题库", questions: window.EMBEDDED_QUESTIONS || [], storeKey: "embedded-basics-practice-v1" },
    { id: "embedded2", name: "嵌入式基础题库2", questions: window.EMBEDDED_QUESTIONS_2 || [], storeKey: "embedded-basics-practice-v2" },
    { id: "embedded3", name: "嵌入式基础题库3", questions: window.EMBEDDED_QUESTIONS_3 || [], storeKey: "embedded-basics-practice-v3" },
  ];
  const activeBankKey = "party-history-active-bank-v1";
  const typeNames = { single: "单选", multiple: "多选", judge: "判断" };

  let activeBank = getInitialBank();
  let questions = activeBank.questions;
  let storeKey = activeBank.storeKey;
  let state = loadState();
  let mode = "normal";
  let order = questions.map((_, index) => index);
  let current = 0;
  let randomMode = false;
  let shouldRevealFeedback = false;
  const retryRecords = {};

  const els = {
    normalCount: document.getElementById("normalCount"),
    wrongCount: document.getElementById("wrongCount"),
    doneCount: document.getElementById("doneCount"),
    rightCount: document.getElementById("rightCount"),
    accuracy: document.getElementById("accuracy"),
    typeBadge: document.getElementById("typeBadge"),
    jumpForm: document.getElementById("jumpForm"),
    jumpInput: document.getElementById("jumpInput"),
    totalText: document.getElementById("totalText"),
    questionStem: document.getElementById("questionStem"),
    optionsForm: document.getElementById("optionsForm"),
    feedback: document.getElementById("feedback"),
    submitBtn: document.getElementById("submitBtn"),
    nextBtn: document.getElementById("nextBtn"),
    prevBtn: document.getElementById("prevBtn"),
    bankSelect: document.getElementById("bankSelect"),
    resetBtn: document.getElementById("resetBtn"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    openBankBtn: document.getElementById("openBankBtn"),
    clearWrongBtn: document.getElementById("clearWrongBtn"),
    bankDialog: document.getElementById("bankDialog"),
    closeBankBtn: document.getElementById("closeBankBtn"),
    bankSearch: document.getElementById("bankSearch"),
    bankTypeFilter: document.getElementById("bankTypeFilter"),
    bankTotal: document.getElementById("bankTotal"),
    bankList: document.getElementById("bankList"),
  };

  function getInitialBank() {
    const saved = localStorage.getItem(activeBankKey);
    return banks.find((bank) => bank.id === saved) || banks[0];
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storeKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return normalizeState(parsed);
    } catch {
      return normalizeState({});
    }
  }

  function normalizeState(value) {
    return {
      answered: value && value.answered && typeof value.answered === "object" ? value.answered : {},
      wrong: value && Array.isArray(value.wrong) ? value.wrong : [],
      cursorByMode: value && value.cursorByMode && typeof value.cursorByMode === "object" ? value.cursorByMode : {},
      wrongCorrectStreak: value && value.wrongCorrectStreak && typeof value.wrongCorrectStreak === "object" ? value.wrongCorrectStreak : {},
    };
  }

  function saveState() {
    localStorage.setItem(storeKey, JSON.stringify(state));
  }

  function switchBank(bankId) {
    const nextBank = banks.find((bank) => bank.id === bankId);
    if (!nextBank || nextBank.id === activeBank.id) return;
    activeBank = nextBank;
    questions = activeBank.questions;
    storeKey = activeBank.storeKey;
    state = loadState();
    mode = "normal";
    order = questions.map((_, index) => index);
    current = 0;
    randomMode = false;
    shouldRevealFeedback = false;
    Object.keys(retryRecords).forEach((key) => delete retryRecords[key]);
    localStorage.setItem(activeBankKey, activeBank.id);
    buildOrder(true);
  }

  function getEnabledTypes() {
    return Array.from(document.querySelectorAll(".filters input:checked")).map((input) => input.value);
  }

  function buildOrder(preferSavedCursor = false) {
    const enabled = new Set(getEnabledTypes());
    const wrongSet = new Set(state.wrong);
    order = questions
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => enabled.has(q.type))
      .filter(({ q }) => mode === "normal" || wrongSet.has(q.id))
      .filter(({ q }) => !randomMode || mode !== "normal" || !state.answered[q.id])
      .map(({ index }) => index);
    current = pickCurrentIndex(preferSavedCursor);
    render();
  }

  function pickCurrentIndex(preferSavedCursor) {
    if (!order.length) return 0;

    if (preferSavedCursor && state.cursorByMode[mode]) {
      const savedIndex = order.findIndex((index) => questions[index].id === state.cursorByMode[mode]);
      if (savedIndex >= 0) return savedIndex;
    }

    if (mode === "normal") {
      const firstUnanswered = order.findIndex((index) => !state.answered[questions[index].id]);
      if (firstUnanswered >= 0) return firstUnanswered;
    }

    return Math.min(current, order.length - 1);
  }

  function saveCursor() {
    if (!order.length) return;
    state.cursorByMode[mode] = questions[order[current]].id;
    saveState();
  }

  function shuffleOrder() {
    randomMode = true;
    buildOrder();
    order = buildBalancedRandomOrder(order);
    current = 0;
    render();
  }

  function buildBalancedRandomOrder(indices) {
    const groups = indices.reduce((acc, index) => {
      const type = questions[index].type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(index);
      return acc;
    }, {});

    Object.values(groups).forEach(shuffleInPlace);

    const result = [];
    let lastType = "";
    while (result.length < indices.length) {
      const availableTypes = Object.keys(groups).filter((type) => groups[type].length);
      const candidates = availableTypes.length > 1
        ? availableTypes.filter((type) => type !== lastType)
        : availableTypes;
      const type = candidates[Math.floor(Math.random() * candidates.length)];
      result.push(groups[type].pop());
      lastType = type;
    }

    return result;
  }

  function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }

  function selectedValues() {
    return Array.from(els.optionsForm.querySelectorAll("input:checked")).map((input) => input.value).sort();
  }

  function sameAnswer(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function render() {
    renderStats();

    document.querySelectorAll(".mode").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });

    if (!order.length) {
      els.typeBadge.textContent = mode === "wrong" ? "错题" : "题库";
      els.jumpInput.value = "";
      els.jumpInput.max = 0;
      els.jumpInput.disabled = true;
      els.totalText.textContent = "0";
      els.questionStem.textContent = mode === "wrong" ? "当前没有错题。" : "当前筛选没有题目。";
      els.optionsForm.innerHTML = "";
      els.feedback.hidden = true;
      els.submitBtn.hidden = false;
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = "提交答案";
      els.prevBtn.disabled = true;
      els.nextBtn.disabled = true;
      return;
    }

    const q = questions[order[current]];
    const record = mode === "wrong" ? retryRecords[q.id] : state.answered[q.id];
    els.typeBadge.textContent = typeNames[q.type];
    els.jumpInput.disabled = false;
    els.jumpInput.value = String(current + 1);
    els.jumpInput.max = String(order.length);
    els.totalText.textContent = String(order.length);
    els.questionStem.textContent = q.stem;
    els.optionsForm.innerHTML = "";
    els.feedback.hidden = true;

    q.options.forEach((option) => {
      const id = `${q.id}-${option.key}`;
      const label = document.createElement("label");
      label.className = "option";
      label.htmlFor = id;

      const input = document.createElement("input");
      input.id = id;
      input.name = q.id;
      input.type = q.type === "multiple" ? "checkbox" : "radio";
      input.value = option.key;

      if (record && record.selected.includes(option.key)) input.checked = true;
      if (record) input.disabled = true;

      const text = document.createElement("span");
      text.textContent = q.type === "judge" ? option.text : `${option.key}. ${option.text}`;
      label.append(input, text);

      if (record) {
        if (q.answer.includes(option.key)) label.classList.add("correct");
        if (record.selected.includes(option.key) && !q.answer.includes(option.key)) label.classList.add("wrong");
      }
      els.optionsForm.append(label);
    });

    if (record) showFeedback(q, record.ok, record.selected);
    els.submitBtn.hidden = q.type !== "multiple";
    els.submitBtn.disabled = q.type !== "multiple" || Boolean(record);
    els.submitBtn.textContent = record ? "已提交" : "提交答案";
    els.prevBtn.disabled = false;
    els.nextBtn.disabled = false;
    saveCursor();
  }

  function showFeedback(q, ok, selected) {
    els.feedback.hidden = false;
    els.feedback.className = `feedback ${ok ? "ok" : "bad"}`;
    const mine = selected.length ? selected.join("") : "未选择";
    if (mode === "wrong" && ok && state.wrong.includes(q.id)) {
      const streak = Number(state.wrongCorrectStreak[q.id]) || 1;
      els.feedback.textContent = `回答正确。答案：${q.answer.join("")}。已连续答对 ${streak} 次，连续答对 2 次后移出错题。`;
    } else {
      els.feedback.textContent = ok ? `回答正确。答案：${q.answer.join("")}` : `回答错误。你的答案：${mine}；正确答案：${q.answer.join("")}`;
    }
    revealFeedbackIfNeeded();
  }

  function showMessage(message) {
    els.feedback.hidden = false;
    els.feedback.className = "feedback bad";
    els.feedback.textContent = message;
    shouldRevealFeedback = true;
    revealFeedbackIfNeeded();
  }

  function revealFeedbackIfNeeded() {
    if (!shouldRevealFeedback) return;
    shouldRevealFeedback = false;
    requestAnimationFrame(() => {
      els.feedback.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function jumpToInputValue() {
    if (!order.length) return;
    const raw = els.jumpInput.value.trim();
    const target = Number(raw);
    if (!Number.isInteger(target) || target < 1 || target > order.length) {
      els.jumpInput.value = String(current + 1);
      showMessage(`第 ${raw || "-"} 题不存在。当前范围是 1 到 ${order.length}。`);
      return;
    }
    current = target - 1;
    render();
  }

  function submitCurrent() {
    if (!order.length) return;
    const q = questions[order[current]];
    const selected = selectedValues();
    if (!selected.length) {
      shouldRevealFeedback = true;
      els.feedback.hidden = false;
      els.feedback.className = "feedback bad";
      els.feedback.textContent = "请先选择答案。";
      revealFeedbackIfNeeded();
      return;
    }

    const answer = [...q.answer].sort();
    const ok = sameAnswer(selected, answer);
    const record = { selected, ok };
    state.answered[q.id] = record;
    if (mode === "wrong") retryRecords[q.id] = record;
    const wrongSet = new Set(state.wrong);
    if (mode === "wrong") {
      const streak = ok ? (Number(state.wrongCorrectStreak[q.id]) || 0) + 1 : 0;
      state.wrongCorrectStreak[q.id] = streak;
      if (ok && streak >= 2) {
        wrongSet.delete(q.id);
        delete state.wrongCorrectStreak[q.id];
      } else {
        wrongSet.add(q.id);
      }
    } else if (ok) {
      delete state.wrongCorrectStreak[q.id];
    } else {
      wrongSet.add(q.id);
      state.wrongCorrectStreak[q.id] = 0;
    }
    state.wrong = Array.from(wrongSet);
    saveState();
    shouldRevealFeedback = true;
    render();
  }

  function renderStats() {
    const answered = Object.values(state.answered);
    const right = answered.filter((item) => item.ok).length;
    const done = answered.length;
    els.normalCount.textContent = questions.length;
    els.wrongCount.textContent = state.wrong.length;
    els.doneCount.textContent = done;
    els.rightCount.textContent = right;
    els.accuracy.textContent = done ? `${((right / done) * 100).toFixed(2)}%` : "0.00%";
    els.shuffleBtn.textContent = randomMode ? "随机未答" : "随机顺序";
    els.bankSelect.value = activeBank.id;
  }

  function renderBank() {
    const keyword = els.bankSearch.value.trim().toLowerCase();
    const type = els.bankTypeFilter.value;
    const rows = questions.filter((q) => {
      if (type !== "all" && q.type !== type) return false;
      if (!keyword) return true;
      const haystack = [q.stem, q.answer.join(""), ...q.options.map((option) => option.text)].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });

    els.bankTotal.textContent = `${activeBank.name}：共 ${rows.length} / ${questions.length} 题`;
    els.bankList.innerHTML = "";

    const fragment = document.createDocumentFragment();
    rows.forEach((q, index) => {
      const article = document.createElement("article");
      article.className = "bankItem";
      const record = state.answered[q.id];
      const status = record ? (record.ok ? "已答对" : "已答错") : "未答";
      const options = q.options
        .map((option) => `<li>${q.type === "judge" ? escapeHtml(option.text) : `${option.key}. ${escapeHtml(option.text)}`}</li>`)
        .join("");

      article.innerHTML = `
        <div class="bankMeta">
          <span class="badge">${typeNames[q.type]}</span>
          <span>第 ${index + 1} 题</span>
          <span>${status}</span>
        </div>
        <h3>${escapeHtml(q.stem)}</h3>
        <ol>${options}</ol>
        <p>答案：<strong>${escapeHtml(q.answer.join(""))}</strong></p>
      `;
      fragment.append(article);
    });

    els.bankList.append(fragment);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      randomMode = false;
      current = 0;
      buildOrder(true);
    });
  });

  document.querySelectorAll(".filters input").forEach((input) => {
    input.addEventListener("change", () => buildOrder());
  });

  els.bankSelect.addEventListener("change", () => switchBank(els.bankSelect.value));
  els.submitBtn.addEventListener("click", submitCurrent);
  els.jumpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    jumpToInputValue();
    els.jumpInput.blur();
  });
  els.jumpInput.addEventListener("blur", jumpToInputValue);
  els.nextBtn.addEventListener("click", () => {
    if (!order.length) return;
    const q = questions[order[current]];
    if (mode === "wrong") delete retryRecords[q.id];
    const stillInWrongList = mode !== "wrong" || state.wrong.includes(q.id);
    if (randomMode && mode === "normal") {
      if (state.answered[q.id]) {
        order = order.filter((index) => !state.answered[questions[index].id]);
        current = Math.min(current, Math.max(order.length - 1, 0));
      } else {
        current = (current + 1) % order.length;
      }
      render();
      return;
    }
    if (stillInWrongList) current = (current + 1) % order.length;
    if (mode === "wrong") buildOrder();
    else render();
  });
  els.prevBtn.addEventListener("click", () => {
    if (!order.length) return;
    if (mode === "wrong") delete retryRecords[questions[order[current]].id];
    current = (current - 1 + order.length) % order.length;
    render();
  });
  els.shuffleBtn.addEventListener("click", shuffleOrder);
  els.openBankBtn.addEventListener("click", () => {
    renderBank();
    els.bankDialog.showModal();
  });
  els.closeBankBtn.addEventListener("click", () => els.bankDialog.close());
  els.bankSearch.addEventListener("input", renderBank);
  els.bankTypeFilter.addEventListener("change", renderBank);
  els.resetBtn.addEventListener("click", () => {
    if (!confirm(`确定清空“${activeBank.name}”的答题进度和错题吗？`)) return;
    state = normalizeState({});
    saveState();
    current = 0;
    buildOrder();
  });
  els.clearWrongBtn.addEventListener("click", () => {
    if (!confirm(`确定清空“${activeBank.name}”的错题吗？`)) return;
    state.wrong = [];
    state.wrongCorrectStreak = {};
    saveState();
    if (mode === "wrong") current = 0;
    buildOrder();
  });

  els.optionsForm.addEventListener("change", () => {
    if (!order.length) return;
    const q = questions[order[current]];
    const record = mode === "wrong" ? retryRecords[q.id] : state.answered[q.id];
    if (record) return;

    if (q.type === "multiple") {
      const selected = selectedValues();
      els.feedback.hidden = false;
      els.feedback.className = "feedback note";
      els.feedback.textContent = selected.length
        ? `已选择：${selected.join("")}。多选题选完后点“提交答案”。`
        : "请选择答案。";
      return;
    }

    submitCurrent();
  });

  buildOrder(true);
})();
