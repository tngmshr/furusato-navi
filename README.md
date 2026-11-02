# ふるさと納税かんたんナビ

はじめてふるさと納税をする人が、画面の案内どおりに進むだけで「上限額の確認 → 手続方法の判定 → サイト選び → 寄付 → 控除の手続き → 翌年の確認」までたどれるスマホ向けWebアプリです。

- 素の HTML / CSS / JavaScript（画面は `index.html`、計算と保存データの読み書きは `core.js`）
- 氏名・住所・年収などは入力しません。進み具合と、採用した上限の目安を端末（localStorage）に保存します
- 制度の内容は変更されることがあります（2026年9月時点で総務省・国税庁の案内を確認）

## 姉妹アプリからの共有

同じオリジンの節税・資産形成ナビが保存した `setsuzeiNavi.share.v1` を読み、今年の `year` と有効な `donationLimit` があるときだけ STEP 2 にカードを表示します。「この金額を使う」で `furusatoNavi.v3` の `donationLimit: {year, amount}` に保存します。寄付の記録（`furusatoNavi.log`）の「上限の目安まで あと○円」は、記録の欄に入れた上限を優先し、空のときは記録の年と同じ年に選んだこの値を使います（`core.js` の `logLimit`）。入力や金額を URL・外部へ送りません。

## テスト

計算と保存データの読み書きは `core.js`（DOM に依存しない関数）にまとめています。依存パッケージなしで次のコマンドで確かめられます（Node.js 18 以上）。

```bash
node --test
```

画面の点検（375px 幅・ダークモード・大きな文字での見切れ・重なり・ラベル不足、壊れた保存データでの起動）は Playwright で手動実行します。

```bash
python3 -m http.server 8765 &
node tools/e2e-check.cjs http://localhost:8765/
```

`core.js` や `index.html` を変えたら、`sw.js` の `CACHE` 名を上げてください。
