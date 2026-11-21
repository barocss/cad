import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const legacy = { degreeU: 1, degreeV: 1, knotsU: [-2, -2, 6, 6], knotsV: [1, 1, 7, 7],
  controlPoints: [[[10, -6, 3], [10, 24, 3]], [[50, -6, 3], [50, 24, 3]]], weights: [[1, 1], [1, 1]] };
const corners = [[-45, -6, 3], [-39, 24, 11], [-21, -6, 35], [-15, 24, 43]];
const initial = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'thicken', name: 'Legacy sampled plate', surface: legacy, thickness: 2 }],
  outputs: { b0: { node: 0, side: 'solid' } }, nextId: 1,
  direct: {
    sources: { tilted: `@model sheet {version:0;length-unit:mm; @surface #tilted {type:nurbs;degree-u:1;degree-v:1;knots-u:[-2,-2,6,6];knots-v:[1,1,7,7];control-points:${JSON.stringify([corners.slice(0, 2), corners.slice(2)])};weights:[[2,2],[2,2]];}}` },
    objects: [{ id: 'tilted-1', name: 'Tilted affine sheet', source: 'tilted', geometry: 'tilted' }],
  },
};
const pins = [
  'apps/cad-studio/test/exact-planar-thicken-browser.mjs', 'packages/barocss-cad-model/src/app/thickenCommand.ts',
  'packages/barocss-cad-model/src/engine/thicken.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/thicken-planar.ts', 'packages/barocss-cad/src/part/part-shell.ts',
  'packages/barocss-cad/src/api/spec.ts',
];
const f = await createFlow({
  name: 'exact-planar-thicken', output: process.argv[2], envFrozen: 'D1629_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Apply Exact planar Thicken to a tilted affine sheet, edit thickness and reopen with both feature and legacy face identity.',
  limits: ['A degree-1 by degree-1 affine sheet with nonunit parameter spans and equal weights. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, valid: checkBrep(brep, { strict: true }).valid, volume: brepMassProperties(brep, 1).volume,
  faces: brep.faces.map(face => ({ name: face.name, kind: face.surface.kind, u: face.surface.degreeU, v: face.surface.degreeV })),
  vertices: brep.vertices.map(vertex => vertex.point), edges: brep.edges.length, solid: brep.bodies[0]?.kind, digest: digestOf(brep),
}))));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const hud = () => f.page.getByRole('dialog', { name: 'Thicken', exact: true });
const normal = [-0.8, 0, 0.6];
const names = ['normal', 'reverse', 'u-max', 'u-min', 'v-max', 'v-min'].map(name => 'n1.' + name);

async function check(label, doc, thickness, original) {
  const [legacyResult, exact] = await f.inspect(label, doc);
  assert.deepEqual(legacyResult, original);
  assert.deepEqual([exact.key, exact.valid, exact.solid, exact.vertices.length, exact.edges], ['b1', true, 'solid', 8, 12]);
  assert.deepEqual(exact.faces.map(face => face.name).sort(), names);
  assert.ok(exact.faces.every(face => face.kind === 'surface' && face.u === 1 && face.v === 1));
  assert.ok(Math.abs(exact.volume - 40 * 30 * thickness) < 1e-8, exact.volume);
  for (const corner of corners) for (const distance of [-thickness / 2, thickness / 2]) {
    const expected = corner.map((value, axis) => value + distance * normal[axis]);
    assert.ok(exact.vertices.some(vertex => vertex.every((value, i) => Math.abs(value - expected[i]) < 1e-10)), expected);
  }
  const offsets = exact.vertices.map(vertex => vertex.reduce((sum, value, axis) => sum + normal[axis] * (value - corners[0][axis]), 0));
  assert.ok(Math.abs(Math.max(...offsets) - Math.min(...offsets) - thickness) < 1e-10);
  assert.equal(doc.nodes[1].mode, 'exact-planar');
  assert.deepEqual(doc.direct, initial.direct);
  return exact;
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
  const file = join(f.output, 'affine-sheet.bcad');
  await writeFile(file, JSON.stringify(initial));
  await f.freshOpen(file, initial, '01-legacy-and-sheet');
  const [original] = await f.inspect('legacy-native', initial);
  assert.equal(original.valid, true);
  assert.equal(original.faces.length, 73);
  assert.ok(original.faces.every(face => /^n0\.facet\d+$/.test(face.name)));

  f.phase = 'Choose Exact planar and preview without committing';
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.locator('.ol.direct').filter({ hasText: 'Tilted affine sheet' }).click();
  await panel().getByLabel('Thickness', { exact: true }).fill('4');
  await panel().getByLabel('Thicken side', { exact: true }).selectOption('both');
  await button('Thicken into a body', panel()).click();
  const geometry = hud().getByLabel('Geometry', { exact: true });
  assert.equal(await geometry.inputValue(), 'sampled');
  await geometry.selectOption('exact-planar');
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(initial);
  await f.snapshot('02-exact-planar-preview');
  await button('Apply', hud()).click();
  await f.changed(initial);
  const applied = await f.doc();
  assert.deepEqual([applied.nodes[1].thickness, applied.nodes[1].side], [4, 'both']);
  const first = await check('applied-native', applied, 4, original);
  await f.snapshot('03-applied');

  f.phase = 'Edit the thickness while retaining the exact faces and source';
  await f.openFeatureEditor(1, 'exact planar Thicken');
  assert.equal(await f.editor().getByLabel('Thickness', { exact: true }).inputValue(), '4');
  await f.editor().getByLabel('Thickness', { exact: true }).fill('6');
  await f.applyEditor(applied, '04-thickness-6');
  const edited = await f.doc();
  assert.equal(edited.nodes[1].thickness, 6);
  const second = await check('edited-native', edited, 6, original);
  const saved = await f.save('exact-planar-thicken');
  await f.freshOpen(saved.file, edited, '05-fresh-open');
  assert.deepEqual(await check('reopened-native', await f.doc(), 6, original), second);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('06-reopened-exact-planar');
  f.report.observations.push({ thicknesses: [4, 6], volumes: [first.volume, second.volume],
    exactNames: names, legacyFaces: original.faces.length, legacyDigest: original.digest, reopenedDigest: second.digest });
});
