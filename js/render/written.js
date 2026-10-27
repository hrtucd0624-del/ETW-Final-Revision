// L5 記述問題：書く → キーワードチェッカー → 採点基準で自己採点 → 模範解答と比較（指示書 §2.3）。
import { esc, $, $$ } from '../util.js';
import { renderExhibit } from './exhibit.js';
import { checkWritten, highlightHTML } from '../grade.js';
import { qHeader, sourceLine, relatedLinks } from './questions.js';
import * as store from '../store.js';

const fmt = n => (Math.round(n * 10) / 10).toString();

export function mountWritten(el, q, { unitId, onFinish } = {}) {
  const saved = store.getWritten(q.id) || {};
  el.innerHTML = `<div class="stack">
    ${qHeader(q)}
    <div class="q-prompt en" lang="en">${q.prompt}</div>
    ${q.exhibit ? (q.exhibitInherited ? '<div class="small muted">資料は前の小問と同じ</div>' : '') + renderExhibit(q.exhibit) : ''}
    ${sourceLine(q)}
    <div>
      <label class="small muted" for="ans-${q.id}">英語で答案を書く（本番と同じように。計算は式で止めてOK）</label>
      <textarea class="ans" id="ans-${q.id}" lang="en" spellcheck="true" autocapitalize="sentences" placeholder="Write your answer in English…">${esc(saved.draft ?? saved.text ?? '')}</textarea>
    </div>
    <div class="btnrow"><button class="btn primary block" data-act="check">答え合わせ</button></div>
    <div class="w-result"></div>
  </div>`;
  const ta = $('textarea', el), out = $('.w-result', el);
  let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => store.saveDraft(q.id, ta.value), 400); });
  $('[data-act="check"]', el).onclick = () => {
    if (!ta.value.trim() && !confirm('何も書いていません。模範解答だけ見ますか？')) return;
    store.saveDraft(q.id, ta.value);
    showResult(out, q, ta.value, { unitId, onFinish });
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function showResult(out, q, text, { unitId, onFinish }) {
  const res = checkWritten(text, q);
  const total = q.rubric.reduce((s, x) => s + x.marks, 0) || q.marks || 0;

  // ① キーワードチェッカー
  const kwRows = res.items.map(({ item, found, auto }) => {
    if (!item.keywords?.length) return `<div class="k"><span class="ic">○</span><span>${esc(item.label)}<br><span class="small muted">自動判定なし — 自分で確認</span></span></div>`;
    if (auto) return `<div class="k"><span class="ic">✅</span><span>${esc(item.label)}</span></div>`;
    const miss = item.keywords.map((g, i) => found[i] ? null : g[0]).filter(Boolean);
    return `<div class="k miss"><span class="ic">⚠️</span><span>${esc(item.label)}<br><span class="small">見つからない：${miss.map(m => `「${esc(m)}」`).join('、')}</span></span></div>`;
  }).join('');
  const forb = res.forbidden.map(f => `<div class="k forb"><span class="ic">⛔</span><span>${esc(f.message)}</span></div>`).join('');

  // ② 採点基準（自動判定できた項目はチェック済み）
  const rub = res.items.map(({ item, auto }, i) =>
    `<label class="${auto ? 'auto' : ''}"><input type="checkbox" data-i="${i}" ${auto ? 'checked' : ''}><span>${esc(item.label)}</span><span class="m">${fmt(item.marks)}m</span></label>`).join('');

  // ③ 模範解答（キーワードをハイライト）
  const kws = q.rubric.flatMap(r => (r.keywords || []).flat()).filter(k => /[a-z0-9]/i.test(k));
  const model = highlightHTML(q.modelAnswer || '', kws);
  const fb = q.feedback || {};

  out.innerHTML = `<div class="stack">
    <div class="card">
      <h3>① キーワードチェッカー</h3>
      <p class="small muted" style="margin-top:4px">採点ポイントに必要な語が入っているかを機械的に確認します。入っていても意味が正しいかは自分で確認。</p>
      <div class="kw" style="margin-top:8px">${forb}${kwRows || '<div class="muted small">この問題にはキーワードが設定されていません。</div>'}</div>
    </div>
    <div class="card">
      <div class="row"><h3>② 採点基準で自己採点</h3><span class="spacer"></span><span class="score"><span class="sc">0</span> / ${fmt(total)}</span></div>
      ${q.marksEstimated ? '<p class="small muted">この問題は公式の配点が公開されていないため、配点は推定です。</p>' : ''}
      <p class="small muted">緑の枠＝キーワードで自動チェック済み。模範解答と比べて、内容が合っているか最終確認してください。</p>
      <div class="rub" style="margin-top:8px">${rub}</div>
    </div>
    ${q.warn ? `<div class="warnbox"><b>公式解答の誤りに注意：</b>${q.warn}</div>` : ''}
    <div class="compare">
      <div class="card"><h4>あなたの答え</h4><div class="mine" lang="en">${esc(text) || '<span class="muted">（未記入）</span>'}</div></div>
      <div class="card"><h4>模範解答 <span class="small muted">（黄色＝点がもらえる語）</span></h4><div class="model" lang="en">${model}</div></div>
    </div>
    ${(q.jp || q.tip || fb.thinking || fb.mistakes || fb.examTemplate) ? `<div class="fb">
      <div class="fb-title" style="color:var(--ink)">解説</div>
      ${q.jp ? `<p style="margin-top:6px">${q.jp}</p>` : ''}
      ${fb.thinking?.length ? `<h4>考え方</h4><ol class="think">${fb.thinking.map(t => `<li>${t}</li>`).join('')}</ol>` : ''}
      ${fb.mistakes?.length ? `<h4>よくある間違い（減点ポイント）</h4><ul class="mist">${fb.mistakes.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
      ${q.tip ? `<div class="tipbox" style="margin-top:10px">💡 ${q.tip}</div>` : ''}
      ${fb.examTemplate ? `<h4>本番での書き方</h4><div class="tmpl">${fb.examTemplate}</div>` : ''}
      ${relatedLinks(fb.related, unitId)}
    </div>` : ''}
    <div class="btnrow"><button class="btn primary block" data-act="commit">自己採点を確定</button></div>
  </div>`;

  const boxes = $$('input[type=checkbox]', out);
  const sc = $('.sc', out);
  const calc = () => boxes.reduce((s, b) => s + (b.checked ? q.rubric[+b.dataset.i].marks : 0), 0);
  const upd = () => { sc.textContent = fmt(calc()); };
  boxes.forEach(b => b.onchange = upd); upd();

  $('[data-act="commit"]', out).onclick = (e) => {
    const got = calc(), pct = total ? got / total : 0;
    store.recordWritten(q.id, text, boxes.map(b => b.checked), pct, { slot: q.slot });
    e.target.closest('.btnrow').innerHTML = `<div class="fb ${pct >= 1 ? 'ok flash-ok' : 'near'}" style="width:100%"><div class="fb-title">${fmt(got)} / ${fmt(total)}（${Math.round(pct * 100)}%）</div><p style="margin-top:4px">${pct >= 1 ? '満点！この問題は完了です。' : '満点でないので、復習キューに入れました（明日もう一度）。'}</p></div>`;
    onFinish && onFinish(pct);
    out.dispatchEvent(new CustomEvent('qdone', { bubbles: true }));
  };
}
