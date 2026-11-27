import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const pins = [
  'apps/cad-studio/test/sphere-box-point-union-browser.mjs',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
];
const f = await createFlow({
  name: 'sphere-box-point-union', output: process.argv[2], envFrozen: 'SPHERE_BOX_POINT_UNION_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Union an exact sphere and box sharing only one vertex, in both selection orders.',
  limits: ['One original axis-aligned box and one radius-3 full Revolve with exact external vertex contact.'],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(outputs.map(output => ({
  report: checkBrep(output.brep, { strict: true }),
  mass: massPropertiesOf(output),
  digest: createHash('sha256').update(JSON.stringify(output.brep)).digest('hex'),
}))));
`,
});

const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
    { id: 'n2', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'arc', start: [0, 0], center: [0, 3], direction: 'ccw' },
      { kind: 'line', start: [0, 6] },
    ], plane: { origin: [21, 22, 19], normal: [0, -1, 0], xAxis: [1, 0, 0] } },
    { id: 'n3', kind: 'revolve', sketch: 2, axis: 'y', angle: 360 },
  ],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const boxVolume = 20 ** 3, sphereVolume = 4 * Math.PI * 3 ** 3 / 3, volume = boxVolume + sphereVolume;
const center = [21, 22, 22];
const centroid = center.map(value => (10 * boxVolume + value * sphereVolume) / volume);
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
const button = name => f.page.getByRole('button', { name, exact: true });

async function verify(label, doc) {
  const [native, ...extra] = await f.inspect(label, doc);
  assert.equal(extra.length, 0);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.counts.bodies, 2);
  assert.equal(native.report.counts.shells, 2);
  assert.equal(native.report.counts.faces, 8);
  near(native.mass.volume, volume);
  native.mass.centroid.forEach((value, axis) => near(value, centroid[axis]));
  const { bodies } = await f.bodies();
  near(bodies.reduce((sum, body) => sum + body.volume, 0), volume);
  f.report.observations.push({ label, volume, centroid, nativeVolume: native.mass.volume,
    nativeCentroid: native.mass.centroid, counts: native.report.counts, digest: native.digest, studioBodies: bodies.length });
  return native;
}

async function applyUnion(reverse) {
  const rows = f.page.locator('.outliner .ol-row > button.ol');
  assert.equal(await rows.count(), 2);
  const first = reverse ? 1 : 0, second = 1 - first;
  await rows.nth(first).click();
  await rows.nth(second).click({ modifiers: ['Shift'] });
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.bodies), [first, second]);
  await f.snapshot(reverse ? 'reverse-original-selection' : 'original-point-contact');
  await clickModelCommand(f.page, 'Combine', 'Union');
  await f.changed(stock);
  const doc = await f.doc();
  assert.deepEqual(doc.nodes.slice(0, 4), stock.nodes);
  assert.deepEqual(doc.nodes[4], { id: 'n4', kind: 'union',
    left: { node: reverse ? 3 : 1, side: 'solid' }, right: { node: reverse ? 1 : 3, side: 'solid' } });
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot(reverse ? 'reverse-union' : 'point-contact-union');
  return doc;
}

await f.run(async () => {
  // The nearest point of the box to the sphere centre is its corner [20,20,20].
  assert.equal(center.reduce((sum, value) => sum + (value - 20) ** 2, 0), 3 ** 2);
  const file = join(f.output, 'sphere-box-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  await f.freshOpen(file, stock, 'original-two-solids');
  const forward = await applyUnion(false);
  const beforeSave = await verify('forward-native', forward);
  await f.undo();
  await f.same(stock);
  await f.redo();
  await f.same(forward);
  const saved = await f.save('point-contact-union');
  const reopened = (await f.freshOpen(saved.file, forward, 'point-contact-union-reopened')).doc;
  assert.equal((await verify('reopened-native', reopened)).digest, beforeSave.digest);
  await f.freshOpen(file, stock, 'reverse-input');
  await verify('reverse-native', await applyUnion(true));
});
