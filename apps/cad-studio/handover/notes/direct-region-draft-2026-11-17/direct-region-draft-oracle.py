import json,re,sys,math
d=json.load(sys.stdin);m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',d['source'],re.S);assert m
p=json.loads(m.group(1));got=[p[0][0],p[0][-1],p[-1][0],p[-1][-1]];want=[[7,-11,13],[7,-11,21],[13,-3,13],[13,-3,21]]
for a,b in zip(got,want):assert math.dist(a,b)<1e-7,(a,b)
print(json.dumps({'status':'PASS','requestedU':[2,4],'requestedV':[-1,3],'corners':got,'expected':want,'budgetMM':1e-7}))