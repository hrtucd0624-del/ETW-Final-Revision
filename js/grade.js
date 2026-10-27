// 採点ロジック。L1〜L4 は自動判定、L5 はキーワードチェッカー（AND の中に OR）。

/** 判定前の正規化：全角→半角、小文字、記号ゆれ（H₀/Ho/H0、β/beta、−/-）、余分な空白 */
export function norm(s) {
  // HTML タグは既知のものだけ消す（ユーザーの「p < 0.05 … > 0」をタグと誤認しないため）
  return String(s ?? '')
    .replace(/<\/?(sub|sup|b|i|strong|em|span|mark)\b[^>]*>/gi, '')
    .replace(/<\/?(p|br|ul|ol|li|div|h\d)\b[^>]*>/gi, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—‐]/g, '-')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/β|ß/g, 'beta')
    .replace(/\bh\s*o\b/g, 'h0')          // Ho → h0
    .replace(/\bbeta\s+(\d)/g, 'beta$1')  // beta 1 → beta1
    .replace(/\bb\s+(\d)\b/g, 'b$1')
    .replace(/\d{1,3}(?:,\d{3})+\b/g, m => m.replace(/,/g, ''))   // 1,043,569 → 1043569
    .replace(/(rm|\$)\s+(\d)/g, '$1$2')   // rm 1.68 → rm1.68
    .replace(/\s*([=<>≠≤≥+÷×/-])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 正規化済みテキストにキーワードが含まれるか。語の途中で当たらないよう境界を見る：
 * 英字で始まるキーワード → 直前が英数字でない（rm が form に当たらない）
 * 数字で始まるキーワード → 直前が数字・小数点でない（0.14 が 10.14 に当たらない。RM0.14 はOK）
 */
export function hasKeyword(textN, kw) {
  const k = norm(kw);
  if (!k) return false;
  const guard = /[a-z]/.test(k[0]) ? /[a-z0-9]/ : /[0-9]/.test(k[0]) ? /[0-9.]/ : null;
  let i = textN.indexOf(k);
  while (i !== -1) {
    if (!guard || i === 0 || !guard.test(textN[i - 1])) return true;
    i = textN.indexOf(k, i + 1);
  }
  return false;
}

/** rubric 1項目：keywords = [[OR...], [OR...]]（外側 AND）。found: 各グループの結果 */
export function checkItem(textN, item) {
  const groups = item.keywords || [];
  const found = groups.map(g => g.some(kw => hasKeyword(textN, kw)));
  return { auto: groups.length > 0 && found.every(Boolean), found };
}

export function checkWritten(text, q) {
  const t = norm(text);
  const items = (q.rubric || []).map(it => ({ ...checkItem(t, it), item: it }));
  const forbidden = (q.forbidden || []).filter(f => hasKeyword(t, f.pattern));
  return { items, forbidden };
}

const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/** L1〜L4：正解なら true */
export function gradeAuto(q, resp) {
  switch (q.kind) {
    case 'choice': return resp === q.answer;
    case 'multi': return eqArr([...resp].sort(), [...q.answer].sort());
    case 'tapCell': return [].concat(q.answer).includes(resp);
    case 'fillChips': return Object.keys(q.answer).every(k => resp[k] === q.answer[k]);
    case 'order': return eqArr(resp, q.answer);
    case 'buildSentence': {
      const s = resp.join(' ');
      return q.answer.some(a => a.join(' ') === s);
    }
  }
  return false;
}

/** 回答に対応する「なぜ違うか」の文。fillChips は "slot:chip" キー */
export function wrongReasons(q, resp) {
  const w = q.feedback?.wrong || {};
  const out = [];
  if (q.kind === 'choice' || q.kind === 'tapCell') {
    if (w[String(resp)]) out.push(w[String(resp)]);
  } else if (q.kind === 'multi') {
    resp.forEach(i => { if (!q.answer.includes(i) && w[String(i)]) out.push(w[String(i)]); });
    q.answer.forEach(i => { if (!resp.includes(i) && w['miss:' + i]) out.push(w['miss:' + i]); });
  } else if (q.kind === 'fillChips') {
    Object.keys(q.answer).forEach(k => {
      if (resp[k] !== q.answer[k] && w[`${k}:${resp[k]}`]) out.push(w[`${k}:${resp[k]}`]);
    });
  }
  return out;
}

/** HTML 文字列内のテキストノードだけを対象に、キーワード（生の文字列）をハイライト */
export function highlightHTML(html, keywords) {
  const kws = [...new Set(keywords.filter(k => k && k.length >= 2))].sort((a, b) => b.length - a.length);
  if (!kws.length) return html;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 英字で始まる語は語の途中に当てない（"ha" が "than" に当たらないように）。3文字以下の英字語は語末も見る
  const pat = k => (/^[a-z]/i.test(k) ? '(?<![A-Za-z0-9])' : '') + esc(k) + (/^[a-z]{1,3}$/i.test(k) ? '(?![A-Za-z])' : '');
  const re = new RegExp('(' + kws.map(pat).join('|') + ')', 'gi');
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    if (!re.test(n.nodeValue)) return; re.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = n.nodeValue.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(re, '<mark>$1</mark>');
    n.replaceWith(...span.childNodes);
  });
  return tpl.innerHTML;
}
