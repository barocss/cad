import json,re,sys,math
d=json.load(sys.stdin);m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',d['source'],re.S);assert m
p=json.loads(m.group(1));reach=d['reach'];expected=[[16+.6*reach,1+.8*reach,13],[16+.6*reach,1+.8*reach,21]]
for got,want in zip([p[-1][0],p[-1][-1]],expected):assert math.dist(got,want)<1e-7,(got,want)
print(json.dumps({'status':'PASS','reach':reach,'endpointOracle':expected,'budgetMM':1e-7}))