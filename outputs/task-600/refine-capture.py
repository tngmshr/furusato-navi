from pathlib import Path
p=Path('outputs/task-600/capture.cjs');s=p.read_text(encoding='utf-8');s=s.replace("   await page.screenshot({path:path.join(out,`${id}-${route}-375.png`)});","   await page.evaluate(()=>scrollTo(0,0));\n   await page.screenshot({path:path.join(out,`${id}-${route}-375.png`)});")
p.write_text(s,encoding='utf-8')
p=Path('outputs/task-600/verify.cjs');s=p.read_text(encoding='utf-8').replace('fullPage:true','fullPage:false');p.write_text(s,encoding='utf-8')