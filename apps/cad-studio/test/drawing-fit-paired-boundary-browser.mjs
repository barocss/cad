import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const f = await createFlow({
  name: 'drawing-fit-paired-boundary', output: process.argv[2], envFrozen: 'D1884_SOURCE_FROZEN',
  initialFiles: ['packages/barocss-cad-model/src/drawing/fitList.ts', 'packages/barocss-cad-model/src/drawing/fits.ts',
    'packages/barocss-cad/src/machine/fits.ts', 'apps/cad-studio/src/ui/ParametersPanel.tsx'],
  qualification: '#269 crosses adjacent sourced and estimated paired Fit rows from actual driving geometry.',
  limits: ['One coupled bore and shaft, synthetic adjacent H7/g6 rows, inch-primary dual dimensions. No standard or manufacturing approval.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { faceGeometry } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { withIds } from '@barocss/cad-model/engine/ids';
import { drawingInputs } from '@barocss/cad-model/chat/drawing';
import { readDrawing } from '@barocss/cad-model/drawing/types';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
if (process.argv[3] === 'true') {
  const part = withIds(rectanglePart(60, 40, 8));
  const radius = { parameter: 'fitR' };
  const hole = withNode({ ...part, parameters: { fitR: 6 } }, { kind: 'hole', parent: { node: 1, side: 'solid' },
    center: [30, 20], radius });
  const profile = withNode(hole, { kind: 'sketch', profile: 'circle', center: [30, 20], radius });
  const stock = withNode(profile, { kind: 'extrude', sketch: 3, height: 12, from: -2 });
  const drawing = drawingInputs(stock);
  assert.ok(typeof drawing !== 'string', String(drawing));
  const rim = drawing.views.top.edges.find(edge => edge.kind === 'circle' && edge.circle && edge.name.includes('n2.') && Math.abs(edge.circle.radius - 6) < 1e-8);
  assert.ok(rim?.circle);
  const bore = rim.name.split('|').find(face => face.startsWith('n2.'));
  assert.ok(bore);
  const doc: StudioDoc = {
    ...stock, fits: { version: 1, faces: [{ face: bore, class: 'H7' }, { face: 'n4.side0', class: 'g6' }],
      pairs: [{ hole: bore, shaft: 'n4.side0' }], tables: [{ id: 'shop-ranges', sources: [
        { id: 'range-a', label: 'Synthetic range A' }, { id: 'range-b', label: 'Synthetic range B' },
      ], rows: [
        { class: 'H7', over: 10, upTo: 14, upper: .018, lower: 0, source: 'range-a' },
        { class: 'g6', over: 10, upTo: 14, upper: -.006, lower: -.017, estimate: true },
        { class: 'H7', over: 14, upTo: 18, upper: .003, lower: .001, source: 'range-b' },
        { class: 'g6', over: 14, upTo: 18, upper: -.003, lower: -.004, estimate: true },
      ] }] },
    drawing: readDrawing({ sheet: 'A3', scale: 1, views: ['front', 'top'], units: 'inch', dual: true,
      dimensions: [{ id: 'linked-bore', kind: 'diameter', view: 'top', edge: rim.name, near: rim.circle.center, place: [45, 35] }],
      tables: [{ id: 'fits', from: 'fits', at: [15, 175] }] }),
  };
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok, evaluated.ok ? '' : evaluated.error.detail);
  console.log(JSON.stringify(captureSignatures(doc, evaluated.bodies)));
} else {
  const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')) as StudioDoc;
  const native = partBreps(doc).flatMap(part => part.brep.faces);
  const dimensions = doc.fits!.faces!.map(binding => {
    const faces = native.filter(face => face.name === binding.face || face.name?.replace(/#\d+$/, '') === binding.face);
    assert.ok(faces.length > 0);
    return { class: binding.class, diameters: faces.map(face => {
      const cylinder = faceGeometry(face);
      assert.equal(cylinder.kind, 'cylinder');
      return cylinder.kind === 'cylinder' && 2 * cylinder.r;
    }) };
  });
  console.log(JSON.stringify(dimensions));
}
`, oracleSource: String.raw`
import json
import re
import sys
import xml.etree.ElementTree as ET
from decimal import Decimal as D

case = json.load(sys.stdin)
ns = {'svg': 'http://www.w3.org/2000/svg'}
root = ET.fromstring(case['svg'])
svg = [(D(t.attrib['y']), ''.join(t.itertext())) for t in root.findall('.//svg:text', ns)]

raw = case['dxf'].splitlines()
assert len(raw) % 2 == 0
records, entity = [], {}
for i in range(0, len(raw), 2):
    code, value = int(raw[i]), raw[i + 1]
    if code == 0:
        records.append(entity)
        entity = {}
    entity.setdefault(code, value)
records.append(entity)

def unescape(value):
    decoded = re.sub(r'\\U\+([0-9A-Fa-f]{4})', lambda match: chr(int(match[1], 16)), value)
    return re.sub(r'%%[cC]', 'Ø', decoded)

dxf = [(D(record[20]), unescape(record[1])) for record in records if record.get(0) == 'TEXT']
number = r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)'
pair = re.compile(r'H7/g6 \((' + number + r')/(' + number + r'), (' + number + r')/(' + number + r')\) \(est\.\)')
expected_mm = D(case['nominal'])
for label, entities in [('SVG', svg), ('DXF', dxf)]:
    text = [value for _, value in entities]
    joined = ' '.join(' '.join(text).split())
    assert 'DIAMETER (inch)' in text and 'FIT DIMENSIONS' in text, (label, text)
    assert f"H7: shop-ranges row {case['rows'][0]}" in joined, (label, joined)
    assert f"g6: shop-ranges row {case['rows'][1]} (estimate)" in joined, (label, joined)
    assert case['source'] in joined and 'Primary units only' in joined, (label, joined)
    ordinate, = [y for y, value in entities if value == 'linked-bore (top)']
    cells = [value for y, value in entities if abs(y - ordinate) < D('0.0001')]
    intervals, = [match for value in cells if (match := pair.fullmatch(value)) is not None]
    nominal, = [D(t) for t in cells if re.fullmatch(number, t) and abs(D(t) * D('25.4') - expected_mm) < D('0.02')]
    printed = [D(t) for t in intervals.groups()]
    for index, true_deviations in enumerate(case['limits']):
        upper, lower = printed[index * 2:index * 2 + 2]
        representable_lo, representable_hi = (nominal + lower) * D('25.4'), (nominal + upper) * D('25.4')
        physical_lo, physical_hi = [expected_mm + D(t) for t in true_deviations]
        assert physical_lo <= representable_lo < representable_hi <= physical_hi, (label, index, representable_lo, representable_hi, physical_lo, physical_hi)
    assert any('H7/g6' in value and '[' in value and 'Ø' in value for value in text), (label, text)
print(json.dumps({'status': 'PASS', 'nominal': case['nominal'], 'rows': case['rows'], 'formats': ['SVG', 'DXF']}))
`
});
const button = name => f.page.getByRole('button', { name, exact: true });
const limits = {
  '12': { rows: [1, 2], source: 'range-a', limits: [['0', '0.018'], ['-0.017', '-0.006']] },
  '14': { rows: [1, 2], source: 'range-a', limits: [['0', '0.018'], ['-0.017', '-0.006']] },
  '14.5': { rows: [3, 4], source: 'range-b', limits: [['0.001', '0.003'], ['-0.004', '-0.003']] },
};

async function drawingAt(nominal) {
  if (!await f.page.locator('.dw[aria-label="Drawing"]').count()) await button('Drawing').click();
  await f.page.waitForFunction(({ diameter, rows }) => {
    const sheet = window.__studioDrawing?.();
    const text = document.querySelector('[aria-label="Drawing sheet"]')?.textContent ?? '';
    return sheet?.dimensions?.some(d => d.id === 'linked-bore' && Math.abs(d.value - diameter) < 1e-8) &&
      sheet.tables?.some(table => table.id === 'fits' && !table.error) &&
      text.includes(`H7: shop-ranges row ${rows[0]}; g6: shop-ranges row ${rows[1]} (estimate)`);
  }, { diameter: Number(nominal), rows: limits[nominal].rows });
}

async function verify(label, nominal, original, exportPair = true) {
  f.phase = `Verify physical Ø${nominal} and current Fit list: ${label}`;
  await drawingAt(nominal);
  const doc = await f.doc();
  assert.equal(doc.parameters.fitR, Number(nominal) / 2);
  assert.deepEqual(doc.nodes, original.nodes);
  assert.deepEqual(doc.fits, original.fits);
  assert.deepEqual(doc.drawing.dimensions.map(dimension => ({ ...dimension, sig: undefined })),
    original.drawing.dimensions.map(dimension => ({ ...dimension, sig: undefined })));
  const signature = doc.drawing.dimensions[0].sig;
  assert.equal(signature.k, 'curve');
  assert.ok(signature.p.every((coordinate, axis) => Math.abs(coordinate - [30 - Number(nominal) / 2, 20, 0][axis]) < 1e-8));
  assert.equal(doc.drawing.units, 'inch');
  assert.equal(doc.drawing.dual, true);
  const measured = await f.inspect(label, doc, false);
  assert.deepEqual(measured.map(member => member.class), ['H7', 'g6']);
  for (const member of measured) assert.ok(member.diameters.every(value => Math.abs(value - Number(nominal)) < 1e-8));
  if (exportPair) {
    const files = {};
    for (const kind of ['SVG', 'DXF']) {
      const pending = f.page.waitForEvent('download');
      await button(`Export ${kind}`).click();
      const bytes = await readFile(await (await pending).path());
      const format = kind.toLowerCase();
      await writeFile(join(f.output, `${label}.${format}`), bytes);
      f.report.files.push({ label, format, bytes: bytes.length, sha256: sha256(bytes) });
      files[format] = bytes.toString(kind === 'DXF' ? 'latin1' : 'utf8');
    }
    await f.runOracle({ ...files, nominal, ...limits[nominal] }, label);
    assert.deepEqual(await f.doc(), doc);
  }
  f.report.observations.push({ label, nominal, measured, rows: limits[nominal].rows });
  return f.snapshot(label);
}

async function setDiameter(radius) {
  f.phase = `Drive both model features from radius ${radius}`;
  await button('Model').click();
  await button('Parameters').click();
  const value = f.page.getByLabel('Value of fitR', { exact: true });
  await value.fill(String(radius));
  await value.press('Enter');
  await f.page.waitForFunction(r => window.__studioDoc?.parameters.fitR === r, radius);
  await f.ready();
  await button('Close parameters').click();
}

await f.run(async () => {
  const seed = await f.inspect('paired-with-adjacent-ranges', {}, true);
  const path = join(f.output, 'fit-paired-ranges.bcad');
  await writeFile(path, JSON.stringify(seed));
  await f.freshOpen(path, seed, 'paired-seed-open');
  await verify('01-original-12', '12', seed);
  await setDiameter(7);
  await verify('02-closed-upper-bound-14', '14', seed);
  await setDiameter(7.25);
  await verify('03-adjacent-14-5', '14.5', seed);
  await f.undo();
  await verify('04-undo-at-14', '14', seed, false);
  await f.redo();
  await verify('05-redo-at-14-5', '14.5', seed, false);
  const current = await f.doc(), saved = await f.save('paired-fit-adjacent-ranges');
  await f.freshOpen(saved.file, current, '06-paired-fit-reopened');
  await verify('07-reopened-at-14-5', '14.5', seed);
});
