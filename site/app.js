// Study Quiz - 依存ライブラリなしの単一ファイルアプリ。
// データ: data.json (カテゴリ / レッスン / 問題)。学習記録: localStorage。
//
// 学習の流れ:
//   レッスンを読む → 確認問題 (8 割で合格) → 次のレッスン
//   解いた問題は間隔反復 (1 → 3 → 7 → 14 → 30 → 60 日) で「今日の復習」に戻ってくる

"use strict";

const STORAGE_KEY = "study-quiz.v2";
const LEGACY_KEY = "study-quiz.history.v1";
const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];
const PASS_RATE = 0.8;
const REVIEW_MAX = 20;
const DAY = 24 * 60 * 60 * 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

// ---------- 学習記録 (localStorage) ----------
// { history: { [qid]: { correct, wrong, unknown, streak, due, last, lastCorrect } },
//   lessons: { [lessonId]: { done, best, at } } }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.history) { s.project ||= {}; return s; }
  } catch { /* 壊れていたら作り直す */ }
  let history = {};
  try { history = JSON.parse(localStorage.getItem(LEGACY_KEY)) || {}; } catch { /* なし */ }
  return { history, lessons: {}, project: {} };
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* 容量超過などは無視 */ }
}

// ok: true = 正解 / false = 不正解 / null = わからない
function record(qid, ok) {
  const s = loadState();
  const e = s.history[qid] || { correct: 0, wrong: 0, unknown: 0, streak: 0, due: 0 };
  const now = Date.now();
  if (ok === true) {
    e.correct++;
    e.streak = (e.streak || 0) + 1;
    e.due = now + INTERVALS_DAYS[Math.min(e.streak - 1, INTERVALS_DAYS.length - 1)] * DAY;
  } else {
    e.wrong++;
    if (ok === null) e.unknown = (e.unknown || 0) + 1;
    e.streak = 0;
    e.due = now + 1 * DAY;
  }
  e.last = now;
  e.lastCorrect = ok === true;
  s.history[qid] = e;
  saveState(s);
}

function toggleStepDone(stepId) {
  const s = loadState();
  const prev = s.project[stepId] || { done: false };
  s.project[stepId] = { done: !prev.done, at: Date.now() };
  saveState(s);
  return s.project[stepId].done;
}

function togglePracticed(lessonId) {
  const s = loadState();
  const prev = s.lessons[lessonId] || { done: false, best: 0 };
  s.lessons[lessonId] = { ...prev, practiced: !prev.practiced, practicedAt: Date.now() };
  saveState(s);
  return s.lessons[lessonId].practiced;
}

function markLesson(lessonId, rate) {
  const s = loadState();
  const prev = s.lessons[lessonId] || { done: false, best: 0 };
  s.lessons[lessonId] = { done: prev.done || rate >= PASS_RATE, best: Math.max(prev.best, rate), at: Date.now() };
  saveState(s);
}

// ---------- 軽量 Markdown (問題文用: ```code```, `code`, 改行) ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
// 苦手優先: 未出題 > 前回間違い > 正答率が低い の順
function pickQuestions(pool, n, weakFirst) {
  const h = loadState().history;
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
// 復習期限が来ている問題 (期限の古い順)
function dueQuestions(state) {
  const now = Date.now();
  return DATA.questions
    .filter((q) => { const e = state.history[q.id]; return e && (e.due || 0) <= now; })
    .sort((a, b) => (state.history[a.id].due || 0) - (state.history[b.id].due || 0));
}
function lessonsOf(catId) {
  return DATA.lessons.filter((l) => l.category === catId).sort((a, b) => a.order - b.order);
}
function questionsOfLesson(lessonId) {
  return DATA.questions.filter((q) => q.lesson === lessonId);
}
function nextLesson(lessonId) {
  const l = DATA.lessons.find((x) => x.id === lessonId);
  const list = lessonsOf(l.category);
  return list[list.findIndex((x) => x.id === lessonId) + 1] || null;
}
// 学習済み = 合格したレッスンの問題 (問題は必ずレッスンに属する)
function learnedPool(state, catId) {
  return DATA.questions.filter((q) =>
    (catId === "all" || q.category === catId) && state.lessons[q.lesson]?.done);
}

// ---------- 画面 ----------
let DATA = null;
const state = { mode: "random", lessonId: null, queue: [], index: 0, results: [], randCategory: "all" };

function mount(tplId, pushHistory = true) {
  app.replaceChildren($(`#${tplId}`).content.cloneNode(true));
  if (pushHistory) history.pushState({ screen: tplId }, "");
  window.scrollTo(0, 0);
}

function showHome() {
  if (updateReady) { location.reload(); return; }
  mount("tpl-home", false);
  const s = loadState();

  // 今日の復習
  const due = dueQuestions(s);
  const seen = Object.keys(s.history).length;
  $("#review-count").textContent = `${due.length} 問`;
  $("#review-note").textContent = due.length ? "間隔反復。忘れかけた頃に出ます" : seen ? "今日の分は終わり。明日また" : "レッスンを解くと、ここに復習が溜まります";
  $("#btn-review").disabled = !due.length;
  $("#btn-review").onclick = () => startQuiz(due.slice(0, REVIEW_MAX), { mode: "review" });

  // プロジェクト (1 本の筋)
  {
    const P = DATA.project;
    const card = $("#project-card");
    if (!P.steps.length) { card.hidden = true; }
    else {
      const done = P.steps.filter((st) => s.project[st.id]?.done).length;
      const next = P.steps.find((st) => !s.project[st.id]?.done);
      card.innerHTML = `<span class="title">${escapeHtml(P.title)}</span>
        <span class="pct ${done === P.steps.length ? "done" : done ? "started" : ""}">${done} / ${P.steps.length}</span>
        <span class="sub">${next ? "次: " + escapeHtml(next.title) : "すべて完了"}</span>
        <span class="bar"><div style="width:${(100 * done) / P.steps.length}%"></div></span>`;
      card.onclick = () => showProject();
    }
  }

  // コース一覧 (コンパクト)。タップでコース画面へ
  const courses = $("#courses");
  for (const c of DATA.categories) {
    const lessons = lessonsOf(c.id);
    const done = lessons.filter((l) => s.lessons[l.id]?.done).length;
    const next = lessons.find((l) => !s.lessons[l.id]?.done) || null;
    const pct = lessons.length ? Math.round((100 * done) / lessons.length) : 0;
    const b = document.createElement("button");
    b.className = "course-card";
    const state_ = done === lessons.length && lessons.length ? "done" : done ? "started" : "";
    b.innerHTML = `<span class="title">${escapeHtml(c.title)}</span>
      <span class="pct ${state_}">${done} / ${lessons.length}</span>
      <span class="sub">${next ? "次: " + escapeHtml(next.title) : "用意されたレッスンは完了"} ・ ${c.questionCount} 問${c.planned.length ? ` ・ 準備中 ${c.planned.length}` : ""}</span>
      <span class="bar"><div style="width:${pct}%"></div></span>`;
    b.onclick = () => showCourse(c.id);
    courses.appendChild(b);
  }

  // ランダム演習
  const sel = $("#rand-category");
  for (const c of [{ id: "all", title: "全部" }, ...DATA.categories]) {
    const o = document.createElement("option");
    o.value = c.id; o.textContent = c.title;
    sel.appendChild(o);
  }
  sel.value = state.randCategory;
  sel.onchange = () => { state.randCategory = sel.value; };
  $("#btn-start").onclick = () => {
    const cat = sel.value;
    const pool = $("#learned-only").checked
      ? learnedPool(loadState(), cat)
      : DATA.questions.filter((q) => cat === "all" || q.category === cat);
    if (!pool.length) { alert("まだ学習済みの範囲がありません。レッスンを 1 つ終えるか、「学習済みの範囲だけ」を外してください"); return; }
    startQuiz(pickQuestions(pool, Number($("#count").value), $("#weak-first").checked), { mode: "random" });
  };

  renderStats(s);
  $("#app-version").textContent = DATA.meta?.version || "-";
  $("#app-built").textContent = DATA.meta?.builtAt || "-";
  $("#btn-check-update").onclick = checkForUpdate;
  $("#btn-reset").onclick = () => {
    if (confirm("レッスンの進捗と成績をすべて消しますか?")) {
      localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_KEY); showHome();
    }
  };
}

function renderStats(s) {
  const rows = DATA.categories.map((c) => {
    const qs = DATA.questions.filter((q) => q.category === c.id);
    let correct = 0, wrong = 0, seen = 0;
    for (const q of qs) { const e = s.history[q.id]; if (e) { seen++; correct += e.correct; wrong += e.wrong; } }
    const total = correct + wrong;
    return { title: c.title, seen, n: qs.length, rate: total ? Math.round((100 * correct) / total) : null };
  });
  $("#stats").innerHTML = `<table class="stats"><tr><th>カテゴリ</th><th class="num">問題数</th><th class="num">解いた</th><th class="num">正答率</th></tr>` +
    rows.map((r) => `<tr><td>${escapeHtml(r.title)}</td><td class="num">${r.n}</td><td class="num">${r.seen}</td><td class="num">${r.rate === null ? "-" : r.rate + "%"}</td></tr>`).join("") +
    `</table>`;
}

function showProject() {
  const P = DATA.project;
  const s = loadState();
  const done = P.steps.filter((st) => s.project[st.id]?.done).length;
  const next = P.steps.find((st) => !s.project[st.id]?.done) || null;
  mount("tpl-project");
  $("#project-title").textContent = P.title;
  $("#project-desc").textContent = P.description;
  $("#project-progress").textContent = `${done} / ${P.steps.length} ステップ完了`;
  $("#project-bar").style.width = `${(100 * done) / P.steps.length}%`;
  if (next) {
    const b = $("#btn-project-continue");
    b.hidden = false;
    b.textContent = done ? `続きから: ${next.title}` : `始める: ${next.title}`;
    b.onclick = () => showStep(next.id);
  }
  const wrap = $("#project-steps");
  let phase = null;
  P.steps.forEach((st, i) => {
    if (st.phase !== phase) {
      phase = st.phase;
      const h = document.createElement("div");
      h.className = "phase-head"; h.textContent = phase;
      wrap.appendChild(h);
    }
    const state_ = s.project[st.id]?.done ? "done" : next && next.id === st.id ? "next" : "todo";
    const b = document.createElement("button");
    b.className = `step-row ${state_}`;
    b.innerHTML = `<span class="icon">${state_ === "done" ? "✓" : state_ === "next" ? "▶" : "○"}</span>
      <span>${i + 1}. ${escapeHtml(st.title)}<span class="sub">${escapeHtml(st.summary)}</span></span>
      <span class="mins">${st.minutes} 分</span>`;
    b.onclick = () => showStep(st.id);
    wrap.appendChild(b);
  });
  $("#btn-project-back").onclick = showHome;
}

function showStep(stepId) {
  const P = DATA.project;
  const s = loadState();
  const idx = P.steps.findIndex((x) => x.id === stepId);
  const st = P.steps[idx];
  mount("tpl-step");
  $("#step-phase").textContent = st.phase;
  $("#step-position").textContent = `${idx + 1} / ${P.steps.length}`;
  $("#step-minutes").textContent = st.minutes;
  $("#step-title").textContent = st.title;
  $("#step-summary").textContent = st.summary;
  const pre = $("#step-prereqs");
  for (const lid of st.prereqs) {
    const l = DATA.lessons.find((x) => x.id === lid);
    const passed = !!s.lessons[lid]?.done;
    const b = document.createElement("button");
    b.className = `lesson-row ${passed ? "done" : "todo"}`;
    b.innerHTML = `<span class="icon">${passed ? "✓" : "○"}</span><span>${escapeHtml(l.title)}</span><span class="mins">${escapeHtml(l.categoryTitle || DATA.categories.find((c) => c.id === l.category).title)}</span>`;
    b.onclick = () => showLesson(lid);
    pre.appendChild(b);
  }
  $("#step-body").innerHTML = st.html;
  const dbtn = $("#btn-step-done");
  const renderDone = (on) => { dbtn.textContent = on ? "✓ 完了 (取り消す)" : "このステップを完了にする"; dbtn.classList.toggle("done", on); };
  renderDone(!!s.project[stepId]?.done);
  dbtn.onclick = () => renderDone(toggleStepDone(stepId));
  const next = P.steps[idx + 1];
  if (next) {
    const nb = $("#btn-step-next");
    nb.hidden = false; nb.textContent = `次のステップ: ${next.title}`;
    nb.onclick = () => showStep(next.id);
  }
  $("#btn-step-back").onclick = showProject;
}

function showCourse(catId) {
  const c = DATA.categories.find((x) => x.id === catId);
  const s = loadState();
  const lessons = lessonsOf(catId);
  const done = lessons.filter((l) => s.lessons[l.id]?.done).length;
  const next = lessons.find((l) => !s.lessons[l.id]?.done) || null;
  mount("tpl-course");
  $("#course-title").textContent = c.title;
  $("#course-desc").textContent = c.description;
  const practicedCount = lessons.filter((l) => s.lessons[l.id]?.practiced).length;
  $("#course-progress").textContent = `合格 ${done} / ${lessons.length} ・ 実践 ${practicedCount} / ${lessons.length} ・ ${c.questionCount} 問${c.planned.length ? ` ・ 準備中 ${c.planned.length}` : ""}`;
  const total = lessons.length + c.planned.length;
  $("#course-bar").style.width = `${total ? (100 * done) / total : 0}%`;
  if (next) {
    const b = $("#btn-course-continue");
    b.hidden = false;
    b.textContent = done ? `続きから: ${next.title}` : `始める: ${next.title}`;
    b.onclick = () => showLesson(next.id);
  }
  const list = $("#course-lessons");
  for (const l of lessons) {
    const st = s.lessons[l.id]?.done ? "done" : next && next.id === l.id ? "next" : "todo";
    const b = document.createElement("button");
    b.className = `lesson-row ${st}`;
    const practiced = s.lessons[l.id]?.practiced ? '<span class="practiced" title="やってみた">🛠</span>' : "";
    b.innerHTML = `<span class="icon">${st === "done" ? "✓" : st === "next" ? "▶" : "○"}</span><span>${escapeHtml(l.title)}</span><span class="mins">${practiced}${l.minutes} 分</span>`;
    b.onclick = () => showLesson(l.id);
    list.appendChild(b);
  }
  if (c.planned.length) {
    $("#course-planned-head").hidden = false;
    const planned = $("#course-planned");
    for (const title of c.planned) {
      const d = document.createElement("div");
      d.className = "lesson-row planned";
      d.innerHTML = `<span class="icon">·</span><span>${escapeHtml(title)}</span><span class="mins">準備中</span>`;
      planned.appendChild(d);
    }
  }
  $("#btn-course-back").onclick = showHome;
}

function showLesson(lessonId) {
  const l = DATA.lessons.find((x) => x.id === lessonId);
  const list = lessonsOf(l.category);
  const cat = DATA.categories.find((c) => c.id === l.category);
  const qs = questionsOfLesson(lessonId);
  const rec = loadState().lessons[lessonId];
  mount("tpl-lesson");
  $("#lesson-category").textContent = cat.title;
  $("#lesson-position").textContent = `${list.findIndex((x) => x.id === lessonId) + 1} / ${list.length}`;
  $("#lesson-minutes").textContent = l.minutes;
  $("#lesson-title").textContent = l.title;
  if (rec?.done) { $("#lesson-status").hidden = false; $("#lesson-status").textContent = `✓ 合格済み (最高 ${Math.round(rec.best * 100)}%)`; }
  $("#lesson-body").innerHTML = l.html;   // build.py が Markdown から生成した自前の HTML
  $("#exercise-body").innerHTML = l.exerciseHtml;
  const pbtn = $("#btn-practiced");
  const renderPracticed = (on) => { pbtn.textContent = on ? "✓ やってみた (取り消す)" : "やってみた"; pbtn.classList.toggle("done", on); };
  renderPracticed(!!rec?.practiced);
  pbtn.onclick = () => renderPracticed(togglePracticed(lessonId));
  const btn = $("#btn-lesson-quiz");
  btn.textContent = `確認問題を解く (${qs.length} 問)`;
  btn.onclick = () => startQuiz(shuffle(qs.slice()), { mode: "lesson", lessonId });
  $("#btn-lesson-back").onclick = () => showCourse(l.category);
}

function startQuiz(queue, { mode, lessonId = null }) {
  if (!queue.length) { alert("出題できる問題がありません"); return; }
  state.mode = mode; state.lessonId = lessonId;
  state.queue = queue; state.index = 0; state.results = [];
  showQuestion();
}

const MODE_LABEL = { lesson: "確認問題", review: "復習", random: "演習" };

function showQuestion() {
  mount("tpl-quiz", state.index === 0);
  const q = state.queue[state.index];
  $("#progress-bar").style.width = `${(100 * state.index) / state.queue.length}%`;
  $("#q-mode").textContent = MODE_LABEL[state.mode];
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
    b.dataset.index = i;
    b.innerHTML = render(q.choices[i]);
    b.onclick = () => answer(q, i, b);
    choices.appendChild(b);
  }
  $("#btn-unknown").onclick = () => answer(q, null, null);
}

function answer(q, chosen, btn) {
  const skipped = chosen === null;
  const ok = !skipped && chosen === q.answer;
  record(q.id, skipped ? null : ok);
  state.results.push({ q, chosen, ok, skipped });
  for (const b of $("#choices").children) b.disabled = true;
  $("#btn-unknown").disabled = true;
  if (btn) btn.classList.add(ok ? "correct" : "wrong");
  if (!ok) $(`#choices [data-index="${q.answer}"]`).classList.add("correct");
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
  const rate = ok / n;
  const skipped = state.results.filter((r) => r.skipped).length;
  const wrong = state.results.filter((r) => !r.ok);
  $("#score").textContent = `${ok} / ${n} 正解 (${Math.round(rate * 100)}%)`;

  if (state.mode === "lesson") {
    markLesson(state.lessonId, rate);
    const passed = rate >= PASS_RATE;
    const next = nextLesson(state.lessonId);
    $("#result-title").textContent = passed ? "合格!" : "もう一歩";
    $("#result-note").textContent = passed
      ? (next ? "このレッスンは完了。次に進めます" : "このコースの用意されているレッスンはすべて完了です")
      : `${Math.round(PASS_RATE * 100)}% 以上で合格。解説を読んで、もう一度どうぞ`;
    if (passed && next) {
      const b = $("#btn-next-lesson");
      b.hidden = false; b.textContent = `次のレッスン: ${next.title}`;
      b.onclick = () => showLesson(next.id);
    }
    if (!passed) {
      $("#btn-reread").hidden = false;
      $("#btn-reread").onclick = () => showLesson(state.lessonId);
      $("#btn-retry-all").hidden = false;
      $("#btn-retry-all").onclick = () => startQuiz(shuffle(state.queue.slice()), { mode: "lesson", lessonId: state.lessonId });
    }
  } else {
    $("#result-note").textContent = state.mode === "review" ? "正解した問題は次の間隔まで出ません" : "";
  }

  $("#wrong-list").innerHTML = wrong.length
    ? `<h2>間違えた問題 (不正解 ${wrong.length - skipped} ・ わからない ${skipped})</h2>` + wrong.map((r) =>
        `<div class="wrong-item"><span class="tag">${r.skipped ? "わからない" : "不正解"}</span><div class="q">${render(r.q.question)}</div><div class="a">正解: ${render(r.q.choices[r.q.answer])}</div></div>`).join("")
    : "<p class='meta center'>全問正解!</p>";
  if (wrong.length && state.mode !== "lesson") {
    const retry = $("#btn-retry-wrong");
    retry.hidden = false;
    retry.onclick = () => startQuiz(shuffle(wrong.map((r) => r.q)), { mode: state.mode });
  }
  if (state.mode === "lesson") {
    const cat = DATA.lessons.find((x) => x.id === state.lessonId).category;
    $("#btn-back").textContent = "コースへ";
    $("#btn-back").onclick = () => showCourse(cat);
  } else {
    $("#btn-back").onclick = showHome;
  }
}

// ---------- 起動 ----------
async function main() {
  $("#btn-home").onclick = showHome;
  window.addEventListener("popstate", showHome);   // 端末の「戻る」はホームへ
  const badge = $("#offline-badge");
  const updateOnline = () => { badge.hidden = navigator.onLine; };
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();

  setupUpdates();
  const res = await fetch("data.json");
  DATA = await res.json();
  history.replaceState({ screen: "tpl-home" }, "");
  showHome();
}

// ---------- 更新 (Service Worker) ----------
// 新しい sw.js が見つかると install → skipWaiting → controllerchange の順に進む。
// controllerchange が来たら: ホーム画面なら即再読み込み、問題を解いている途中ならバナーを出して任せる。
// PWA は起動しっぱなしになりやすいので、前面に戻るたびに update() で確認する。
let swRegistration = null;
let updateReady = false;

function setupUpdates() {
  if (!("serviceWorker" in navigator)) return;
  const btn = $("#btn-update");
  btn.onclick = () => location.reload();
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    updateReady = true;
    if (!navigator.serviceWorker.controller || app.querySelector("#courses")) { location.reload(); return; }
    btn.hidden = false;
  });
  navigator.serviceWorker.register("sw.js")
    .then((reg) => {
      swRegistration = reg;
      if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
    })
    .catch((e) => console.warn("SW 登録失敗", e));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && swRegistration) swRegistration.update().catch(() => {});
  });
}

// ホームの「更新を確認」。見つかれば controllerchange 経由で再読み込みされる
async function checkForUpdate() {
  const status = $("#update-status");
  if (!swRegistration) { status.textContent = "この環境では更新確認を使えません"; return; }
  if (!navigator.onLine) { status.textContent = "オフラインのため確認できません"; return; }
  status.textContent = "確認中...";
  try {
    const reg = await swRegistration.update();
    if (reg.installing || reg.waiting) {
      status.textContent = "新しい版を取得しています。まもなく再読み込みします";
      if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
    } else if (updateReady) {
      status.textContent = "新しい版の準備ができています";
      location.reload();
    } else {
      status.textContent = "最新です";
    }
  } catch (e) {
    status.textContent = "確認に失敗しました: " + e;
  }
}
main().catch((e) => { app.innerHTML = `<p>読み込みに失敗しました: ${escapeHtml(String(e))}</p>`; });
