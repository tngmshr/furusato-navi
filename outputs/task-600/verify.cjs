const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const out = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseline = JSON.parse(fs.readFileSync(path.join(out, 'before.json'), 'utf8'));
const checks = [];
const testedScreens = [];
const errors = [];
const check = (name, fn) => { fn(); checks.push({name, result:'合格'}); };
const key = 'furusatoNavi.v3';
const rule = '2026-10-25';
const state = (id='home', route=null) => ({stack:id==='home'?['home']:['home',id], a:{}, route,routeRule:rule,site:'satofull',maxStage:7,checks:{}});
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
check('既存JavaScriptの構文検査を再利用', () => {
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
 assert.equal(scripts.length, 2); scripts.forEach((s,i)=>new vm.Script(s[1],{filename:`inline-${i+1}`}));
});
check('対象外の既存ファイルの保全', () => {
 for (const [p,h] of Object.entries(baseline.hashes)) if(p!=='index.html') assert.equal(hash(path.join(root,p)),h,p);
});
check('固定金額・未確認の期限等を除去（代替テキストを含む）', () => {
 for(const s of ['18,000','16,000','年収500万円','約5,900','約52,000','約4,800','1月10日','12か月','5〜6月','同じ自治体に2回寄付したら2回','欄に金額が入っていれば反映']) assert(!html.includes(s),s);
 assert(!/57,?479|57479/.test(html));
});
check('514の合成算術検査を再利用', () => {
 assert.equal(3560000-750000-1040000,1770000);
 assert(Math.abs(58000*.05*1.021-2960.9)<1e-8);
 assert(Math.abs(2000+235500*.2/(.9-.05*1.021)-57480.30)<.01);
 assert(Math.abs(58000*(.9-.05*1.021)-49239.1)<1e-8);
 assert.equal(60000-2000,58000);
});
const server = http.createServer((req,res) => {
 if(req.url==='/' || req.url==='/index.html') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
 else {res.writeHead(204);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:375,height:900},locale:'ja-JP'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  const saved = () => page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  async function boot(s, resume=true) {
   await page.evaluate(({k,s})=>{localStorage.clear();localStorage.setItem(k,JSON.stringify(s));},{k:key,s});
   await page.reload();
   if(resume && s.stack.length>1) await page.locator('#btnMain').click();
   await page.locator('#main h1,#main #focusMe').first().waitFor();
  }
  async function answer(v){ await page.locator(`[data-answer="${v}"]`).click(); }
  async function expectRoute(r){ assert.equal((await saved()).route,r); }
  for(const [title,answers,expected] of [
   ['所得税・住民税とも申告なし、5団体以内',['no','no','le5'],'one'],
   ['所得税申告あり',['yes'],'tax'],
   ['住民税申告あり',['no','yes'],'tax'],
   ['所得税申告の要否不明',['unknown'],'check'],
   ['住民税申告の要否不明',['no','unknown'],'check'],
   ['6団体以上',['no','no','ge6'],'tax']]) {
    await boot(state('s3q1')); for(const a of answers) await answer(a); await expectRoute(expected);
    checks.push({name:'判定：'+title,result:'合格'});
  }
  await boot(state('s3q3')); await answer('le5'); await expectRoute('check');
  checks.push({name:'質問を飛ばした古い履歴からは特例確定にしない',result:'合格'});
  for(const r of ['one','tax']) {
   await boot(state('s6')); await answer(r); await expectRoute(r);
   const text=await page.locator('#main').innerText();
   assert(text.includes(r==='one'?'寄付先の公式案内':'第二表'));
  }
  checks.push({name:'STEP6の直接選択と申告条件の表示',result:'合格'});
  await boot(state('s6'));
  assert((await page.locator('[data-answer="one"]').innerText()).includes('個人住民税'));
  await answer('review'); assert((await saved()).stack.at(-1)==='s3q1');
  checks.push({name:'STEP6の不明時は質問へ戻る',result:'合格'});
  const old=state('s6','one'); delete old.routeRule; old.checks={tax2:true,one1:true};
  await boot(old); await expectRoute(null);
  assert.equal((await saved()).checks.tax2,undefined); assert.equal((await saved()).checks.one1,true);
  assert(await page.locator('[data-answer="one"]').isVisible());
  checks.push({name:'旧判定と旧申告チェックを再確認し、他の進み具合を保全',result:'合格'});
  const current=state('s6','one');current.checks={tax2:true};
  await boot(current);await expectRoute('one');assert.equal((await saved()).checks.tax2,true);
  checks.push({name:'新条件で確認済みの進み具合を再読込後も保持',result:'合格'});
  for(const q of ['s3q1','s3q2']) {
   const fresh=state(q);delete fresh.routeRule;await boot(fresh);await answer('yes');
   await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.checks.tax2=true;localStorage.setItem(k,JSON.stringify(s));},key);
   await page.reload();assert.equal((await saved()).checks.tax2,true);
  }
  checks.push({name:'新たな所得税・住民税申告経路のチェックを再読込後も保持',result:'合格'});
  const ids=['home','s1','s1b','s2','s3q1','s3q2','s3q3','s3r','s4q1','s4q2','s4r','s5','s6','s7','done'];
  for(const width of [375,1280]) {
   await page.setViewportSize({width,height:900});
   for(const id of ids) for(const r of ['one','tax','check']) {
    await boot(state(id,r));
    await page.locator('#main .screen').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
    const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth>innerWidth+1,main:document.querySelector('#main').scrollWidth>document.querySelector('#main').clientWidth+1}));
    assert(!overflow.document&&!overflow.main, `${width}/${id}/${r}: 横はみ出し`);
    assert(!/undefined|NaN/.test(await page.locator('#main').innerText()),`${id}/${r}`);
    testedScreens.push({width,id,route:r});
   }
  }
  checks.push({name:'全15画面×3経路×2幅の描画・横はみ出し',result:'合格',count:testedScreens.length});
  await page.setViewportSize({width:375,height:900});
  for(const [id,r] of [['s1b','one'],['s3q2','check'],['s6','tax'],['s6','one'],['home','check']]) {
   await boot(state(id,r));await page.locator('#main .screen').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
   await page.screenshot({path:path.join(out,`${id}-${r}-375.png`),fullPage:false});
  }
  await boot(state('home'));await page.getByText('寄付前に個別の確認が必要なこと',{exact:true}).click();
  assert(await page.getByText(/申請期限・申請単位・変更届・本人確認書類/).isVisible());
  checks.push({name:'ホームから個別確認事項を開ける',result:'合格'});
  await boot(state('s1b')); const example=await page.locator('.calc tr').allTextContents();
  assert(example[0].includes('60,000円')&&example[1].includes('58,000円')&&example[2].includes('2,000円'));
  checks.push({name:'控除上限内という仮定付きの計算例を実画面で確認',result:'合格'});
  assert.deepEqual(errors,[]);checks.push({name:'ブラウザ実行時エラーなし',result:'合格'});
 } finally {if(browser)await browser.close();server.close();}
 const result={checkedAt:new Date().toISOString(),node:process.version,checks,testedScreens,errors,calculation:{donation:60000,conditionalRelief:58000,conditionalBurden:2000,syntheticLimit:2000+235500*.2/(.9-.05*1.021)}};
 fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(result,null,2)+'\n','utf8');
 console.log(`合格: ${checks.length}項目、画面描画: ${testedScreens.length}通り、ブラウザエラー: ${errors.length}件`);
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});