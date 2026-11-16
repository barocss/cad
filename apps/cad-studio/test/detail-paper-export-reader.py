"""Independent stdlib XML/DXF group-code checks, consuming writer bytes via stdin."""
import json
import re
import sys
from xml.etree import ElementTree as ET

p = json.load(sys.stdin)
ns = {'s': 'http://www.w3.org/2000/svg'}
roots = [ET.fromstring(s['svg']) for s in p['sheets']]
assert (roots[1].get('width'), roots[1].get('height')) == ('297mm', '210mm')
d = p['doc']['drawing']['details'][0]
assert (d['id'], d['center'], d['radius'], d['scale']) == ('B', [32, 16], 6, 5)
assert p['doc']['drawing']['sheets'][0]['views'] == ['detail:B']
box = [d['at'][0]-30, d['at'][1]-30, d['at'][0]+30, d['at'][1]+30]
assert all(abs(a-b) < 1e-8 for a, b in zip(box, p['observation']['box']))
texts = lambda el: [e.text for e in el.findall('.//s:text', ns)]
parent = roots[0].find('.//s:g[@class="detail"][@data-view="top"][@data-dim="B"]', ns)
assert parent is not None and 'SEE SHEET 2' in texts(parent)
assert roots[0].find('.//s:g[@data-view="detail:B"]', ns) is None
view = roots[1].find('.//s:g[@class="detail"][@data-view="detail:B"][@data-dim="B"]', ns)
assert view is not None
paths = view.findall('./s:path', ns)
# Exact SVG arc commands independently expose the displayed crop radius and hole radius.
assert any('A30 30 ' in x.get('d', '') for x in paths)
assert any('A20 20 ' in x.get('d', '') for x in paths)
crop = next(x.get('d') for x in paths if 'A30 30 ' in x.get('d', ''))
m = re.match(r'M([-\d.]+) ([-\d.]+)', crop)
assert m and abs(float(m[1])-(d['at'][0]+30)) < 1e-4 and abs(float(m[2])-d['at'][1]) < 1e-4
nominal = 'Ø8 THRU +0.15/-0.14'
assert p['doc']['drawing']['dimensions'][0]['tol'] == {'kind': 'symmetric', 'value': 0.15}
# Known native radius precision boundary: compare actual displayed text, not an idealized symmetric label.
from html import unescape
browser_group = re.search(r'<g[^>]*data-dim="b-diameter"[^>]*>(.*?)</g>', p['browserHtml'], re.S)
assert browser_group and nominal in unescape(browser_group[1])
dim = roots[1].find('.//s:g[@class="dimension"][@data-dim="b-diameter"]', ns)
assert dim is not None and texts(dim) == [nominal], texts(dim)
frame = roots[1].find('.//s:g[@data-standalone-frame="b-frame"]', ns)
assert frame is not None and texts(frame) == ['0.07']
assert {'DETAIL B (5:1)', 'FROM SHEET 1'} <= set(texts(roots[1]))

# DXF parser is deliberately independent of the CAD writer and third-party packages.
def parse(text):
    lines = text.splitlines()
    assert len(lines) % 2 == 0
    pairs = [(int(lines[i].strip()), lines[i+1].strip()) for i in range(0, len(lines), 2)]
    records, current = [], []
    for code, value in pairs:
        if code == 0:
            if current: records.append(current)
            current = [(code, value)]
        else: current.append((code, value))
    if current: records.append(current)
    return pairs, records
pairs, records = parse(p['sheets'][1]['dxf'])
for variable in ('$EXTMAX', '$LIMMAX'):
    i = pairs.index((9, variable))
    assert pairs[i+1][0] == 10 and float(pairs[i+1][1]) == 297
    assert pairs[i+2][0] == 20 and float(pairs[i+2][1]) == 210
i = pairs.index((9, '$INSUNITS'))
assert pairs[i+1] == (70, '4')
get = lambda r, c: next((v for k, v in r if k == c), None)
entities = [r for r in records if get(r, 0) == 'DIMENSION']
assert len(entities) == 1
assert abs(float(get(entities[0], 42))-8) < 1e-9
assert get(entities[0], 1).replace('%%c', 'Ø').replace('%%p', '±') == nominal
labels = {get(r, 1) for r in records if get(r, 0) == 'TEXT'}
assert {'DETAIL B (5:1)', 'FROM SHEET 1', '0.07'} <= labels
circles = [r for r in records if get(r, 0) in ('ARC', 'CIRCLE')]
assert any(abs(float(get(r, 40))-30) < 1e-9 and abs(float(get(r, 10))-d['at'][0]) < 1e-9 and abs(float(get(r, 20))-(210-d['at'][1])) < 1e-9 for r in circles)
assert any(abs(float(get(r, 40))-20) < 1e-9 for r in circles if get(r, 8) == 'VISIBLE')
_, parent_records = parse(p['sheets'][0]['dxf'])
assert 'SEE SHEET 2' in {get(r, 1) for r in parent_records if get(r, 0) == 'TEXT'}
print(json.dumps({'passed': True, 'sheet': 'A4', 'detailPaperBox': box, 'scale': 5, 'measured': 8, 'authoredTolerance': 0.15, 'actualText': nominal, 'rawDxfMeasured': float(get(entities[0], 42)), 'knownPrecisionBoundary': '#35', 'frame': 0.07, 'crossReferences': True, 'parsers': ['stdlib ElementTree', 'independent DXF group codes']}))
