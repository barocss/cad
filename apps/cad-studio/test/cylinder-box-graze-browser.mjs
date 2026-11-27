import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const cases = [
  { label: 'tolerance-graze', depth: '0_00001', toolFaces: [] },
  { label: 'retained-cut', depth: '0_0001', toolFaces: ['n3.side0', 'n3.top'] },
].map(test => ({
  ...test,
  file: `packages/barocss-cad/robustness/corpus/oracle/cylinder-box-graze-x45-in${test.depth}-difference.json`,
}));
const pins = [
  'apps/cad-studio/test/cylinder-box-graze-browser.mjs',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
  ...cases.map(test => test.file),
];
const f = await createFlow({
  name: 'cylinder-box-graze', output: process.argv[2], envFrozen: 'CYLINDER_BOX_GRAZE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Subtract a 45-degree rotated box from an original cylinder at two grazing depths.',
  limits: ['The 10 nm sliver is elided. The 0.1 µm control retains cut faces. These are two fixture-specific results.'],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(outputs.map(output => ({
  report: checkBrep(output.brep, { strict: true }),
  mass: massPropertiesOf(output),
  faces: output.brep.faces.map(face => face.name),
  digest: createHash('sha256').update(JSON.stringify(output.brep)).digest('hex'),
}))));
`,
});

function studioStock({ input }) {
  const [circle, cylinder, rectangle, box, rotation] = input.partDocument.features;
  const solid = node => ({ node, side: 'solid' });
  const sketch = ({ profile, center, radius, min, max }, id) => ({
    id, kind: 'sketch', profile, ...(profile === 'circle' ? { center, radius } : { min, max }),
  });
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
    nodes: [
      sketch(circle, 'n0'),
      { id: 'n1', kind: 'extrude', sketch: 0, height: cylinder.height, from: cylinder.from },
      sketch(rectangle, 'n2'),
      { id: 'n3', kind: 'extrude', sketch: 2, height: box.height, from: box.from },
      { id: 'n4', kind: 'rotate', parent: solid(3), axis: rotation.axis, angle: rotation.angle, pivot: rotation.pivot },
    ],
    outputs: { b1: solid(1), b4: solid(4) },
  };
}

function near(actual, expected, tolerance) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
}

async function verify(label, doc, expected, toolFaces) {
  const [native, ...extra] = await f.inspect(label, doc);
  assert.equal(extra.length, 0);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  const { counts } = native.report;
  assert.equal(counts.bodies, 1);
  assert.equal(counts.shells, 1);
  assert.equal(counts.faces, 4 + toolFaces.length);
  assert.deepEqual(native.faces.filter(name => !name?.startsWith('n1.')).sort(), toolFaces);
  near(native.mass.volume, expected.volume.value, 1e-11);
  native.mass.centroid.forEach((value, axis) => near(value, expected.centroid.value[axis], 1e-9));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expected.volume.value, 1e-7);
  f.report.observations.push({ label, counts, faces: native.faces, mass: native.mass, digest: native.digest,
    expectedVolume: expected.volume.value, studioVolume: bodies[0].volume });
  return native;
}

await f.run(async () => {
  for (const test of cases) {
    const fixture = JSON.parse(await readFile(join(f.repo, test.file), 'utf8'));
    const stock = studioStock(fixture);
    const file = join(f.output, `${test.label}-source.bcad`);
    await writeFile(file, JSON.stringify(stock));
    await f.freshOpen(file, stock, `${test.label}-source`);
    const rows = f.page.locator('.outliner .ol-row > button.ol');
    assert.equal(await rows.count(), 2);
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ['Shift'] });
    assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.bodies), [0, 1]);
    await f.snapshot(`${test.label}-selected`);
    await clickModelCommand(f.page, 'Combine', 'Subtract');
    await f.changed(stock);
    const result = await f.doc();
    assert.deepEqual(result.nodes.slice(0, 5), stock.nodes);
    assert.deepEqual(result.nodes[5], { id: 'n5', kind: 'difference',
      parent: { node: 1, side: 'solid' }, tool: { node: 4, side: 'solid' } });
    await f.page.getByRole('button', { name: 'Iso', exact: true }).click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    const expected = fixture.expect.outputs[0];
    const native = await verify(`${test.label}-native`, result, expected, test.toolFaces);
    await f.snapshot(test.label);
    await f.undo();
    await f.same(stock);
    await f.redo();
    await f.same(result);
    const saved = await f.save(test.label);
    const reopened = (await f.freshOpen(saved.file, result, `${test.label}-reopened`)).doc;
    assert.equal((await verify(`${test.label}-reopened-native`, reopened, expected, test.toolFaces)).digest, native.digest);
  }
});
