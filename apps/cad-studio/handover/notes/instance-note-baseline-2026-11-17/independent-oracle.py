import json,sys,hashlib
d=json.load(sys.stdin);base=d['base'];saved=d['saved'];cleared=d['cleared'];reopened=d['reopened']
canon=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
b=canon(base['baselines'])
assert base['baselines']['baselines'][0]['state']=='approved'
for doc in [saved,cleared,reopened]:
 assert canon(doc['baselines'])==b
 assert doc['instances'][2]==base['instances'][2]
 for i in [0,1]:
  for key in ['position','rotation','id','name']:assert doc['instances'][i][key]==base['instances'][i][key]
  expected=dict(base['instances'][i]['doc']);expected['brief']=dict(expected['brief']);expected['brief'].pop('notes')
  actual=dict(doc['instances'][i]['doc']);actual['brief']=dict(actual['brief']);actual['brief'].pop('notes',None)
  assert actual==expected
 assert doc['instances'][0]['doc']==doc['instances'][1]['doc']
assert saved['instances'][0]['doc']['brief']['notes']['value']=='Explicit synthetic revised intent'
assert 'notes' not in cleared['instances'][0]['doc']['brief'];assert reopened==cleared
print(json.dumps({'status':'PASS','baselineJSONSHA256':hashlib.sha256(b.encode()).hexdigest(),'shared':['p1','p2'],'independentUnchanged':'p3','otherDefinitionDataExact':True}))
