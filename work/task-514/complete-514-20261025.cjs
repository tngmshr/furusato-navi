// タスク514の不足文書補完・検証専用。既存成果とアプリは書き換えない。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'outputs/task-514');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, '');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex').toLowerCase();
const writeNew = (p, s) => { const dest=path.join(root,p); if(fs.existsSync(dest)) { if(fs.readFileSync(dest,'utf8')===s)return; throw new Error('既存成果の上書きを拒否: '+p); } fs.writeFileSync(dest,s,{encoding:'utf8',flag:'wx'}); };
const data = JSON.parse(read('outputs/task-514/照合データ.json'));
const snapshot = JSON.parse(read('work/task-514/before-20261025.json'));
const date = '2026-10-25';
const jst = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
const counts = Object.fromEntries(['一致','相違','未確認'].map(s => [s, data.rows.filter(r => r.status===s).length]));
const notes = {
  N01:'計算方法、5団体以内、所得税・個人住民税の申告をする場合の除外、第二表の記載を本文で再確認。',
  N02:'計算方法と手続き。当年支出合計、所得の40%限度、受領証・指定事業者の年間証明書を再確認。',
  N03:'基礎控除表と注記。令和8・9年分の金額、12月1日施行等の注意を再確認。',
  N04:'令和8・9年分の給与所得控除表と注3。660万円未満は別表第五による。該当行の照合は未実施。',
  N05:'税率表、2026年の復興特別所得税、2027年以後の附加税改正の注記を再確認。',
  N06:'原則2026年12月1日施行、2026年分以後適用、年末調整事務への反映を再確認。',
  N07:'PDF1ページの改正前後の基礎控除表・注記を抽出本文で確認。画像による表組の目視確認は未実施。',
  N08:'PDF本文2ページQ1-1、3ページQ1-3の適用時期・居住者の扱いを確認。特殊例の全網羅ではない。',
  N09:'申告義務がない場合の還付申告、既納税額の条件、翌年1月1日から5年間を再確認。',
  N10:'当年1〜12月の所得、既納税額の精算、翌年3月15日の原則期限、作成コーナーを再確認。',
  N11:'年末調整と申告不要の原則、給与収入2,000万円超・一定条件の他所得20万円超等を再確認。',
  N12:'寄付年分の所得税と翌年度住民税、特例は翌年6月以降の住民税、一時所得の注意を再確認。ページは令和7年分特集であり2026年分の日程の証明には使わない。',
  N13:'Q19の郵送提出・記載された日程を確認。2026年3月16日は2025年分の案内として扱う。',
  N14:'個人の寄付合計の算式、受領証・電子証明書等を再確認。既存台帳の「個人住民税の参考」等の説明は今回本文から裏付けず、R47の相談案内はN01で確認する。',
  N15:'返礼品の経済的利益の一時所得該当と個別事例の留保を再確認。',
  M01:'総務省作成・内閣府掲載の2024年9月26日通知。3ページの3割基準は調達費用であることを本文確認。最新運用通知全体の代わりにはしない。',
  M02:'総務省作成・内閣府掲載の2025年1月22日事務連絡。本文19ページ(8)②の2025年10月以降の禁止導入、20ページ③のオンライン申請を本文確認。最新細則の確認とは別。'
};
const fetchedIds = Object.keys(notes);
const candidateNotes = {
  U01:'2026-10-22の本文未取得記録を維持。今回再取得せず。申請期限・単位・変更届・添付書類は未確認。',
  U02:'2026-10-25にWeb openを実施。non-retryable errorで本文取得失敗。反復・別経路の取得は行っていない。',
  U03:'2026-10-22の本文未取得記録を維持。今回再取得せず。ポイント禁止の例外等は未確認。',
  U04:'2026-10-22の本文未取得記録を維持。今回再取得せず。題名・日付も原文未照合。',
  U05:'2026-10-22の本文未取得記録を維持。今回再取得せず。将来の制度全体を確認済みとしない。',
  U06:'2026-10-22の本文未取得記録を維持。今回再取得せず。12か月徴収・通知時期・端数は未確認。'
};
let recheck = `# 一次資料の再確認記録（タスク514）\n\n確認日：${date}（JST）\n\n既存の[照合表](照合表.md)と[照合データ](照合データ.json)（確認日2026-10-22）は上書きしていない。50項目・一致24件／相違12件／未確認14件という分類を維持する。今回、本文確認済みとされた17出典の関連本文をWeb機能で再確認し、不足していた[修正案](修正案.md)と[検証結果](検証結果.md)を補った。すべての制度細則を最新資料で確認できた意味ではない。\n\n## 対象と判断\n\n- ローカル index.html の制度説明、固定数値例、手続分岐、外部計算依存を確認した。追加の未カバー制度主張は確認した範囲では発見しなかった。公開中のファイルと同一かは未検証。\n- 内部の税額計算関数はなく、上限は外部シミュレーターへ誘導する。年は389行の thisYear()、分岐は1015〜1024行、固定税額例は491〜546行にある。\n- R08のうち「特例は翌年6月以降の住民税」はN12本文末尾で確認できる。一方、6月〜翌々年5月の12か月、端数調整までの複合主張は未確認のまま。\n- R09・R11・R12の再計算は合成仮定に限る。旧成果の57,479.12円は算術誤差があり、同じ入力の再計算は57,480.30円。どちらも正確な年収別上限ではない。R11等の「相違」は固定例の条件不足も含む。\n- R15・R16は調達費用を受取人の市場価値・利益へ換算できないという判断。2024年通知を2026年最新通知全体の代わりにしない。\n- ポイント禁止の導入はM02で確認。通常決済ポイントや最新例外、すべてのポイントの可否を確認済みとしない。\n- N14の旧台帳説明のうち住民税相談の根拠は、今回確認できたN01へ限定して読む。既存ファイル自体は保全した。\n\n## 今回確認した一次本文\n\n下表の確認日はすべて2026-10-25。法令基準日・過去通知の日付と、アクセスした日を混同しない。本文の関連箇所を確認したもので、外部サービスや個別税額の検証ではない。\n\n| 出典ID・一次資料 | ページの基準・版（既存台帳） | 今回の確認範囲・限界 |\n| --- | --- | --- |\n`;
for (const id of fetchedIds) {
  const s = data.sources.find(s => s.id===id);
  if(!s) throw new Error('出典IDが不明: '+id);
  recheck += `| [${id} ${s.title}](${s.url}) | ${s.version} | ${notes[id]} |\n`;
}
recheck += '\n## 本文未取得の出典候補\n\nURLがあるだけでは制度確認の証拠にならない。下記に依存する未確認部分は一致へ変更していない。総務省控除ページの取得失敗が続いているため、同原因の再試行は繰り返さなかった。\n\n| 出典候補 | 今回の扱い |\n| --- | --- |\n';
for (const [id,note] of Object.entries(candidateNotes)) {
 const s = data.sources.find(s => s.id===id);
 recheck += `| [${id} ${s.title}](${s.url}) | ${note} |\n`;
}
recheck += '\n## 残る未確認項目\n\n';
for (const r of data.rows.filter(r => r.status==='未確認')) recheck += `- ${r.id}：${r.claim}\n`;
recheck += '\n申請期限の最新取扱い・変更届・添付条件、住民税の通知と徴収期間、最新ポイント細則、外部計算ページ等は未確認。修正の採否・本体への反映・公開は本人の後作業である。今回は投稿・公開・アカウント操作・git操作を行っていない。\n';
writeNew('outputs/task-514/再確認記録.md', recheck);

const checks = [];
function check(name, ok, detail) {checks.push({name, ok:!!ok, detail}); if(!ok) throw new Error(name+'：'+detail);}
const sourceMap = new Map(data.sources.map(s => [s.id,s]));
check('照合項目数・判定数', data.rows.length===50 && counts.一致===24 && counts.相違===12 && counts.未確認===14, JSON.stringify(counts));
check('IDの一意性', new Set(data.rows.map(r=>r.id)).size===data.rows.length && sourceMap.size===data.sources.length, '項目50件・出典23件');
const missingSources = data.rows.filter(r => !r.source_ids?.length || !r.source_urls?.length);
check('出典のない項目', missingSources.length===0, `${missingSources.length}件。未取得の出典候補を含むので、本文確認完了数とは区別。`);
const brokenRefs = data.rows.filter(r => r.source_ids.some((id,i) => !sourceMap.has(id) || sourceMap.get(id).url!==r.source_urls[i]) || r.source_ids.length!==r.source_urls.length);
check('出典参照・URL対応', brokenRefs.length===0 && data.sources.every(s => /^https:\/\/(www\.nta\.go\.jp|www\.soumu\.go\.jp|www\.cao\.go\.jp)\//.test(s.url)), `${brokenRefs.length}件の不整合。一次官公庁URLのみ。`);
check('既存確認日', data.checked_on==='2026-10-22' && [...data.rows,...data.sources].every(r => r.checked_on==='2026-10-22'), '既存確認日を保持し、今回の確認日は別記録。');
check('未取得本文だけによる一致判定なし', data.rows.filter(r=>r.status==='一致').every(r => r.source_ids.some(id=>sourceMap.get(id).body_verified)), '一致24件に本文確認済み出典あり。算術・実装の判断は照合表の留保を保持。');
check('再確認記録の出典網羅', data.sources.every(s => fetchedIds.includes(s.id) || Object.hasOwn(candidateNotes,s.id)) && fetchedIds.length===17, '本文関連箇所再確認17件、未取得候補6件。今回取得失敗1件、既存未取得を維持5件。');
const html = read('index.html');
const lines = html.split(/\r?\n/);
const badAnchors = data.rows.filter(r => !r.ranges.some(([a,b]) => a>=1 && b<=lines.length && a<=b && lines.slice(a-1,b).join('\n').includes(r.anchor)));
check('ローカル原本との行・アンカー対応', badAnchors.length===0, `${badAnchors.length}件の不整合。50項目の対象箇所を確認。`);
const table = read('outputs/task-514/照合表.md');
const tableRows = [...table.matchAll(/^\| (R\d{2})／.*?\| \*\*(一致|相違|未確認)\*\*/gm)];
check('Markdown照合表と構造化データ', tableRows.length===50 && tableRows.every(m => data.rows.find(r=>r.id===m[1])?.status===m[2]), `${tableRows.length}行のID・判定が一致。`);
const proposal = read('outputs/task-514/修正案.md');
const headings = [...proposal.matchAll(/^## (P\d{2}) /gm)].map(m=>m[1]);
check('修正案P01〜P11の存在', headings.length===11 && new Set(headings).size===11 && data.rows.filter(r=>r.proposal).every(r=>headings.includes(r.proposal)), '旧照合表からの全提案参照を解決。');
check('相違12項目の修正案対応', data.rows.filter(r=>r.status==='相違').every(r=>r.proposal && proposal.includes(r.id)), '相違12件すべてに提案ID・対象IDの対応あり。');
const baseline = snapshot.files.map(f => ({path:f.path, ok:hash(f.path)===f.sha256.toLowerCase()}));
check('今回作業前からの原本・既存成果保全', baseline.every(f=>f.ok), `${baseline.length}ファイルのSHA-256一致。index.html・README.md・qr.png・.nojekyll・既存成果2件・既存work2件。`);
const oldBaseline = JSON.parse(read('work/task-514/before-files.json'));
const oldMatch = Array.isArray(oldBaseline) && oldBaseline.every(f => {
 const p=f.path ?? f.file; const h=f.sha256 ?? f.hash;
 return typeof p==='string' && typeof h==='string' && hash(p)===h.toLowerCase();
});
check('2026-10-22基準とのアプリ保全', oldMatch, `${Array.isArray(oldBaseline)?oldBaseline.length:0}ファイルを既存基準と照合。`);
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m => !/\bsrc\s*=/.test(m[1]) && !/application\/(ld\+)?json/i.test(m[1]));
scripts.forEach((m,i) => new vm.Script(m[2], {filename:`index-inline-${i+1}.js`}));
check('既存JavaScriptの構文', scripts.length>0, `インラインスクリプト${scripts.length}件を構文確認。DOM実行・画面操作は未実施。`);
const calc = {
 給与所得控除の速算値:5000000*0.2+440000,
 仮定の課税所得:3560000-750000-1040000,
 所得税等軽減の合成概算:58000*0.05*1.021,
 現行例が暗黙に置く概算:58000*0.1*1.021,
 住民税基本分の合成概算:58000*0.1,
 上限未達を仮定した住民税特例分:58000*(0.9-0.05*1.021),
 合成所得割額による感度計算:2000+235500*0.2/(0.9-0.05*1.021),
 月平均の算術:58000/12
};
check('合成計算の算術', calc.仮定の課税所得===1770000 && Math.abs(calc.所得税等軽減の合成概算-2960.9)<1e-8 && Math.abs(calc.合成所得割額による感度計算-57480.30)<0.01 && Math.abs(calc.上限未達を仮定した住民税特例分-49239.1)<1e-8, '合成モデルの算術のみ。旧成果の上限57,479.12円は再計算57,480.30円と約1.18円異なるため補足で訂正。個人税額の検証ではない。');
function localLinkErrors(allowPendingReport) {
 const errors=[];
 for(const name of fs.readdirSync(out).filter(n=>n.endsWith('.md'))) {
  const md=fs.readFileSync(path.join(out,name),'utf8');
  for(const m of md.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
   const href=m[1]; if(/^(https?:|#)/.test(href))continue;
   const target=path.resolve(out, decodeURIComponent(href.split('#')[0]));
   if(allowPendingReport && target===path.join(out,'検証結果.md'))continue;
   if(!fs.existsSync(target))errors.push({file:name,href});
  }
 }
 return errors;
}
check('成果間のローカルリンク（報告書生成前）', localLinkErrors(true).length===0, '未作成だった修正案リンクを解決。検証結果は以下で新規生成し再検査する。');
let report = `# タスク514 検証結果・作業報告\n\n検証日時：${jst}（JST）\n\n## 変更ファイル\n\n新規作成のみ。\n\n- [修正案.md](修正案.md)：P01〜P11。\n- [再確認記録.md](再確認記録.md)：2026-10-25の一次本文確認と未取得の区別。\n- 本書（検証結果.md）。\n- work/task-514/before-20261025.json：作業開始時の8ファイルのハッシュ。\n- work/task-514/complete-514-20261025.cjs：補完・検証スクリプト。\n- work/task-514/検証結果-20261025.json：機械検証結果。\n\n既存の[照合表](照合表.md)・[照合データ](照合データ.json)・生成スクリプトは上書きしていない。\n\n## 変更内容\n\n50項目の既存照合成果を再利用し、リンク先が欠けていた修正案・検証結果を補完した。分類は一致24件・相違12件・未確認14件。既存合成上限値の算術誤差（57,479.12円→57,480.30円）を補足で訂正した。相違のうち固定税額、返礼品価値、上限超過、特例の住民税申告条件、申告第二表、還付申告期限等の修正案を記載した。本文確認済み扱いの17出典は関連箇所をWeb機能で再確認。未取得候補6件のうち総務省控除ページは今回も取得失敗、ほか5件は以前の未取得記録を維持した。\n\n目的：2026年制度と説明・固定例の整合確認。対象：work/task-514/、outputs/task-514/。制約：本体とREADME、qr.pngは変更せず、git・公開・アカウント操作は行わない。完了条件：全項目の判定・出典と相違の修正案。方法：項目数、出典欠落、参照、原本ハッシュ、合成算術の検査。\n\n## テスト結果\n\n実行：node work/task-514/complete-514-20261025.cjs（Node.js ${process.version}、追加依存なし）。既存のテスト設定・実行指示は探索で見つからなかった。旧build-report.cjsは生成専用かつ既存出力への排他書込なので再実行していない。\n\n| 検証 | 結果 | 詳細 |\n| --- | --- | --- |\n`;
for(const c of checks) report+=`| ${c.name} | 合格 | ${c.detail.replace(/\|/g,'／')} |\n`;
report += `| 成果間のローカルリンク（生成後） | 最終処理で検査 | 本書生成後に実在ファイルを検査し、失敗時はスクリプトを異常終了させる。実行の確定結果はwork/task-514/検証結果-20261025.jsonを参照。 |\n\n照合項目50件・出典なし0件。ただし出典候補しか取得できていない項目を含み、全50件の制度適合が確認済みという意味ではない。未確認14件を維持した。\n\n## 懸念点\n\n- 特例の申請期限・変更届・添付書類、住民税通知・月割り、最新ポイント細則は未確認。取得失敗を一致としない。\n- 合成計算の算術が通っても、実際の税額・上限は認定できない。給与所得別表第五の該当行、住民税の税率判定・他控除・端数処理等は未検証。\n- 本番への反映、画面・実機・外部シミュレーター、公開URLとローカル原本の同一性は未検証。本人の採否・公開判断が残る。\n- 検証初回は旧JSONのUTF-8 BOMで停止し、読み込み側だけ対応した。続いて旧成果の合成上限の算術誤差を検出し、原本を保全して補足側で訂正した。\n- 初回のapply_patchによる新規文書書込は失敗した。ACLに読書きの許可があることとファイル未作成を確認後、同じ許可対象内に排他新規書込で作成した。権限・システム設定は変更していない。\n\n対象外handoff-log.mdは未変更。追記用1行：\n\n- ${jst} | E:\\Claude code\\furusato-navi | タスク514：既存50項目の照合を保全、一次本文17出典再確認、修正案11件・検証記録を補完、本体未変更 | 未コミット | 要確認: 未確認14項目、修正採否と公開は本人\n`;
writeNew('outputs/task-514/検証結果.md',report);
check('成果間のローカルリンク（生成後）', localLinkErrors(false).length===0, '生成した報告書を含め、全Markdownのローカルリンクが実在。');
check('最終保全確認', snapshot.files.every(f=>hash(f.path)===f.sha256.toLowerCase()), '生成後も8ファイルのSHA-256一致。');
report = report.replace('| 成果間のローカルリンク（生成後） | 最終処理で検査 | 本書生成後に実在ファイルを検査し、失敗時はスクリプトを異常終了させる。実行の確定結果はwork/task-514/検証結果-20261025.jsonを参照。 |', '| 成果間のローカルリンク（生成後） | 合格 | 本書を含め全ローカルリンクの実在を確認。機械記録でも合格。 |\n| 最終保全確認 | 合格 | 生成後も8ファイルのSHA-256一致。全18検証に不合格なし。 |');
// この実行で新規作成した報告書だけを、実際の最終検証結果で確定する。
fs.writeFileSync(path.join(out,'検証結果.md'), report, 'utf8');
writeNew('work/task-514/検証結果-20261025.json', JSON.stringify({task:514,checked_on:date,jst,counts,missing_sources:missingSources.length,checks,calculations:calc,preserved:baseline,limitations:['本文未確認14項目','外部シミュレーター・画面・実機未検証','個別税額の正確な算定は対象外']},null,2)+'\n');
console.log(JSON.stringify({判定:counts,出典なし:missingSources.length,検証:checks.length,不合格:checks.filter(c=>!c.ok).length,保全一致:baseline.length,成果物:['修正案.md','再確認記録.md','検証結果.md']},null,2));
