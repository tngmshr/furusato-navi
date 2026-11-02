// 画面の点検（手動で実行）：375px 幅・ダークモード・大きな文字で、全画面の見切れ・重なり・ラベル不足と、
// 壊れた保存データでの起動を確かめる。Playwright（Chromium）が必要。
//   python3 -m http.server 8765 &   # リポジトリ直下で
//   node tools/e2e-check.cjs [http://localhost:8765/] [スクリーンショットの保存先]
// node --test の対象外（test/ の外に置いている）。
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOT = process.argv[3] || '';
const SCREENS = ['home', 's1', 's1b', 's2', 's3q1', 's3q2', 's3q3', 's3r', 's4q1', 's4q2', 's4r', 's5', 's6', 's7', 'done'];
const LONG = '北海道上川郡東神楽町ひがしかぐらちょうちょうちょうながいなまえのまち';
const LOG = JSON.stringify({ limit: 60000, items: [
  { id: 'a', city: LONG, amount: 123456789, date: '2026-05-01', one: true },
  { id: 'b', city: '□□市', amount: 10000, date: '2026-06-01', one: false }
] });

const CORRUPT = {
  empty: { v3: '', log: '' },
  broken: { v3: '{"stack":["home","s2"', log: '{"items":[' },
  nulls: { v3: '{"stack":["home","s6"],"a":null,"checks":null,"resume":"x","route":"one"}', log: '{"limit":"x","items":[null,1,{"city":5,"date":20260101},{"id":"z","city":"A町","amount":"1000","date":"2026-01-01"}]}' },
  oldFormat: { v3: '{"stack":["home","s1","s2"],"a":{},"route":"one","site":"rakuten","maxStage":2,"checks":{"tax2":true}}', log: '{"items":[{"city":"A町","amount":10000,"date":"2026-01-01"}]}' },
  unknownScreen: { v3: '{"stack":["home","removed-screen"],"resume":["home","nope"]}', log: 'null' },
  wrongType: { v3: '[1,2,3]', log: '"text"' },
  shared: { v3: '{}', log: '{}', shared: '{"year":"2026","donationLimit":"abc"}' }
};

async function audit(page) {
  return page.evaluate(() => {
    const W = innerWidth, out = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`横スクロール: ${document.documentElement.scrollWidth}px > ${W}px`);
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('.sheet:not(.open)') && !el.closest('details:not([open]) > .more-body'); };
    for (const el of document.querySelectorAll('main *, .bottombar *, .topbar *')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1) out.push(`はみ出し: <${el.tagName.toLowerCase()} class="${el.className}"> ${Math.round(r.left)}〜${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 20)}"`);
      const s = getComputedStyle(el);
      if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && !el.matches('.where-title, main.wrap, .sr'))
        out.push(`見切れ: <${el.tagName.toLowerCase()} class="${el.className}"> "${el.textContent.trim().slice(0, 20)}"`);
    }
    // 操作できる要素どうしの重なり
    // 下のバーは sticky で本文がその下を通るため、本文の要素どうしだけを比べる。折り返した行内リンクは行ごとの矩形で比べる
    const ctl = [...document.querySelectorAll('main button, main a, main input, main select, main summary, main label')].filter(vis);
    const hit = (a, b) => [...a.getClientRects()].some(p => [...b.getClientRects()].some(q =>
      Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2));
    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
      const a = ctl[i], b = ctl[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (hit(a, b)) out.push(`重なり: "${a.textContent.trim().slice(0, 12)}" と "${b.textContent.trim().slice(0, 12)}"`);
    }
    // 名前のない入力・ボタン
    for (const el of document.querySelectorAll('input, select, textarea, button, a[href]')) {
      if (el.closest('.sheet:not(.open)') || el.hidden) continue;
      const name = (el.getAttribute('aria-label') || (el.labels && [...el.labels].map(l => l.textContent).join('')) || el.textContent || el.title || '').trim();
      if (!name) out.push(`名前なし: <${el.tagName.toLowerCase()} id="${el.id}">`);
    }
    // 小さすぎるタップ領域（44px 未満）
    for (const el of document.querySelectorAll('main button:not(.yogo), main input[type=checkbox], .bottombar button')) {
      if (!vis(el)) continue;
      const r = el.closest('label') ? el.closest('label').getBoundingClientRect() : el.getBoundingClientRect();
      if (r.height < 40) out.push(`タップ領域が小さい: "${(el.textContent || el.closest('label')?.textContent || '').trim().slice(0, 12)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return [...new Set(out)];
  });
}

(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  const combos = [];
  for (const scheme of ['light', 'dark']) for (const big of [false, true]) for (const width of [375, 288]) combos.push({ scheme, big, width });
  for (const c of combos) {
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 740 }, colorScheme: c.scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const id of SCREENS) {
      for (const route of id === 's5' || id === 's6' || id === 's7' ? ['one', 'tax'] : ['check']) {
        await page.goto(BASE);
        await page.evaluate(({ id, route, big, LOG }) => {
          localStorage.clear();
          localStorage.setItem('furusatoNavi.v3', JSON.stringify({ stack: ['home'], resume: ['home', id], a: {}, route, routeRule: '2026-10-25', site: 'choice', maxStage: 8, checks: {} }));
          localStorage.setItem('furusatoNavi.log', LOG);
          localStorage.setItem('furusatoNavi.big', big ? '1' : '0');
        }, { id, route, big: c.big, LOG });
        await page.reload();
        if (id !== 'home') await page.click('#btnMain');
        await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
        await page.waitForTimeout(260);
        const res = await audit(page);
        const tag = `${c.scheme}/${c.big ? 'big' : 'normal'}/${c.width}px/${id}${route !== 'check' ? '(' + route + ')' : ''}`;
        if (res.length) { problems += res.length; console.log(`✗ ${tag}\n   ` + res.join('\n   ')); }
        if (SHOT && c.width === 375) await page.screenshot({ path: `${SHOT}/${c.scheme}-${c.big ? 'big' : 'normal'}-${id}${route !== 'check' ? '-' + route : ''}.png`, fullPage: true });
      }
    }
    if (errors.length) { problems += errors.length; console.log(`✗ ${c.scheme}/${c.width} JS エラー: ${errors.join(' / ')}`); }
    await ctx.close();
  }

  // 壊れた保存データ
  const ctx = await browser.newContext({ viewport: { width: 375, height: 740 } });
  const page = await ctx.newPage();
  for (const [name, d] of Object.entries(CORRUPT)) {
    const errors = [];
    const h = e => errors.push(e.message);
    page.on('pageerror', h);
    await page.goto(BASE);
    await page.evaluate(d => { localStorage.clear(); localStorage.setItem('furusatoNavi.v3', d.v3); localStorage.setItem('furusatoNavi.log', d.log); if (d.shared) localStorage.setItem('setsuzeiNavi.share.v1', d.shared); }, d);
    await page.reload();
    const h1 = await page.textContent('h1');
    // 続きから → 寄付の記録のある画面まで操作できるか
    await page.click('#btnMain');
    for (const sid of ['s5', 's6']) {
      await page.evaluate(sid => { const S = JSON.parse(localStorage.getItem('furusatoNavi.v3')); S.stack = ['home']; S.resume = ['home', sid]; localStorage.setItem('furusatoNavi.v3', JSON.stringify(S)); }, sid);
      await page.reload(); await page.click('#btnMain');
    }
    const after = await page.textContent('h1');
    page.off('pageerror', h);
    const ok = !errors.length && h1 && after;
    if (!ok) problems++;
    console.log(`${ok ? '✓' : '✗'} 保存データ ${name}: 起動「${(h1 || '').trim().slice(0, 16)}」→「${(after || '').trim().slice(0, 16)}」${errors.length ? ' エラー: ' + errors.join(' / ') : ''}`);
  }
  await browser.close();
  console.log(problems ? `\n問題 ${problems} 件` : '\n問題なし');
  process.exit(problems ? 1 : 0);
})();
