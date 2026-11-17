import json,sys,xml.etree.ElementTree as E
p,title=sys.argv[1:];root=E.parse(p).getroot();ns={'s':'http://www.w3.org/2000/svg'}
assert root.tag=='{http://www.w3.org/2000/svg}svg'
assert root.find('s:title',ns).text==title
assert root.attrib['width']=='420mm' and root.attrib['height']=='297mm'
assert root.attrib['viewBox']=='0 0 420 297'
views={}
for name,height in [('front',8),('top',24)]:
 groups=[g for g in root.findall('.//s:g',ns) if g.attrib.get('class')=='view' and g.attrib.get('data-view')==name]
 assert len(groups)==1,(name,len(groups))
 lines=groups[0].findall('.//s:line',ns)
 pts=[(float(l.attrib[x]),float(l.attrib[y])) for l in lines for x,y in [('x1','y1'),('x2','y2')]]
 assert pts,name
 width=max(p[0] for p in pts)-min(p[0] for p in pts);h=max(p[1] for p in pts)-min(p[1] for p in pts)
 assert abs(width-32)<1e-8 and abs(h-height)<1e-8,(name,width,h)
 views[name]={'lineCount':len(lines),'width':width,'height':h}
print(json.dumps({'title':title,'width':root.attrib['width'],'height':root.attrib['height'],'viewBox':root.attrib['viewBox'],'views':views},ensure_ascii=False))
