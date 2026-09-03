// Study Quiz - 依存ライブラリなしの単一ファイルアプリ。
// 状態: questions.json (問題) + localStorage (正誤履歴)

"use strict";

const STORAGE_KEY = "study-quiz.history.v1";
const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

// ---------- 履歴 (localStorage) ----------
// { [questionId]: { correct: n, wrong: n, last: epoch_ms, lastCorrect: bool } }
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveHistory(h) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); } catch { /* 容量超過などは無視 */ }
}
// ok: true = 正解 / false = 不正解 / null = わからない (不正解として数え、unknown にも記録)
function record(qid, ok) {
  const h = loadHistory();
  const e = h[qid] || { correct: 0, wrong: 0, unknown: 0 };
  if (ok) e.correct++; else e.wrong++;
  if (ok === null) e.unknown = (e.unknown || 0) + 1;
  ok = ok === true;
  e.last = Date.now();
  e.lastCorrect = ok;
  h[qid] = e;
  saveHistory(h);
}

// ---------- 軽量 Markdown (```code```, `code`, 改行) ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function render(md) {
  const parts = md.split(/```(\w*)\n([\s\S]*?)```/g);
  let out = "";
  for (let i = 0; i < parts.length; i += 3) {
    out += escapeHtml(parts[i]).replace(/`([^`]+)`/g, "<code>$1</code>");
    if (i + 2 < parts.length) out += `<pre><code>${escapeHtml(parts[i + 2].replace(/\n$/, ""))}</code></pre>`;
  }
  return out;
}

// ---------- 出題ロジック ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// 苦手優先: 未出題 > 前回間違い > 正答率が低い の順に重みを付けて並べ替え
function pickQuestions(pool, n, weakFirst) {
  const h = loadHistory();
  const scored = shuffle(pool.slice()).map((q) => {
    const e = h[q.id];
    let w = 0;
    if (!e) w = 3;
    else if (e.lastCorrect === false) w = 2;
    else w = 1 - e.correct / (e.correct + e.wrong);
    return { q, w };
  });
  if (weakFirst) scored.sort((a, b) => b.w - a.w);
  const picked = scored.map((s) => s.q);
  return n > 0 ? picked.slice(0, n) : picked;
}

// ---------- 画面 ----------
let DATA = null;
const state = { category: null, queue: [], index: 0, results: [] };

function mount(tplId) {
  app.replaceChildren($(`#${tplId}`).content.cloneNode(true));
}

function showHome() {
  mount("tpl-home");
  const list = $("#category-list");
  const cats = [{ id: "all", title: "全部", count: DATA.questions.length }, ...DATA.categories];
  for (const c of cats) {
    const b = document.createElement("button");
    b.className = "card" + (state.category === c.id ? " selected" : "");
    b.innerHTML = `${escapeHtml(c.title)}<span class="count">${c.count} 問</span>`;
    b.onclick = () => { state.category = c.id; showHome(); };
    list.appendChild(b);
  }
  $("#btn-start").disabled = !state.category;
  $("#btn-start").onclick = () => {
    const pool = state.category === "all" ? DATA.questions : DATA.questions.filter((q) => q.category === state.category);
    startQuiz(pickQuestions(pool, Number($("#count").value), $("#weak-first").checked));
  };
  $("#btn-reset").onclick = () => { if (confirm("成績をすべて消しますか?")) { localStorage.removeItem(STORAGE_KEY); showHome(); } };
  renderStats();
}

function renderStats() {
  const h = loadHistory();
  const rows = DATA.categories.map((c) => {
    const qs = DATA.questions.filter((q) => q.category === c.id);
    let correct = 0, wrong = 0, seen = 0;
    for (const q of qs) { const e = h[q.id]; if (e) { seen++; correct += e.correct; wrong += e.wrong; } }
    const total = correct + wrong;
    return { title: c.title, seen, n: qs.length, rate: total ? Math.round((100 * correct) / total) : null };
  });
  $("#stats").innerHTML = `<table class="stats"><tr><th>カテゴリ</th><th>解いた</th><th>正答率</th></tr>` +
    rows.map((r) => `<tr><td>${escapeHtml(r.title)}</td><td class="num">${r.seen} / ${r.n}</td><td class="num">${r.rate === null ? "-" : r.rate + "%"}</td></tr>`).join("") +
    `</table>`;
}

function startQuiz(queue) {
  if (!queue.length) { alert("出題できる問題がありません"); return; }
  state.queue = queue; state.index = 0; state.results = [];
  showQuestion();
}

function showQuestion() {
  mount("tpl-quiz");
  const q = state.queue[state.index];
  $("#progress-bar").style.width = `${(100 * state.index) / state.queue.length}%`;
  $("#q-index").textContent = `${state.index + 1} / ${state.queue.length}`;
  $("#q-category").textContent = q.categoryTitle;
  $("#q-difficulty").textContent = "★".repeat(q.difficulty);
  $("#q-text").innerHTML = render(q.question);
  const choices = $("#choices");
  // 選択肢の順番をシャッフルして丸暗記を防ぐ
  const order = shuffle(q.choices.map((_, i) => i));
  for (const i of order) {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = render(q.choices[i]);
    b.onclick = () => answer(q, i, b);
    choices.appendChild(b);
  }
  $("#btn-unknown").onclick = () => answer(q, null, null);
  window.scrollTo(0, 0);
}

function answer(q, chosen, btn) {
  const skipped = chosen === null;
  const ok = !skipped && chosen === q.answer;
  record(q.id, skipped ? null : ok);
  state.results.push({ q, chosen, ok, skipped });
  for (const b of $("#choices").children) b.disabled = true;
  $("#btn-unknown").disabled = true;
  if (btn) btn.classList.add(ok ? "correct" : "wrong");
  if (!ok) {
    // 正解の選択肢を緑で示す
    const idx = [...$("#choices").children].findIndex((b) => b.innerHTML === render(q.choices[q.answer]));
    if (idx >= 0) $("#choices").children[idx].classList.add("correct");
  }
  const fb = $("#feedback");
  fb.hidden = false;
  $("#feedback-result").textContent = skipped ? "わからない → 正解は緑の選択肢" : ok ? "正解!" : "不正解";
  $("#feedback-result").className = "result " + (skipped ? "skip" : ok ? "ok" : "ng");
  $("#feedback-explanation").innerHTML = render(q.explanation);
  const next = $("#btn-next");
  next.textContent = state.index + 1 < state.queue.length ? "次へ" : "結果を見る";
  next.onclick = () => { state.index++; state.index < state.queue.length ? showQuestion() : showResult(); };
  next.scrollIntoView({ behavior: "smooth", block: "end" });
}

function showResult() {
  mount("tpl-result");
  const n = state.results.length;
  const ok = state.results.filter((r) => r.ok).length;
  const skipped = state.results.filter((r) => r.skipped).length;
  $("#score").textContent = `${ok} / ${n} 正解 (${Math.round((100 * ok) / n)}%)`;
  const wrong = state.results.filter((r) => !r.ok);
  $("#wrong-list").innerHTML = wrong.length
    ? `<h2>間違えた問題 (不正解 ${wrong.length - skipped} ・ わからない ${skipped})</h2>` + wrong.map((r) =>
        `<div class="wrong-item"><span class="tag">${r.skipped ? "わからない" : "不正解"}</span><div class="q">${render(r.q.question)}</div><div class="a">正解: ${render(r.q.choices[r.q.answer])}</div></div>`).join("")
    : "<p>全問正解!</p>";
  const retry = $("#btn-retry-wrong");
  retry.hidden = !wrong.length;
  retry.onclick = () => startQuiz(shuffle(wrong.map((r) => r.q)));
  $("#btn-back").onclick = showHome;
  window.scrollTo(0, 0);
}

// ---------- 起動 ----------
async function main() {
  $("#btn-home").onclick = showHome;
  const badge = $("#offline-badge");
  const updateOnline = () => { badge.hidden = navigator.onLine; };
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW 登録失敗", e));
  }
  const res = await fetch("questions.json");
  DATA = await res.json();
  showHome();
}
main().catch((e) => { app.innerHTML = `<p>読み込みに失敗しました: ${escapeHtml(String(e))}</p>`; });
