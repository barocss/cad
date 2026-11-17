import csv,io,json,sys,hashlib
from pathlib import Path
d=json.load(sys.stdin)
raw=Path(d['file']).read_bytes()
assert hashlib.sha256(raw).hexdigest()==d['sha256']
text=raw.decode('utf-8')
rows=list(csv.reader(io.StringIO(text,newline=''),strict=True))
assert rows[0]==['item no.','item','qty','note scope','design brief notes / occurrence mapping JSON'],rows
assert len(rows)==2 and rows[1][:3]==['1','Same box','3'],rows
assert rows[1][3]=='Design brief notes: intent, not approval',rows[1][3]
groups=json.loads(rows[1][4])
assert groups==[{'parts':['p1','p2'],'state':'note','field':d['fields'][0]}, {'parts':['p3'],'state':'note','field':d['fields'][1]}],groups
for old in d['oldFields']:
 for v in old.values():
  if isinstance(v,str) and '_A_' in v: assert v not in text and v not in json.dumps(groups,ensure_ascii=False),v
assert 'NOTE_A_' not in text and 'SOURCE_A_' not in text and 'REASON_A_' not in text
print(json.dumps({'status':'PASS','rows':1,'qty':3,'occurrences':['p1','p2','p3'],'fullFieldEquality':True,'AFieldsAbsent':True,'bytes':len(raw),'sha256':d['sha256']}))
