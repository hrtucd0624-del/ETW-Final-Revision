# ETW1001 期末対策 学習アプリ

作業を始める前に `docs/指示書.md` を最後まで読むこと。仕様はすべてそこにある。

## 要点
- 目的：統計を知らない人が、ETW1001 期末（2026-11-05、クローズドブック・電卓なし・記述式）で Sample paper 形式の問題を英語で書けるようになる学習アプリ。
- 本番は `../Sample paper 1.pdf` と `../Sample Paper 2_ Set2.pdf` の形式で出ると予測して設計する。
- 問題と解説はすべて親フォルダ `../` の教材（Week 1–11 のチュートリアル PDF と Excel、Sample と解答）を根拠にし、`source` を付ける。架空データは `invented: true`。
- 既存コンテンツは `seed/`（Sample 全小問の模範解答・採点ポイント、解き方の型、Week のまとめ、暗記カード）。再利用すること。
- 公式解答の誤り一覧（指示書 §8.3）を引き継がない。
- ビルド不要の静的サイト、GitHub Pages、無料。AI API は使わない。
- 実装は指示書 §12 の Phase 順。Phase 1–2 を最優先（10/30 までに使える状態に）。
- 迷ったらハルトに質問する。ユーザーへの説明は日本語で。

## 実装メモ（Phase 1–2 完了時点で決めたこと）
- セルアドレスは **ラベル列を除いた 0 始まり**。coef の列 0=Coefficients, 1=SE, 2=t Stat, 3=P-value, 4=Lower, 5=Upper（§9 のお手本と一致。§6.2 の「coef:1:4 = P-value」はラベル込みの数え方で、こちらは採用しない）。stats は `stats:行:0`、desc/pivot は `行:列`（列 0 = 最初のデータ列）。
- Sample/類題は `seed/` をそのまま読み、実行時に written 問題へ変換（js/content.js）。キーワードは `data/sample-rubrics.json`。Sample 2 と類題は公式配点が無いので rubric ごと推定（画面に「配点は推定」と表示）。
- 新しいユニットを作ったら `data/units/index.json` の `ready` を true にし、`sw.js` の SHELL に追加。
- 検証：全モデル解答が自分の rubric で満点になること（node でチェック）。
- 公式解答の誤り（追加で発見）：W8 QA Q2(c) の p-value「4.36E-16」は誤り。出力表は 4.36E-13。
- ローカル確認：`python3 -m http.server 8765` をこのフォルダで実行 → http://localhost:8765
- exhibit の参照：`{ "ref": "u12-l2:2" }` ＝ そのレッスンの2番目の exhibit。別ユニットの exhibit は参照できないのでコピーして埋め込む。
- 公式解答の誤り（Phase 3 で追加発見）：Week 11 Solution Q1(vi)(vii) の「38.47」→ 出力表は 38.44664（≈38.45）。W9 Excel Q8(a) は経験年数を 18 で代入しているが平均は 17.66。W9 QA Q2(i) の切片「$195」→ 195.68。W8 Excel Part 1(a) の「1% increase」→ 失業率・インフレ率は率なので percentage point。
- `P 11_2 Solution.xls` はダミー列とカテゴリー名が行ずれしている（例：Help_Line=NO の行が 1）。係数は使わず、「ダミーをいくつ作るか・基準はどれか」の問題にだけ使う。
- 進捗（2026-10-28）：Unit 9・10・11・12・13・5・2 が ready。残りは優先順で 1 → 3 → 4 → 8 → 7 → 0 → 6、その後 Phase 4（模試）と Phase 5（公開）。
- Extra Questions の解答は小問の記号が1つずれている（問題の e が解答では f）。Week 4 Q4（Salesperson A/B）は問題文が PDF に無く、数値は Pearl Bay Solution の Q4 シートから。
