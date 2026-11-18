"""Independent DXF read + regenerate of product-written endpoint suppression. No product imports."""
import json, sys, math, hashlib
from pathlib import Path
import ezdxf
import xml.etree.ElementTree as ET

def extension_lines(dim):
    p1, p2 = dim.dxf.defpoint2, dim.dxf.defpoint3
    typ = dim.dxf.dimtype & 7
    angle = math.radians(dim.dxf.angle) if typ == 0 else math.atan2(p2.y-p1.y,p2.x-p1.x)
    along = (math.cos(angle), math.sin(angle))
    result = {'a':[], 'b':[]}
    for entity in dim.get_geometry_block():
        if entity.dxftype() != 'LINE': continue
        a,b = entity.dxf.start,entity.dxf.end
        dx,dy=b.x-a.x,b.y-a.y
        if math.hypot(dx,dy) < .1 or abs(dx*along[0]+dy*along[1]) > 1e-6: continue
        for key,p in [('a',p1),('b',p2)]:
            if abs((a.x-p.x)*along[0]+(a.y-p.y)*along[1]) < 1e-6:
                result[key].append([[a.x,a.y],[b.x,b.y]])
    return result

request=json.load(sys.stdin); results=[]; baseline_marks=None
def svg_marks(file):
    root=ET.parse(file).getroot()
    group=next(g for g in root.iter() if g.get('data-dim')=='manual-width')
    return [(e.tag.rsplit('}',1)[-1],dict(e.attrib),e.text or '') for e in group]

for item in request['files']:
    path=Path(item['file']); doc=ezdxf.readfile(path)
    audit=doc.audit(); assert not audit.errors and not audit.fixes,(audit.errors,audit.fixes)
    dims=list(doc.modelspace().query('DIMENSION'))
    assert len(dims)==1, len(dims)
    dim=dims[0]; side=item.get('hide'); style=dim.override()
    assert (style.get('dimse1',0),style.get('dimse2',0)) == (int(side=='a'),int(side=='b'))
    measurement=dim.dxf.get('actual_measurement',dim.get_measurement())
    expected=item.get('measurement',64)
    assert abs(measurement-expected)<1e-6,(measurement,expected)
    if item.get('svg'):
        marks=svg_marks(item['svg'])
        if baseline_marks is None:
            assert side is None; baseline_marks=marks
        expected_marks=baseline_marks
        if side:
            endpoint=dim.dxf.defpoint2 if side=='a' else dim.dxf.defpoint3
            removed=[m for m in baseline_marks if m[0]=='line' and abs(float(m[1]['x1'])-endpoint.x)<.001 and abs(float(m[1]['x2'])-endpoint.x)<.001]
            assert len(removed)==1, removed
            expected_marks=[m for m in baseline_marks if m not in removed]
        assert marks==expected_marks, 'SVG changed more than the chosen extension line'
    before=extension_lines(dim)
    for key in ['a','b']: assert bool(before[key]) == (key!=side),(side,key,before)
    p1=list(dim.dxf.defpoint2);p2=list(dim.dxf.defpoint3);text=dim.dxf.text
    style.render()  # Recompute an independent reader's anonymous block, not merely inspect saved block.
    after=extension_lines(dim)
    for key in ['a','b']: assert bool(after[key]) == (key!=side),(side,key,after)
    assert list(dim.dxf.defpoint2)==p1 and list(dim.dxf.defpoint3)==p2 and dim.dxf.text==text
    results.append({'name':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'hide':side,'measurement':measurement,'saved_extensions':before,'regenerated_extensions':after})
print(json.dumps({'status':'PASS','reader':ezdxf.__version__,'files':results}))
