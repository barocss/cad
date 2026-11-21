import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/two-point-snap-line-browser.mjs',
  'apps/cad-studio/src/sketch/useTwoPointSnap.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
];
const f = await createFlow({
  name: 'two-point-snap-line', output: process.argv[2], envFrozen: 'D1613_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Use the calculated point as the first point of Line, then close the profile and reopen its native extrusion.',
  limits: ['One XY triangle and a separate construction segment.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const bodies = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const [{ brep }] = bodies;
console.log(JSON.stringify({ count: bodies.length, check: checkBrep(brep, { strict: true }),
  mass: brepMassProperties(brep, 1), vertices: brep.vertices.map(vertex => vertex.point),
}));
`,
});
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const start = () => button(f.sketchPanel(), 'Two-point snap');
const form = () => f.page.getByRole('form', { name: 'Two-point snap', exact: true });
const point = (index, axis) => f.sketchPanel().getByLabel(`Point ${index} ${axis}`, { exact: true });
const corners = [[7.75, 3], [22, 3], [22, 12]];
const basis = [[0, 0], [31, 12]];
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
  await button(f.page.locator('.mode'), 'Sketch').click();
  await f.sketchPanel().waitFor();
  await f.frame([...basis, ...corners]);
  await f.tool('Line', 'l');
  await f.page.keyboard.press('x');
  for (const reference of basis) await f.worldClick(reference);
  await f.page.keyboard.press('x');
  await f.tool('Rectangle', 'r');
  await f.tool('Line', 'l');

  f.phase = 'cancel a partial calculation and obtain a fresh first point';
  await start().click();
  await f.worldClick(basis[0]);
  await f.page.keyboard.press('Escape');
  await form().waitFor({ state: 'hidden' });
  await start().click();
  await form().getByText('Pick the first endpoint.', { exact: true }).waitFor();
  for (const reference of basis) await f.worldClick(reference);
  const value = form().getByLabel('Snap value');
  await value.fill('0.25');
  await form().getByText('Point 7.75, 3 mm', { exact: true }).waitFor();
  await f.page.locator('.vp-overlay .sk-osnap').filter({ hasText: 'Calculated' }).waitFor();
  await f.same(empty);
  await f.snapshot('01-calculated-first-point');

  f.phase = 'transfer the start exactly once and close the normal Line chain';
  await value.press('Enter');
  await form().waitFor({ state: 'hidden' });
  await point(1, 'X').waitFor();
  assert.equal(Number(await point(1, 'X').inputValue()), 7.75);
  assert.equal(Number(await point(1, 'Y').inputValue()), 3);
  assert.equal(await point(2, 'X').count(), 0);
  assert.equal(await start().count(), 0);
  await f.worldClick(corners[1]);
  await f.worldClick(corners[2]);
  await f.worldClick(corners[0]);
  assert.equal(await point(4, 'X').count(), 0);
  await f.snapshot('02-closed-line-profile');
  const finished = await f.finishSketch('03-finished-line-profile');
  const [sketch] = finished.doc.nodes;
  assert.equal(sketch.profile, 'polygon');
  assert.deepEqual(sketch.points, corners);
  assert.deepEqual(sketch.construction.map(shape => shape.points), [basis]);
  assert.equal(sketch.association, undefined);

  f.phase = 'extrude the calculated profile and reopen the accepted exact solid';
  await f.openExtrudeHud();
  const solid = await f.applyExtrude({ distance: 2, previous: finished.doc, label: '04-extruded-profile' });
  const native = await f.inspect('04-native-profile', solid.doc);
  const area = (22 - 7.75) * (12 - 3) / 2;
  assert.equal(native.count, 1);
  assert.equal(native.check.valid, true);
  assert.equal(native.vertices.length, 6);
  assert.ok(corners.every(([x, y]) => [0, 2].every(z => native.vertices.some(p => p[0] === x && p[1] === y && p[2] === z))));
  near(native.mass.volume, 2 * area);
  near((await f.bodies()).bodies[0].volume, 2 * area);
  [17.25, 6, 1].forEach((v, i) => near(native.mass.centroid[i], v));
  await f.undo();
  await f.same(finished.doc);
  await f.redo();
  await f.same(solid.doc);
  const saved = await f.save('calculated-line-start');
  await f.freshOpen(saved.file, solid.doc, '05-reopened-line-start');
  assert.deepEqual(await f.inspect('05-reopened-native', solid.doc), native);
  f.report.observations.push({ corners, areaMm2: area, volumeMm3: native.mass.volume, centroid: native.mass.centroid });
});
