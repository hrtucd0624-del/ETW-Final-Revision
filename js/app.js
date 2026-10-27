// ルーティングと画面。ハッシュルーター（GitHub Pages でそのまま動く）。
import { esc, $, $$, toast, ICONS } from './util.js';
import * as store from './store.js';
import { getJSON, unitIndex, loadUnit, unitQuestions, resolveExhibit, loadPapers, findQuestion, SLOTS } from './content.js';
import { renderExhibit } from './render/exhibit.js';
import { mountAuto } from './render/questions.js';
import { mountWritten } from './render/written.js';

const app = $('#app');
const TABS = [
  ['home', 'ホーム', '#/home'], ['learn', '学習', '#/learn'], ['drill', '演習', '#/drill'], ['review', '復習', '#/review'], ['more', 'その他', '#/more'],
];
const TAB_OF = { home: 'home', learn: 'learn', unit: 'learn', lesson: 'learn', uq: 'learn', drill: 'drill', paper: 'drill', sq: 'drill', review: 'review', rq: 'review' };

function chrome(route) {
  const cur = TAB_OF[route] || 'more';
  const due = store.dueReviews().length;
  $('#tabbar').innerHTML = TABS.map(([k, l, h]) => `<a href="${h}" ${k === cur ? 'aria-current="page"' : ''}>${ICONS[k]}<span>${l}</span>${k === 'review' && due ? `<span class="dot">${due}</span>` : ''}</a>`).join('');
  $('#topnav').innerHTML = TABS.map(([k, l, h]) => `<a href="${h}" ${k === cur ? 'aria-current="page"' : ''}>${l}${k === 'review' && due ? `（${due}）` : ''}</a>`).join('');
  const d = store.daysToExam();
  $('#countdown').innerHTML = d > 0 ? `試験まで <b>${d}</b> 日` : d === 0 ? '<b>今日が試験</b>' : '試験終了';
}

const routes = {
  home: viewHome, learn: viewLearn, unit: viewUnit, lesson: viewLesson, uq: viewUnitQ,
  drill: viewDrill, paper: viewPaper, sq: viewSampleQ, review: viewReview, rq: viewReviewQ,
  more: viewMore, types: viewTypes, glossary: viewGlossary, cards: viewCards, settings: viewSettings,
};

async function router() {
  let [route, ...args] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (!routes[route]) route = 'home';
  const fn = routes[route];
  chrome(route);
  try { await fn(...args); }
  catch (e) { console.error(e); app.innerHTML = `<div class="card"><h2>読み込みに失敗しました</h2><p class="muted">${esc(e.message)}</p><p><a href="#/home">ホームへ</a></p></div>`; }
  app.focus({ preventScroll: true });
  if (!history.state?.keepScroll) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);

// ───────── 集計 ─────────
async function unitStats(u) {
  if (!u.ready) return null;
  const unit = await loadUnit(u.id);
  const qs = unit.questions;
  const lessonsDone = unit.lessons.filter(l => store.lessonDone(l.id)).length;
  const att = qs.filter(q => store.getQ(q.id));
  const ok = att.filter(q => store.getQ(q.id).last === 'correct').length;
  const written = qs.filter(q => q.kind === 'written').map(q => store.getQ(q.id)?.score).filter(x => x != null);
  return {
    unit, lessonsDone, lessons: unit.lessons.length, attempted: att.length, total: qs.length, ok,
    writtenAvg: written.length ? written.reduce((a, b) => a + b, 0) / written.length : null,
    progress: (lessonsDone + att.length) / (unit.lessons.length + qs.length),
  };
}
function slotStats() {
  const s = {}; Object.keys(SLOTS).forEach(k => s[k] = { n: 0, sum: 0 });
  Object.values(store.allQ()).forEach(r => { if (r.slot && s[r.slot]) { s[r.slot].n++; s[r.slot].sum += r.score ?? (r.last === 'correct' ? 1 : 0); } });
  return s;
}
const pct = x => `${Math.round(x * 100)}%`;

// ───────── ホーム ─────────
async function viewHome() {
  const idx = await unitIndex();
  const due = store.dueReviews();
  const stats = await Promise.all(idx.units.map(unitStats));
  const order = idx.priority.map(id => idx.units.findIndex(u => u.id === id)).filter(i => i >= 0);
  const nextI = order.find(i => stats[i] && stats[i].progress < 1);
  const next = nextI != null ? idx.units[nextI] : null;
  const { byId } = await loadPapers();
  const sampleIds = Object.keys(byId).filter(id => !id.startsWith('p'));
  const sampleDone = sampleIds.filter(id => store.getQ(id)).length;
  const ss = slotStats();
  const weak = Object.entries(ss).filter(([, v]) => v.n >= 2).sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)[0];
  const d = store.daysToExam();

  app.innerHTML = `<div class="stack">
    <div class="hero">
      <div class="stat"><div class="n">${Math.max(d, 0)}</div><div class="l">試験（11月5日）まであと日数</div></div>
      <div class="stat"><div class="n">${due.length}</div><div class="l">今日の復習</div></div>
    </div>
    <div class="card"><h2>今日やること</h2>
      <ul class="list" style="margin-top:6px">
        ${due.length ? `<li><a class="item" href="#/review"><span class="t">復習キュー ${due.length} 問<small>間違えた問題・満点でなかった記述</small></span><span class="chev">›</span></a></li>` : ''}
        ${next ? `<li><a class="item" href="#/unit/${next.id}"><span class="t">Unit ${next.n}：${esc(next.title)}<small>進捗 ${pct(stats[nextI].progress)} — 配点の大きい順に進めています</small></span><span class="chev">›</span></a></li>` : ''}
        <li><a class="item" href="#/drill"><span class="t">Sample 演習<small>${sampleDone} / ${sampleIds.length} 小問 — 本番とほぼ同じ形式</small></span><span class="chev">›</span></a></li>
      </ul>
    </div>
    <div class="card"><div class="row"><h2>スロット別の正答率</h2><span class="spacer"></span>${weak ? `<span class="pill bad">弱点：${weak[0]} ${SLOTS[weak[0]]}</span>` : ''}</div>
      <p class="small muted" style="margin:4px 0 10px">本番の出題スロット（A〜J）ごと。記述は自己採点の得点率。</p>
      <div class="slots">${Object.entries(SLOTS).map(([k, name]) => {
        const v = ss[k], r = v.n ? v.sum / v.n : 0;
        return `<div class="slot"><span class="k">${k}</span><div><div class="small">${name}</div><div class="bar${v.n && r < .6 ? ' weak' : ''}"><span style="width:${v.n ? r * 100 : 0}%"></span></div></div><span class="v">${v.n ? pct(r) : '—'}<br><span class="small">${v.n}問</span></span></div>`;
      }).join('')}</div>
    </div>
    <div class="card"><h2>学習マップ</h2>
      <ul class="list" style="margin-top:6px">${idx.units.map((u, i) => unitRow(u, stats[i])).join('')}</ul>
    </div>
  </div>`;
}

function unitRow(u, st) {
  const cls = !u.ready ? 'locked' : st.progress >= 1 ? 'done' : '';
  const sub = !u.ready ? '準備中' : `レッスン ${st.lessonsDone}/${st.lessons} ・ 問題 ${st.attempted}/${st.total}（正答 ${st.ok}）${st.writtenAvg != null ? ` ・ 記述平均 ${pct(st.writtenAvg)}` : ''}`;
  const inner = `<span class="unit ${cls}"><span class="num">${u.n}</span></span><span class="t">${esc(u.title)}<small>${sub}</small>${u.ready ? `<div class="bar" style="margin-top:4px"><span style="width:${st.progress * 100}%"></span></div>` : ''}</span>${u.ready ? '<span class="chev">›</span>' : ''}`;
  return `<li>${u.ready ? `<a class="item" href="#/unit/${u.id}">${inner}</a>` : `<div class="item">${inner}</div>`}</li>`;
}

// ───────── 学習 ─────────
async function viewLearn() {
  const idx = await unitIndex();
  const stats = await Promise.all(idx.units.map(unitStats));
  app.innerHTML = `<div class="stack"><h1>学習マップ</h1>
    <p class="muted small">Unit 0〜14。易しい順に並んでいます。準備ができたユニットから解放されます（回帰・ダミーを優先して作成中）。</p>
    <div class="card"><ul class="list">${idx.units.map((u, i) => unitRow(u, stats[i])).join('')}</ul></div></div>`;
}

async function viewUnit(uid) {
  const idx = await unitIndex();
  const meta = idx.units.find(u => u.id === uid);
  const unit = await loadUnit(uid);
  const qs = unit.questions;
  const { byId } = await loadPapers();
  app.innerHTML = `<div class="stack">
    <div class="crumb"><a href="#/learn">学習</a> › Unit ${meta.n}</div>
    <h1>${esc(unit.title)}</h1>
    <div class="row">${unit.slot.map(s => `<span class="pill">スロット ${s}：${SLOTS[s]}</span>`).join('')}</div>
    <div class="card"><h2>① 学ぶ</h2><ul class="list" style="margin-top:6px">
      ${unit.lessons.map((l, i) => `<li><a class="item" href="#/lesson/${uid}/${l.id}"><span class="t">${i + 1}. ${esc(l.title)}<small>${l.steps.length} カード</small></span>${store.lessonDone(l.id) ? '<span class="pill good">✓</span>' : ''}<span class="chev">›</span></a></li>`).join('')}
    </ul></div>
    <div class="card"><h2>② 練習問題</h2><p class="small muted">易しい順（L1 → L5）。L5 は本番形式の英語記述。</p><ul class="list" style="margin-top:6px">
      ${qs.map((q, i) => { const st = store.getQ(q.id);
        const b = !st ? '' : st.last === 'correct' ? '<span class="pill good">✓</span>' : st.last === 'partial' ? `<span class="pill warn">${pct(st.score)}</span>` : '<span class="pill bad">✗</span>';
        return `<li><a class="item" href="#/uq/${uid}/${i}"><span class="t">Q${i + 1}. <span class="pill gray">L${q.level}</span> ${esc(stripTags(q.prompt).slice(0, 60))}${stripTags(q.prompt).length > 60 ? '…' : ''}</span>${b}<span class="chev">›</span></a></li>`; }).join('')}
    </ul></div>
    ${unit.goalSample?.length ? `<div class="card"><h2>③ ゴールの Sample 問題</h2><p class="small muted">このユニットを終えたら、本番形式で解いてみよう。</p><ul class="list" style="margin-top:6px">
      ${unit.goalSample.map(id => byId[id] ? `<li><a class="item" href="#/sq/${id}"><span class="t">${byId[id].paper === 's1' ? 'Sample 1' : 'Sample 2'} ${esc(byId[id].label)}<small>${esc(stripTags(byId[id].prompt).slice(0, 70))}…</small></span><span class="chev">›</span></a></li>` : '').join('')}
    </ul></div>` : ''}
  </div>`;
}
const stripTags = s => String(s).replace(/<[^>]+>/g, '');

async function viewLesson(uid, lid) {
  const unit = await loadUnit(uid);
  const li = unit.lessons.findIndex(l => l.id === lid);
  const lesson = unit.lessons[li];
  if (!lesson) { location.hash = `#/unit/${uid}`; return; }
  let step = 0;
  const draw = () => {
    const s = lesson.steps[step];
    const last = step === lesson.steps.length - 1;
    app.innerHTML = `<div class="stack">
      <div class="crumb"><a href="#/unit/${uid}">${esc(unit.title)}</a> › レッスン ${li + 1}</div>
      <div class="row"><h1>${esc(lesson.title)}</h1></div>
      <div class="steps-dots">${lesson.steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="card lesson-card"><div class="lbody"></div></div>
      <div class="btnrow stickybar">
        <button class="btn" data-act="prev" ${step === 0 ? 'disabled' : ''}>戻る</button>
        <button class="btn primary" data-act="next">${last ? 'レッスン完了' : '次へ'}</button>
      </div></div>`;
    const body = $('.lbody', app);
    if (s.type === 'explain') {
      body.innerHTML = `<div class="body stack"><div>${s.body}</div>${s.exhibit ? renderExhibit(resolveExhibit(s.exhibit, unit)) : ''}</div>`;
    } else if (s.type === 'check') {
      body.innerHTML = '<div class="small muted" style="margin-bottom:8px">ミニ確認問題</div><div class="qq"></div>';
      const q = { ...s.question, exhibit: resolveExhibit(s.question.exhibit, unit) };
      mountAuto($('.qq', body), q, { unitId: uid, compact: true, onFinish: r => store.recordAuto(q.id, r, { slot: unit.slot[0] }) });
    }
    $('[data-act="prev"]', app).onclick = () => { step--; draw(); window.scrollTo(0, 0); };
    $('[data-act="next"]', app).onclick = () => {
      if (!last) { step++; draw(); window.scrollTo(0, 0); return; }
      store.markLesson(lesson.id);
      const nxt = unit.lessons[li + 1];
      location.hash = nxt ? `#/lesson/${uid}/${nxt.id}` : `#/uq/${uid}/0`;
      toast(nxt ? 'レッスン完了！次のレッスンへ' : 'レッスン完了！練習問題へ');
    };
  };
  draw();
}

function qNav(prevHref, nextHref, backHref, backLabel) {
  return `<div class="btnrow stickybar">
    ${prevHref ? `<a class="btn" href="${prevHref}">← 前</a>` : `<a class="btn" href="${backHref}">${backLabel}</a>`}
    ${nextHref ? `<a class="btn primary" href="${nextHref}">次の問題 →</a>` : `<a class="btn primary" href="${backHref}">${backLabel}</a>`}
  </div>`;
}

async function viewUnitQ(uid, i) {
  i = +i;
  const unit = await loadUnit(uid);
  const qs = unitQuestions(unit);
  const q = qs[i];
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/unit/${uid}">${esc(unit.title)}</a> › 問題 ${i + 1} / ${qs.length}</div>
    <div class="card qbox"></div>
    ${qNav(i > 0 ? `#/uq/${uid}/${i - 1}` : null, i < qs.length - 1 ? `#/uq/${uid}/${i + 1}` : null, `#/unit/${uid}`, 'ユニットに戻る')}</div>`;
  mountQ($('.qbox', app), q, uid);
}

function mountQ(el, q, unitId) {
  const meta = { slot: q.slot, ref: q.unitId || unitId };
  if (q.kind === 'written') mountWritten(el, q, { unitId });
  else mountAuto(el, q, { unitId, onFinish: r => store.recordAuto(q.id, r, meta) });
}

// ───────── 演習（Sample・類題・模試） ─────────
async function viewDrill() {
  const { papers } = await loadPapers();
  app.innerHTML = `<div class="stack"><h1>演習</h1>
    <p class="muted small">本番は Sample paper とほぼ同じ形式。英語で書いて、採点基準で自己採点しよう。</p>
    <div class="card"><ul class="list">${papers.map(p => {
      const parts = p.questions.flatMap(q => q.parts);
      const done = parts.filter(x => store.getQ(x.id)).length;
      const avg = parts.map(x => store.getQ(x.id)?.score).filter(x => x != null);
      return `<li><a class="item" href="#/paper/${p.id}"><span class="t">${esc(p.paper)}：${esc(stripTags(p.title))}<small>${done} / ${parts.length} 小問${avg.length ? ` ・ 平均 ${pct(avg.reduce((a, b) => a + b, 0) / avg.length)}` : ''}${p.id === 'p' ? ' ・ 練習用の架空データ' : ''}</small></span><span class="chev">›</span></a></li>`;
    }).join('')}
    <li><div class="item"><span class="unit locked"><span class="num">模</span></span><span class="t">予想模試 A・B・C<small>準備中（Phase 4）</small></span></div></li>
    </ul></div></div>`;
}

async function viewPaper(pid) {
  const { papers } = await loadPapers();
  const p = papers.find(x => x.id === pid);
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/drill">演習</a> › ${esc(p.paper)}</div>
    <h1>${esc(p.paper)}：${p.title}</h1>
    ${p.invented ? '<div><span class="invented">練習用の架空データ</span></div>' : ''}
    <div class="card small">${p.intro}</div>
    ${p.questions.map(q => `<div class="card"><div class="row"><h2>${esc(q.q)}</h2>${q.marks ? `<span class="pill gray">${q.marks} marks</span>` : ''}</div>
      <ul class="list" style="margin-top:6px">${q.parts.map(x => { const st = store.getQ(x.id);
        const b = !st ? '' : st.score >= 1 ? '<span class="pill good">満点</span>' : `<span class="pill warn">${pct(st.score)}</span>`;
        return `<li><a class="item" href="#/sq/${x.id}"><span class="t">${esc(x.label)}${x.marks ? ` <span class="small muted">[${x.marks}m]</span>` : ''}<small>${esc(stripTags(x.prompt).slice(0, 90))}${stripTags(x.prompt).length > 90 ? '…' : ''}</small></span>${b}<span class="chev">›</span></a></li>`; }).join('')}</ul></div>`).join('')}
  </div>`;
}

async function viewSampleQ(id) {
  const { papers, byId } = await loadPapers();
  const q = byId[id];
  const p = papers.find(x => x.id === q.paper);
  const ids = p.questions.flatMap(x => x.parts.map(y => y.id));
  const i = ids.indexOf(id);
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/drill">演習</a> › <a href="#/paper/${p.id}">${esc(p.paper)}</a> › ${esc(q.label)}</div>
    <div class="card qbox"></div>
    ${qNav(i > 0 ? `#/sq/${ids[i - 1]}` : null, i < ids.length - 1 ? `#/sq/${ids[i + 1]}` : null, `#/paper/${p.id}`, '一覧に戻る')}</div>`;
  mountQ($('.qbox', app), q);
}

// ───────── 復習 ─────────
async function viewReview() {
  const due = store.dueReviews();
  const later = Object.entries(store.reviewItems()).filter(([, r]) => r.due > store.today());
  const rows = await Promise.all(due.map(async r => ({ r, f: await findQuestion(r.id) })));
  app.innerHTML = `<div class="stack"><h1>復習</h1>
    <p class="muted small">間違えた問題は翌日、正解したら3日後にもう一度。2回続けて正解したら卒業。</p>
    <div class="card"><h2>今日の復習（${due.length}）</h2>
      ${due.length ? `<ul class="list" style="margin-top:6px">${rows.map(({ r, f }) => f ? `<li><a class="item" href="#/rq/${r.id}"><span class="t"><span class="pill gray">L${f.q.level}</span> ${esc(f.q.label || '')} ${esc(stripTags(f.q.prompt).slice(0, 60))}…<small>${r.stage === 2 ? '2回目の復習' : '1回目の復習'}</small></span><span class="chev">›</span></a></li>` : '').join('')}</ul>
      <div class="btnrow" style="margin-top:10px"><a class="btn primary block" href="#/rq/${due[0].id}">最初から解く</a></div>` : '<div class="empty">今日の復習はありません 🎉</div>'}
    </div>
    ${later.length ? `<div class="card"><h2>予定（${later.length}）</h2><ul class="list" style="margin-top:6px">${later.sort((a, b) => a[1].due.localeCompare(b[1].due)).map(([id, r]) => `<li><div class="item"><span class="t">${esc(id)}<small>${r.due} に出題</small></span></div></li>`).join('')}</ul></div>` : ''}
  </div>`;
}

async function viewReviewQ(id) {
  const f = await findQuestion(id);
  if (!f) { store.removeReview(id); location.hash = '#/review'; return; }
  const due = store.dueReviews().map(r => r.id).filter(x => x !== id);
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/review">復習</a> › ${esc(id)}</div>
    <div class="card qbox"></div>
    <div class="btnrow stickybar"><a class="btn" href="#/review">一覧へ</a>${due.length ? `<a class="btn primary" href="#/rq/${due[0]}">次の復習 →</a>` : ''}</div></div>`;
  mountQ($('.qbox', app), f.q, f.ctx.unit?.id);
}

// ───────── その他 ─────────
function viewMore() {
  app.innerHTML = `<div class="stack"><h1>その他</h1><div class="card"><ul class="list">
    <li><a class="item" href="#/types"><span class="t">解き方の型<small>問題タイプ別の手順と英文テンプレート・答案の鉄則</small></span><span class="chev">›</span></a></li>
    <li><a class="item" href="#/glossary"><span class="t">用語・公式<small>Week 1–11 の用語（英語＋日本語）と公式シート</small></span><span class="chev">›</span></a></li>
    <li><a class="item" href="#/cards"><span class="t">暗記カード<small>タップで裏返す</small></span><span class="chev">›</span></a></li>
    <li><a class="item" href="#/settings"><span class="t">設定<small>表示テーマ、進捗の書き出し／読み込み／リセット</small></span><span class="chev">›</span></a></li>
  </ul></div></div>`;
}

async function viewTypes(openId) {
  const a = await getJSON('seed/answer-types.json');
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/more">その他</a> › 解き方の型</div><h1>解き方の型</h1>
    <details class="acc" ${openId ? '' : 'open'}><summary>答案の鉄則（全問共通）</summary><div class="in"><ol>${a.rules.map(([t, d]) => `<li><b>${t}</b><br><span class="small">${d}</span></li>`).join('')}</ol></div></details>
    ${a.types.map(t => `<details class="acc" id="t-${t.id}" ${t.id === openId ? 'open' : ''}><summary>${esc(t.name)} <span class="small muted">${esc(t.en || '')}</span></summary><div class="in stack">
      ${t.look ? `<p class="small"><b>見分け方：</b>${t.look}</p>` : ''}
      ${t.steps ? `<div><b class="small">手順</b><ol>${t.steps.map(s => `<li>${s}</li>`).join('')}</ol></div>` : ''}
      ${t.template ? `<div><b class="small">英文テンプレート</b><div class="tmpl" lang="en">${t.template}</div></div>` : ''}
      ${t.pitfalls ? `<div><b class="small">落とし穴</b><ul class="mist">${t.pitfalls.map(s => `<li>${s}</li>`).join('')}</ul></div>` : ''}
      ${t.samples?.length ? `<div class="chips">${t.samples.map(s => `<a class="pill" href="#/sq/${s}">${s}</a>`).join('')}</div>` : ''}
    </div></details>`).join('')}</div>`;
  if (openId) document.getElementById('t-' + openId)?.scrollIntoView({ block: 'start' });
}

async function viewGlossary() {
  const [weeks, a] = await Promise.all([getJSON('seed/weeks.json'), getJSON('seed/answer-types.json')]);
  const terms = weeks.flatMap(w => (w.terms || []).map(([en, jp]) => ({ en, jp, w: w.n })));
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/more">その他</a> › 用語・公式</div><h1>用語・公式</h1>
    <details class="acc" open><summary>公式シート</summary><div class="in"><table class="plain">${a.formulas.map(([n, f, d]) => `<tr><td>${n}<br><span class="small muted">${d}</span></td><td style="font-family:var(--f-mono)">${f}</td></tr>`).join('')}</table></div></details>
    <input class="search" type="search" placeholder="用語を検索（英語・日本語）" aria-label="用語を検索">
    <div class="card"><table class="plain gl"></table></div></div>`;
  const tbl = $('.gl', app);
  const draw = (f = '') => {
    const k = f.toLowerCase();
    tbl.innerHTML = terms.filter(t => !k || (t.en + t.jp).toLowerCase().includes(k)).map(t => `<tr><td lang="en">${t.en}</td><td>${t.jp} <span class="small muted">W${t.w}</span></td></tr>`).join('') || '<tr><td class="muted">見つかりません</td></tr>';
  };
  $('.search', app).oninput = e => draw(e.target.value); draw();
}

async function viewCards(cat) {
  const c = await getJSON('seed/cards.json');
  const list = c.cards.filter(x => !cat || x.cat === cat);
  let i = 0, flipped = false;
  const draw = () => {
    const card = list[i];
    app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/more">その他</a> › 暗記カード</div><h1>暗記カード</h1>
      <div class="chips"><a class="pill ${!cat ? '' : 'gray'}" href="#/cards">すべて</a>${Object.entries(c.categories).map(([k, v]) => `<a class="pill ${cat === k ? '' : 'gray'}" href="#/cards/${k}">${v}</a>`).join('')}</div>
      <div class="small muted">${i + 1} / ${list.length} ・ ${c.categories[card.cat]}</div>
      <div class="flash"><button class="card face ${flipped ? 'back' : ''}" style="width:100%">${flipped ? card.back : card.front}</button></div>
      <p class="small muted" style="text-align:center">タップで${flipped ? '表' : '答え'}を見る</p>
      <div class="btnrow"><button class="btn" data-a="p" ${i === 0 ? 'disabled' : ''}>← 前</button><button class="btn primary" data-a="n" ${i === list.length - 1 ? 'disabled' : ''}>次 →</button></div></div>`;
    $('.face', app).onclick = () => { flipped = !flipped; draw(); };
    $('[data-a="p"]', app).onclick = () => { i--; flipped = false; draw(); };
    $('[data-a="n"]', app).onclick = () => { i++; flipped = false; draw(); };
  };
  draw();
}

function viewSettings() {
  const theme = store.getSetting('theme', 'auto');
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/more">その他</a> › 設定</div><h1>設定</h1>
    <div class="card"><h2>表示</h2><div class="btnrow" style="margin-top:8px">${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([k, l]) => `<button class="btn ${theme === k ? 'primary' : ''}" data-theme="${k}">${l}</button>`).join('')}</div></div>
    <div class="card"><h2>進捗の書き出し／読み込み</h2><p class="small muted">iPhone と PC の間で進捗を移すとき：片方で「書き出し」→ ファイルを送る → もう片方で「読み込み」。</p>
      <div class="btnrow" style="margin-top:8px"><button class="btn" data-act="export">書き出し（JSON）</button><label class="btn">読み込み<input type="file" accept="application/json,.json" hidden></label></div></div>
    <div class="card"><h2>リセット</h2><p class="small muted">すべての進捗・復習キュー・下書きを消します。</p><div class="btnrow" style="margin-top:8px"><button class="btn" data-act="reset" style="color:var(--bad)">進捗をリセット</button></div></div>
  </div>`;
  $$('[data-theme]', app).forEach(b => b.onclick = () => { store.setSetting('theme', b.dataset.theme); applyTheme(); viewSettings(); });
  $('[data-act="export"]', app).onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `etw-progress-${store.today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('input[type=file]', app).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); toast('読み込みました'); chrome('more'); } catch (err) { toast('読み込めません：' + err.message); }
  };
  $('[data-act="reset"]', app).onclick = () => { if (confirm('本当にすべての進捗を消しますか？（元に戻せません）')) { store.resetAll(); toast('リセットしました'); chrome('more'); } };
}

function applyTheme() {
  const t = store.getSetting('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

applyTheme();
router();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
