// 問題 UI（L1〜L4 の6種類）と答え合わせの5点セット（指示書 §2.2）。
import { esc, $, $$, shuffle, ICONS } from '../util.js';
import { renderExhibit } from './exhibit.js';
import { gradeAuto, wrongReasons } from '../grade.js';
import * as store from '../store.js';

const LEVEL = { 1: 'L1 選択', 2: 'L2 セル', 3: 'L3 穴埋め', 4: 'L4 組み立て', 5: 'L5 記述' };
const KIND = { choice: '選択', multi: '複数選択', tapCell: 'セルをタップ', fillChips: '空欄を埋める', order: '並べ替え', buildSentence: '文を組み立てる', written: '記述' };

export function qHeader(q, extra = '') {
  const st = store.getQ(q.id);
  const badge = !st ? '' : st.last === 'correct' ? '<span class="pill good">✓ 正解済み</span>'
    : st.last === 'partial' ? `<span class="pill warn">${Math.round((st.score || 0) * 100)}%</span>` : '<span class="pill bad">要復習</span>';
  return `<div class="q-head"><span class="pill">${LEVEL[q.level] || ''}</span>${q.kind !== 'written' ? `<span class="pill gray">${KIND[q.kind] || ''}</span>` : ''}${q.marks ? `<span class="pill gray">${q.marks} marks${q.marksEstimated ? '（推定）' : ''}</span>` : ''}${badge}${extra}</div>`;
}

export function sourceLine(q) {
  const s = q.source ? `<div class="src">出典：${esc(q.source.file)}${q.source.where ? ` — ${esc(q.source.where)}` : ''}${q.answerSource === 'claude' ? '（解答は Claude 作成）' : ''}</div>` : '';
  return (q.invented ? '<div><span class="invented">練習用の架空データ</span></div>' : '') + s;
}

export function relatedLinks(rel = {}, unitId) {
  const out = [];
  if (rel.lesson && unitId) out.push(`<a class="pill" href="#/lesson/${unitId}/${rel.lesson}">レッスンに戻る</a>`);
  if (rel.sample) [].concat(rel.sample).forEach(s => out.push(`<a class="pill" href="#/sq/${s}">関連する Sample：${esc(s)}</a>`));
  if (rel.answerType) out.push(`<a class="pill" href="#/types/${rel.answerType}">解き方の型</a>`);
  return out.length ? `<h4>関連</h4><div class="chips">${out.join('')}</div>` : '';
}

/** 答え合わせパネル。status: ok | near | ng | reveal */
export function feedbackHTML(q, status, reasons = [], unitId) {
  const fb = q.feedback || {};
  const title = { ok: '✓ 正解', near: '△ 惜しい（2回目で正解）', ng: '✗ 不正解', reveal: '答えと解説' }[status];
  const cls = { ok: 'ok', near: 'near', ng: 'ng', reveal: 'ng' }[status];
  let h = `<div class="fb ${cls}${status === 'ok' ? ' flash-ok' : ''}" role="status"><div class="fb-title">${title}</div>`;
  if (status === 'ok' || status === 'near') h += fb.correct ? `<p style="margin-top:6px">${fb.correct}</p>` : '';
  if (status === 'ng') {
    h += reasons.length ? reasons.map(r => `<p style="margin-top:6px">${r}</p>`).join('') : '<p style="margin-top:6px" class="muted">もう一度考えてみよう。ヒントは下の「考え方」。</p>';
    return h + '</div>';
  }
  if (status === 'reveal') h += `<p style="margin-top:6px"><b>正解：</b>${answerText(q)}</p>`;
  if (fb.thinking?.length) h += `<h4>考え方</h4><ol class="think">${fb.thinking.map(t => `<li>${t}</li>`).join('')}</ol>`;
  if (fb.mistakes?.length) h += `<h4>よくある間違い（減点ポイント）</h4><ul class="mist">${fb.mistakes.map(t => `<li>${t}</li>`).join('')}</ul>`;
  if (fb.examTemplate) h += `<h4>本番での書き方</h4><div class="tmpl">${fb.examTemplate}</div>`;
  h += relatedLinks(fb.related, unitId);
  return h + '</div>';
}

function answerText(q) {
  switch (q.kind) {
    case 'choice': return esc(q.options[q.answer]);
    case 'multi': return q.answer.map(i => esc(q.options[i])).join(' ／ ');
    case 'tapCell': return '緑の枠のセル';
    case 'fillChips': return esc(q.template.replace(/\[(\w+)\]/g, (_, k) => q.answer[k]));
    case 'order': return '<ol>' + q.answer.map(a => `<li>${esc(a)}</li>`).join('') + '</ol>';
    case 'buildSentence': return esc(q.answer[0].join(' '));
  }
  return '';
}

/**
 * L1〜L4 の問題を el に描画。onFinish(result) は最初の答え合わせの後に1回だけ呼ばれる（記録用）。
 * opts.compact: レッスン内のミニ確認問題
 */
export function mountAuto(el, q, { unitId, onFinish, compact } = {}) {
  let resp = initResp(q);
  let tries = 0, done = false, recorded = false, active = null;
  const bankOrder = q.kind === 'buildSentence' ? shuffle(q.chips.map((_, i) => i), q.id) : null;
  const orderItems = q.kind === 'order' ? (q.items ? [...q.items] : shuffle(q.answer, q.id)) : null;
  if (q.kind === 'order') resp = orderItems;
  if (q.kind === 'fillChips') active = Object.keys(q.answer)[0];

  el.innerHTML = `<div class="stack">
    ${compact ? '' : qHeader(q)}
    <div class="q-prompt">${q.prompt}</div>
    ${q.exhibit && q.kind !== 'tapCell' ? renderExhibit(q.exhibit) : ''}
    <div class="q-ui"></div>
    <div class="q-fb"></div>
    <div class="btnrow q-actions"></div>
    ${compact ? '' : sourceLine(q)}
  </div>`;
  const ui = $('.q-ui', el), fbEl = $('.q-fb', el), act = $('.q-actions', el);

  function complete() {
    switch (q.kind) {
      case 'choice': return resp !== null;
      case 'multi': return resp.length > 0;
      case 'tapCell': return resp !== null;
      case 'fillChips': return Object.keys(q.answer).every(k => resp[k]);
      case 'order': return true;
      case 'buildSentence': return resp.length > 0;
    }
  }

  function draw(mark) {
    // mark: null | { ok, reveal }
    const lock = done;
    if (q.kind === 'choice' || q.kind === 'multi') {
      const multi = q.kind === 'multi';
      ui.innerHTML = `<div class="opts">${q.options.map((o, i) => {
        const sel = multi ? resp.includes(i) : resp === i;
        let c = sel ? ' sel' : '';
        if (mark && (mark.ok || mark.reveal)) { if ((multi ? q.answer.includes(i) : q.answer === i)) c = ' right'; else if (sel) c = ' wrong'; }
        else if (mark && sel) c = ' wrong';
        return `<button class="opt${multi ? ' sq' : ''}${c}" data-i="${i}" ${lock ? 'disabled' : ''}><span class="mk">${multi ? (sel ? '✓' : '') : String.fromCharCode(65 + i)}</span><span>${o}</span></button>`;
      }).join('')}</div>`;
      $$('.opt', ui).forEach(b => b.onclick = () => {
        if (done) return; const i = +b.dataset.i;
        if (multi) resp = resp.includes(i) ? resp.filter(x => x !== i) : [...resp, i]; else resp = i;
        fbEl.innerHTML = ''; draw(); actions();
      });
    } else if (q.kind === 'tapCell') {
      ui.innerHTML = renderExhibit(q.exhibit, { tap: true });
      const answers = [].concat(q.answer);
      $$('td[data-a]', ui).forEach(td => {
        const a = td.dataset.a;
        if (mark && (mark.ok || mark.reveal) && answers.includes(a)) td.classList.add('right');
        else if (mark && a === resp) td.classList.add('wrong');
        else if (a === resp) td.classList.add('sel');
        const pick = () => { if (done) return; resp = a; fbEl.innerHTML = ''; draw(); actions(); };
        td.onclick = pick; td.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
      });
      if (!mark) ui.insertAdjacentHTML('beforeend', '<div class="xlnote">答えだと思うセルをタップ（表は横にスクロールできます）</div>');
    } else if (q.kind === 'fillChips') {
      const tpl = esc(q.template).replace(/\[(\w+)\]/g, (_, k) => {
        let c = resp[k] ? ' filled' : '';
        if (mark && resp[k]) c += resp[k] === q.answer[k] ? ' right' : ' wrong';
        if (!done && k === active) c += ' active';
        return `<button class="slotbtn${c}" data-k="${k}" ${lock ? 'disabled' : ''}>${resp[k] ? esc(resp[k]) : '？'}</button>`;
      });
      const chips = active && !done ? shuffle(q.chips[active], q.id + active) : [];
      ui.innerHTML = `<div class="card tpl">${tpl}</div>${chips.length ? `<div class="small muted" style="margin:10px 0 6px">空欄に入る語を選ぶ</div><div class="chips">${chips.map(c => `<button class="chip${resp[active] === c ? ' sel' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}`;
      $$('.slotbtn', ui).forEach(b => b.onclick = () => { if (done) return; active = b.dataset.k; draw(); });
      $$('.chip', ui).forEach(b => b.onclick = () => {
        resp[active] = b.dataset.c; fbEl.innerHTML = '';
        const keys = Object.keys(q.answer);
        active = keys.find(k => !resp[k]) || active;
        draw(); actions();
      });
    } else if (q.kind === 'order') {
      const showOk = mark && (mark.ok || mark.reveal);
      const list = showOk && mark.reveal ? q.answer : resp;
      ui.innerHTML = `<ol class="order">${list.map((t, i) => {
        const c = mark ? (q.answer[i] === t ? ' right' : ' wrong') : '';
        return `<li class="${c.trim()}"><span class="n">${i + 1}</span><span class="t">${esc(t)}</span>${done ? '' : `<button class="iconbtn" data-u="${i}" aria-label="上へ" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button><button class="iconbtn" data-d="${i}" aria-label="下へ" ${i === list.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>`}</li>`;
      }).join('')}</ol>`;
      const move = (i, j) => { const a = [...resp]; [a[i], a[j]] = [a[j], a[i]]; resp = a; fbEl.innerHTML = ''; draw(); actions(); };
      $$('[data-u]', ui).forEach(b => b.onclick = () => move(+b.dataset.u, +b.dataset.u - 1));
      $$('[data-d]', ui).forEach(b => b.onclick = () => move(+b.dataset.d, +b.dataset.d + 1));
    } else if (q.kind === 'buildSentence') {
      const cls = mark ? (mark.ok ? ' right' : ' wrong') : '';
      const words = (mark && mark.reveal) ? q.answer[0] : resp.map(i => q.chips[i]);
      ui.innerHTML = `<div class="built${cls}">${words.map((w, j) => `<button class="chip" data-j="${j}" ${lock ? 'disabled' : ''}>${esc(w)}</button>`).join('')}</div>
        ${done ? '' : `<div class="chips" style="margin-top:10px">${bankOrder.map(i => `<button class="chip${resp.includes(i) ? ' used' : ''}" data-i="${i}" ${resp.includes(i) ? 'disabled' : ''}>${esc(q.chips[i])}</button>`).join('')}</div>`}`;
      $$('.built .chip', ui).forEach(b => b.onclick = () => { if (done) return; resp = resp.filter((_, j) => j !== +b.dataset.j); fbEl.innerHTML = ''; draw(); actions(); });
      $$('.chips .chip[data-i]', ui).forEach(b => b.onclick = () => { resp = [...resp, +b.dataset.i]; fbEl.innerHTML = ''; draw(); actions(); });
    }
  }

  function actions(state) {
    if (done) { act.innerHTML = ''; el.dispatchEvent(new CustomEvent('qdone', { bubbles: true })); return; }
    if (state === 'wrong') {
      act.innerHTML = '<button class="btn primary" data-act="retry">もう一度</button><button class="btn" data-act="reveal">答えを見る</button>';
    } else {
      act.innerHTML = `<button class="btn primary block" data-act="check" ${complete() ? '' : 'disabled'}>答え合わせ</button>`;
    }
    $$('[data-act]', act).forEach(b => b.onclick = () => handle(b.dataset.act));
  }

  function record(result) {
    if (recorded) return; recorded = true;
    onFinish && onFinish(result);
  }

  function handle(a) {
    if (a === 'check') {
      const r = q.kind === 'buildSentence' ? resp.map(i => q.chips[i]) : resp;
      const ok = gradeAuto(q, r);
      tries++;
      if (ok) {
        done = true;
        const status = tries === 1 ? 'ok' : 'near';
        record(tries === 1 ? 'correct' : 'wrong');
        draw({ ok: true });
        fbEl.innerHTML = feedbackHTML(q, status, [], unitId);
      } else {
        record('wrong');
        draw({ ok: false });
        fbEl.innerHTML = feedbackHTML(q, 'ng', wrongReasons(q, r), unitId);
        actions('wrong'); return;
      }
    } else if (a === 'retry') {
      fbEl.innerHTML = '';
      if (q.kind === 'fillChips') { Object.keys(q.answer).forEach(k => { if (resp[k] !== q.answer[k]) delete resp[k]; }); active = Object.keys(q.answer).find(k => !resp[k]); }
      if (q.kind === 'tapCell' || q.kind === 'choice') resp = null;
      draw();
    } else if (a === 'reveal') {
      done = true;
      draw({ ok: false, reveal: true });
      fbEl.innerHTML = feedbackHTML(q, 'reveal', [], unitId);
    }
    actions();
  }

  draw(); actions();
}

function initResp(q) {
  switch (q.kind) {
    case 'multi': return [];
    case 'fillChips': return {};
    case 'buildSentence': return [];
    default: return null;
  }
}
