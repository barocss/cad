import json,re,sys
d=json.load(sys.stdin)
def poles(s,id):
 blocks=re.findall(r'@surface\s+#'+re.escape(id)+r'\s*\{([^{}]*)\}',s,re.S);assert len(blocks)==1
 m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',blocks[0],re.S);assert m;return json.loads(m.group(1))
a=poles(d['before'],d['beforeId']);b=poles(d['after'],d['afterId']);expected=[[[p[0],p[1],p[2]+d['z']] for p in row] for row in a];assert b==expected,(b,expected)
print(json.dumps({'status':'PASS','translation':[0,0,d['z']],'before':a,'after':b,'exactAllPoles':True}))