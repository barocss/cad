
import json,sys,xml.etree.ElementTree as ET
q=json.load(sys.stdin); w=q['writer'];expected=q['expected'];tol=1e-7
assert w['scope']=={'kind':'part','body':{'key':'b1','feature':'n1','kind':'extrude'}}
assert len(w['native'])==2
for key,vol in [('b1',2880),('b3',960)]:
 b=next(x for x in w['native'] if x['key']==key);assert b['check']['valid'];assert abs(b['volume']-vol)<tol
for n,size in [('front',[40,6]),('top',[40,12]),('right',[12,6])]:
 v=w['views'][n];assert v['edges'];assert all(all(z.startswith('n1.') for z in e['name'].split('|')) for e in v['edges']);assert all(abs(v['max'][i]-v['min'][i]-size[i])<tol for i in [0,1])
ns={'s':'http://www.w3.org/2000/svg'};root=ET.fromstring(w['svg']);texts={}
for id,value in expected.items():
 g=root.find(".//s:g[@class='dimension'][@data-dim='%s']"%id,ns);assert g is not None,id
 ts=[''.join(t.itertext()).strip() for t in g.findall('.//s:text',ns)];assert str(value) in ts,(id,value,ts);texts[id]=ts
raw=w['dxf'].splitlines();assert len(raw)%2==0; pairs=[(int(raw[i]),raw[i+1].strip()) for i in range(0,len(raw),2)];entities=[];section=None;cur=[];i=0
while i<len(pairs):
 code,value=pairs[i]
 if (code,value)==(0,'SECTION'):
  section=pairs[i+1][1];i+=2;continue
 if (code,value)==(0,'ENDSEC'):
  if cur:entities.append(cur);cur=[]
  section=None
 elif section=='ENTITIES':
  if code==0:
   if cur:entities.append(cur)
   cur=[]
  cur.append((code,value))
 i+=1
vals=[]
for e in entities:
 def get(k):return next((v for c,v in e if c==k),None)
 if get(0)=='DIMENSION':
  assert get(1) is not None and get(42) is not None
  vals.append((get(1),float(get(42))))
assert len(vals)==len(expected),(vals,expected)
assert sorted(t for t,v in vals)==sorted(str(v) for v in expected.values())
assert all(abs(v-float(t))<tol for t,v in vals)
print(json.dumps({'status':'PASS','svgDimensionTexts':texts,'dxfDimensionTextMeasurements':vals,'nativeVolumes':{'b1':2880,'b3':960},'boundary':'Model writer strings, not browser exports'}))
