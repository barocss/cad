import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-bore-regeneration-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad-model/src/drawing/dimensions.ts',
  'packages/barocss-cad-model/src/drawing/sheet.ts',
];
const f = await createFlow({
  name: 'drawing-bore-regeneration', output: process.argv[2], envFrozen: 'DRAWING_BORE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Regenerate one authored diameter and retain its identity when two matching nominal bores remain.',
  limits: ['One A4 part sheet, three through holes, authored symmetric tolerance and SVG.'],
  oracleSource: String.raw`
import collections
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

input = json.load(sys.stdin)
svg = ET.fromstring(input['svg'])
ns = '{http://www.w3.org/2000/svg}'
assert svg.tag == ns + 'svg' and svg.get('width') == '297mm' and svg.get('height') == '210mm'
top, = [g for g in svg.iter(ns + 'g') if g.get('class') == 'view' and g.get('data-view') == 'top']
segments = top.findall(ns + 'line')
xs = [float(line.get(key)) for line in segments for key in ('x1', 'x2')]
ys = [float(line.get(key)) for line in segments for key in ('y1', 'y2')]
assert math.isclose(max(xs) - min(xs), 80, abs_tol=0.0001) and math.isclose(max(ys) - min(ys), 40, abs_tol=0.0001)
circles = collections.Counter()
num = r'(-?[0-9]+(?:\.[0-9]+)?)'
pattern = rf'M{num} {num}A{num} {num} {num} 0 ([01]) {num} {num}'
for path in top.findall(ns + 'path'):
    data = path.get('d', '')
    match = re.fullmatch(pattern, data)
    assert match, data
    x0, y0, rx, ry, rotation, sweep, x1, y1 = map(float, match.groups())
    assert rx == ry and rotation == 0 and y0 == y1 and abs(x1 - x0) == 2 * rx, data
    circles[(round((x0 + x1) / 2 - min(xs), 4), round(y0 - min(ys), 4), rx)] += 1
expected = collections.Counter({(22, 20, 5): 2, (58, 20, 5): 2})
target = input['diameter']
if target is not None:
    expected[(40, 20, target / 2)] = 2
assert circles == expected, (circles, expected)
groups = [g for g in svg.iter(ns + 'g') if g.get('class') == 'dimension']
if target is None:
    assert groups == [], [g.attrib for g in groups]
    texts = []
else:
    group, = groups
    assert group.get('data-dim') == input['id'] and group.get('data-view') == 'top'
    texts = [''.join(t.itertext()) for t in group.iter(ns + 'text')]
    merged = ' '.join(texts)
    assert merged == f'Ø{target}.000 THRU ±0.125', texts
revision, = [''.join(t.itertext()) for t in svg.iter(ns + 'text') if (t.text or '').startswith('SRC ')]
assert re.fullmatch(r'SRC [0-9a-f]{16}', revision), revision
print(json.dumps(dict(status='PASS', revision=revision, radiusCounts=sorted([list(k) + [v] for k, v in circles.items()]), texts=texts)))
`,
});

const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [80, 40] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 8 },
    ...[22, 58, 40].map((x, i) => ({
      kind: 'hole', id: 'n' + (i + 2), parent: { node: i + 1, side: 'solid' },
      face: 'n1.top', center: [x, 20], radius: i === 2 ? 4 : 5,
    })),
  ],
  outputs: { b4: { node: 4, side: 'solid' } }, nextId: 5,
  drawing: { sheet: 'A4', scope: { kind: 'part' }, scale: 1, projection: 'third',
    hidden: false, centers: false, dimensions: [], views: ['front', 'top'], precision: { mm: 3 } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const tools = () => f.page.getByRole('navigation', { name: 'Drawing tools', exact: true });
const top = () => f.page.getByLabel('Drawing sheet', { exact: true }).locator('g.view[data-view="top"]');
const target = () => f.page.locator('.history .hs[data-node-index="4"]');
const near = (a, b, tol = 1e-7) => Math.abs(a - b) <= tol;

async function drawing() {
  await button('Drawing').click();
  await top().waitFor();
}

async function fresh(file, expected) {
  await f.newPage();
  await f.openFile(file, expected.nodes.length);
  const opened = await f.doc();
  assert.deepEqual(opened, expected);
  return opened;
}

async function modelPoint(u, v) {
  const point = await f.page.evaluate(([x, y]) => window.__studioDrawingAt('top', x, y), [u, v]);
  assert.ok(point);
  return point;
}

async function readSheet(label, original, diameter) {
  f.phase = label;
  await f.page.waitForFunction(({ id, diameter }) => {
    const d = window.__studioDrawing?.()?.dimensions.find(d => d.id === id);
    return diameter === null ? Boolean(d?.lost) : d && !d.lost && Math.abs(d.value - diameter) < 1e-8;
  }, { id: original.id, diameter });
  if (diameter === null) await f.page.locator('.dw-dim.lost').filter({ hasText: /diameter · top/ }).scrollIntoViewIfNeeded();
  const state = await f.snapshot(label, () => ({ drawingSheet: window.__studioDrawing() }));
  const stored = state.doc.drawing.dimensions;
  assert.equal(stored.length, 1);
  const [saved] = stored;
  assert.deepEqual([saved.id, saved.edge, saved.near, saved.place, saved.tol],
    [original.id, original.edge, original.near, original.place, original.tol]);
  assert.equal(saved.was, undefined);
  assert.equal(state.bodies.bodies.length, 1);
  const expectedVolume = 80 * 40 * 8 - 8 * Math.PI * (50 + (diameter === null ? 0 : diameter ** 2 / 4));
  const volume = state.bodies.bodies[0].volume;
  assert.ok(near(volume, expectedVolume), JSON.stringify({ volume, expectedVolume }));
  const lost = state.drawingSheet.issues.filter(issue => issue.code === 'DIMENSION_LOST');
  assert.equal(lost.length, diameter === null ? 1 : 0);
  if (diameter === null) assert.match(state.drawingSheet.dimensions[0].lost, /circle.*no longer in the part/i);
  const [download] = await Promise.all([f.page.waitForEvent('download'), button('Export SVG').click()]);
  const file = join(f.output, label + '.svg');
  await download.saveAs(file);
  const bytes = await readFile(file);
  const checked = await f.runOracle({ svg: bytes.toString('utf8'), id: original.id, diameter }, label);
  f.report.files.push({ label, bytes: bytes.length, sha256: sha256(bytes) });
  f.report.observations.push({ label, volume, expectedVolume, ...checked });
  return checked;
}

await f.run(async () => {
  f.phase = 'Open stock and author the middle bore callout in the Top view';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'bore-regeneration.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[4]?.kind === 'hole');
  await f.ready();
  await drawing();
  await button('Diameter', tools()).click();
  const edge = await modelPoint(44, 20);
  await f.page.mouse.move(edge.x, edge.y);
  await f.page.mouse.click(edge.x, edge.y);
  const position = await modelPoint(43, 54);
  await f.page.mouse.move(position.x, position.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(position.x, position.y);
  await f.page.locator('.dw-dim button.dw-annotation-select').click();
  await f.page.getByLabel('Tolerance', { exact: true }).selectOption('symmetric');
  const tolerance = f.page.getByLabel('Tolerance ±', { exact: true });
  await tolerance.fill('0.1254');
  await tolerance.press('Enter');
  await f.page.waitForFunction(() => window.__studioDoc.drawing.dimensions[0]?.tol?.value === .1254);
  const authored = await f.doc(), [dimension] = authored.drawing.dimensions;
  assert.match(dimension.edge, /n4\.side/);
  const before = await readSheet('author-diameter-8', dimension, 8);

  f.phase = 'Regenerate the same reference after Model edits Diameter 8 to 10';
  await button('Model').click();
  await f.openFeatureEditor(4, 'middle bore');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('10');
  await f.applyEditor(authored, 'model-diameter-10');
  const edited = await f.doc();
  assert.deepEqual(edited.nodes, authored.nodes.map((n, i) => i === 4 ? { ...n, radius: 5 } : n));
  await drawing();
  const current = await readSheet('regenerated-diameter-10', dimension, 10);
  assert.notEqual(current.revision, before.revision);
  await button('Model').click();
  const saved = await f.save('bore-at-diameter-10');
  const reopened = await fresh(saved.file, edited);
  await drawing();
  assert.deepEqual(await readSheet('reopened-diameter-10-sheet', dimension, 10), current);

  f.phase = 'Suppress the source with two equally distant Ø10 bores still visible';
  await button('Model').click();
  await target().click({ button: 'right' });
  await f.page.getByRole('menuitem', { name: 'Suppress', exact: true }).click();
  await f.changed(reopened);
  const suppressed = await f.doc();
  assert.deepEqual(suppressed.nodes, edited.nodes.map((n, i) => i === 4 ? { ...n, suppressed: true } : n));
  await drawing();
  const missing = await readSheet('source-suppressed', dimension, null);
  assert.notEqual(missing.revision, current.revision);
  await f.undo();
  await f.same(reopened);
  assert.deepEqual(await readSheet('undo-restores-diameter-10', dimension, 10), current);
  await f.redo();
  await f.same(suppressed);
  assert.deepEqual(await readSheet('redo-source-suppressed', dimension, null), missing);
  await button('Model').click();
  const lost = await f.save('bore-source-suppressed');
  await fresh(lost.file, suppressed);
  await drawing();
  const references = f.page.getByRole('region', { name: 'References', exact: true });
  await references.getByText(/1 need a choice/).waitFor();
  const choices = await references.getByRole('button', { name: /^Preview candidate \d+$/ }).count();
  assert.ok(choices >= 2, 'The lost callout needs an explicit choice');
  f.report.observations.push({ label: 'reopened-reference-choice', choices });
  assert.deepEqual(await readSheet('reopened-lost-diameter-sheet', dimension, null), missing);
});
