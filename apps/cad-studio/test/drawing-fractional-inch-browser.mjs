import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/drawing-fractional-inch-browser.mjs',
  'apps/cad-studio/src/ui/drawing/SheetSettings.tsx',
  'packages/barocss-cad-model/src/drawing/standard.ts',
  'packages/barocss-cad-model/src/drawing/types.ts',
  'packages/barocss-cad-model/src/drawing/sheet.ts',
  'packages/barocss-cad-model/src/drawing/issues.ts',
  'packages/barocss-cad-model/src/chat/drawing.ts',
];

const f = await createFlow({
  name: 'drawing-fractional-inch', output: process.argv[2], envFrozen: 'D1996_SOURCE_FROZEN',
  qualification: 'Fractional inch display for plain Drawing length dimensions preserves original mm geometry, tolerance zones, callouts, dual units, SVG/DXF outputs, Undo/Redo, source edits and fresh Open.',
  initialFiles: pins, requiredFrozen: pins,
  snapshotExtra: () => ({ drawing: window.__studioDrawing?.() ?? null }),
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { brepsFor, partBreps } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { defaultDrawing, readDrawing } from '@barocss/cad-model/drawing/types';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (input.prepare) {
  const doc = input.doc;
  const b = brepsFor(doc);
  if (!('breps' in b)) throw new Error('breps failed');
  const r = projectViews(b.breps, b.prefixes);
  if (!r.ok) throw new Error('project failed');
  const near = (a, c) => Math.abs(a - c) < 1e-5;
  const frontSnaps = snapPoints(r.views.front);
  const topSnaps = snapPoints(r.views.top);
  const fAt = (u, v) => frontSnaps.find(p => near(p.at[0], u) && near(p.at[1], v)).ref;
  const tAt = (u, v) => topSnaps.find(p => near(p.at[0], u) && near(p.at[1], v)).ref;
  const hole = r.views.top.edges.find(e => e.kind === 'circle');
  const circle = { edge: hole.name, near: [...hole.circle.center] };
  const drawing = {
    ...defaultDrawing(),
    sheet: 'A3', scale: 2, units: 'inch',
    dimensions: [
      { id: 'plain-width', view: 'front', kind: 'linear', a: fAt(0, 0), b: fAt(31.75, 0), orient: 'horizontal', place: [15.875, -8] },
      { id: 'plain-height', view: 'front', kind: 'linear', a: fAt(0, 0), b: fAt(0, 12.7), orient: 'vertical', place: [-8, 6.35] },
      { id: 'tol-depth', view: 'top', kind: 'linear', a: tAt(0, 0), b: tAt(0, 25.5), orient: 'vertical', place: [-8, 12.75], tol: { kind: 'symmetric', value: 0.01 } },
      { id: 'hole-callout', view: 'top', kind: 'diameter', ...circle, place: [24, 18] },
      { id: 'plain-radius', view: 'top', kind: 'radius', ...circle, place: [24, 6] },
    ],
  };
  console.log(JSON.stringify({ doc: { ...doc, drawing: readDrawing(drawing) } }));
} else {
  const [{ brep }] = partBreps(input);
  console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
}
`,
});

const seedBase = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [31.75, 25.5] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 12.7 },
    { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, face: 'n1.top', center: [15.875, 12.75], radius: 6.35 },
  ],
  outputs: { b2: { node: 2, side: 'solid' } },
};

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

async function openDrawing() {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.waitForFunction(() => (window.__studioDrawing?.()?.dimensions?.length ?? 0) === 5);
}
async function dimMap() {
  const dims = await f.page.evaluate(() => window.__studioDrawing().dimensions);
  return Object.fromEntries(dims.map(d => [d.id, d]));
}
async function dimSvgText(id) {
  return f.page.locator(`g.dimension[data-dim="${id}"] text`).allTextContents();
}
async function downloadExport(buttonName, filename) {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(buttonName).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, 'utf8');
}
async function verifyNative(label, doc, widthMm) {
  const { check, mass } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 1);
  const expected = (widthMm * 25.5 - Math.PI * 6.35 * 6.35) * 12.7;
  near(mass.volume, expected, 1e-5);
  f.report.observations.push({ label, widthMm, volume: mass.volume, expected });
}

await f.run(async () => {
  const { doc: seed } = await f.inspect('prepare-drawing', { prepare: true, doc: seedBase });
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'fractional-inch-plate.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await verifyNative('initial-native', seed, 31.75);
  await openDrawing();

  // Open Sheet Details section
  const details = f.page.locator('details').filter({ hasText: 'inch decimals' });
  await details.locator(':scope > summary').click();
  const initialDims = await dimMap();
  assert.equal(initialDims['plain-width'].text, '1.250');
  assert.equal(initialDims['plain-height'].text, '.500');
  assert.equal(initialDims['tol-depth'].text, '1.0039');
  assert.equal(initialDims['hole-callout'].text, 'Ø.500 THRU');
  assert.equal(initialDims['plain-radius'].text, 'R.250');

  const inchFormat = f.page.getByLabel('Inch format', { exact: true });
  if (baseline) {
    assert.equal(await inchFormat.count(), 0, 'Previous Studio has no Inch format control');
    await f.snapshot('00-previous-no-inch-fraction');
    return;
  }

  f.phase = 'select 1/16 fractional inch and verify plain vs toleranced/callout separation';
  await inchFormat.selectOption('16');
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.find(d => d.id === 'plain-width')?.text === '1 1/4');
  const frac16Doc = (await f.snapshot('01-inch-fraction-16')).doc;
  assert.deepEqual(frac16Doc.nodes, seed.nodes, 'Fractional format must not alter model geometry');
  assert.equal(frac16Doc.drawing.inchFraction, 16);
  const d16 = await dimMap();
  assert.equal(d16['plain-width'].text, '1 1/4');
  near(d16['plain-width'].value, 31.75);
  assert.equal(d16['plain-height'].text, '1/2');
  near(d16['plain-height'].value, 12.7);
  assert.equal(d16['plain-radius'].text, 'R1/4');
  near(d16['plain-radius'].value, 6.35);
  assert.equal(d16['tol-depth'].text, '1.0039', 'Toleranced 25.5 ±0.01 must stay decimal to preserve tolerance zone');
  assert.equal(d16['hole-callout'].text, 'Ø.500 THRU', 'Hole callout must stay decimal');

  f.phase = 'export actual SVG and DXF and independently verify displayed text';
  const svg = await downloadExport('Export SVG', 'frac-16.svg');
  for (const label of ['>1 1/4</text>', '>1/2</text>', '>R1/4</text>', '>1.0039 +.0004/-.0003</text>', '>Ø.500 THRU</text>']) {
    assert.ok(svg.includes(label), `SVG missing ${label}`);
  }
  const dxf = await downloadExport('Export DXF', 'frac-16.dxf');
  for (const label of ['1 1/4', '1/2', 'R1/4', '1.0039 +.0004/-.0003', '%%c.500 THRU']) {
    assert.ok(dxf.includes(label), `DXF missing ${label}`);
  }

  f.phase = 'verify dual units in both inch [mm] and mm [inch]';
  await f.page.getByLabel('Dual units', { exact: true }).check();
  await f.page.locator('g.dimension[data-dim="plain-width"] text', { hasText: '1 1/4 [31.75]' }).waitFor();
  assert.deepEqual(await dimSvgText('plain-width'), ['1 1/4 [31.75]']);
  assert.deepEqual(await dimSvgText('plain-height'), ['1/2 [12.7]']);
  assert.deepEqual(await dimSvgText('plain-radius'), ['R1/4 [R6.35]']);
  assert.deepEqual(await dimSvgText('tol-depth'), ['1.0039 +.0004/-.0003 [25.5 ±0.01]']);
  assert.deepEqual(await dimSvgText('hole-callout'), ['Ø.500 THRU [Ø12.7 THRU]']);

  await f.page.getByLabel('Drawing units', { exact: true }).selectOption('mm');
  await f.page.locator('g.dimension[data-dim="plain-width"] text', { hasText: '31.75 [1 1/4]' }).waitFor();
  assert.deepEqual(await dimSvgText('plain-width'), ['31.75 [1 1/4]']);
  assert.deepEqual(await dimSvgText('plain-height'), ['12.7 [1/2]']);
  assert.deepEqual(await dimSvgText('plain-radius'), ['R6.35 [R1/4]']);
  assert.deepEqual(await dimSvgText('tol-depth'), ['25.5 ±0.01 [1.0039 +.0004/-.0003]']);
  assert.deepEqual(await dimSvgText('hole-callout'), ['Ø12.7 THRU [Ø.500 THRU]']);
  await f.snapshot('02-dual-mm-inch-fraction');

  f.phase = 'switch back to inch, change denominator to 1/64, verify Undo/Redo';
  await f.page.getByLabel('Drawing units', { exact: true }).selectOption('inch');
  await f.page.getByLabel('Dual units', { exact: true }).uncheck();
  await f.page.locator('g.dimension[data-dim="plain-width"] text', { hasText: /^1 1\/4$/ }).waitFor();
  const before64 = await f.doc();
  await inchFormat.selectOption('64');
  await f.page.waitForFunction(() => window.__studioDoc?.drawing?.inchFraction === 64);
  const at64 = await f.doc();
  await f.undo();
  await f.same(before64);
  await f.redo();
  await f.same(at64);

  f.phase = 'edit source plate width 31.75 -> 38.1 mm and verify Drawing updates to 1 1/2';
  await button('Model').click();
  await f.ready();
  await f.openFeatureEditor(1, 'Extrude');
  await f.editor().getByLabel('Width', { exact: true }).fill('38.1');
  const edited = (await f.applyEditor(at64, '03-model-width-38-1')).doc;
  await verifyNative('edited-native', edited, 38.1);
  await openDrawing();
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.find(d => d.id === 'plain-width')?.text === '1 1/2');
  const afterEdit = await dimMap();
  assert.equal(afterEdit['plain-width'].text, '1 1/2');
  near(afterEdit['plain-width'].value, 38.1);
  assert.equal(afterEdit['tol-depth'].text, '1.0039');
  await f.snapshot('03-source-edited-1-and-half');

  f.phase = 'save .bcad and verify fresh Open preserves inchFraction 64 and displayed labels';
  const saved = await f.save('fractional-inch-reopened');
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles(saved.file);
  await f.same(edited);
  await verifyNative('fresh-open-native', await f.doc(), 38.1);
  await openDrawing();
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.find(d => d.id === 'plain-width')?.text === '1 1/2');
  const reopenedDims = await dimMap();
  assert.equal(reopenedDims['plain-width'].text, '1 1/2');
  assert.equal(reopenedDims['tol-depth'].text, '1.0039');
  assert.equal(reopenedDims['hole-callout'].text, 'Ø.500 THRU');
  await f.snapshot('04-fresh-open');
});
