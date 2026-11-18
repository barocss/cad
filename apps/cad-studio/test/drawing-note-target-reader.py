"""Independent SVG/XML and ezdxf primitive comparison. No product imports or associative LEADER claim."""
import json, sys, re, math, hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
import ezdxf

request = json.load(sys.stdin)
NS = {'s': 'http://www.w3.org/2000/svg'}
TOL = .002

def close(a, b):
    return len(a) == len(b) and all(abs(x-y) <= TOL for x,y in zip(a,b))

def point(p):
    assert abs(p.z) < TOL
    return [p.x,p.y]

def same_line(a,b):
    return (close(a[0],b[0]) and close(a[1],b[1])) or (close(a[0],b[1]) and close(a[1],b[0]))

def same_polygon(a,b):
    remaining=list(b)
    for p in a:
        index=next((i for i,q in enumerate(remaining) if close(p,q)),None)
        if index is None:return False
        remaining.pop(index)
    return not remaining

def consume(pool, expected, equivalent):
    # Multiset consumption: one entity cannot satisfy two coincident source marks.
    index=next((i for i,actual in enumerate(pool) if equivalent(actual,expected)),None)
    assert index is not None, ('missing primitive',expected)
    return pool.pop(index)

results=[]
for item in request['files']:
    root=ET.parse(item['svg']).getroot()
    H=float(root.get('height').removesuffix('mm'))
    assert H>0 and math.isfinite(H)
    flip=lambda p:[p[0],H-p[1]]
    doc=ezdxf.readfile(item['file'])
    assert doc.dxfversion==item['version'],(doc.dxfversion,item['version'])
    audit=doc.audit();assert not audit.errors and not audit.fixes,(audit.errors,audit.fixes)
    entities=list(doc.modelspace())
    assert not any(e.dxftype() in ('LEADER','MLEADER') for e in entities),'this fixture exports flattened primitives only'
    lines=[[point(e.dxf.start),point(e.dxf.end)] for e in entities if e.dxftype()=='LINE' and e.dxf.layer=='THIN']
    solids=[]
    for e in entities:
        if e.dxftype()=='SOLID' and e.dxf.layer=='THIN':
            vertices=[point(e.dxf.get('vtx'+str(i))) for i in range(4)]
            unique=[]
            for p in vertices:
                if not any(close(p,q) for q in unique):unique.append(p)
            assert len(unique)==3,unique
            solids.append(unique)
    notes=[]
    for id,text in [('bound','CONNECTED NOTE'),('free','FREE CONTROL')]:
        groups=[g for g in root.findall('.//s:g',NS) if g.get('data-dim')==id and 'note' in g.get('class','').split()]
        assert len(groups)==1
        group=groups[0];texts=group.findall('s:text',NS)
        assert len(texts)==1 and texts[0].text==text
        t=texts[0]; expected_text=flip([float(t.get('x')),float(t.get('y'))])
        actual_text=[e for e in entities if e.dxftype()=='TEXT' and e.dxf.text==text]
        assert len(actual_text)==1 and close(point(actual_text[0].dxf.insert),expected_text)
        assert abs(actual_text[0].dxf.height-float(t.get('font-size'))) < TOL
        svg_lines=[[[float(e.get('x1')),float(e.get('y1'))],[float(e.get('x2')),float(e.get('y2'))]] for e in group.findall('s:line',NS)]
        paths=group.findall('s:path',NS)
        lost=id=='bound' and item['lost']
        assert len(svg_lines)==(0 if lost else 2) and len(paths)==(0 if lost else 1)
        if not lost:
            for line in svg_lines:consume(lines,[flip(p) for p in line],same_line)
            path=paths[0];assert path.get('fill')=='#000' and path.get('stroke')=='none'
            assert re.fullmatch(r'M[-+\d.eE]+ [-+\d.eE]+L[-+\d.eE]+ [-+\d.eE]+L[-+\d.eE]+ [-+\d.eE]+Z',path.get('d'))
            numbers=[float(x) for x in re.findall(r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',path.get('d'))]
            polygon=[numbers[i:i+2] for i in range(0,6,2)]
            native_x=64 if id=='free' else item['width']
            expected_tip=[item['box'][0]+native_x*item['scale'],item['box'][3]]
            assert close(polygon[0],expected_tip),(polygon[0],expected_tip)
            consume(solids,[flip(p) for p in polygon],same_polygon)
        else:
            # A stale bound shoulder would still start next to this note's text.
            # Text origin and height independently locate that horizontal shoulder's y.
            shoulder_y=H-(float(t.get('y'))-.4*float(t.get('font-size')))
            assert not any(abs(a[1]-shoulder_y)<TOL and abs(b[1]-shoulder_y)<TOL and abs(abs(a[0]-b[0])-3)<TOL for a,b in lines),'unresolved bound leader shoulder survived in DXF'
        notes.append({'id':id,'lost':lost,'text':text,'leaderLines':len(svg_lines),'arrowheads':len(paths)})
    # Fixture-specific contract: modelspace THIN LINEs belong only to these two Notes.
    # Frame/title thin lines live in TITLE_BLOCK; projected centre lines use CENTER.
    # Reject duplicates and any orphan diagonal, not merely a retained shoulder.
    assert not lines,('unexpected, duplicate or stale Note leader line',lines)
    assert not solids,('unexpected or stale arrowhead',solids)
    results.append({'file':item['file'],'sha256':hashlib.sha256(Path(item['file']).read_bytes()).hexdigest(),'version':doc.dxfversion,'svg':item['svg'],'notes':notes})
assert len(results)==8,'four lifecycle states times two DXF versions required'
print(json.dumps({'status':'PASS','reader':ezdxf.__version__,'semantics':'flattened TEXT/LINE/SOLID only; no editable associativity','files':results}))
