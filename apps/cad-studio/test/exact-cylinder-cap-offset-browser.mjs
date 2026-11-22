import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const cap = 'n0.v-max', originalHeight = 12;
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{
    id: 'n0', kind: 'thicken', name: 'Semicylinder', thickness: 2, side: 'reverse', mode: 'exact-cylinder',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, originalHeight]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    },
  }],
  outputs: { b0: { node: 0, side: 'solid' } },
};
const pins = [
  'apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
  'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/exact-cylinder-cap-offset.ts',
  'packages/barocss-cad/src/brep/thicken-cylinder.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'exact-cylinder-cap-offset', envFrozen: 'D1646_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Offset one original Exact semicylinder cap, edit a signed distance and reopen the native solid.',
  limits: ['Two-quarter upright Exact cylinder Thicken. Signed offset of its original upper cap. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bodies = partBreps(doc), [{ brep }] = bodies;
const report = checkBrep(brep, { strict: true });
const evaluated = evaluateDoc(doc, 0);
const meshFaces = evaluated.ok && evaluated.bodies[0].mesh.faces.map(({ name, index }) => [name, index]);
console.log(JSON.stringify({ bodies: bodies.length, brep, report, meshFaces, digest: digestOf(brep),
  geometry: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])),
  mass: brepMassProperties(brep, 1) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const offset = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (got, want, tolerance = 1e-8) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);

async function check(label, doc, height, original) {
  const item = await f.inspect(label, doc);
  const { report, brep, geometry, mass } = item;
  assert.equal(item.bodies, 1);
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology[0]?.genus, 0);
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.deepEqual([geometry[cap].kind, geometry[cap].n, geometry[cap].o[2]], ['plane', [0, 0, 1], height]);
  assert.deepEqual([geometry['n0.v-min'].kind, geometry['n0.v-min'].n, geometry['n0.v-min'].o[2]], ['plane', [0, 0, -1], 0]);
  for (const [name, radius, sense] of [['n0.normal', 10, 1], ['n0.reverse', 8, -1]]) {
    const wall = geometry[name];
    assert.deepEqual([wall.kind, wall.a, wall.out], ['cylinder', [0, 0, 1], sense]);
    near(wall.r, radius);
    near(wall.c[0], 20);
    near(wall.c[1], 20);
  }
  const volume = 18 * Math.PI * height;
  const centroid = [20, 20 + 488 / (27 * Math.PI), height / 2];
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  near(mass.volume, volume);
  centroid.forEach((value, axis) => {
    near(mass.centroid[axis], value);
    near(bodies[0].centroid[axis], value);
  });
  if (original) {
    const source = original.brep;
    const upper = ([x, y, z]) => [x, y, z === originalHeight ? height : z];
    const before = { ...source,
      vertices: source.vertices.map(vertex => ({ ...vertex, point: upper(vertex.point) })),
      edges: source.edges.map(edge => ({ ...edge, curve: { ...edge.curve, controlPoints: edge.curve.controlPoints.map(upper) } })),
      faces: source.faces.map(face => ({ ...face,
        surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(upper)) } })),
    };
    assert.deepEqual(brep, before);
  }
  f.report.observations.push({ label, height, volume, nativeVolume: mass.volume, studioVolume: bodies[0].volume,
    nativeCentroid: mass.centroid, digest: item.digest, gap: report.maximumEdgeSurfaceGap });
  return item;
}

await f.run(async () => {
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [file] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await file.setFiles({ name: 'exact-semicylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const original = await check('01-source-native', seed, 12);
  f.phase = 'Select the original upper cap';
  await button('Top', f.page.getByRole('group', { name: 'Views', exact: true })).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const pick = await f.page.evaluate(() => window.__studioScreenOf([20, 29, 12]));
  assert.ok(pick && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pick));
  await f.page.mouse.click(...pick);
  const capIndex = original.meshFaces.find(([name]) => name === cap)[1];
  await f.page.waitForFunction(index => {
    const selected = window.__studioSelection.selection.faces;
    return selected.length === 1 && selected[0].face === index;
  }, capIndex);
  await f.snapshot('01-selected-upper-cap');
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).inputValue(), 'distance');
  assert.match(await panel.innerText(), /n0\.v-max.*Outward \+Z/s);

  f.phase = 'Drag the normal handle and apply a 2 mm offset';
  const delta = await f.page.evaluate(() => {
    const a = window.__studioScreenOf([20, 29, 12]), b = window.__studioScreenOf([20, 29, 13]);
    return b.map((value, i) => value - a[i]);
  });
  assert.ok(Math.hypot(...delta) > 8, delta);
  const handle = await f.page.locator('g.gizmo-handle[data-handle="d"] polygon').evaluate(polygon => {
    const svg = polygon.closest('svg').getBoundingClientRect(), points = [...polygon.points];
    return [svg.x + points.reduce((sum, p) => sum + p.x, 0) / points.length,
      svg.y + points.reduce((sum, p) => sum + p.y, 0) / points.length];
  });
  await f.page.mouse.move(...handle);
  await f.page.mouse.down();
  await f.page.mouse.move(...handle.map((value, i) => value + delta[i]), { steps: 6 });
  await f.page.mouse.up();
  assert.equal(await offset(panel).inputValue(), '3');
  await status(panel, 'preview');
  await f.same(seed);
  await f.snapshot('02-dragged-preview');
  await offset(panel).fill('2');
  await status(panel, 'preview');
  await button('Apply', panel).click();
  await f.changed(seed);
  const outward = await f.doc(), node = outward.nodes[1];
  assert.deepEqual(outward.nodes[0], seed.nodes[0]);
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(node.parent, { node: 0, side: 'solid' });
  assert.deepEqual(node.faces, [cap]);
  assert.equal(node.distance, 2);
  assert.ok(node.sigs[cap]);
  assert.equal(node.target, undefined);
  await check('03-outward-native', outward, 14, original);
  await f.snapshot('03-applied-upper-cap');

  await f.openFeatureEditor(1, 'upper cap Offset');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  await status(edit, 'preview');
  assert.equal(await offset(edit).inputValue(), '2');
  assert.equal(await edit.getByLabel('Mode', { exact: true }).inputValue(), 'distance');
  f.phase = 'Reject collapse and apply the inward History edit';
  await offset(edit).fill('-12');
  await status(edit, 'refused');
  assert.ok(await button('Apply', edit).isDisabled());
  await f.same(outward);
  const error = edit.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /opposite cap/i);
  await f.snapshot('04-collapse-refused');

  await offset(edit).fill('-3');
  await status(edit, 'preview');
  await button('Apply', edit).click();
  await f.changed(outward);
  const inward = await f.doc();
  assert.deepEqual(inward.nodes[1], { ...node, distance: -3 });
  const expected = await check('05-inward-native', inward, 9, original);
  await f.undo();
  await f.same(outward);
  await f.redo();
  await f.same(inward);
  const saved = await f.save('exact-semicylinder-cap-offset');
  await f.freshOpen(saved.file, inward, '06-native-fresh-open');
  const reopened = await check('06-reopened-native', await f.doc(), 9, original);
  assert.equal(reopened.digest, expected.digest);
  await f.openFeatureEditor(1, 'reopened upper cap Offset');
  await button('Edit offset', f.editor()).click();
  assert.equal(await offset(hud('Edit Offset face')).inputValue(), '-3');
  await f.snapshot('07-reopened-distance');
  await button('Cancel', hud('Edit Offset face')).click();
  await f.same(inward);
});
