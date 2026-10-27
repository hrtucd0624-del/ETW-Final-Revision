// 進捗の保存（localStorage: etw-study-v1）。プライベートブラウズでも落ちないよう全部 try/catch。
const KEY = 'etw-study-v1';
export const EXAM_DATE = '2026-11-05';
const LAST_REVIEW_DATE = '2026-11-04'; // 試験日以降には出題しない

const blank = () => ({ v: 1, q: {}, review: {}, lessons: {}, written: {}, settings: {} });
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export const today = () => ymd(new Date());
export function ymd(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  const s = ymd(d);
  return s > LAST_REVIEW_DATE ? (today() > LAST_REVIEW_DATE ? today() : LAST_REVIEW_DATE) : s;
}
export function daysToExam() {
  const a = new Date(today() + 'T00:00:00'), b = new Date(EXAM_DATE + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export const getQ = id => state.q[id];
export const getWritten = id => state.written[id];
export const lessonDone = id => !!state.lessons[id];
export const allQ = () => state.q;
export const reviewItems = () => state.review;
export const getSetting = (k, d) => (k in state.settings ? state.settings[k] : d);
export function setSetting(k, v) { state.settings[k] = v; save(); }

export function markLesson(id) { state.lessons[id] = today(); save(); }

/**
 * L1〜L4 の結果を記録。result: 'correct' | 'near'（2回目以降で正解）| 'wrong'
 * meta: { slot }
 */
export function recordAuto(id, result, meta = {}) {
  const r = state.q[id] || { n: 0, ok: 0, slot: meta.slot };
  r.n++; if (result === 'correct') r.ok++;
  r.last = result; r.date = today(); r.slot = meta.slot || r.slot; r.score = result === 'correct' ? 1 : 0;
  state.q[id] = r;
  updateReview(id, result === 'correct', meta);
  save();
}

/** L5（記述）の自己採点を記録。pct は 0〜1 */
export function recordWritten(id, text, checks, pct, meta = {}) {
  state.written[id] = { text, checks, pct, date: today() };
  const r = state.q[id] || { n: 0, ok: 0 };
  r.n++; if (pct >= 1) r.ok++;
  r.last = pct >= 1 ? 'correct' : 'partial'; r.date = today(); r.slot = meta.slot || r.slot; r.score = pct;
  state.q[id] = r;
  updateReview(id, pct >= 1, meta);
  save();
}
export function saveDraft(id, text) {
  const w = state.written[id] || {};
  state.written[id] = { ...w, draft: text }; save();
}

// 復習キュー：不正解 → 翌日 → 正解なら3日後 → 正解なら卒業
function updateReview(id, ok, meta) {
  const cur = state.review[id];
  const isDue = cur && cur.due <= today();
  if (!ok) {
    state.review[id] = { due: addDays(1), stage: 1, ref: meta.ref || cur?.ref };
  } else if (cur && isDue) {
    if (cur.stage >= 2) delete state.review[id];
    else state.review[id] = { ...cur, due: addDays(3), stage: 2 };
  }
}
export function dueReviews() {
  const t = today();
  return Object.entries(state.review).filter(([, r]) => r.due <= t).map(([id, r]) => ({ id, ...r }));
}
export function removeReview(id) { delete state.review[id]; save(); }

export function exportJSON() { return JSON.stringify(state, null, 1); }
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || d.v !== 1 || typeof d.q !== 'object') throw new Error('形式が違います');
  state = { ...blank(), ...d }; save();
}
export function resetAll() { state = blank(); save(); }
