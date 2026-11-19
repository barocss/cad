import json,hashlib,xml.etree.ElementTree as ET
from decimal import Decimal as D
from pathlib import Path
p=Path(__file__).resolve().parent
expected=json.loads((p/"manifest.json").read_text())
for name,digest in expected.items():
 assert hashlib.sha256((p/name).read_bytes()).hexdigest()==digest,name
results=[]
for label in ("symmetric","saved"):
 q=json.loads((p/(label+"-output.json")).read_bytes(),parse_float=D)
 doc=json.loads((p/(label+"-accepted.json")).read_bytes(),parse_float=D)
 assert q["doc"]==doc
 L=next(d for d in doc["drawing"]["dimensions"] if d["id"]=="L")
 symmetric=label=="symmetric"
 tol={"kind":"symmetric","value":D(".254")} if symmetric else {"kind":"deviation","upper":D(".254"),"lower":D("-.127")}
 assert L["tol"]==tol and doc["drawing"]["units"]=="inch"
 ns={"s":"http://www.w3.org/2000/svg"}
 g=ET.fromstring(q["svg"]).find(".//s:g[@data-dim=\"L\"]",ns)
 text=["".join(t.itertext()) for t in g.findall(".//s:text",ns)]
 wanted=["1.000 ±.010"] if symmetric else ["1.000","+.010","-.005"]
 assert text==wanted
 nominal=D("25.4")/D("25.4");upper=D(".254")/D("25.4")
 lower=-upper if symmetric else D("-.127")/D("25.4")
 assert upper==D(".010") and lower==(D("-.010") if symmetric else D("-.005"))
 lines=q["dxf"].splitlines();assert len(lines)%2==0
 entities=[];e=[]
 for i in range(0,len(lines),2):
  pair=(int(lines[i]),lines[i+1])
  if pair[0]==0:
   if e:entities.append(e)
   e=[pair]
  else:e.append(pair)
 if e:entities.append(e)
 blocks={};current=None;dimensions=[]
 decode=lambda v:v.replace("%%p","±")
 for e in entities:
  kind=e[0][1]
  if kind=="BLOCK":current=next(v for k,v in e if k==2);blocks[current]=[]
  elif kind=="ENDBLK":current=None
  elif current is not None and kind in ("TEXT","MTEXT"):blocks[current].extend(decode(v) for k,v in e if k==1)
  if kind=="DIMENSION":dimensions.append(e)
 title="1.000 ±.010" if symmetric else "1.000 +.010/-.005"
 matched=[e for e in dimensions if any(k==1 and decode(v)==title for k,v in e)]
 assert len(matched)==1
 block=next(v for k,v in matched[0] if k==2);assert blocks[block]==text
 results.append({"case":label,"status":"PASS","wholeDocumentParity":True,"svgLTexts":text,"dxfDimension":title,"dxfBlock":block,"inchEndpoints":[str(nominal+lower),str(nominal+upper)]})
print(json.dumps({"status":"PASS","results":results,"scope":"retained writer outputs only; no writer, browser or download executed"},ensure_ascii=False,indent=2))
