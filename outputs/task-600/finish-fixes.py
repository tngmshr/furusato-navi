from pathlib import Path
p=Path('index.html'); h=p.read_text(encoding='utf-8')
h=h.replace('\ns1b: {','\n  s1b: {').replace('\ns3q1: {','\n  s3q1: {').replace('\ns3q2: {','\n  s3q2: {')
h=h.replace("if (S.route === 'one' && S.routeRule !== ROUTE_RULE) S.route = null;", "if (S.routeRule !== ROUTE_RULE) { if (S.route === 'one') S.route = null; delete S.checks.tax2; }")
p.write_text(h,encoding='utf-8',newline='\r\n')