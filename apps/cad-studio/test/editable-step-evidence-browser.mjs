import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const fixtures = process.argv[3];
assert.ok(fixtures, 'Supply the STEP inputs and CLI reviews.');
const pins = [
  'apps/cad-studio/src/files/StepExportPanel.tsx',
  'apps/cad-studio/src/files/editableStepPreparation.ts',
  'packages/barocss-cad-model/src/engine/editableStepCopy.ts',
  'packages/barocss-cad-model/src/engine/editableStepEvidence.ts',
];
const f = await createFlow({
  name: 'editable-step-evidence', output: process.argv[2], envFrozen: 'D1848_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Read the full source-to-native face correspondence before Save in actual Studio.',
  limits: ['One inch plate and one anonymous millimetre Shaft. Associations describe the initial copy.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), [output] = partBreps(doc);
console.log(JSON.stringify({ key: output.key, faces: output.brep.faces.map(face => ({ id: face.id, loops: face.loops.length })),
  check: checkBrep(output.brep, { strict: true }) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('region', { name: 'Editable STEP copy', exact: true });
async function open(file) {
  const step = await readFile(file, 'utf8');
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.page.waitForFunction(step => window.__studioDoc?.nodes[0]?.step === step, step);
  await f.ready();
  return f.doc();
}
async function review() {
  const tool = button('Review editable STEP copy');
  if (!(await tool.isVisible())) await button('More tools').click();
  await tool.click();
  await panel().waitFor();
}

await f.run(async () => {
  await f.newPage();
  for (const [kind, count, features] of [['plate', 8, 'Sketch, Extrude, Hole'], ['shaft', 10, 'Shaft']]) {
    const file = join(fixtures, kind + '.step');
    const before = await readFile(file), doc = await open(file);
    const receipt = JSON.parse(await readFile(join(fixtures, kind + '-review.json'), 'utf8'));
    const evidence = receipt.candidate.evidence, source = await f.inspect(kind + '-source', doc);
    assert.equal(sha256(before), receipt.source.sha256);
    assert.equal(evidence.originalHistory, 'unknown');
    assert.ok(source.check.valid);
    assert.equal(evidence.sourceBody, source.key);
    assert.equal(evidence.regions.flatMap(region => region.sourceFaces).length, count);
    assert.deepEqual(evidence.regions.flatMap(region => region.sourceFaces).sort(), source.faces.map(face => face.id).sort());
    await review();
    await panel().locator('.kv').filter({ hasText: /^New features/ }).getByText(features, { exact: true }).waitFor();
    await panel().getByText('Geometry only. Original history is unknown.', { exact: true }).waitFor();
    await panel().getByText(count + ' source faces explained', { exact: true }).click();
    if (kind === 'plate') {
      await panel().getByText('Bottom cap', { exact: true }).waitFor();
      assert.equal(await panel().getByText('Extrude · Hole trim', { exact: true }).count(), 2);
      await panel().getByText('Through bore', { exact: true }).waitFor();
      await panel().getByRole('checkbox', { name: 'Named thickness and hole centre', exact: true }).check();
    } else {
      await panel().getByText('Shoulder', { exact: true }).waitFor();
      for (const label of ['First end', 'First seat', 'Second seat', 'Second end'])
        await panel().getByText(label, { exact: true }).waitFor();
    }
    await f.snapshot(kind + '-source-coverage');
    const [download] = await Promise.all([f.page.waitForEvent('download'), button('Save copy', panel()).click()]);
    const candidateFile = join(f.output, download.suggestedFilename());
    await download.saveAs(candidateFile);
    const bytes = await readFile(candidateFile), candidate = JSON.parse(bytes);
    assert.equal(sha256(bytes), receipt.candidate.sha256);
    await f.same(doc);
    const result = await f.inspect(kind + '-copy', candidate);
    assert.ok(result.check.valid);
    assert.equal(evidence.copyBody, result.key);
    assert.deepEqual(evidence.regions.flatMap(region => region.copyFaces).sort(), result.faces.map(face => face.id).sort());
    if (kind === 'plate') for (const cap of evidence.regions.filter(region => region.trimmedBy))
      assert.equal(result.faces.find(face => face.id === cap.copyFaces[0])?.loops, 2);
    await f.freshOpen(candidateFile, candidate, kind + '-copy-reopened');
    assert.deepEqual(await readFile(file), before);
    f.report.observations.push({ kind, evidence, sourceSHA: receipt.source.sha256, candidateSHA: receipt.candidate.sha256 });
  }

  const multi = await open(join(fixtures, 'two-solids.step'));
  await review();
  await panel().getByRole('alert').waitFor();
  assert.equal(await button('Save copy', panel()).isDisabled(), true);
  assert.equal(await panel().getByText(/source faces explained/).count(), 0);
  await f.same(multi);
  await f.snapshot('two-solids-refused');
});
