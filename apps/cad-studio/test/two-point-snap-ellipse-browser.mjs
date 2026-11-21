import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/two-point-snap-ellipse-browser.mjs',
  'apps/cad-studio/src/sketch/useTwoPointSnap.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/viewport/ellipseDraft.ts',
];
const f = await createFlow({
  name: 'two-point-snap-ellipse', output: process.argv[2], envFrozen: 'D1616_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Place an Ellipse centre at the exact calculated point and finish with the ordinary axis picks.',
  limits: ['One axis-aligned XY ellipse and one visible straight construction segment.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { curveDomain, evaluateCurve } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const { direct } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(direct.objects.map(object => {
  const curve = geometryOf(direct, object);
  if (curve.kind !== 'curve') throw new Error('Expected a native curve');
  const [start, end] = curveDomain(curve);
  return { degree: curve.degree, weights: curve.weights, points: Array.from({ length: 129 }, (_, i) =>
    evaluateCurve(curve, start + (end - start) * i / 128)) };
})));
`,
});
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const start = () => button(f.sketchPanel(), 'Two-point snap');
const form = () => f.page.getByRole('form', { name: 'Two-point snap', exact: true });
const fields = () => f.sketchPanel().getByRole('group', { name: 'Ellipse', exact: true });
const centre = [7.75, 3], reference = [[0, 0], [31, 12]], axisEnd = [20, 3], widthPick = [8, 9];
const expected = { center: centre, rx: 12.25, ry: 6, angle: 0 };

async function checkFields() {
  await fields().waitFor();
  const labels = ['Centre X', 'Centre Y', 'Rx', 'Ry', 'Angle'];
  const values = await Promise.all(labels.map(async label => Number(await fields().getByLabel(label, { exact: true }).inputValue())));
  assert.deepEqual(values, [...centre, expected.rx, expected.ry, expected.angle]);
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await button(f.page, 'New part').click();
  await f.ready();
  const empty = await f.doc();
  assert.equal(empty.nodes.length, 0);
  await button(f.page.locator('.mode'), 'Sketch').click();
  await f.sketchPanel().waitFor();
  await f.frame([[-6, -3], [32, 14]]);
  await f.tool('Line', 'l');
  await f.page.keyboard.press('x');
  for (const point of reference) await f.worldClick(point);
  await f.page.keyboard.press('x');
  await f.tool('Ellipse', 'i');

  f.phase = 'apply the calculated centre once with the grid active';
  await start().click();
  for (const point of reference) await f.worldClick(point);
  const value = form().getByLabel('Snap value');
  await value.fill('0.25');
  await form().getByText('Point 7.75, 3 mm', { exact: true }).waitFor();
  await f.page.locator('.vp-overlay .sk-osnap').filter({ hasText: 'Calculated' }).waitFor();
  await f.snapshot('01-calculated-ellipse-centre');
  await value.press('Enter');
  await form().waitFor({ state: 'hidden' });
  await f.same(empty);
  assert.equal(await fields().count(), 0);

  f.phase = 'finish the ordinary Ellipse gesture and reopen the editable sketch';
  await f.worldClick(axisEnd);
  await f.worldClick(widthPick);
  await checkFields();
  await f.snapshot('02-ellipse-draft');
  const finished = await f.finishSketch('03-finished-ellipse');
  assert.deepEqual(finished.doc.nodes[0].outline.ellipse, expected);
  assert.deepEqual(finished.doc.nodes[0].construction.map(shape => shape.points), [reference]);
  await f.undo();
  await f.same(empty);
  await f.redo();
  await f.same(finished.doc);
  const saved = await f.save('calculated-ellipse');
  await f.freshOpen(saved.file, finished.doc, '04-reopened-ellipse');
  const history = f.page.getByRole('group', { name: 'History', exact: true });
  await button(history, 'Sketch · outline').click();
  await button(f.editor(), 'Edit sketch').click();
  await checkFields();
  await f.snapshot('05-reopened-ellipse-definition');

  f.phase = 'verify exact native ellipse conversion with the independent implicit equation';
  await button(f.sketchPanel(), 'Make curves').click();
  await f.changed(finished.doc);
  await f.sketchPanel().waitFor({ state: 'hidden' });
  const converted = await f.doc();
  assert.deepEqual(converted.nodes, finished.doc.nodes);
  const curves = await f.inspect('06-converted-curves', converted);
  assert.equal(curves.length, 2);
  const rational = curves.filter(curve => curve.weights.some(weight => weight !== 1));
  assert.equal(rational.length, 1);
  const [ellipse] = rational;
  assert.equal(ellipse.degree, 2);
  const { points } = ellipse;
  const residual = Math.max(...points.map(([x, y, z]) =>
    Math.max(Math.abs(z), Math.abs(((x - centre[0]) / expected.rx) ** 2 + ((y - centre[1]) / expected.ry) ** 2 - 1))));
  assert.ok(residual < 1e-9, `Implicit ellipse residual ${residual}`);
  const bounds = [0, 1].map(axis => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))]);
  const expectedBounds = [[-4.5, 20], [-3, 9]];
  bounds.forEach((range, axis) => range.forEach((edge, side) => assert.ok(Math.abs(edge - expectedBounds[axis][side]) < 1e-9)));
  const curveFile = await f.save('calculated-ellipse-curves');
  await f.freshOpen(curveFile.file, converted, '07-reopened-native-ellipse');
  assert.deepEqual(await f.inspect('07-reopened-curves', converted), curves);
  f.report.observations.push({ definition: expected, samples: points.length, implicitResidual: residual, bounds });
});
