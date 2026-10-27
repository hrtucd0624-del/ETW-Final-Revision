// Exhibit（資料）の表示：reg（SUMMARY OUTPUT）/ desc / pivot / img。
// 値の先頭が ! のセルは黄色ハイライト。セルアドレスはラベル列を除いた 0 始まり：
//   reg → stats:行:0、anova:行:列、coef:行:列（coef の列 0=Coefficients, 1=Standard Error, 2=t Stat, 3=P-value, 4=Lower 95%, 5=Upper 95%）
//   desc / pivot → 行:列（列 0 = 最初のデータ列）
import { esc } from '../util.js';

const COEF_HEAD = ['Coefficients', 'Standard Error', 't Stat', 'P-value', 'Lower 95%', 'Upper 95%'];
const ANOVA_HEAD = ['df', 'SS', 'MS', 'F', 'Significance F'];

function cell(v, addr, opts) {
  if (v === undefined || v === null) return '<td class="empty"></td>';
  let s = String(v), hl = false;
  if (s.startsWith('!')) { s = s.slice(1); hl = !opts.tap; }
  const cls = [hl ? 'hl' : ''].filter(Boolean).join(' ');
  return `<td${cls ? ` class="${cls}"` : ''}${addr && opts.tap ? ` data-a="${addr}" role="button" tabindex="0" aria-label="${esc(s || '空白')}"` : ''}>${esc(s)}</td>`;
}
const pad = (n, w) => Array.from({ length: Math.max(0, w - n) }, () => '<td class="empty"></td>').join('');

function renderReg(r, opts) {
  const W = 7;
  let h = '<tr class="sec"><td colspan="7">SUMMARY OUTPUT</td></tr>';
  h += '<tr class="sec"><td colspan="2"><i>Regression Statistics</i></td>' + pad(2, W) + '</tr>';
  (r.stats || []).forEach((row, i) => {
    h += `<tr><td class="lab">${esc(row[0])}</td>${cell(row[1], `stats:${i}:0`, opts)}${pad(2, W)}</tr>`;
  });
  if (r.anova) {
    h += '<tr><td colspan="7" class="empty"></td></tr><tr class="sec"><td colspan="7">ANOVA</td></tr>';
    h += '<tr><th></th>' + ANOVA_HEAD.map(x => `<th>${x}</th>`).join('') + '<th></th></tr>';
    r.anova.forEach((row, i) => {
      h += `<tr><td class="lab">${esc(row[0])}</td>` + row.slice(1).map((v, j) => cell(v, `anova:${i}:${j}`, opts)).join('') + pad(row.length, W) + '</tr>';
    });
  }
  h += '<tr><td colspan="7" class="empty"></td></tr>';
  h += '<tr><th></th>' + COEF_HEAD.map(x => `<th>${x}</th>`).join('') + '</tr>';
  (r.coef || []).forEach((row, i) => {
    h += `<tr><td class="lab">${esc(row[0])}</td>` + row.slice(1).map((v, j) => cell(v, `coef:${i}:${j}`, opts)).join('') + pad(row.length, W) + '</tr>';
  });
  return `${r.title ? `<div class="cap">${esc(r.title)}</div>` : ''}<div class="xlwrap"><table class="xl${opts.tap ? ' tap' : ''}">${h}</table></div>`;
}

function renderGrid(t, opts) {
  const head = '<tr>' + t.cols.map((c, i) => `<th${i === 0 ? ' style="text-align:left"' : ''}>${esc(c)}</th>`).join('') + '</tr>';
  const body = t.rows.map((row, i) =>
    `<tr><td class="lab">${esc(String(row[0]).replace(/^!/, ''))}</td>` + row.slice(1).map((v, j) => cell(v, `${i}:${j}`, opts)).join('') + '</tr>').join('');
  return `${t.title ? `<div class="cap">${esc(t.title)}</div>` : ''}<div class="xlwrap"><table class="xl${opts.tap ? ' tap' : ''}">${head}${body}</table></div>`;
}

const IMG_ALT = { hist: 'ヒストグラム（2種類の階級幅）', scatter: '散布図', polygon: '度数多角形' };

/** exhibit オブジェクトを HTML に。opts.tap = セルタップモード（ハイライトを隠す） */
export function renderExhibit(ex, opts = {}) {
  if (!ex) return '';
  const parts = [];
  if (ex.note) parts.push(`<p class="small muted">${ex.note}</p>`);
  if (ex.reg) parts.push(renderReg(ex.reg, opts));
  if (ex.desc) parts.push(renderGrid(ex.desc, opts));
  if (ex.pivot) parts.push(renderGrid(ex.pivot, opts));
  if (ex.img) {
    const src = ex.img.includes('/') ? ex.img : `seed/img/${ex.img}.webp`;
    parts.push(`<img src="${esc(src)}" alt="${esc(IMG_ALT[ex.img] || '図')}" loading="lazy">`);
  }
  if (ex.html) parts.push(ex.html);
  const wide = ex.reg || ex.desc || ex.pivot;
  return `<figure class="exhibit stack">${parts.join('')}${wide && !opts.tap ? '<div class="xlnote">表は横にスクロールできます。黄色＝見るべきセル</div>' : ''}</figure>`;
}
