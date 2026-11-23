import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const fixtures = process.argv[3];
assert.ok(fixtures, 'Supply the editable-step CLI output folder.');
const pins = [
  'apps/cad-studio/server/editableStepCli.ts',
  'apps/cad-studio/server/cadCli.ts',
  'packages/barocss-cad-model/src/engine/editableStepCopy.ts',
];
const f = await createFlow({
  name: 'editable-step-cli-consumer', output: process.argv[2], envFrozen: 'D1845_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Open, edit and save both CLI-published native reconstructions in Studio.',
  limits: ['One named-driver plate and one numeric two-step shaft from exact writer-profile STEP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2],'utf8')), result = evaluateDoc(doc, 1);
if (!result.ok || result.bodies.length !== 1) throw Error('Expected one body');
const output = result.bodies[0];
console.log(JSON.stringify({ volume: output.volume, centroid: output.centroid, strict: checkBrep(partBreps(doc)[0].brep, { strict: true }) }));
`,
});
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
async function check(label, doc, volume, z, genus) {
  const read = await f.inspect(label, doc);
  assert.ok(read.strict.valid);
  assert.equal(read.strict.topology[0].genus, genus);
  near(read.volume, volume);
  near(read.centroid[2], z);
  f.report.observations.push({ label, volume: read.volume, centroid: read.centroid, genus });
}

await f.run(async () => {
  for (const family of ['plate', 'shaft']) {
    const review = JSON.parse(await readFile(join(fixtures, family + '-review.json'), 'utf8'));
    const written = JSON.parse(await readFile(join(fixtures, family + '-written.json'), 'utf8'));
    const file = join(fixtures, family + '-copy.bcad'), bytes = await readFile(file), doc = JSON.parse(bytes);
    assert.equal(written.review, review.review);
    assert.equal(sha256(bytes), review.candidate.sha256);
    assert.equal(sha256(await readFile(join(fixtures, family + '.step'))), review.source.sha256);
    assert.deepEqual(doc.nodes, review.candidate.nodes);
    assert.deepEqual(doc.parameters, review.candidate.parameters);
    await f.freshOpen(file, doc, family + '-cli-open');
    if (family === 'plate') {
      await check('plate-start', doc, 12000 - 90 * Math.PI, 5, 1);
      const changed = (await f.setParameter('plateThickness', 13, 'plate-named-edit')).doc;
      assert.deepEqual(changed.nodes, doc.nodes);
      assert.deepEqual(changed.parameters, { ...doc.parameters, plateThickness: 13 });
      await check('plate-edit', changed, 13 * (1200 - 9 * Math.PI), 6.5, 1);
      const saved = await f.save('cli-plate-edited');
      await f.freshOpen(saved.file, saved.doc, 'plate-reopen');
      await f.same(changed);
    } else {
      await check('shaft-start', doc, 1488 * Math.PI, 246 / 31, 0);
      await f.openFeatureEditor(0, 'CLI shaft');
      await f.editor().getByRole('spinbutton', { name: 'Step 2 length', exact: true }).fill('10');
      const changed = (await f.applyEditor(doc, 'shaft-stage-edit')).doc;
      assert.deepEqual(changed.nodes, [{ ...doc.nodes[0], steps: [{ diameter: 20, length: 12 }, { diameter: 12, length: 10 }] }]);
      await check('shaft-edit', changed, 1560 * Math.PI, (1200 * 6 + 360 * 17) / 1560, 0);
      const saved = await f.save('cli-shaft-edited');
      await f.freshOpen(saved.file, saved.doc, 'shaft-reopen');
      await f.same(changed);
    }
    assert.equal(sha256(await readFile(file)), review.candidate.sha256);
    assert.equal(sha256(await readFile(join(fixtures, family + '.step'))), review.source.sha256);
  }
});
