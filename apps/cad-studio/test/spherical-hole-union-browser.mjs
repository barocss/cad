import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const paths = [
  'apps/cad-studio/test/spherical-hole-union-browser.mjs',
  'packages/barocss-cad/src/brep/brep-tessellate.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
];
const f = await createFlow({
  name: 'union-sphere-cut-commute', output: process.argv[2], envFrozen: 'UNION_SPHERE_CUT_FROZEN',
  qualification: 'Apply and reopen both pick orders of RB 20261024:125@r.b in desktop Studio.',
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
  initialFiles: paths, requiredFrozen: paths,
});

const solid = node => ({ node, side: 'solid' });
const sphereProfile = radius => ({
  kind: 'sketch', profile: 'loop', segments: [
    { kind: 'line', start: [0, -radius] },
    { kind: 'arc', start: [0, radius], center: [0, 0], direction: 'cw' },
  ], plane: { origin: [0, 0, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] },
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 12,
  nodes: [
    { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 4 },
    { kind: 'extrude', sketch: 0, height: 1 },
    { kind: 'rotate', parent: solid(1), axis: 'x', angle: 180, pivot: [0, 0, 0] },
    { kind: 'translate', parent: solid(2), offset: [3, 1, -1] },
    sphereProfile(4),
    { kind: 'revolve', sketch: 4, axis: 'y', angle: 360 },
    { kind: 'rotate', parent: solid(5), axis: 'z', angle: 90, pivot: [0, 0, 0] },
    { kind: 'translate', parent: solid(6), offset: [0, 3, 0] },
    { kind: 'difference', parent: solid(3), tool: solid(7) },
    sphereProfile(3),
    { kind: 'revolve', sketch: 9, axis: 'y', angle: 360 },
    { kind: 'translate', parent: solid(10), offset: [-1, -3, -2] },
  ].map((node, i) => ({ id: `n${i}`, ...node })),
  outputs: { b8: solid(8), b11: solid(11) },
};
const volume = 140.7123325734261;

async function verify(label, doc) {
  const [native, ...extra] = await f.inspect(`${label}-native`, doc);
  assert.equal(extra.length, 0);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.counts.bodies, 1);
  assert.equal(native.report.counts.shells, 1);
  assert.equal(native.report.counts.faces, 6);
  assert.equal(native.report.counts.loops, 7);
  assert.equal(native.mass.method, 'quadrature');
  assert.ok(Math.abs(native.mass.volume - volume) < 1e-6, String(native.mass.volume));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.ok(Math.abs(bodies[0].volume - volume) < 1e-6, String(bodies[0].volume));
  f.report.observations.push({ label, workerVolume: bodies[0].volume, mass: native.mass,
    counts: native.report.counts, digest: native.digest });
  return native;
}

await f.run(async () => {
  const file = join(f.output, 'spherical-hole-union-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  const verified = [];
  for (const [a, b, label] of [[0, 1, 'cylinder-first'], [1, 0, 'sphere-first']]) {
    await f.freshOpen(file, stock, `${label}-stock`);
    const rows = f.page.locator('.outliner .ol-row > button.ol');
    assert.equal(await rows.count(), 2);
    await rows.nth(a).click();
    await rows.nth(b).click({ modifiers: ['Shift'] });
    assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.bodies), [a, b]);
    await f.snapshot(`${label}-selected`);
    await clickModelCommand(f.page, 'Combine', 'Union');
    await f.changed(stock);
    const result = await f.doc();
    assert.deepEqual(result.nodes.slice(0, 12), stock.nodes);
    const inputs = [8, 11];
    assert.deepEqual(result.nodes.at(-1), { id: 'n12', kind: 'union', left: solid(inputs[a]), right: solid(inputs[b]) });
    await f.page.getByRole('button', { name: 'Iso', exact: true }).click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    verified.push(await verify(label, result));
    await f.snapshot(`${label}-applied`);
    await f.undo();
    await f.same(stock);
    await f.redo();
    await f.same(result);
    const saved = await f.save(label);
    const reopened = (await f.freshOpen(saved.file, result, `${label}-reopened`)).doc;
    assert.equal((await verify(`${label}-reopened`, reopened)).digest, verified.at(-1).digest);
  }
  const [forward, reverse] = verified.map(result => result.mass);
  assert.ok(Math.abs(forward.volume - reverse.volume) < 1e-8);
  forward.centroid.forEach((value, axis) => assert.ok(Math.abs(value - reverse.centroid[axis]) < 1e-8));
});
