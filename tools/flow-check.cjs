// 画面の通し点検（手動で実行）：幅 375px と 1280px で、初めての人と同じように
// はじめ → STEP 1〜7 → 完了 まで画面の操作だけで進み、そのあと「戻る」で最初まで戻る。
// 各画面で次を確かめ、問題があれば一覧にして終了コード 1 を返す。
//   - コンソールのエラー・警告、ページの例外が 0 件
//   - 横スクロール・右へのはみ出しがない
//   - 下のバー（sticky）が画面の下端に付いたまま、ページの最後まで読んでも本文を隠さない
//   - 見出しの順序（本文の h1 は1つ、レベルを飛ばさない）
//   - 文字色と背景色のコントラスト（WCAG AA：通常 4.5、大きな文字 3）
//   - キーボード（Tab）だけで「次へ」「戻る」と回答の選択肢に届き、閉じたシートに入り込まない
//   - 全体の流れ（シート）を開閉したとき、フォーカスが開いたボタンへ戻り、開いている間は Tab がシートの外へ出ない
// Playwright（Chromium）が必要。node --test の対象外（test/ の外に置いている）。
//   python3 -m http.server 8765 &   # リポジトリ直下で
//   node tools/flow-check.cjs [http://localhost:8765/]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';

// 画面ごとの進み方：'main' は下の「次へ」、それ以外は data-answer の値
const PATHS = {
  // ワンストップ特例・いつものサイトあり
  one: { s3q1: 'no', s3q2: 'no', s3q3: 'le5', s4q1: 'yes' },
  // 確定申告・サイトを見比べたい
  tax: { s3q1: 'yes', s4q1: 'no', s4q2: 'compare' }
};

async function audit(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [];
    const de = document.documentElement;
    if (de.scrollWidth > W + 1) out.push(`横スクロール ${de.scrollWidth}px > ${W}px`);
    const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    for (const el of document.querySelectorAll('main *, .bottombar *, .topbar *')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1) out.push(`はみ出し <${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().slice(0, 16)}"`);
    }
    // 見出し
    const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4')].filter(vis);
    const h1 = hs.filter(h => h.tagName === 'H1').length;
    if (h1 !== 1) out.push(`本文の h1 が ${h1} 個`);
    let prev = 1;
    for (const h of hs) { const lv = +h.tagName[1]; if (lv > prev + 1) out.push(`見出しが飛ぶ h${prev}→h${lv} "${h.textContent.trim().slice(0, 16)}"`); prev = lv; }
    // コントラスト
    const rgb = s => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : null; };
    const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && (c.length < 4 || c[3] > 0.9)) return c; if (getComputedStyle(e).backgroundImage !== 'none') return null; } return rgb(getComputedStyle(document.body).backgroundColor); };
    const seen = new Set();
    for (const el of document.querySelectorAll('main *, .bottombar *, .topbar *')) {
      if (!vis(el) || el.closest('.sr')) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const s = getComputedStyle(el), fg = rgb(s.color), bg = bgOf(el);
      if (!fg || !bg || +s.opacity < 1) continue;
      const a = lum(fg.slice(0, 3)), b = lum(bg.slice(0, 3)), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need) { const k = `${s.color}/${bg.join(',')}`; if (!seen.has(k)) { seen.add(k); out.push(`コントラスト ${ratio.toFixed(2)} < ${need} "${el.textContent.trim().slice(0, 16)}" (${s.color})`); } }
    }
    // 下のバー：画面の下端に付いているか
    const bb = document.querySelector('.bottombar').getBoundingClientRect();
    if (Math.abs(bb.bottom - H) > 2) out.push(`下のバーが下端にない（上端 ${Math.round(bb.top)} / 下端 ${Math.round(bb.bottom)} / 画面 ${H}）`);
    return out;
  });
}

// ページの最後までスクロールしたとき、本文の最後の要素が下のバーに隠れないか
async function bottomCheck(page) {
  return page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 80));
    const bb = document.querySelector('.bottombar').getBoundingClientRect();
    const els = [...document.querySelectorAll('main .screen > *')].filter(e => e.getBoundingClientRect().height > 0);
    const last = els[els.length - 1];
    const out = [];
    if (Math.abs(bb.bottom - innerHeight) > 2) out.push('スクロール後に下のバーが下端から外れる');
    if (last && last.getBoundingClientRect().bottom > bb.top + 1) out.push(`最後の要素が下のバーに隠れる "${last.textContent.trim().slice(0, 16)}"`);
    window.scrollTo(0, 0);
    return out;
  });
}

// Tab だけで回答の選択肢・「次へ」「戻る」に届くか。閉じたシートの中に入らないか
async function keyboardCheck(page) {
  const want = await page.evaluate(() => {
    const v = el => el && !el.hidden && el.getBoundingClientRect().height > 0;
    return { choice: !!document.querySelector('main [data-answer]'), main: v(document.getElementById('btnMain')), back: v(document.getElementById('btnBack')) };
  });
  const got = { choice: false, main: false, back: false }, out = [];
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => { const a = document.activeElement; return { id: a.id, ans: !!(a.dataset && a.dataset.answer), inSheet: !!a.closest('.sheet:not(.open)'), tag: a.tagName }; });
    if (f.inSheet) { out.push(`閉じたシートの中にフォーカス <${f.tag.toLowerCase()} id="${f.id}">`); break; }
    if (f.ans) got.choice = true;
    if (f.id === 'btnMain') got.main = true;
    if (f.id === 'btnBack') got.back = true;
    if ((!want.choice || got.choice) && (!want.main || got.main) && (!want.back || got.back)) break;
  }
  for (const k of Object.keys(want)) if (want[k] && !got[k]) out.push(`Tab で届かない: ${k}`);
  return out;
}

// 全体の流れ（シート）：開いたら閉じるボタンへ、閉じたら開いたボタンへフォーカス。開いている間は Tab がシート内を回る
async function sheetCheck(page) {
  const out = [];
  await page.focus('#where');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(260);
  if (await page.evaluate(() => document.activeElement.id) !== 'sheetClose') out.push('シートを開いても閉じるボタンにフォーカスが移らない');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement.closest('#sheet')))) { out.push('シートを開いたまま Tab で外へ出る'); break; }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(260);
  if (await page.evaluate(() => document.activeElement.id) !== 'where') out.push('シートを閉じたあと、フォーカスが「全体」ボタンへ戻らない');
  return out;
}

(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  for (const scheme of ['light', 'dark']) for (const width of [375, 1280]) for (const [route, path] of Object.entries(PATHS)) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 740 : 800 }, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('例外: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
    page.on('dialog', d => d.accept());
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const seen = [];
    const report = async (id, list) => { if (list.length) { problems += list.length; console.log(`✗ ${scheme}/${width}px/${route}/${id}\n   ` + list.join('\n   ')); } };
    // 進む
    for (let n = 0; n < 30; n++) {
      const id = await page.evaluate(() => { const h = document.querySelector('main h1'); return document.getElementById('pill').textContent + '|' + (h ? h.textContent.trim().slice(0, 24) : ''); });
      const sid = await page.evaluate(() => JSON.parse(localStorage.getItem('furusatoNavi.v3') || '{}').stack?.slice(-1)[0]);
      seen.push({ sid, id });
      await page.waitForTimeout(260);
      await report(sid, [...await audit(page), ...await bottomCheck(page), ...await keyboardCheck(page)]);
      if (sid === 's1' && width === 375) await report(sid + '/sheet', await sheetCheck(page));
      if (sid === 'done') break;
      const ans = path[sid];
      if (ans) await page.click(`main [data-answer="${ans}"]`);
      else if (await page.isVisible('#btnMain')) await page.click('#btnMain');
      else { await report(sid, ['進む操作が見つからない']); break; }
    }
    if (seen[seen.length - 1].sid !== 'done') await report('flow', ['完了画面まで進めなかった']);
    // 戻る（ブラウザの履歴も含めて、通った画面を逆順にたどる）
    for (let i = seen.length - 2; i >= 0; i--) {
      if (!(await page.isVisible('#btnBack'))) { await report(seen[i + 1].sid, ['「戻る」がない']); break; }
      await page.click('#btnBack');
      await page.waitForTimeout(150);
      const sid = await page.evaluate(() => JSON.parse(localStorage.getItem('furusatoNavi.v3') || '{}').stack?.slice(-1)[0]);
      if (sid !== seen[i].sid) { await report('back', [`戻った先が ${sid}（期待 ${seen[i].sid}）`]); break; }
    }
    // 再訪：はじめ画面から「続きから」で元の画面へ
    await page.reload();
    if (errors.length) { problems += errors.length; console.log(`✗ ${scheme}/${width}px/${route} ` + errors.join('\n   ')); }
    console.log(`${scheme}/${width}px/${route}: ${seen.map(s => s.sid).join(' → ')}`);
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `\n問題 ${problems} 件` : '\n問題なし');
  process.exit(problems ? 1 : 0);
})();
