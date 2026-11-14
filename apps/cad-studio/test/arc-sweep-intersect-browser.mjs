import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/editFields.ts'];
const f = await createFlow({
  name: 'arc-sweep-intersect', output: process.argv[2], envFrozen: 'D1293_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Intersect a native quarter-torus Sweep with a box and regenerate its exact radial cut.',
  limits: ['Desktop WebGPU. One radial plane through the rotation axis and disk radii 2 and 2.5 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
const { brep } = out, report = checkBrep(brep, { strict: true });
const { volume, centroid, method } = massPropertiesOf(out);
const cut = brep.faces.find(face => face.name === 'n3.bottom');
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const rim = cut?.loops.flatMap(loop => loops.get(loop).coedges).map(id => {
  const use = uses.get(id), twin = uses.get(use.twin), edge = edges.get(use.edge), [a, b] = curveDomain(edge.curve);
  return { degree: edge.curve.degree, paired: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
    samples: Array.from({ length: 17 }, (_, i) => evaluateCurve(edge.curve, a + (b - a) * i / 16)) };
});
const wall = brep.faces.filter(face => face.surface.degreeU === 2 && face.surface.degreeV === 2).map(face => {
  const { u, v } = surfaceDomain(face.surface);
  return [.17,.43,.72].flatMap(a => [.21,.58,.87].map(b =>
    evaluateSurface(face.surface, u[0] + (u[1] - u[0]) * a, v[0] + (v[1] - v[0]) * b)));
});
console.log(JSON.stringify({ source: brep.source.family, valid: report.valid, counts: report.counts, genus: report.topology[0].genus,
  volume, centroid, method, rim, wall, faces: brep.faces.map(face => face.name) }));
`,
});
const axis = Math.SQRT1_2;
const rail = { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[20,0,0],[20,0,20],[0,0,20]], weights: [1,.707106781,1] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [7,8], radius: 2 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', mode: 'exact', path: rail },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [-10,-5], max: [10,35], plane: { origin: [0,0,0], normal: [axis,0,-axis], xAxis: [0,1,0] } },
    { id: 'n3', kind: 'extrude', sketch: 2, height: 50 }],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) <= 1e-7;
async function open(file) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
}
async function verify(doc, radius, label) {
  assert.deepEqual(doc.nodes[1], seed.nodes[1]);
  assert.deepEqual(doc.nodes[4].left, { node: 1, side: 'solid' });
  assert.deepEqual(doc.nodes[4].right, { node: 3, side: 'solid' });
  assert.equal(doc.nodes[4].kind, 'intersect');
  const result = await f.inspect(label, doc), angle = Math.PI / 4;
  const volume = Math.PI * radius ** 2 * 20 * angle, effective = 20 + radius ** 2 / 80;
  const centroid = [effective * Math.sin(angle) / angle, 0, effective * (1 - Math.cos(angle)) / angle];
  assert.ok(result.valid && result.source === 'analytic-boolean' && result.genus === 0, JSON.stringify(result));
  assert.deepEqual(result.counts, { bodies:1, shells:1, faces:4, loops:4, coedges:12, edges:6, vertices:4 });
  assert.ok(result.faces.includes('n1.start') && result.faces.includes('n3.bottom'));
  assert.ok(near(result.volume, volume), JSON.stringify({ measured: result.volume, volume }));
  assert.ok(result.centroid.every((value, axis) => near(value, centroid[axis])));
  assert.equal(result.rim.length, 2);
  for (const item of result.rim) {
    assert.equal(item.degree, 2);
    assert.ok(item.paired && item.samples.every(([x,y,z]) => near(x, z) && near(Math.hypot(x - 20 * axis, y, z - 20 * axis), radius)));
  }
  assert.equal(result.wall.length, 2);
  for (const points of result.wall) {
    assert.ok(points.every(([x,y,z]) => near(Math.hypot(Math.hypot(x, z) - 20, y), radius)));
  }
  const read = await f.bodies();
  assert.equal(read.bodies.length, 1);
  assert.ok(near(read.bodies[0].volume, volume));
  f.report.observations.push({ label, radius, expected: { volume, centroid }, result });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'D1293-torus-and-box.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Sweep along Quarter rail', browser).click();
  await button('Extrude 50', browser).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  f.phase = 'intersect with box';
  await f.command('Intersect');
  await f.changed(seed);
  const cut = (await f.snapshot('radial-clip')).doc;
  await verify(cut, 2, 'native-radial-clip');
  await f.openFeatureEditor(1, 'upstream circular Sweep');
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('40');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
  await f.same(cut);
  await verify(cut, 2, 'refused-pinch-retains-clip');
  await diameter.fill('5');
  const edited = (await f.applyEditor(cut, 'edit-diameter-and-reclip')).doc;
  assert.equal(edited.nodes[0].radius, 2.5);
  assert.deepEqual(edited.nodes.slice(1), cut.nodes.slice(1));
  await verify(edited, 2.5, 'native-edited-clip');
  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('arc-sweep-intersection');
  await f.newPage();
  await open(saved.file);
  await f.same(edited);
  await verify(await f.doc(), 2.5, 'opened-native-clip');
  await f.snapshot('reopened-radial-clip');
});
