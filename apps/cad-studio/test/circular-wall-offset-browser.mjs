import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const bore = process.argv.includes('--bore');
const centre = bore ? [11, 9] : [7, -4], radius = bore ? 3 : 5, height = bore ? 10 : 20;
const plate = [40, 30], area = plate[0] * plate[1];
const first = bore ? 1 : 2, second = bore ? -2 : -1;
const feature = bore ? 'bore' : 'cylinder';
const name = bore ? 'Cylindrical bore · Radial' : 'Cylindrical wall · Radial';
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    bore ? { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: plate }
      : { id: 'n0', kind: 'sketch', profile: 'circle', center: centre, radius },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
    ...(bore ? [{ id: 'n2', kind: 'hole', center: centre, radius, parent: { node: 1, side: 'solid' } }] : []),
  ],
  outputs: bore ? { b2: { node: 2, side: 'solid' } } : { b1: { node: 1, side: 'solid' } }, nextId: bore ? 3 : 2,
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
const owners = [brep.bodies, brep.shells, brep.loops,
  brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]),
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
  const native = await f.inspect(label, doc), expectedRadius = radius + (bore ? -radialOffset : radialOffset);
  assert.ok(native.check.valid, native.check.issues.join(', '));
  const expected = bore ? { faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 }
    : { faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 };
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, ...expected });
  const cylinders = native.supports.filter(face => face.geometry.kind === 'cylinder');
  const planes = native.supports.filter(face => face.geometry.kind === 'plane');
  assert.equal(cylinders.length, 2);
  assert.equal(planes.length, bore ? 6 : 2);
  for (const { geometry: g } of cylinders) {
    assert.equal(g.out, bore ? -1 : 1);
    near(g.c[0], centre[0]); near(g.c[1], centre[1]); near(Math.abs(g.a[2]), 1);
    near(g.r, expectedRadius);
  }
  const capLevels = planes.filter(({ geometry }) => Math.abs(geometry.n[2]) > .99)
    .map(({ geometry }) => geometry.o[2]).sort((a, b) => a - b);
  assert.deepEqual(capLevels, [0, height]);
  const circularArea = Math.PI * expectedRadius ** 2;
  const volume = (bore ? area - circularArea : circularArea) * height;
  near(native.mass.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  const centroid = bore ? plate.map((side, i) => (area * side / 2 - circularArea * centre[i]) / (area - circularArea)) : centre;
  native.mass.centroid.forEach((value, axis) => near(value, [...centroid, height / 2][axis]));
  if (original) {
    assert.deepEqual(native.owners, original.owners);
    if (bore) {
      const planesOf = result => result.brep.faces.filter(face => planes.some(plane => plane.name === face.name));
      assert.deepEqual(planesOf(native), planesOf(original));
    } else assert.deepEqual(native.brep.coedges, original.brep.coedges);
  }
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
  const stock = join(f.output, 'original-' + feature + '.bcad');
  await writeFile(stock, JSON.stringify(source));
  await f.freshOpen(stock, source, feature + '-original');
  const original = await measure('original-native', source, 0);

  f.phase = 'select the cylindrical wall and apply a positive radial offset';
  await button(bore ? 'Iso' : 'Front').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const pixel = await f.page.evaluate(({ bore, centre, radius, height }) => {
    if (!bore) return window.__studioScreenOf([centre[0], centre[1] - radius, height / 2]);
    const { yaw } = window.__studioCamera();
    return window.__studioScreenOf([centre[0] - radius * Math.cos(yaw), centre[1] - radius * Math.sin(yaw), height - 1]);
  }, { bore, centre, radius, height });
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.faces.length === 1);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const instance = dialog('Offset face');
  await instance.getByText(name, { exact: true }).waitFor();
  assert.equal(await instance.getByLabel('Mode', { exact: true }).count(), 0);
  await instance.getByLabel('Offset', { exact: true }).fill(String(first));
  await status(instance, 'preview');
  await f.same(source);
  await f.snapshot(feature + '-radial-preview');
  await button('Apply', instance).click();
  await f.changed(source);
  const expanded = await f.doc(), node = expanded.nodes.at(-1);
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(expanded.nodes.slice(0, -1), source.nodes);
  assert.equal(node.sigs[node.faces[0]].r, radius);
  await measure('first-native', expanded, first, original);
  await f.snapshot(feature + '-radial-applied');

  f.phase = 'refuse radial collapse and edit a negative radial distance in History';
  await f.openFeatureEditor(source.nodes.length, 'radial Offset face');
  await button('Edit offset', f.editor()).click();
  const history = dialog('Edit Offset face'), distance = history.getByLabel('Offset', { exact: true });
  assert.equal(await history.getByLabel('Mode', { exact: true }).count(), 0);
  async function refuse(value, reason, label) {
    await distance.fill(String(value));
    await status(history, 'refused');
    const error = history.locator('.hud-error').filter({ hasText: reason });
    await error.waitFor();
    const detail = error.locator('details:not([open]) > summary');
    if (await detail.count()) await detail.click();
    assert.match(await error.innerText(), reason);
    assert.ok(await button('Apply', history).isDisabled());
    await f.same(expanded);
    await f.snapshot(feature + '-' + label);
  }
  await refuse(bore ? radius : -radius, bore ? /bore axis/i : /reach or cross the cylinder axis/i, 'radial-collapse-refused');
  if (bore) await refuse(radius - Math.min(...centre), /outer plate wall/i, 'wall-contact-refused');
  await distance.fill(String(second));
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(expanded);
  const reduced = await f.doc();
  assert.deepEqual(reduced.nodes.at(-1), { ...node, distance: second });
  const accepted = await measure('second-native', reduced, second, original);
  await f.undo();
  await f.same(expanded);
  await f.redo();
  await f.same(reduced);
  const saved = await f.save(feature + '-radial-offset');
  await f.freshOpen(saved.file, reduced, feature + '-radial-reopened');
  const reopened = await measure('reopened-native', reduced, second, original);
  assert.deepEqual(reopened.brep, accepted.brep);
});
