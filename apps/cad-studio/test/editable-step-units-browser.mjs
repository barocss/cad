import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const fixtures = process.argv[3], inch = process.argv.includes('--inch');
const profile = inch ? { name: 'inch', unit: 'inches', factor: 25.4, centre: 12, wrong: 'wrong-inch-factor.step' }
  : { name: 'centimetre', unit: 'centimetres', factor: 10, centre: 11, wrong: 'wrong-centimetre-line.step' };
assert.ok(fixtures, 'Supply the two STEP fixtures and the CLI copy.');
const pins = [
  'packages/barocss-cad/src/io/step-import.ts',
  'packages/barocss-cad-model/src/engine/editableStepCopy.ts',
  'packages/barocss-cad-model/src/engine/editableStepSource.ts',
  'apps/cad-studio/src/files/importedFile.ts',
  'apps/cad-studio/src/files/useModelExports.ts',
];
const f = await createFlow({
  name: 'editable-step-units', output: process.argv[2], envFrozen: 'EDITABLE_STEP_UNITS_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Compare an alternate STEP length context, its explicit normalizing Scale, and the editable native millimetre copy.',
  limits: ['Exact AP214 writer-profile plate. Alternate source units use the active linked STEP context.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), result = evaluateDoc(doc, 1);
if (!result.ok || result.bodies.length !== 1) throw Error('Expected one native body');
const body = result.bodies[0], [{ brep }] = partBreps(doc);
console.log(JSON.stringify({ strict: checkBrep(brep, { strict: true }), volume: body.volume, centroid: body.centroid,
  vertices: brep.vertices.map(vertex => vertex.point) }));
`,
});
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const panel = () => f.page.getByRole('region', { name: 'Editable STEP copy', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
async function review() {
  const pick = button('Review editable STEP copy');
  if (!(await pick.isVisible())) await button('More tools').click();
  await pick.click();
  await panel().waitFor();
}
async function check(label, doc, z, centerX = profile.centre) {
  const native = await f.inspect(label, doc), c = 9 * Math.PI, a = 1200 - c;
  assert.ok(native.strict.valid, JSON.stringify(native.strict.issues));
  assert.equal(native.strict.topology[0].genus, 1);
  near(native.volume, a * z);
  native.centroid.forEach((value, i) => near(value, [(24000 - centerX * c) / a, (18000 - 9 * c) / a, z / 2][i]));
  [40, 30, z].forEach((max, i) => {
    near(Math.min(...native.vertices.map(point => point[i])), 0);
    near(Math.max(...native.vertices.map(point => point[i])), max);
  });
  f.report.observations.push({ label, volume: native.volume, centroid: native.centroid });
}

await f.run(async () => {
  const mmFile = join(fixtures, 'millimetre-plate.step');
  const alternate = join(fixtures, profile.name + '-plate.step'), original = await readFile(alternate);
  await f.newPage();
  await f.openFile(mmFile, 1);
  await check('mm-source', await f.doc(), 10);
  await f.snapshot('01-millimetre-source');
  await f.openFile(alternate, 2);
  const source = await f.doc();
  assert.equal(source.nodes[0].step, original.toString());
  assert.deepEqual(source.nodes[1], { id: 'n1', kind: 'scale', parent: { node: 0, side: 'solid' }, factor: profile.factor, pivot: [0, 0, 0] });
  await f.waitToast(new RegExp(profile.unit + ', scaled ×' + String(profile.factor).replace('.', '\\.') + ' to millimetres'));
  await check('alternate-source', source, 10);
  await review();
  await panel().getByRole('checkbox', { name: 'Named thickness and hole centre', exact: true }).check();
  await f.snapshot('02-alternate-source-review');
  const [download] = await Promise.all([f.page.waitForEvent('download'), button('Save copy', panel()).click()]);
  const copyFile = join(f.output, download.suggestedFilename());
  await download.saveAs(copyFile);
  const bytes = await readFile(copyFile), copy = JSON.parse(bytes);
  assert.equal(sha256(bytes), sha256(await readFile(join(fixtures, 'cli-' + profile.name + '-copy.bcad'))));
  await f.same(source);
  assert.deepEqual(copy.nodes.map(node => node.kind), ['sketch', 'extrude', 'hole']);
  assert.deepEqual(copy.parameters, { plateThickness: 10, holeCentreX: profile.centre, holeCentreY: 9 });
  await f.openFile(copyFile, 3);
  await f.same(copy);
  await check('alternate-copy', copy, 10);
  const taller = (await f.setParameter('plateThickness', 14, '03-native-thickness-14')).doc;
  assert.deepEqual(taller.nodes, copy.nodes);
  await check('edited-copy', taller, 14);
  const saved = await f.save(profile.name + '-copy-edited');
  await f.freshOpen(saved.file, saved.doc, '04-editable-mm-reopened');
  await check('reopened-copy', saved.doc, 14);
  await f.openFile(join(fixtures, profile.wrong), 2);
  const wrong = await f.doc(), downloads = f.report.downloads.length;
  await review();
  await panel().getByRole('alert').waitFor();
  assert.equal(await button('Save copy', panel()).isDisabled(), true);
  assert.equal(f.report.downloads.length, downloads);
  await f.same(wrong);
  await f.snapshot('05-wrong-source-refused');
  assert.deepEqual(await readFile(alternate), original);
});
