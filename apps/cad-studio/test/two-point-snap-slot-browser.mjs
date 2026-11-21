import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/two-point-snap-slot-browser.mjs',
  'apps/cad-studio/src/sketch/useTwoPointSnap.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/ui/SketchPanel.tsx',
];
const f = await createFlow({
  name: 'two-point-snap-slot', output: process.argv[2], envFrozen: 'D1608_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Use the calculated point once as the first Slot centre. Pick the other centre and finish the standard width gesture.',
  limits: ['One horizontal XY slot and a visible construction segment.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const bodies = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const { brep } = bodies[0];
console.log(JSON.stringify({ count: bodies.length, check: checkBrep(brep, { strict: true }),
  mass: brepMassProperties(brep, 1), supports: brep.faces.map(faceGeometry),
}));
`,
});
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const start = () => button(f.sketchPanel(), 'Two-point snap');
const form = () => f.page.getByRole('form', { name: 'Two-point snap', exact: true });
const field = id => f.page.locator('#sk-slot-' + id);
const a = [7.75, 3], b = [24, 3], r = 4, height = 2;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

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
  await f.frame([[0, 0], [31, 12], [24, 3]]);
  await f.tool('Line', 'l');
  await f.page.keyboard.press('x');
  await f.worldClick([0, 0]);
  await f.worldClick([31, 12]);
  await f.page.keyboard.press('x');
  await f.tool('Slot', 'o');

  f.phase = 'retire a partial two-point calculation when switching tools';
  await start().click();
  await f.worldClick([0, 0]);
  await f.tool('Rectangle', 'r');
  await form().waitFor({ state: 'hidden' });
  await f.tool('Slot', 'o');
  await start().click();
  await form().getByText('Pick the first endpoint.', { exact: true }).waitFor();
  await f.same(empty);

  f.phase = 'apply one exact first centre without moving it to the grid';
  await f.worldClick([0, 0]);
  await f.worldClick([31, 12]);
  const value = form().getByLabel('Snap value');
  await value.fill('0.25');
  await form().getByText('Point 7.75, 3 mm', { exact: true }).waitFor();
  await f.page.locator('.vp-overlay .sk-osnap').filter({ hasText: 'Calculated' }).waitFor();
  await f.snapshot('01-calculated-slot-centre');
  await value.press('Enter');
  await form().waitFor({ state: 'hidden' });
  await field('x').waitFor();
  assert.deepEqual(await Promise.all(['x', 'y', 'length', 'width'].map(async name => Number(await field(name).inputValue()))), [...a, 0, 0]);
  assert.equal(await start().count(), 0);
  await f.same(empty);

  f.phase = 'complete the standard axis and width gestures';
  await f.worldClick(b);
  assert.equal(Number(await field('length').inputValue()), 16.25);
  await f.worldClick([20, 7]);
  assert.equal(Number(await field('width').inputValue()), 8);
  await f.snapshot('02-completed-slot-draft');
  const finished = await f.finishSketch('03-finished-slot');
  const sketch = finished.doc.nodes[0];
  assert.deepEqual(sketch.segments.map(segment => segment.kind), ['line', 'arc', 'line', 'arc']);
  assert.deepEqual([sketch.segments[3].center, sketch.segments[1].center], [a, b]);
  assert.deepEqual(sketch.construction.map(shape => shape.points), [[[0, 0], [31, 12]]]);
  assert.equal(sketch.association, undefined);

  f.phase = 'verify the editable slot and prismatic solid after native Open';
  await f.openExtrudeHud();
  const solid = await f.applyExtrude({ distance: height, previous: finished.doc, label: '04-extruded-slot' });
  const native = await f.inspect('04-native-slot', solid.doc);
  assert.equal(native.count, 1);
  assert.equal(native.check.valid, true);
  const expectedVolume = height * (2 * r * 16.25 + Math.PI * r * r);
  near(native.mass.volume, expectedVolume);
  near((await f.bodies()).bodies[0].volume, expectedVolume);
  [15.875, 3, 1].forEach((v, i) => near(native.mass.centroid[i], v));
  const cylinders = native.supports.filter(support => support.kind === 'cylinder').sort((left, right) => left.c[0] - right.c[0]);
  assert.equal(cylinders.length, 2);
  cylinders.forEach((support, i) => {
    near(support.r, r);
    near(support.c[0], [a, b][i][0]);
    near(support.c[1], 3);
  });
  await f.undo();
  await f.same(finished.doc);
  await f.redo();
  await f.same(solid.doc);
  const saved = await f.save('calculated-slot');
  await f.freshOpen(saved.file, solid.doc, '05-reopened-slot');
  assert.deepEqual(await f.inspect('05-reopened-native-slot', solid.doc), native);
  f.report.observations.push({ a, b, radius: r, volumeMm3: native.mass.volume, expectedVolume, centroid: native.mass.centroid });
});
