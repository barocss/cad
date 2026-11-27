import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/drawing-authored-circle-nominal-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'packages/barocss-cad-model/src/drawing/dimensions.ts',
  'packages/barocss-cad/src/brep/brep-hidden-line.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'drawing-authored-circle-nominal', output: process.argv[2], envFrozen: 'AUTHORED_CIRCLE_NOMINAL_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Compare the same tolerance on an original circular Extrude in millimetre and inch drawings.',
  limits: ['Ordinary Top drawing only. This flow does not generate a PDF.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const source = brepsFor(doc);
if (!('breps' in source)) throw Error(source.error);
const projected = projectViews(source.breps, source.prefixes);
if (!projected.ok) throw Error(projected.error);
const edge = projected.views.top.edges.find(edge => edge.circle && edge.pieces.some(piece => piece.visible));
if (!edge) throw Error('No visible circular edge');
const { outputs: [output] } = partSnapshot(doc);
const shape = { report: checkBrep(output.brep, { strict: true }), mass: massPropertiesOf(output), edge };
const dim = { id: 'd1', kind: 'diameter', view: 'top', edge: edge.name, near: edge.circle.center, place: [12,9],
  tol: { kind: 'deviation', upper: 0.254, lower: -0.254 } };
const drawing = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
console.log(JSON.stringify({ ...shape, doc: { ...doc, drawing } }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 6.35 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
const units = () => f.page.getByLabel('Drawing units', { exact: true });
const dimension = () => f.page.locator('g.dimension[data-dim="d1"]');

async function drawing() {
  await button('Drawing').click();
  await dimension().locator('text').first().waitFor();
}

async function scene(label, value, nominal, limits) {
  await f.page.waitForFunction(value => window.__studioDrawing?.()?.dimensions.find(d => d.id === 'd1')?.value === value, value);
  const texts = await dimension().locator('text').allTextContents();
  assert.ok(texts.some(text => text.includes(nominal)), texts.join('|'));
  const [upper, lower = upper] = limits;
  assert.ok(texts.includes('+' + upper) && texts.includes('-' + lower), texts.join('|'));
  const svg = await f.page.locator('svg[aria-label="Drawing sheet"]').evaluate(element => element.outerHTML);
  await writeFile(join(f.output, label + '.svg'), svg);
  f.report.observations.push({ label, value, texts, units: (await f.doc()).drawing.units ?? 'mm' });
  return f.snapshot(label);
}

await f.run(async () => {
  f.phase = 'Open the original authored Ø12.7 extrusion with its top drawing dimension';
  const fixture = await f.inspect('original-circle', stock);
  assert.ok(fixture.report.valid, fixture.report.issues.join('\n'));
  near(fixture.mass.volume, Math.PI * 6.35 ** 2 * 10);
  assert.equal(fixture.edge.circle.radius, 6.3500000000000005);
  assert.equal(fixture.edge.circle.nominalRadius, baseline ? undefined : 6.35);
  const file = join(f.output, 'drawing-authored-circle.bcad');
  await writeFile(file, JSON.stringify(fixture.doc));
  await f.newPage();
  await f.openFile(file, stock.nodes.length);
  assert.deepEqual(await f.doc(), fixture.doc);
  await f.snapshot('original-model');
  await drawing();
  const nominal = baseline ? 12.700000000000001 : 12.7;
  const mm = await scene('millimetre-tolerance', nominal, 'Ø12.7', baseline ? ['0.254', '0.253'] : ['0.254']);
  await units().selectOption('inch');
  await f.changed(mm.doc);
  const inch = await scene('inch-tolerance', nominal, 'Ø.500', baseline ? ['.010', '.009'] : ['.010']);
  const fileDoc = await f.doc();
  assert.deepEqual(fileDoc.nodes, stock.nodes);
  assert.deepEqual(fileDoc.drawing.dimensions, fixture.doc.drawing.dimensions);
  if (baseline) return;

  await f.undo();
  await f.same(mm.doc);
  await f.redo();
  await f.same(inch.doc);
  const saved = await f.save('drawing-authored-circle');
  await f.freshOpen(saved.file, inch.doc, 'saved-circle');
  await drawing();
  await scene('reopened-inch-tolerance', 12.7, 'Ø.500', ['.010']);

  f.phase = 'Edit the reopened original circle and check drawing nominal invalidation';
  await button('Model').click();
  await f.openFeatureEditor(1, 'Cylinder');
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('14');
  await diameter.press('Enter');
  await f.page.waitForFunction(() => window.__studioDoc.nodes[0]?.radius === 7);
  const changed = await f.doc();
  const [editedDimension] = changed.drawing.dimensions;
  const { sig, ...dimensionRecord } = editedDimension;
  assert.equal(sig?.k, 'curve');
  assert.deepEqual(dimensionRecord, fixture.doc.drawing.dimensions[0]);
  await drawing();
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions.find(d => d.id === 'd1')?.value === 14);
  await f.snapshot('edited-original-diameter');
  await f.undo();
  await f.same(inch.doc);
  await scene('undo-restores-original-tolerance', 12.7, 'Ø.500', ['.010']);
});
