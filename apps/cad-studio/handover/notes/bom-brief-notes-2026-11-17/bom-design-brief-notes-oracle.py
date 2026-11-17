import csv,io,json,sys
d=json.load(sys.stdin)
r=list(csv.reader(io.StringIO(d['csv'],newline=''),strict=True))
assert r[0]==['item no.','item','qty','note scope','design brief notes / occurrence mapping JSON'],r
assert len(r)==2 and r[1][2]=='3',r
g=json.loads(r[1][4]);assert len(g)==2,g
assert g[0]['parts']==['p1','p2'] and g[1]['parts']==['p3'],g
assert g[0]['field']==d['A'] and g[1]['field']==d['B'],g
assert all(x['state']=='note' for x in g)
assert all('confirmed' not in x['field'] for x in g)
print(json.dumps({'status':'PASS','rows':1,'qty':3,'groups':2,'mapping':[['p1','p2'],['p3']],'fieldRoundTrip':True}))