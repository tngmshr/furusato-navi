// 分岐の点検（手動で実行）：節税・資産形成ナビの目安が 0 円のとき、Brave のとき、の表示を確かめる。
//   python3 -m http.server 8765 &   # リポジトリ直下で
//   node tools/variants-check.cjs [http://localhost:8765/]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const Y = new Date().getFullYear();
(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  const check = (ok, msg) => { if (!ok) problems++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
  for (const brave of [false, true]) for (const amount of [0, 54000]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 } });
    if (brave) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'brave', { value: { isBrave: () => Promise.resolve(true) } }); });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(BASE);
    await page.evaluate(({ Y, amount }) => {
      localStorage.clear();
      localStorage.setItem('furusatoNavi.v3', JSON.stringify({ stack: ['home'], resume: ['home', 's2'], a: {}, maxStage: 2, checks: {} }));
      localStorage.setItem('setsuzeiNavi.share.v1', JSON.stringify({ year: Y, donationLimit: amount, donationLimitNoIdeco: amount, updatedAt: null }));
    }, { Y, amount });
    await page.reload();
    await page.click('#btnMain');
    const card = await page.evaluate(() => { const h = document.getElementById('sharedLimit'); return { text: h.textContent, btn: !!h.querySelector('button') }; });
    const tag = `${brave ? 'Brave' : 'Chrome'}/${amount}円`;
    if (amount === 0) check(!card.btn && /目安が出ませんでした/.test(card.text), `${tag}: 「この金額を使う」を出さず確認を案内する`);
    else check(card.btn && card.text.includes('54,000円'), `${tag}: 目安と「この金額を使う」を出す`);
    // 完了画面のホーム画面に追加の案内
    await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('furusatoNavi.v3')); S.stack = ['home']; S.resume = ['home', 'done']; localStorage.setItem('furusatoNavi.v3', JSON.stringify(S)); });
    await page.reload(); await page.click('#btnMain');
    const tip = await page.evaluate(() => document.querySelector('main').textContent.includes('Brave Shields'));
    check(tip === brave, `${tag}: Brave 向けの追加の案内は ${brave ? '出す' : '出さない'}`);
    check(!errors.length, `${tag}: コンソールのエラーなし ${errors.join(' / ')}`);
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `\n問題 ${problems} 件` : '\n問題なし');
  process.exit(problems ? 1 : 0);
})();
