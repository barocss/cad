import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const sector = process.argv.includes('--sector');
const profile = sector ? [[40, -14], [40, 6], [24, -6]] : [[36, -6], [28, 0], [22, -8]];
const grid = profile.map(([x, y]) => [[x, y, -2], [x, y, 10]]);
const weight = sector ? 1 / Math.sqrt(5) : Math.SQRT1_2;
const sweep = sector ? 2 * Math.atan(2) : Math.PI / 2;
const patch = sector ? 'sector' : 'quarter';
const patchName = `Upright ${patch} cylinder`;
const source = `@model cylinder {version:0;length-unit:mm; @surface #${patch} {type:nurbs;degree-u:2;degree-v:1;knots-u:[-2,-2,-2,6,6,6];knots-v:[1,1,7,7];control-points:${JSON.stringify(grid)};weights:[[1,1],[${weight},${weight}],[1,1]];}}`;
const input = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: { sources: { source }, objects: [{ id: `${patch}-1`, name: patchName, source: 'source', geometry: patch }] },
};
const pins = [
  'apps/cad-studio/test/exact-cylinder-thicken-browser.mjs', 'packages/barocss-cad-model/src/app/thickenCommand.ts',
  'packages/barocss-cad-model/src/engine/thicken.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/thicken-cylinder.ts', 'packages/barocss-cad/src/part/part-shell.ts', 'packages/barocss-cad/src/api/spec.ts',
];
const f = await createFlow({
  name: 'exact-cylinder-thicken', output: process.argv[2], envFrozen: sector ? 'D1633_SOURCE_FROZEN' : 'D1632_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Thicken an open upright ${(sweep * 180 / Math.PI).toFixed(2)}-degree cylinder inward, edit its thickness, and reopen the exact solid in Studio.`,
  limits: ['One canonical rational circular span and one linear axial span. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const report = checkBrep(brep, { strict: true });
  return { key, valid: report.valid, counts: report.counts, genus: report.topology[0]?.genus,
    volume: brepMassProperties(brep, 1).volume,
    faces: brep.faces.map(face => ({ name: face.name, geometry: faceGeometry(face, 20) })).sort((a, b) => a.name.localeCompare(b.name)),
    vertices: brep.vertices.map(v => v.point), digest: digestOf(brep) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const hud = () => f.page.getByRole('dialog', { name: 'Thicken', exact: true });
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const names = ['normal', 'reverse', 'u-max', 'u-min', 'v-max', 'v-min'].map(name => 'n0.' + name);

async function verify(label, doc, thickness) {
  assert.equal(doc.nodes.length, 1);
  assert.deepEqual([doc.nodes[0].kind, doc.nodes[0].mode, doc.nodes[0].side, doc.nodes[0].thickness], ['thicken', 'exact-cylinder', 'reverse', thickness]);
  assert.deepEqual(doc.nodes[0].surface.controlPoints, grid);
  assert.deepEqual(doc.nodes[0].surface.weights, [[1, 1], [weight, weight], [1, 1]]);
  assert.deepEqual(doc.direct, input.direct);
  const [solid] = await f.inspect(label, doc);
  assert.deepEqual([solid.key, solid.valid, solid.genus, solid.counts.bodies, solid.counts.faces, solid.counts.edges, solid.counts.vertices],
    ['b0', true, 0, 1, 6, 12, 8]);
  assert.deepEqual(solid.faces.map(face => face.name).sort(), names);
  const byName = new Map(solid.faces.map(face => [face.name, face.geometry]));
  const inner = 10 - thickness;
  for (const [face, radius, orientation] of [['n0.normal', 10, 1], ['n0.reverse', inner, -1]]) {
    const wall = byName.get(face);
    assert.deepEqual([wall.kind, wall.out], ['cylinder', orientation]);
    near(wall.r, radius);
    near(wall.c[0], 30);
    near(wall.c[1], -14);
    near(Math.abs(wall.a[2]), 1);
  }
  for (const [face, z] of [['n0.v-min', -2], ['n0.v-max', 10]]) {
    const cap = byName.get(face);
    assert.equal(cap.kind, 'plane');
    near(cap.o[2], z);
    near(Math.abs(cap.n[2]), 1);
  }
  const rays = sector ? [[1, 0], [-.6, .8]] : [[.6, .8], [-.8, .6]];
  for (const [face, ray] of [['n0.u-min', rays[0]], ['n0.u-max', rays[1]]]) {
    const wall = byName.get(face);
    assert.equal(wall.kind, 'plane');
    near(wall.n[2], 0);
    near(wall.n[0] * ray[0] + wall.n[1] * ray[1], 0);
    near(wall.n[0] * (wall.o[0] - 30) + wall.n[1] * (wall.o[1] + 14), 0);
    for (const radius of [10, inner]) for (const z of [-2, 10]) {
      const point = [30 + radius * ray[0], -14 + radius * ray[1], z];
      assert.ok(solid.vertices.some(vertex => Math.hypot(...vertex.map((coord, axis) => coord - point[axis])) < 1e-8));
    }
  }
  near(solid.volume, sweep / 2 * (100 - inner ** 2) * 12, 1e-7);
  near((await f.bodies()).bodies[0].volume, solid.volume, 1e-7);
  return solid;
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async opts => {
    const context = await newContext({ ...opts, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const file = join(f.output, `${patch}-cylinder.bcad`);
  await writeFile(file, JSON.stringify(input));
  await f.freshOpen(file, input, `01-open-${patch}`);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.locator('.ol.direct').filter({ hasText: patchName }).click();
  await panel().getByLabel('Thicken side', { exact: true }).selectOption('reverse');
  await button('Thicken into a body', panel()).click();
  await hud().getByLabel('Geometry', { exact: true }).selectOption('exact-cylinder');
  const thickness = hud().getByLabel('Thickness', { exact: true });

  f.phase = 'Refuse an inward offset that reaches or crosses the axis before writing a feature';
  await thickness.fill(sector ? '11' : '10');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  await f.same(input);
  await f.snapshot('02-collapse-refused');

  f.phase = 'Preview and apply the exact inward offset';
  await thickness.fill('2');
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(input);
  await f.snapshot('03-exact-preview');
  await button('Apply', hud()).click();
  await f.changed(input);
  const applied = await f.doc(), first = await verify('04-native-applied', applied, 2);
  await f.openFeatureEditor(0, 'exact cylinder Thicken');
  const edit = f.editor().getByLabel('Thickness', { exact: true });
  assert.equal(await edit.inputValue(), '2');
  await edit.fill('3');
  await f.applyEditor(applied, '05-thickness-3');
  const edited = await f.doc(), second = await verify('06-native-edited', edited, 3);
  const saved = await f.save('exact-cylinder-thicken');
  await f.freshOpen(saved.file, edited, '07-fresh-open');
  assert.deepEqual(await verify('08-native-reopened', await f.doc(), 3), second);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('09-reopened-cylinder');
  f.report.observations.push({ sweep, thicknesses: [2, 3], radii: [[8, 10], [7, 10]],
    volumes: [first.volume, second.volume], names, digest: second.digest });
});
