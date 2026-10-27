// コンテンツの読み込み（data/ と seed/ の JSON）。Sample と類題は written 問題に変換する（指示書 §6.4）。
const cache = {};
export async function getJSON(path) {
  if (!cache[path]) cache[path] = fetch(path).then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });
  return cache[path];
}

export const SLOTS = {
  A: '記述統計', B: 'グラフの形', C: '確率', D: '単回帰', E: 'ダミー',
  F: '重回帰', G: '検定の理論', H: '用語・サンプリング', I: '応用', J: '正規分布・CI',
};
// seed の問題タイプ → スロット
export const TYPE_SLOT = {
  desc: 'A', shape: 'B', scatter: 'B', prob: 'C', slr: 'D', dummy: 'E', report: 'E',
  mlr: 'F', fit: 'F', test: 'G', errors: 'G', concept: 'H', nonlin: 'I', normal: 'J', ci: 'J',
};
// 小問タイプが test でも、回帰の検定なら主題のスロットを優先
export function slotOfTypes(types = []) {
  const main = types.find(t => !['test', 'report'].includes(t)) || types[0];
  return TYPE_SLOT[main] || 'H';
}

export const unitIndex = () => getJSON('data/units/index.json');
export const loadUnit = id => getJSON(`data/units/${id}.json`);

/** unit 内の問題の exhibit { ref: lessonId } を実体に解決 */
export function resolveExhibit(ex, unit) {
  if (!ex || !ex.ref) return ex;
  if (ex.note) { const t = resolveExhibit({ ref: ex.ref }, unit); return t && { ...t, note: ex.note }; }
  // "u12-l2:2" = そのレッスンの2番目の exhibit（省略時は1番目）
  const [refId, nth = 1] = ex.ref.split(':');
  for (const l of unit?.lessons || []) {
    if (l.id === refId) { const s = l.steps.filter(s => s.exhibit && !s.exhibit.ref)[nth - 1]; if (s) return s.exhibit; }
    for (const s of l.steps) if (s.question?.id === ex.ref && s.question.exhibit) return s.question.exhibit;
  }
  for (const q of unit?.questions || []) if (q.id === ex.ref && q.exhibit && !q.exhibit.ref) return q.exhibit;
  return null;
}

export function unitQuestions(unit) {
  return unit.questions.map(q => ({
    ...q, exhibit: resolveExhibit(q.exhibit, unit), slot: q.slot || unit.slot[0], unitId: unit.id,
    ...(q.kind === 'written' ? { forbidden: [...(q.forbidden || []), ...DEFAULT_FORBIDDEN] } : {}),
  }));
}

/** "Mean の比較 [1]" → { label, marks } */
function parsePoint(p) {
  const m = p.match(/\[(\d+(?:\.\d+)?)\]/);
  return { label: p.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim(), marks: m ? Number(m[1]) : 1 };
}

// すべての記述問題に共通の禁止ワード（答案の鉄則 §8.2）
export const DEFAULT_FORBIDDEN = [
  { pattern: 'accept h0', message: '「accept H0」ではなく「do not reject H0」と書く' },
  { pattern: 'accept the null', message: '「accept the null」ではなく「do not reject the null hypothesis」と書く' },
];

let papersP;
/** seed/samples.json + seed/practice.json + data/sample-rubrics.json → 紙（paper）ごとの written 問題 */
export function loadPapers() {
  papersP ||= Promise.all([
    getJSON('seed/samples.json'), getJSON('seed/practice.json'), getJSON('data/sample-rubrics.json'),
  ]).then(([samples, practice, rub]) => {
    const papers = [...samples, ...practice];
    const byId = {};
    papers.forEach(paper => {
      paper.invented = paper.id === 'p';
      paper.questions.forEach(q => {
        let lastEx = null;
        q.parts.forEach(part => {
          const r = rub[part.id] || {};
          const ex = part.exhibit || lastEx;
          if (part.exhibit) lastEx = part.exhibit;
          let rubric;
          if (r.rubric) rubric = r.rubric;
          else rubric = (part.points || []).map(parsePoint).map((it, i) => ({ ...it, keywords: r.keywords?.[i] || [] }));
          const marks = part.marks ?? rubric.reduce((s, x) => s + x.marks, 0);
          const wq = {
            id: part.id, level: 5, kind: 'written', paper: paper.id, qLabel: q.q, label: part.label,
            marks, marksEstimated: part.marks == null, prompt: part.prompt, exhibit: ex, exhibitInherited: !part.exhibit && !!ex,
            invented: paper.invented, modelAnswer: part.answer, rubric, forbidden: [...(r.forbidden || []), ...DEFAULT_FORBIDDEN],
            warn: part.warn, jp: part.jp, tip: part.tip, types: part.types, slot: slotOfTypes(part.types),
            source: { file: paper.id === 's1' ? 'Sample paper 1.pdf / Sample paper 1 solution.pdf' : paper.id === 's2' ? 'Sample Paper 2_ Set2.pdf / Solution  Paper 2_Set 2.pdf' : 'seed/practice.json（練習用の架空データ）', where: part.label },
            answerSource: paper.id === 'p' ? 'claude' : (r.answerSource || 'official+edited'),
            feedback: { related: { answerType: part.types?.[0] } },
          };
          byId[part.id] = wq;
        });
      });
    });
    return { papers, byId };
  });
  return papersP;
}

/** どの画面からでも問題 id で引けるように（復習キュー用） */
export async function findQuestion(id) {
  const { byId } = await loadPapers();
  if (byId[id]) return { q: byId[id], ctx: { type: 'sample' } };
  const idx = await unitIndex();
  for (const u of idx.units.filter(u => u.ready)) {
    const unit = await loadUnit(u.id);
    const qs = unitQuestions(unit);
    const q = qs.find(x => x.id === id);
    if (q) return { q, ctx: { type: 'unit', unit } };
    for (const l of unit.lessons) for (const s of l.steps) if (s.question?.id === id)
      return { q: { ...s.question, exhibit: resolveExhibit(s.question.exhibit, unit), slot: unit.slot[0] }, ctx: { type: 'unit', unit } };
  }
  return null;
}
