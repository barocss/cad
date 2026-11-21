import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const centre = [7, -4], radius = 5, height = 20;
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: centre, radius },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const f = await createFlow({
  name: 'circular-wall-offset', envFrozen: 'CIRCULAR_WALL_FROZEN', output: process.argv[2],
  qualification: 'Offset the complete cylindrical wall through a real face pick, native History and Save/Open.',
  initialFiles: [
    'apps/cad-studio/test/circular-wall-offset-browser.mjs',
    'packages/barocss-cad/src/features/bored-cap-offset.ts',
    'packages/barocss-cad/src/part/part-model.ts',
    'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
    'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
    'packages/barocss-cad-model/src/app/profileCommands.ts',
    'packages/barocss-cad-model/src/engine/doc.ts',
    'packages/barocss-cad-model/src/engine/references.ts',
    'packages/barocss-cad-model/src/engine/rematch.ts',
  ],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const owners = [brep.bodies, brep.shells, brep.loops, brep.coedges,
  brep.faces.map(({ surface, ...face }) => [face, surface.id]),
  brep.edges.map(({ curve, ...edge }) => [edge, curve.id]), brep.vertices.map(vertex => vertex.id)];
const supports = brep.faces.map(face => ({ name: face.name, geometry: faceGeometry(face) }));
console.log(JSON.stringify({ brep, owners, supports, mass: brepMassProperties(brep, 1), check: checkBrep(brep, { strict: true }) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const dialog = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, expected) => panel.locator('.status').filter({ hasText: new RegExp('^' + expected + '$') }).waitFor();
const near = (measured, expected, tolerance = 1e-8) => assert.ok(Math.abs(measured - expected) < tolerance, measured + ' != ' + expected);

async function measure(label, doc, radialOffset, original) {
  const native = await f.inspect(label, doc), expectedRadius = radius + radialOffset;
  assert.ok(native.check.valid, native.check.issues.join(', '));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
  const cylinders = native.supports.filter(face => face.geometry.kind === 'cylinder');
  const planes = native.supports.filter(face => face.geometry.kind === 'plane');
  assert.equal(cylinders.length, 2);
  assert.equal(planes.length, 2);
  for (const { geometry: g } of cylinders) {
    assert.equal(g.out, 1);
    near(g.c[0], centre[0]); near(g.c[1], centre[1]); near(Math.abs(g.a[2]), 1);
    near(g.r, expectedRadius);
  }
  const capLevels = planes.map(({ geometry }) => geometry.o[2]).sort((a, b) => a - b);
  assert.deepEqual(capLevels, [0, height]);
  const volume = Math.PI * expectedRadius ** 2 * height;
  near(native.mass.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  native.mass.centroid.forEach((value, axis) => near(value, [...centre, height / 2][axis]));
  if (original) assert.deepEqual(native.owners, original.owners);
  f.report.observations.push({ label, radialOffset, capLevels, expectedRadius, volume, measuredVolume: native.mass.volume,
    trimGap: native.check.maximumPcurveGap, wallNames: cylinders.map(face => face.name) });
  return native;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    return context;
  };
  const stock = join(f.output, 'original-cylinder.bcad');
  await writeFile(stock, JSON.stringify(source));
  await f.freshOpen(stock, source, 'cylinder-original');
  const original = await measure('original-native', source, 0);

  f.phase = 'select the cylindrical wall and apply a positive radial offset';
  await button('Front').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [centre[0], centre[1] - radius, height / 2]);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.faces.length === 1);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const instance = dialog('Offset face');
  await instance.getByText('Cylindrical wall · Radial', { exact: true }).waitFor();
  assert.equal(await instance.getByLabel('Mode', { exact: true }).count(), 0);
  await instance.getByLabel('Offset', { exact: true }).fill('2');
  await status(instance, 'preview');
  await f.same(source);
  await f.snapshot('cylinder-radial-preview');
  await button('Apply', instance).click();
  await f.changed(source);
  const expanded = await f.doc(), node = expanded.nodes.at(-1);
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(expanded.nodes.slice(0, -1), source.nodes);
  assert.equal(node.sigs[node.faces[0]].r, radius);
  await measure('expanded-native', expanded, 2, original);
  await f.snapshot('cylinder-radial-expanded');

  f.phase = 'refuse radial collapse and edit a negative radial distance in History';
  await f.openFeatureEditor(2, 'radial Offset face');
  await button('Edit offset', f.editor()).click();
  const history = dialog('Edit Offset face'), distance = history.getByLabel('Offset', { exact: true });
  assert.equal(await history.getByLabel('Mode', { exact: true }).count(), 0);
  await distance.fill(String(-radius));
  await status(history, 'refused');
  const error = history.locator('.hud-error');
  if (await error.locator('summary').count()) await error.locator('summary').click();
  assert.match(await error.innerText(), /reach or cross the cylinder axis/i);
  assert.ok(await button('Apply', history).isDisabled());
  await f.same(expanded);
  await f.snapshot('cylinder-radial-collapse-refused');
  await distance.fill('-1');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(expanded);
  const reduced = await f.doc();
  assert.deepEqual(reduced.nodes.at(-1), { ...node, distance: -1 });
  const accepted = await measure('reduced-native', reduced, -1, original);
  await f.undo();
  await f.same(expanded);
  await f.redo();
  await f.same(reduced);
  const saved = await f.save('cylinder-radial-offset');
  await f.freshOpen(saved.file, reduced, 'cylinder-radial-reopened');
  const reopened = await measure('reopened-native', reduced, -1, original);
  assert.deepEqual(reopened.brep, accepted.brep);
});
