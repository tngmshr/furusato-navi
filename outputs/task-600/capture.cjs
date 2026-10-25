const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=__dirname,html=fs.readFileSync(path.join(out,'../../index.html'),'utf8');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:375,height:900},locale:'ja-JP'});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for(const [id,route] of [['s1b','one'],['s3q2','check'],['s6','tax'],['s6','one'],['home','check']]){
   await page.evaluate(({id,route})=>{localStorage.clear();localStorage.setItem('furusatoNavi.v3',JSON.stringify({stack:id==='home'?['home']:['home',id],route,routeRule:'2026-10-25',site:'satofull',checks:{},a:{},maxStage:7}));},{id,route});
   await page.reload();if(id!=='home')await page.locator('#btnMain').click();
   await page.locator('#main .screen').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
   assert(await page.locator('#sheet').evaluate(el=>el.getBoundingClientRect().top>=innerHeight-1));
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(out,`${id}-${route}-375.png`)});
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   await page.screenshot({path:path.join(out,`${id}-${route}-375-bottom.png`)});
  }
  console.log('実表示領域375×900の先頭・末尾を5画面で撮影。閉じたシートは表示領域外と確認。');
 } finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});