"""Independent readback of #269 actual SVG/DXF downloads; synthetic data only."""
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

folder = Path(sys.argv[1])
root = ET.parse(folder / 'nominal14-inch-dual.svg').getroot()
svg = [t.text or '' for t in root.iter('{http://www.w3.org/2000/svg}text')]
raw = (folder / 'nominal14-inch-dual.dxf').read_text(encoding='latin1').splitlines()
assert len(raw) % 2 == 0
entities, current = [], []
for i in range(0, len(raw), 2):
    code, value = int(raw[i]), raw[i + 1]
    if code == 0:
        if current:
            entities.append(current)
        current = []
    current.append((code, value))
if current:
    entities.append(current)

def value(entity, code):
    return next((v for c, v in entity if c == code), '')

def decode(text):
    text = re.sub(r'%%[cC]', 'Ø', text)
    return re.sub(re.escape(chr(92) + 'U+') + r'([a-fA-F0-9]{4})',
                  lambda match: chr(int(match[1], 16)), text)

dxf = [decode(value(e, 1)) for e in entities if value(e, 0) == 'TEXT']
expected = ['FIT DIMENSIONS', 'bore-fit (top)', 'DIAMETER (inch)', '.5512',
            'H7 (+.0006/0)', 'H7: synthetic-shop row 1',
            'Ø.5512 THRU H7 (+.0006/0) [Ø14 THRU H7 (+0.018/+0.001)]']
for kind, texts in [('SVG', svg), ('DXF', dxf)]:
    for text in expected:
        assert text in texts, (kind, text)
    assert texts.count('bore-fit (top)') == 1
    for text in ['trial-only', 'Rows are dimensions', 'Primary units only']:
        assert text in ' '.join(texts), (kind, text)
# Displayed rounded primary limits remain inside the supplied synthetic zone.
assert 14 <= .5512 * 25.4 <= 14.018
assert 14 <= (.5512 + .0006) * 25.4 <= 14.018
print(json.dumps({'status': 'PASS', 'formats': ['SVG', 'DXF'], 'nominalMm': 14,
                  'primaryDiameterInch': .5512, 'dualCalloutPresent': True,
                  'tableRowCount': 1, 'syntheticSource': 'trial-only',
                  'scope': 'XML/DXF TEXT readback and numeric containment; not an external viewer or manufacturing certification'}))
