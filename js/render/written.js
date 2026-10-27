// L5 記述問題：① 書く → ② 採点（キーワード判定と採点基準を1つのチェックリストに）→ ③ 模範解答と比べる → ④ 解説。
import { esc, $, $$ } from '../util.js';
import { renderExhibit } from './exhibit.js';
import { checkWritten, highlightHTML } from '../grade.js';
import { qHeader, sourceLine, relatedLinks } from './questions.js';
import * as store from '../store.js';

const fmt = n => (Math.round(n * 10) / 10).toString();

/**
 * opts.unitId: 関連リンク用 / opts.onFinish(pct): 確定時 / opts.studyLinks: 「ここを復習」に出すリンク [{href,label}]
 * opts.deferGrade: true なら答え合わせボタンを出さない（模試モード：外から grade() を呼ぶ）
 */
export function mountWritten(el, q, opts = {}) {
  const saved = store.getWritten(q.id) || {};
  el.innerHTML = `<div class="stack">
    ${opts.compactHeader ? '' : qHeader(q)}
    ${opts.before || ''}
    <div class="q-prompt en" lang="en">${q.prompt}</div>
    ${q.exhibit ? (q.exhibitInherited ? '<div class="small muted">資料は前の小問と同じ</div>' : '') + renderExhibit(q.exhibit) : ''}
    ${sourceLine(q)}
    <div class="w-write">
      <div class="steplabel"><span class="stepnum">1</span>英語で答案を書く <span class="small muted">（計算は式で止めてOK）</span></div>
      <textarea class="ans" id="ans-${q.id}" lang="en" spellcheck="true" autocapitalize="sentences" placeholder="Write your answer in English…">${esc(saved.draft ?? saved.text ?? '')}</textarea>
      ${q.marks ? `<div class="small muted" style="margin-top:4px">${q.marks} marks${q.marksEstimated ? '（配点は推定）' : ''} — 採点ポイントは ${q.rubric.length} 個</div>` : ''}
    </div>
    ${opts.deferGrade ? '' : '<div class="btnrow"><button class="btn primary block" data-act="check">答え合わせ</button></div>'}
    <div class="w-result"></div>
  </div>`;
  const ta = $('textarea', el), out = $('.w-result', el);
  let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => store.saveDraft(q.id, ta.value), 400); });
  const grade = (scroll = true) => {
    store.saveDraft(q.id, ta.value);
    const btn = $('[data-act="check"]', el); if (btn) btn.closest('.btnrow').remove();
    showResult(out, q, ta.value, opts, () => { // もう一度書く
      out.innerHTML = '';
      el.querySelector('.w-write').insertAdjacentHTML('afterend', '<div class="btnrow"><button class="btn primary block" data-act="check">答え合わせ</button></div>');
      $('[data-act="check"]', el).onclick = () => grade();
      ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (scroll) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const btn = $('[data-act="check"]', el);
  if (btn) btn.onclick = () => {
    if (!ta.value.trim() && !confirm('何も書いていません。模範解答だけ見ますか？')) return;
    grade();
  };
  return { grade, textarea: ta };
}

function showResult(out, q, text, opts, retry) {
  const res = checkWritten(text, q);
  const total = q.rubric.reduce((s, x) => s + x.marks, 0) || q.marks || 0;
  const kws = q.rubric.flatMap(r => (r.keywords || []).flat()).filter(k => /[a-z0-9]/i.test(k));
  const model = highlightHTML(q.modelAnswer || '', kws);
  const fb = q.feedback || {};

  const rows = res.items.map(({ item, found, auto }, i) => {
    let status;
    if (!item.keywords?.length) status = '<span class="st self">自分で確認</span>';
    else if (auto) status = '<span class="st ok">キーワードあり</span>';
    else status = `<span class="st miss">見つからない：${item.keywords.map((g, j) => found[j] ? null : `「${esc(g[0])}」`).filter(Boolean).join(' ')}</span>`;
    return `<label class="rubrow${auto ? ' auto' : ''}"><input type="checkbox" data-i="${i}" ${auto ? 'checked' : ''}>
      <span class="rt"><span>${esc(item.label)}</span>${status}</span><span class="m">${fmt(item.marks)}点</span></label>`;
  }).join('');

  out.innerHTML = `<div class="stack">
    ${res.forbidden.length ? `<div class="warnbox">${res.forbidden.map(f => `<div>⛔ ${esc(f.message)}</div>`).join('')}</div>` : ''}
    <div class="card">
      <div class="steplabel"><span class="stepnum">2</span>採点チェックリスト</div>
      <p class="small muted" style="margin:2px 0 10px">緑＝必要な語が見つかった項目（自動でチェック済み）。下の模範解答と比べて、内容が合っているか最後に自分で確かめてチェックを直してください。${q.marksEstimated ? '配点は推定です。' : ''}</p>
      <div class="rub">${rows}</div>
    </div>
    ${q.warn ? `<div class="warnbox"><b>公式解答の誤りに注意：</b>${q.warn}</div>` : ''}
    <div class="card">
      <div class="steplabel"><span class="stepnum">3</span>模範解答と比べる <span class="small muted">（黄色＝点になる語）</span></div>
      <div class="model" lang="en" style="margin-top:8px">${model}</div>
      <details class="mine-d"><summary class="small">自分の答えを表示</summary><div class="mine" lang="en">${esc(text) || '<span class="muted">（未記入）</span>'}</div></details>
    </div>
    ${(q.jp || q.tip || fb.thinking || fb.mistakes || fb.examTemplate) ? `<details class="acc"><summary>解説・書き方のコツ</summary><div class="in">
      ${q.jp ? `<p>${q.jp}</p>` : ''}
      ${fb.thinking?.length ? `<h4 class="small muted">考え方</h4><ol class="think">${fb.thinking.map(t => `<li>${t}</li>`).join('')}</ol>` : ''}
      ${fb.mistakes?.length ? `<h4 class="small muted">よくある間違い（減点ポイント）</h4><ul class="mist">${fb.mistakes.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
      ${q.tip ? `<div class="tipbox">💡 ${q.tip}</div>` : ''}
      ${fb.examTemplate ? `<h4 class="small muted">本番での書き方</h4><div class="tmpl">${fb.examTemplate}</div>` : ''}
      ${relatedLinks(fb.related, opts.unitId)}
    </div></details>` : ''}
    <div class="scorebar"><div class="scoreval"><span class="sc">0</span><span class="tot"> / ${fmt(total)} 点</span></div><button class="btn primary" data-act="commit">この点数で確定</button></div>
    <div class="w-after"></div>
  </div>`;

  const boxes = $$('.rub input[type=checkbox]', out);
  const sc = $('.sc', out);
  const calc = () => boxes.reduce((s, b) => s + (b.checked ? q.rubric[+b.dataset.i].marks : 0), 0);
  const upd = () => { sc.textContent = fmt(calc()); };
  boxes.forEach(b => b.onchange = upd); upd();

  $('[data-act="commit"]', out).onclick = () => {
    const got = calc(), pct = total ? got / total : 0;
    store.recordWritten(q.id, text, boxes.map(b => b.checked), pct, { slot: q.slot });
    $('.scorebar', out).remove();
    const missed = res.items.filter((_, i) => !boxes[i].checked).map(x => x.item.label);
    const links = (opts.studyLinks || []).map(l => `<a class="btn" href="${l.href}">${esc(l.label)}</a>`).join('');
    $('.w-after', out).innerHTML = `<div class="fb ${pct >= 1 ? 'ok flash-ok' : 'near'}">
      <div class="fb-title">${fmt(got)} / ${fmt(total)} 点（${Math.round(pct * 100)}%）</div>
      ${pct >= 1 ? '<p style="margin-top:4px">満点！この問題は完了です。</p>' : `<p style="margin-top:4px">落とした点：${missed.map(esc).join('、')}</p><p class="small muted">復習キューに入れました（明日もう一度出ます）。</p>`}
      ${pct < 1 && links ? `<h4>ここを復習</h4><div class="btnrow">${links}</div>` : ''}
      <div class="btnrow" style="margin-top:10px"><button class="btn" data-act="retry">もう一度書く</button></div>
    </div>`;
    $('[data-act="retry"]', out).onclick = retry;
    opts.onFinish && opts.onFinish(pct);
    out.dispatchEvent(new CustomEvent('qdone', { bubbles: true }));
  };
}
