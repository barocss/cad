import json,sys
from pathlib import Path
d=json.load(sys.stdin); saved=json.loads(Path(d['file']).read_bytes())
assert saved['parameters']=={'StartR':2,'EndR':3}
assert len(saved['nodes'])==3
f=saved['nodes'][2]
assert f['id']=='n2' and f['parent']=={'node':1,'side':'solid'}
assert f['edges']==['n1.side0|n1.top']
assert f['radius']=={'parameter':'StartR'}
assert f['radii']==[{'at':[0,0,20],'radius':{'parameter':'StartR'},'atEnd':True},{'at':[30,0,20],'radius':{'parameter':'EndR'},'atEnd':True}]
assert not any(k in f for k in ['held','suppressed','rematched'])
assert saved['nodes'][:2]==d['originalNodes']
assert d['beforeVolume']>d['afterVolume']>0
print(json.dumps({'status':'PASS','savedDimBindingsExact':True,'originalNodesExact':True,'beforeVolume':d['beforeVolume'],'afterVolume':d['afterVolume'],'claim':'current application body volume changes; not an independent native accuracy certification'}))
