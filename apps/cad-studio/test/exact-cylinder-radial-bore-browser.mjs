import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const surface = {
  degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
  controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
};
const target = { node: 0, side: 'solid' }, tool = { node: 2, side: 'solid' };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [
    { id: 'n0', kind: 'thicken', name: 'Semicylinder', thickness: 2, side: 'reverse', mode: 'exact-cylinder', surface },
    { id: 'n1', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 1.5,
      plane: { origin: [20, 25, 6], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { id: 'n2', kind: 'extrude', sketch: 1, height: 8 },
  ],
  outputs: { b0: target, b2: tool },
};
const pins = [
  'apps/cad-studio/test/exact-cylinder-radial-bore-browser.mjs', 'apps/cad-studio/test/model-rail-helper.mjs',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts', 'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts', 'packages/barocss-cad/src/brep/thicken-cylinder.ts',
];
const f = await createFlow({
  name: 'exact-cylinder-radial-bore', output: process.argv[2], envFrozen: 'D1644_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Subtract a radial cylinder from an Exact semicylinder Thicken, edit its diameter and reopen the native part.',
  limits: ['One upright two-quarter semicylinder and one perpendicular, centered bore at diameters 3 and 4 mm. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const report = checkBrep(brep, { strict: true });
  const openings = Object.fromEntries(brep.faces.filter(face => face.name === 'n0.normal' || face.name === 'n0.reverse').map(face => [
    face.name, face.loops.map(id => brep.loops.find(loop => loop.id === id)).filter(loop => loop.kind === 'inner')
      .map(loop => loop.coedges.map(id => {
        const use = brep.coedges.find(coedge => coedge.id === id);
        const twin = brep.coedges.find(coedge => coedge.id === use.twin);
        const mate = brep.loops.find(loop => loop.id === twin.loop).face;
        const { curve } = brep.edges.find(edge => edge.id === use.edge);
        const [a, b] = curveDomain(curve);
        const samples = Array.from({ length: 17 }, (_, i) => evaluateCurve(curve, a + (b - a) * i / 16));
        return { mate: brep.faces.find(face => face.id === mate).name, samples };
      })),
  ]));
  return { key, valid: report.valid, genus: report.topology[0]?.genus, counts: report.counts,
    volume: brepMassProperties(brep, 1).volume, digest: digestOf(brep),
    geometry: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face, 30)])), openings };
})));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const near = (got, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(got - expected) < tolerance, `${got} != ${expected} within ${tolerance}`);
const boreFaces = ['n2.side0#1', 'n2.side0#2'];
const faceNames = ['n0.normal', 'n0.reverse', 'n0.u-max', 'n0.u-min', 'n0.v-max', 'n0.v-min', ...boreFaces];

function expectedVolume(radius) {
  // Integrate the vertical bore chords over the difference of the two positive-Y cylinder roots.
  const intervals = 512, step = Math.PI / (2 * intervals);
  let sum = 0;
  for (let i = 0; i <= intervals; i++) {
    const angle = i * step, x = radius * Math.sin(angle);
    const depth = Math.sqrt(100 - x * x) - Math.sqrt(64 - x * x);
    const weight = i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2;
    sum += weight * 4 * (radius * Math.cos(angle)) ** 2 * depth;
  }
  return 216 * Math.PI - sum * step / 3;
}

async function check(label, doc, radius) {
  assert.deepEqual(doc.nodes, [seed.nodes[0], { ...seed.nodes[1], radius }, seed.nodes[2],
    { id: 'n3', kind: 'difference', parent: target, tool }]);
  assert.deepEqual(doc.outputs, { b3: { node: 3, side: 'solid' } });
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [part] = rows;
  assert.deepEqual([part.key, part.valid, part.genus], ['b3', true, 1]);
  assert.deepEqual(part.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, edges: 30, coedges: 60, vertices: 24 });
  assert.deepEqual(Object.keys(part.geometry).sort(), faceNames);

  for (const name of boreFaces) {
    const bore = part.geometry[name];
    assert.deepEqual([bore.kind, bore.a, bore.out], ['cylinder', [0, 1, 0], -1]);
    near(bore.r, radius);
    near(bore.c[0], 20);
    near(bore.c[2], 6);
  }
  const residuals = [];
  for (const [name, wallRadius, sense] of [['n0.normal', 10, 1], ['n0.reverse', 8, -1]]) {
    const wall = part.geometry[name];
    assert.deepEqual([wall.kind, wall.a, wall.out], ['cylinder', [0, 0, 1], sense]);
    near(wall.r, wallRadius);
    near(wall.c[0], 20);
    near(wall.c[1], 20);
    assert.equal(part.openings[name].length, 1);
    const [rim] = part.openings[name];
    assert.equal(rim.length, 8);
    assert.deepEqual([...new Set(rim.map(edge => edge.mate))].sort(), boreFaces);
    const points = rim.flatMap(edge => edge.samples);
    for (const [x, y, z] of points) {
      assert.ok(y > 20);
      residuals.push(Math.abs(Math.hypot(x - 20, y - 20) - wallRadius));
      residuals.push(Math.abs(Math.hypot(x - 20, z - 6) - radius));
    }
    for (const z of [6 - radius, 6 + radius]) {
      assert.ok(points.some(p => Math.hypot(p[0] - 20, p[1] - 20 - wallRadius, p[2] - z) < 1e-8));
    }
  }
  const maxResidual = Math.max(...residuals);
  near(maxResidual, 0);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  const volumeReference = expectedVolume(radius);
  near(part.volume, volumeReference);
  near(bodies[0].volume, volumeReference);
  return { part, maxResidual, volumeReference, studioVolume: bodies[0].volume };
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
  const input = join(f.output, 'semicylinder-radial-cutter.bcad');
  await writeFile(input, JSON.stringify(seed));
  await f.freshOpen(input, seed, '01-input');
  await button('Front').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();

  const bodies = f.page.locator('.outliner .ol-row > button.ol');
  assert.equal(await bodies.count(), 2);
  f.phase = 'Subtract through the radial wall';
  await bodies.filter({ hasText: 'Semicylinder' }).click();
  await bodies.nth(1).click({ modifiers: ['Shift'] });
  await clickModelCommand(f.page, 'Combine', 'Subtract');
  await f.changed(seed);
  const cut = await f.doc(), first = await check('02-cut-native', cut, 1.5);
  await f.snapshot('02-inner-opening');

  await f.openFeatureEditor(2, 'radial cutter Extrude');
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  assert.equal(await diameter.inputValue(), '3');
  await diameter.fill('4');
  await f.snapshot('03-edit-diameter');
  await f.applyEditor(cut, '04-applied-diameter');
  const edited = await f.doc(), second = await check('04-edited-native', edited, 2);
  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('semicylinder-radial-bore');
  await f.freshOpen(saved.file, edited, '05-fresh-open');
  assert.deepEqual(await check('05-reopened-native', await f.doc(), 2), second);
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Back', exact: true }).click();
  await f.page.locator('.vc-label').getByText('BACK', { exact: true }).waitFor();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('06-reopened-outer-opening');
  f.report.observations.push({ diameters: [3, 4], digests: [first.part.digest, second.part.digest],
    nativeVolumes: [first.part.volume, second.part.volume], studioVolumes: [first.studioVolume, second.studioVolume],
    expectedVolumes: [first.volumeReference, second.volumeReference], maxResiduals: [first.maxResidual, second.maxResidual] });
});
