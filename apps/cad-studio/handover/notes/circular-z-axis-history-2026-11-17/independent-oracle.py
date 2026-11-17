import json,sys,itertools
d=json.load(sys.stdin);px,py=d['pivot'];expected=set()
for x,y,z in itertools.product([10,14],[20,26],[0,8]):
 for k in range(4):
  u,v=x-px,y-py
  for _ in range(k):u,v=-v,u
  expected.add((u+px,v+py,z))
assert len(d['native'])==1 and d['native'][0]['key']=='b2'
actual=d['native'][0]['points']; assert len(actual)==len(expected)==32
remaining=list(expected); residual=0
for p in actual:
 matches=[q for q in remaining if max(abs(a-b) for a,b in zip(p,q))<=1e-9]
 assert len(matches)==1,(p,matches)
 q=matches[0];residual=max(residual,max(abs(a-b) for a,b in zip(p,q)));remaining.remove(q)
assert not remaining
print(json.dumps({'status':'PASS','uniqueCorners':len(actual),'pivot':d['pivot'],'maxCoordinateResidualMM':residual}))
