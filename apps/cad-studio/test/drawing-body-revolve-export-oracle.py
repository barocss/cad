"""Independent readback of actual SVG/DXF downloads from the #270 torus fixture."""
import json, math, pathlib, sys, xml.etree.ElementTree as ET
folder = pathlib.Path(sys.argv[1]); ns = {'s': 'http://www.w3.org/2000/svg'}
results = []
for label in ('selected', 'restored'):
    root = ET.parse(folder / (label + '.svg')).getroot()
    height = float(root.attrib['height'].removesuffix('mm'))
    raw = (folder / (label + '.dxf')).read_text().splitlines()
    entities, current = [], []
    for i in range(0, len(raw), 2):
        code, value = int(raw[i]), raw[i + 1]
        if code == 0:
            if current: entities.append(current)
            current = []
        current.append((code, value))
    if current: entities.append(current)
    def field(e, code): return next((v for c, v in e if c == code), None)
    polylines = []
    for e in entities:
        if field(e, 0) != 'LWPOLYLINE': continue
        xs = [float(v) for c, v in e if c == 10]
        ys = [height - float(v) for c, v in e if c == 20]
        assert len(xs) == len(ys)
        polylines.append((field(e, 8), list(zip(xs, ys))))
    spans = {}
    for name, expected in [('front', (50, 50)), ('top', (50, 10))]:
        group = root.find(".//s:g[@data-view='%s']" % name, ns)
        assert group is not None
        visible, all_points = [], []
        for e in group.findall('s:polyline', ns):
            pts = [tuple(map(float, p.split(','))) for p in e.attrib['points'].split()]
            layer = 'HIDDEN' if 'stroke-dasharray' in e.attrib else 'VISIBLE'
            assert any(layer == l and len(pts) == len(q) and all(math.dist(a,b) < .00015 for a,b in zip(pts,q)) for l,q in polylines), (label,name,'DXF counterpart missing')
            all_points += pts
            if layer == 'VISIBLE': visible += pts
        assert visible
        span = [max(p[k] for p in all_points)-min(p[k] for p in all_points) for k in (0,1)]
        assert all(abs(a-b) < .0002 for a,b in zip(span,expected)), (name,span)
        spans[name] = span
        if name == 'front':
            centre = [(max(p[k] for p in visible)+min(p[k] for p in visible))/2 for k in (0,1)]
            radii = [math.dist(p,centre) for p in visible]
            assert all(min(abs(r-15),abs(r-25)) < .0002 for r in radii)
            assert min(radii) < 15.0002 and max(radii) > 24.9998
    results.append({'label':label,'spans':spans,'frontRadii':[15,25],'svgDxfPolylineAgreement':True})
print(json.dumps({'status':'PASS','results':results},indent=2))
