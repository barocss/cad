import json,re,sys
d=json.load(sys.stdin)
def poles(s,id):
 blocks=re.findall(r'@surface\s+#'+re.escape(id)+r'\s*\{([^{}]*)\}',s,re.S);assert len(blocks)==1
 m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',blocks[0],re.S);assert m;return json.loads(m.group(1))
a=poles(d['before'],d['beforeId']);b=poles(d['after'],d['afterId']);c=[11.5,-5,17];expected=[[[c[i]+d['factor']*(p[i]-c[i]) for i in range(3)] for p in row] for row in a];assert b==expected,(b,expected)
print(json.dumps({'status':'PASS','scale':d['factor'],'centre':[11.5,-5,17],'before':a,'after':b,'exactAllPoles':True}))