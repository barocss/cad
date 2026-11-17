import json,sys,hashlib
x=json.load(sys.stdin)
with open(x['file'],'rb') as f: raw=f.read()
doc=json.loads(raw)
assert doc==x['accepted'], 'file differs from accepted document'
print(json.dumps({'status':'PASS','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'exactAcceptedDocument':True,'extraSessionMetadata':False}))
