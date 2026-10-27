// ルーティングと画面。ハッシュルーター（GitHub Pages でそのまま動く）。
import { esc, $, $$, toast, ICONS } from './util.js';
import * as store from './store.js';
import { getJSON, unitIndex, loadUnit, unitQuestions, resolveExhibit, loadPapers, findQuestion, SLOTS, unitsForPart, loadTutorials, mockIndex, loadMock, mockParts } from './content.js';
import { renderExhibit } from './render/exhibit.js';
import { mountAuto, sourceLine } from './render/questions.js';
import { mountWritten } from './render/written.js';

const app = $('#app');
const TABS = [
  ['home', 'ホーム', '#/home'], ['drill', '本番演習', '#/drill'], ['learn', '単元', '#/learn'], ['review', '復習', '#/review'], ['more', 'その他', '#/more'],
];
const TAB_OF = { home: 'home', learn: 'learn', unit: 'learn', lesson: 'learn', uq: 'learn', week: 'learn', wq: 'learn', drill: 'drill', paper: 'drill', sq: 'drill', mock: 'drill', review: 'review', rq: 'review' };

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
  drill: viewDrill, paper: viewPaper, sq: viewSampleQ, mock: viewMock, week: viewWeek, wq: viewWeekQ, review: viewReview, rq: viewReviewQ,
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
  if (!u.ready || u.link) return null;
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

// ───────── ホーム（Sample 中心） ─────────
const SAMPLE_PAPERS = ['s1', 's2'];
const qStatus = id => { const st = store.getQ(id); return !st ? 'none' : (st.score ?? (st.last === 'correct' ? 1 : 0)) >= 1 ? 'full' : 'part'; };

async function sampleOrder() {
  const { papers } = await loadPapers();
  return papers.filter(p => SAMPLE_PAPERS.includes(p.id)).flatMap(p => p.questions.flatMap(q => q.parts.map(x => x.id)));
}
/** 次にやる Sample 小問：まだ解いていないもの → 満点でないもの の順 */
async function nextSample() {
  const ids = await sampleOrder();
  return ids.find(id => qStatus(id) === 'none') || ids.find(id => qStatus(id) === 'part') || null;
}

async function viewHome() {
  const [{ papers, byId }, idx] = await Promise.all([loadPapers(), unitIndex()]);
  const ids = await sampleOrder();
  const full = ids.filter(id => qStatus(id) === 'full').length, part = ids.filter(id => qStatus(id) === 'part').length;
  const due = store.dueReviews();
  const d = store.daysToExam();
  const remaining = ids.length - full;
  const studyDays = Math.max(d - 1, 1); // 試験前日は模試と見直しに使う
  const target = Math.min(remaining, Math.max(1, Math.ceil(remaining / studyDays)));
  const doneToday = store.todayDone();
  const sampleToday = doneToday.filter(id => byId[id] && SAMPLE_PAPERS.includes(byId[id].paper)).length;
  const next = await nextSample();
  const nq = next && byId[next];
  const nextUnits = nq ? await unitsForPart(nq) : [];

  // 弱点スロット → そのスロットのユニット
  const ss = slotStats();
  const weak = Object.entries(ss).filter(([, v]) => v.n >= 2).sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)[0];
  const weakUnit = weak && idx.units.find(u => u.ready && u.slot.includes(weak[0]));
  const stats = await Promise.all(idx.units.map(unitStats));
  const unitsDone = stats.filter(s => s && s.progress >= 1).length, unitsReady = idx.units.filter(u => u.ready && !u.link).length;

  const cta = due.length
    ? `<a class="cta" href="#/rq/${due[0].id}"><span class="go">→</span><div class="k">まずはこれ</div><div class="t">復習 ${due.length} 問</div><div class="s">前に間違えた問題・満点でなかった記述</div></a>`
    : nq ? `<a class="cta" href="#/sq/${nq.id}"><span class="go">→</span><div class="k">次の1問</div><div class="t">${nq.paper === 's1' ? 'Sample 1' : 'Sample 2'} ${esc(nq.label)}</div><div class="s">${nextUnits.length ? `関係する単元：${nextUnits.map(u => `Unit ${u.n}`).join('・')}` : esc(stripTags(nq.prompt).slice(0, 60)) + '…'}</div></a>`
    : `<a class="cta" href="#/drill"><span class="go">→</span><div class="k">Sample は全部満点！</div><div class="t">予想模試に挑戦</div></a>`;

  app.innerHTML = `<div class="stack">
    ${cta}
    <div class="card"><div class="row"><h2>今日やること</h2><span class="spacer"></span><span class="small muted">試験まで ${Math.max(d, 0)} 日</span></div>
      <ul class="today" style="margin-top:4px">
        <li><span class="ck ${due.length ? '' : 'on'}">✓</span><a href="#/review">復習キューを空にする<small>${due.length ? `あと ${due.length} 問` : '今日の分は終わり'}</small></a></li>
        <li><span class="ck ${sampleToday >= target ? 'on' : ''}">✓</span><a href="${nq ? `#/sq/${nq.id}` : '#/drill'}">Sample を ${target} 問解く<small>今日 ${sampleToday} / ${target} 問 ・ 残り ${remaining} 問を ${studyDays} 日で終えるペース</small></a></li>
        <li><span class="ck"></span><a href="${weakUnit ? `#/unit/${weakUnit.id}` : (nextUnits[0] ? `#/unit/${nextUnits[0].id}` : '#/learn')}">分からない所は単元で基礎から<small>${weakUnit ? `弱点：${weak[0]} ${SLOTS[weak[0]]} → Unit ${weakUnit.n}` : nextUnits[0] ? `次の Sample に関係：Unit ${nextUnits[0].n} ${esc(nextUnits[0].title)}` : '単元の一覧へ'}</small></a></li>
      </ul>
    </div>
    <div class="card"><div class="row"><h2>Sample の進み具合</h2><span class="spacer"></span><b>${full} / ${ids.length}</b></div>
      <div class="bigbar" style="margin:10px 0 6px"><span class="g" style="width:${full / ids.length * 100}%"></span><span class="y" style="width:${part / ids.length * 100}%"></span></div>
      <div class="legend"><span><i style="background:var(--good)"></i>満点 ${full}</span><span><i style="background:var(--hl)"></i>途中 ${part}</span><span><i style="background:var(--line)"></i>まだ ${ids.length - full - part}</span></div>
      <div class="smap" style="margin-top:12px">${papers.filter(p => SAMPLE_PAPERS.includes(p.id)).map(p => `<div class="small" style="font-weight:700">${esc(p.paper)}</div>` + p.questions.map(q => `<div class="qrow"><span class="ql">${esc(q.q)}</span><div class="cells">${q.parts.map(x => `<a href="#/sq/${x.id}" class="${qStatus(x.id)}${x.id === next ? ' next' : ''}" title="${esc(x.label)}">${esc(x.label.replace(/^Q\d+/, '').replace(/[()]/g, '') || x.label)}</a>`).join('')}</div></div>`).join('')).join('')}</div>
    </div>
    <div class="card"><h2>全体の進み具合</h2>
      <div class="slots" style="margin-top:10px">
        <div class="slot"><span class="k">S</span><div><div class="small">Sample（本番形式）</div><div class="bar"><span style="width:${full / ids.length * 100}%"></span></div></div><span class="v">${full}/${ids.length}</span></div>
        <div class="slot"><span class="k">U</span><div><div class="small">単元（基礎）</div><div class="bar"><span style="width:${unitsReady ? unitsDone / unitsReady * 100 : 0}%"></span></div></div><span class="v">${unitsDone}/${unitsReady}</span></div>
      </div>
      <details class="acc" style="margin-top:12px"><summary>スロット別の正答率（A〜J）</summary><div class="in"><div class="slots">${Object.entries(SLOTS).map(([k, name]) => {
        const v = ss[k], r = v.n ? v.sum / v.n : 0;
        return `<div class="slot"><span class="k">${k}</span><div><div class="small">${name}</div><div class="bar${v.n && r < .6 ? ' weak' : ''}"><span style="width:${v.n ? r * 100 : 0}%"></span></div></div><span class="v">${v.n ? pct(r) : '—'}</span></div>`;
      }).join('')}</div></div></details>
    </div>
  </div>`;
}

function unitRow(u, st) {
  if (u.link) return `<li><a class="item" href="${u.link}"><span class="unit"><span class="num">${u.n}</span></span><span class="t">${esc(u.title)}<small>${esc(u.sub || '')}</small></span><span class="chev">›</span></a></li>`;
  const cls = !u.ready ? 'locked' : st.progress >= 1 ? 'done' : '';
  const sub = !u.ready ? '準備中' : `レッスン ${st.lessonsDone}/${st.lessons} ・ 問題 ${st.attempted}/${st.total}（正答 ${st.ok}）${st.writtenAvg != null ? ` ・ 記述平均 ${pct(st.writtenAvg)}` : ''}`;
  const inner = `<span class="unit ${cls}"><span class="num">${u.n}</span></span><span class="t">${esc(u.title)}<small>${sub}</small>${u.ready ? `<div class="bar" style="margin-top:4px"><span style="width:${st.progress * 100}%"></span></div>` : ''}</span>${u.ready ? '<span class="chev">›</span>' : ''}`;
  return `<li>${u.ready ? `<a class="item" href="#/unit/${u.id}">${inner}</a>` : `<div class="item">${inner}</div>`}</li>`;
}

// ───────── 学習 ─────────
async function viewLearn() {
  const idx = await unitIndex();
  const stats = await Promise.all(idx.units.map(unitStats));
  const tut = await loadTutorials().catch(() => ({ weeks: [] }));
  app.innerHTML = `<div class="stack"><h1>単元</h1>
    <p class="muted small">Sample で点を落としたら、ここで基礎から。各ユニットは「学ぶ → 練習（L1〜L4）→ 本番形式（L5）」の順。</p>
    <div class="card"><h2>単元（Unit 0〜14）</h2><ul class="list" style="margin-top:6px">${idx.units.map((u, i) => unitRow(u, stats[i])).join('')}</ul></div>
    ${tut.weeks.length ? `<div class="card"><h2>Week 別チュートリアル（全小問）</h2><p class="small muted">Week 1〜11 のチュートリアルの問題を原文どおりに。単元と同じ問題はそちらと進捗を共有します。</p><ul class="list" style="margin-top:6px">${tut.weeks.map(w => {
      return `<li><a class="item" href="#/week/${w.n}"><span class="unit"><span class="num">W${w.n}</span></span><span class="t">${esc(w.title)}<small>${w.items.length} 問</small></span><span class="chev">›</span></a></li>`; }).join('')}</ul></div>` : ''}
  </div>`;
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
  if (q.kind === 'reveal') mountReveal(el, q);
  else if (q.kind === 'written') mountWritten(el, q, { unitId });
  else mountAuto(el, q, { unitId, onFinish: r => store.recordAuto(q.id, r, meta) });
}

// ───────── 本番演習（Sample・類題・模試） ─────────
async function viewDrill() {
  const [{ papers }, mi] = await Promise.all([loadPapers(), mockIndex().catch(() => ({ mocks: [] }))]);
  const row = p => {
    const parts = p.questions.flatMap(q => q.parts);
    const full = parts.filter(x => qStatus(x.id) === 'full').length;
    return `<li><a class="item" href="#/paper/${p.id}"><span class="t">${esc(p.paper)}：${esc(stripTags(p.title))}<small>満点 ${full} / ${parts.length} 小問${p.id === 'p' ? ' ・ 練習用の架空データ' : ''}</small><div class="bar" style="margin-top:4px"><span style="width:${full / parts.length * 100}%"></span></div></span><span class="chev">›</span></a></li>`;
  };
  app.innerHTML = `<div class="stack"><h1>本番演習</h1>
    <p class="muted small">本番は Sample paper とほぼ同じ形式。英語で書いて、採点チェックリストで自己採点。点を落としたら「ここを復習」から単元へ。</p>
    <div class="card"><h2>① Sample paper</h2><ul class="list" style="margin-top:6px">${papers.filter(p => p.id !== 'p').map(row).join('')}</ul></div>
    <div class="card"><h2>② 予想模試（各100点）</h2><p class="small muted">チュートリアルの実データで作った本番形式の通し演習。全問書いてからまとめて答え合わせ。</p><ul class="list" style="margin-top:6px">
      ${mi.mocks.length ? mi.mocks.map(m => { const st = store.getMock(m.id); return `<li><a class="item" href="#/mock/${m.id}"><span class="t">${esc(m.title)}<small>${esc(m.sub || '')}${st?.score != null ? ` ・ 前回 ${st.score} / 100` : ''}</small></span><span class="chev">›</span></a></li>`; }).join('') : '<li><div class="item muted">準備中</div></li>'}
    </ul></div>
    <div class="card"><h2>③ 類題（練習用の架空データ）</h2><ul class="list" style="margin-top:6px">${papers.filter(p => p.id === 'p').map(row).join('')}</ul></div>
  </div>`;
}

async function viewPaper(pid) {
  const { papers } = await loadPapers();
  const p = papers.find(x => x.id === pid);
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/drill">本番演習</a> › ${esc(p.paper)}</div>
    <h1>${esc(p.paper)}：${p.title}</h1>
    ${p.invented ? '<div><span class="invented">練習用の架空データ</span></div>' : ''}
    <details class="acc"><summary>この試験の設定（最初に読む）</summary><div class="in small">${p.intro}</div></details>
    ${p.questions.map(q => `<div class="card"><div class="row"><h2>${esc(q.q)}</h2>${q.marks ? `<span class="pill gray">${q.marks} marks</span>` : ''}</div>
      <ul class="list" style="margin-top:6px">${q.parts.map(x => { const s = qStatus(x.id), st = store.getQ(x.id);
        const b = s === 'none' ? '' : s === 'full' ? '<span class="pill good">満点</span>' : `<span class="pill warn">${pct(st.score || 0)}</span>`;
        return `<li><a class="item" href="#/sq/${x.id}"><span class="t">${esc(x.label)}${x.marks ? ` <span class="small muted">[${x.marks}m]</span>` : ''}<small>${esc(stripTags(x.prompt).slice(0, 90))}${stripTags(x.prompt).length > 90 ? '…' : ''}</small></span>${b}<span class="chev">›</span></a></li>`; }).join('')}</ul></div>`).join('')}
  </div>`;
}

async function viewSampleQ(id) {
  const { papers, byId } = await loadPapers();
  const q = byId[id];
  const p = papers.find(x => x.id === q.paper);
  const ids = p.questions.flatMap(x => x.parts.map(y => y.id));
  const i = ids.indexOf(id);
  const units = await unitsForPart(q);
  const studyLinks = units.flatMap(u => [{ href: `#/unit/${u.id}`, label: `Unit ${u.n} ${u.title}` }]);
  const before = units.length ? `<div class="unitchips"><span class="small muted">関係する単元：</span>${units.map(u => `<a class="pill" href="#/unit/${u.id}">Unit ${u.n} ${esc(u.title)}</a>`).join('')}${q.types?.[0] ? `<a class="pill gray" href="#/types/${q.types[0]}">解き方の型</a>` : ''}</div>` : '';
  const nextId = ids[i + 1];
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/drill">本番演習</a> › <a href="#/paper/${p.id}">${esc(p.paper)}</a> › ${esc(q.label)}</div>
    <div class="card qbox"></div>
    ${qNav(i > 0 ? `#/sq/${ids[i - 1]}` : null, nextId ? `#/sq/${nextId}` : null, `#/paper/${p.id}`, '一覧に戻る')}</div>`;
  mountWritten($('.qbox', app), q, { before, studyLinks });
}

// ───────── 予想模試 ─────────
async function viewMock(mid) {
  const mock = await loadMock(mid);
  const parts = mockParts(mock);
  const st = store.getMock(mid) || {};
  const total = parts.reduce((s, x) => s + (x.marks || 0), 0);
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/drill">本番演習</a> › ${esc(mock.title)}</div>
    <h1>${esc(mock.title)}</h1>
    <div class="card small">${mock.intro}</div>
    <div class="card row"><div><div class="small muted">タイマー（任意）</div><div class="timer" id="mtimer">--:--</div></div><span class="spacer"></span>
      <button class="btn" data-act="t60">60分で開始</button><button class="btn" data-act="t120">120分で開始</button></div>
    ${mock.questions.map(q => `<div class="card"><div class="row"><h2>${esc(q.q)}：${esc(q.title || '')}</h2><span class="pill gray">${q.parts.reduce((s, x) => s + x.marks, 0)} marks</span></div>
      ${q.intro ? `<p class="small" style="margin-top:6px">${q.intro}</p>` : ''}${q.exhibit ? renderExhibit(q.exhibit) : ''}
      ${q.parts.map(x => `<div class="mpart" data-id="${x.id}" style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px"></div>`).join('')}</div>`).join('')}
    <div class="stickybar btnrow"><button class="btn primary block" data-act="submit">全部提出して答え合わせ（${total}点）</button></div>
    <div class="card mresult" hidden></div>
  </div>`;
  const ctrls = {};
  for (const part of parts) {
    const el = $(`.mpart[data-id="${part.id}"]`, app);
    ctrls[part.id] = mountWritten(el, { ...part, exhibit: part.exhibit && part.exhibit !== mock.questions.find(q => q.q === part.qLabel)?.exhibit ? part.exhibit : null },
      { compactHeader: true, deferGrade: true, before: `<div class="row"><b>${esc(part.label)}</b><span class="pill gray">${part.marks} marks${part.marksEstimated ? '（推定）' : ''}</span></div>`,
        onFinish: () => summarize() });
  }
  const summarize = () => {
    const got = parts.map(x => ({ x, s: store.getQ(x.id) })).filter(o => o.s && o.s.date === store.today());
    if (!got.length) return;
    const score = Math.round(got.reduce((a, o) => a + (o.s.score || 0) * o.x.marks, 0) * 10) / 10;
    const bySlot = {}; got.forEach(o => { const k = o.x.slot || '?'; (bySlot[k] ||= [0, 0]); bySlot[k][0] += (o.s.score || 0) * o.x.marks; bySlot[k][1] += o.x.marks; });
    store.saveMock(mid, { score, date: store.today() });
    const box = $('.mresult', app); box.hidden = false;
    box.innerHTML = `<h2>結果：${score} / ${total}（確定済み ${got.length} / ${parts.length} 小問）</h2><div class="slots" style="margin-top:10px">${Object.entries(bySlot).map(([k, [a, b]]) => `<div class="slot"><span class="k">${k}</span><div><div class="small">${SLOTS[k] || ''}</div><div class="bar${a / b < .6 ? ' weak' : ''}"><span style="width:${a / b * 100}%"></span></div></div><span class="v">${Math.round(a * 10) / 10}/${b}</span></div>`).join('')}</div>`;
  };
  $('[data-act="submit"]', app).onclick = () => {
    if (!confirm('全部の答案を提出して答え合わせしますか？')) return;
    clearInterval(timer);
    Object.values(ctrls).forEach(c => c.grade(false));
    $('[data-act="submit"]', app).closest('.stickybar').remove();
    toast('各小問の「この点数で確定」を押すと合計が出ます');
  };
  let timer;
  const startTimer = min => {
    clearInterval(timer); const end = Date.now() + min * 60000;
    const tick = () => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); $('#mtimer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; if (!s) { clearInterval(timer); toast('時間です！'); } };
    tick(); timer = setInterval(tick, 1000);
    window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
  };
  $('[data-act="t60"]', app).onclick = () => startTimer(60);
  $('[data-act="t120"]', app).onclick = () => startTimer(120);
  summarize();
}

// ───────── Week 別チュートリアル ─────────
async function viewWeek(n) {
  const tut = await loadTutorials();
  const w = tut.weeks.find(x => String(x.n) === String(n));
  const items = await Promise.all(w.items.map(weekItemQ));
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/learn">単元</a> › Week ${w.n}</div>
    <h1>Week ${w.n}：${esc(w.title)}</h1>
    <p class="small muted">チュートリアルの全小問（原文）。解答は公式解答をもとにしています（誤りは修正済み）。${w.note || ''}</p>
    <div class="card"><ul class="list">${w.items.map((it, i) => { const q = items[i]; if (!q) return '';
      const s = qStatus(q.id); const b = s === 'none' ? '' : s === 'full' ? '<span class="pill good">✓</span>' : '<span class="pill warn">途中</span>';
      return `<li><a class="item" href="#/wq/${w.n}/${i}"><span class="t"><b>${esc(it.label)}</b> ${q.kind === 'reveal' ? '<span class="pill gray">Excel 操作</span>' : ''}<small>${esc(stripTags(q.prompt).slice(0, 90))}${stripTags(q.prompt).length > 90 ? '…' : ''}</small></span>${b}<span class="chev">›</span></a></li>`; }).join('')}</ul></div></div>`;
}
async function weekItemQ(it) {
  if (it.q) return it.q;
  const f = await findQuestion(it.ref);
  return f && f.q;
}
async function viewWeekQ(n, i) {
  i = +i;
  const tut = await loadTutorials();
  const w = tut.weeks.find(x => String(x.n) === String(n));
  const it = w.items[i];
  const f = it.q ? { q: { ...it.q, slot: it.q.slot || w.slot }, ctx: {} } : await findQuestion(it.ref);
  app.innerHTML = `<div class="stack"><div class="crumb"><a href="#/learn">単元</a> › <a href="#/week/${w.n}">Week ${w.n}</a> › ${esc(it.label)}</div>
    ${it.ref && f?.ctx?.unit ? `<div class="unitchips"><span class="small muted">この問題は単元にもあります：</span><a class="pill" href="#/unit/${f.ctx.unit.id}">${esc(f.ctx.unit.title)}</a></div>` : ''}
    <div class="card qbox"></div>
    ${qNav(i > 0 ? `#/wq/${w.n}/${i - 1}` : null, i < w.items.length - 1 ? `#/wq/${w.n}/${i + 1}` : null, `#/week/${w.n}`, 'Week の一覧へ')}</div>`;
  if (!f) { $('.qbox', app).innerHTML = '<p class="muted">問題が見つかりません</p>'; return; }
  mountQ($('.qbox', app), f.q, f.ctx?.unit?.id);
}

function mountReveal(el, q) {
  el.innerHTML = `<div class="stack"><div class="q-head"><span class="pill gray">Excel 操作・確認問題</span></div>
    <div class="q-prompt en" lang="en">${q.prompt}</div>${q.exhibit ? renderExhibit(q.exhibit) : ''}${sourceLine(q)}
    <p class="small muted">Excel で操作する問題です。試験では操作は出ないので、答え（何が分かるか）を読んで確認しましょう。</p>
    <div class="btnrow"><button class="btn primary block" data-act="show">答えを見る</button></div><div class="ra"></div></div>`;
  $('[data-act="show"]', el).onclick = e => {
    e.target.closest('.btnrow').remove();
    $('.ra', el).innerHTML = `<div class="reveal-ans" lang="en">${q.modelAnswer}</div>${q.warn ? `<div class="warnbox" style="margin-top:10px"><b>注意：</b>${q.warn}</div>` : ''}
      <div class="btnrow" style="margin-top:12px"><button class="btn primary" data-r="1">分かった</button><button class="btn" data-r="0">あとで見直す</button></div>`;
    $$('[data-r]', el).forEach(b => b.onclick = () => { store.recordAuto(q.id, b.dataset.r === '1' ? 'correct' : 'wrong', { slot: q.slot }); toast(b.dataset.r === '1' ? '記録しました' : '復習キューに入れました'); });
  };
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
