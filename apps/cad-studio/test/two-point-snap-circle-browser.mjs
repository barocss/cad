import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/two-point-snap-circle-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/sketch/useTwoPointSnap.ts',
  'apps/cad-studio/src/sketch/useCircleFromChord.ts',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
];
const f = await createFlow({
  name: 'two-point-snap-circle', output: process.argv[2], envFrozen: 'D1598_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Hand the calculated construction point to Circle once as its centre. Set the radius with ordinary Midpoint snap.',
  limits: ['One XY sketch circle and one construction line.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const [output] = evaluateCadPart(toPartDocument(JSON.parse(readFileSync(process.argv[2], 'utf8')))).outputs;
console.log(JSON.stringify({ valid: checkOutput(output).valid, mass: massPropertiesOf(output),
  supports: output.brep.faces.map(faceGeometry) }));
`,
});
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const snap = () => f.page.getByRole('form', { name: 'Two-point snap', exact: true });
const chord = () => f.page.getByRole('group', { name: 'Circle from two points', exact: true });
const startSnap = () => button(f.sketchPanel(), 'Two-point snap').click();
const startChord = () => button(f.sketchPanel(), 'Circle from two points').click();
const centre = [7.75, 3.25], radius = Math.sqrt(1130) / 4;
const field = id => f.page.locator('#sk-' + id);

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await button(f.page, 'New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  const empty = await f.doc();
  await button(f.page.locator('.mode'), 'Sketch').click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [31, 13]]);
  await f.tool('Line', 'l');
  await f.page.keyboard.press('x');
  await f.worldClick([0, 0]);
  await f.worldClick([31, 13]);
  await f.page.keyboard.press('x');
  await f.tool('Circle', 'c');

  f.phase = 'switch between two input modes without carrying a picked point';
  await startSnap();
  await f.worldClick([0, 0]);
  await startChord();
  await snap().waitFor({ state: 'hidden' });
  await f.worldClick([31, 13]);
  await chord().getByText('Pick the second point on the circle.', { exact: true }).waitFor();
  await startSnap();
  await chord().waitFor({ state: 'hidden' });
  await snap().getByRole('status').getByText('Pick the first endpoint.', { exact: true }).waitFor();
  await f.same(empty);

  f.phase = 'preview the exact calculated centre and place it once';
  await f.worldClick([0, 0]);
  await f.worldClick([31, 13]);
  const value = snap().getByLabel('Snap value');
  await value.fill('0.25');
  await snap().getByRole('status').getByText('Point 7.75, 3.25 mm', { exact: true }).waitFor();
  await f.page.locator('.vp-overlay .sk-osnap').filter({ hasText: 'Calculated' }).waitFor();
  await f.snapshot('01-calculated-circle-centre');
  await value.press('Enter');
  await snap().waitFor({ state: 'hidden' });
  await field('cx').waitFor();
  assert.deepEqual([Number(await field('cx').inputValue()), Number(await field('cy').inputValue())], centre);
  assert.equal(await field('diameter').inputValue(), '2');
  await f.same(empty);
  await f.snapshot('02-first-circle-point');

  f.phase = 'complete the circle with ordinary Midpoint snap';
  await f.worldClick([15.56, 6.54]);
  const finished = await f.finishSketch('03-finished-circle');
  const sketch = finished.doc.nodes[0];
  assert.equal(sketch.profile, 'circle');
  assert.deepEqual(sketch.center, centre);
  assert.ok(Math.abs(sketch.radius - radius) < 1e-12);
  assert.deepEqual(sketch.construction.map(shape => shape.points), [[[0, 0], [31, 13]]]);
  assert.equal(sketch.association, undefined);

  f.phase = 'extrude and check the native circle';
  await f.openExtrudeHud();
  const solid = await f.applyExtrude({ distance: 2, previous: finished.doc, label: '04-extruded-circle' });
  const native = await f.inspect('04-native', solid.doc);
  assert.equal(native.valid, true);
  assert.ok(Math.abs(native.mass.volume - 141.25 * Math.PI) < 1e-8);
  assert.ok(native.mass.centroid.every((value, axis) => Math.abs(value - [...centre, 1][axis]) < 1e-10));
  const cylinders = native.supports.filter(support => support.kind === 'cylinder');
  assert.equal(cylinders.length, 2);
  assert.ok(cylinders.every(support => Math.abs(support.r - radius) < 1e-12));
  await f.undo();
  await f.same(finished.doc);
  await f.redo();
  await f.same(solid.doc);
  const saved = await f.save('calculated-circle');
  await f.freshOpen(saved.file, solid.doc, '05-reopened-circle');
  assert.deepEqual(await f.inspect('05-reopened-native', solid.doc), native);
  f.report.observations.push({ centre, radius: sketch.radius, volumeMm3: native.mass.volume, centroid: native.mass.centroid });
});
