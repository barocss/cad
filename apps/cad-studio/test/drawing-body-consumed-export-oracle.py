"""Independent readback of actual SVG/DXF downloads from the #270 consumed-owner explicit B fixture."""
import json, math, pathlib, sys, xml.etree.ElementTree as ET
folder = pathlib.Path(sys.argv[1]); ns = {'s': 'http://www.w3.org/2000/svg'}
results = []
for label in ('explicit-b',):
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
        if field(e, 0) != 'LINE': continue
        xs = [float(field(e, c)) for c in (10,11)]
        ys = [height-float(field(e,c)) for c in (20,21)]
        assert len(xs) == len(ys)
        polylines.append((field(e, 8), list(zip(xs, ys))))
    spans = {}
    for name, expected in [('front', (20, 10)), ('top', (20, 8))]:
        group = root.find(".//s:g[@data-view='%s']" % name, ns)
        assert group is not None
        visible, all_points = [], []
        for e in group.findall('s:line', ns):
            pts = [(float(e.attrib['x'+str(i)]),float(e.attrib['y'+str(i)])) for i in (1,2)]
            layer = 'HIDDEN' if 'stroke-dasharray' in e.attrib else 'VISIBLE'
            assert any(layer == l and len(pts) == len(q) and all(math.dist(a,b) < .00015 for a,b in zip(pts,q)) for l,q in polylines), (label,name,'DXF counterpart missing')
            all_points += pts
            if layer == 'VISIBLE': visible += pts
        assert visible
        span = [max(p[k] for p in all_points)-min(p[k] for p in all_points) for k in (0,1)]
        assert all(abs(a-b) < .0002 for a,b in zip(span,expected)), (name,span)
        spans[name] = span
    results.append({'label':label,'spans':spans,'svgDxfLineAgreement':True})
print(json.dumps({'status':'PASS','results':results},indent=2))
