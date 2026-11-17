import json,csv,io,sys
x=json.load(sys.stdin);rows=list(csv.reader(io.StringIO(x['csv']),strict=True));assert len(rows)==2 and rows[1][2]=='3'
groups=json.loads(rows[1][4]);mapping={p:g['field'] for g in groups for p in g['parts']};assert sorted(mapping)==['p1','p2','p3']
assert mapping['p1']==mapping['p2']==x['expectedShared'];assert mapping['p3']==x['expectedIndependent']
assert x['doc']['baselines']==x['base']['baselines'];assert x['doc']['instances'][2]==x['base']['instances'][2]
for i in [0,1]:
 before=x['base']['instances'][i];after=x['doc']['instances'][i]
 for key in ['position','rotation','id','name']:assert before[key]==after[key]
 a=dict(before['doc']);b=dict(after['doc']);a['brief']=dict(a['brief']);b['brief']=dict(b['brief']);a['brief'].pop('notes');b['brief'].pop('notes');assert a==b
 assert after['part']['source']=='./source.bcad'
print(json.dumps({'status':'PASS','qty':3,'mappedIDs':sorted(mapping),'sharedValue':mapping['p1']['value'],'baselineExact':True,'geometryAndPlacementsExact':True}))
