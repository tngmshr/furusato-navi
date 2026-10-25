from pathlib import Path
p=Path('index.html'); h=p.read_text(encoding='utf-8')
h=h.replace("case 's3q1': S.route = null;", "case 's3q1': S.routeRule = ROUTE_RULE; S.route = null;")
h=h.replace("case 's3q2': if (v === 'no')", "case 's3q2': S.routeRule = ROUTE_RULE; if (v === 'no')")
h=h.replace("label:'いくらお得なの？ →'", "label:'寄付と控除の関係は？ →'")
p.write_text(h,encoding='utf-8',newline='\r\n')
p=Path('outputs/task-600/verify.cjs'); t=p.read_text(encoding='utf-8')
old="  const ids=['home','s1'"
new="""  for(const q of ['s3q1','s3q2']) {
   const fresh=state(q);delete fresh.routeRule;await boot(fresh);await answer('yes');
   await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.checks.tax2=true;localStorage.setItem(k,JSON.stringify(s));},key);
   await page.reload();assert.equal((await saved()).checks.tax2,true);
  }
  checks.push({name:'新たな所得税・住民税申告経路のチェックを再読込後も保持',result:'合格'});
  const ids=['home','s1'"""
assert old in t;t=t.replace(old,new)
p.write_text(t,encoding='utf-8')