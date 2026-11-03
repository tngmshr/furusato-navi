// PWA の点検（手動で実行）：Chromium にマニフェストを読ませ、解析エラーとインストール可否の理由を表示する。
// Android の Chrome / Brave も同じ Chromium の判定を使う（Brave は WebAPK を作れないため、追加の方式は異なる）。
//   python3 -m http.server 8765 &   # リポジトリ直下で
//   node tools/pwa-check.cjs [http://localhost:8765/]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  const man = await cdp.send('Page.getAppManifest');
  const inst = await cdp.send('Page.getInstallabilityErrors');
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { scope: r && r.scope, active: !!(r && r.active), controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() }; });
  // マニフェストのアイコンが実際に取れて、宣言どおりの大きさか
  const icons = await page.evaluate(async () => {
    const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    return Promise.all(m.icons.map(async i => {
      const res = await fetch(new URL(i.src, document.querySelector('link[rel=manifest]').href));
      const img = await createImageBitmap(await res.blob());
      return { src: i.src, sizes: i.sizes, purpose: i.purpose || 'any', type: res.headers.get('content-type'), real: `${img.width}x${img.height}`, ok: res.ok && i.sizes === `${img.width}x${img.height}` };
    }));
  });
  let problems = 0;
  console.log('manifest URL:', man.url);
  for (const e of man.errors) { problems++; console.log(`✗ manifest の解析 ${e.critical ? '(重大)' : ''}: ${e.message}`); }
  for (const e of inst.installabilityErrors) { problems++; console.log(`✗ インストールできない理由: ${e.errorId} ${JSON.stringify(e.errorArguments)}`); }
  for (const i of icons) { if (!i.ok) problems++; console.log(`${i.ok ? '✓' : '✗'} アイコン ${i.src} 宣言 ${i.sizes} / 実際 ${i.real} / ${i.purpose} / ${i.type}`); }
  console.log(`${sw.active && sw.controlled ? '✓' : '✗'} Service Worker: scope=${sw.scope} active=${sw.active} controlled=${sw.controlled} caches=${sw.caches.join(',')}`);
  if (!sw.active || !sw.controlled) problems++;
  if (errors.length) { problems += errors.length; console.log('✗ コンソール: ' + errors.join(' / ')); }
  await browser.close();
  console.log(problems ? `\n問題 ${problems} 件` : '\n問題なし');
  process.exit(problems ? 1 : 0);
})();
