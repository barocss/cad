import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const fixture = 'packages/barocss-cad/robustness/corpus/oracle/gear-helical-pair-crossing-intersect.json';
const baseline = process.argv.includes('--baseline');
const expectResult = process.argv.includes('--intersect');
const pins = [fixture, 'apps/cad-studio/test/helical-intersection-refusal-browser.mjs',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts', 'packages/barocss-cad-model/src/engine/part.ts'];
const f = await createFlow({
  name: expectResult ? 'helical-intersection' : 'helical-intersection-refusal', output: process.argv[2], envFrozen: 'HELICAL_PAIR_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: expectResult ? 'Verify the original helical Intersect result in both operand orders and after native Open.'
    : 'Verify that the original opposite-hand helical gear Intersect refusal names the operation and preserves both originals.',
  limits: ['The original corpus geometry maps to native Studio Gear authoring with generator spur-gear@0 and explicit 3 degree phase.'],
  inspectorSource: expectResult ? `
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
` : undefined,
});
const original = JSON.parse(await readFile(join(f.repo, fixture), 'utf8'));
const corpus = original.input.partDocument.features;
const expected = original.expect.outputs[0];
const nodes = corpus.slice(0, 2).map((gear, i) => ({
  id: `n${i}`, kind: 'gear', module: gear.normalModule, helixAngle: gear.helixAngle, hand: gear.hand,
  teeth: gear.teeth, faceWidth: gear.faceWidth, thicknessReduction: gear.thicknessReduction,
  center: [0, 0], generator: gear.generator, ...(gear.mesh ? { mesh: { gear: 0, phase: gear.mesh.phase } } : {}),
}));
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, nodes,
  outputs: { b0: { node: 0, side: 'solid' }, b1: { node: 1, side: 'solid' } },
};
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const undoButtons = async () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const project = expectResult ? 'Original helical intersection' : 'Original crossing gear inputs';
async function projectOpen() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}

function near(actual, reference, tolerance) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - reference) <= tolerance, `${actual} vs ${reference}`);
}

async function verifyResult(doc, label) {
  const [native, ...extra] = await f.inspect(label, doc);
  assert.equal(extra.length, 0);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.counts.bodies, expected.bodies);
  assert.deepEqual(native.report.topology.map(({ shells, genus }) => ({ shells, genus })), expected.topology);
  const { value, relTol } = expected.volume;
  near(native.mass.volume, value, value * relTol);
  native.mass.centroid.forEach((coord, axis) => near(coord, expected.centroid.value[axis], expected.centroid.absTol));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, native.mass.volume, 1e-7);
  bodies[0].centroid.forEach((coord, axis) => near(coord, native.mass.centroid[axis], 1e-7));
  return native;
}

await f.run(async () => {
  const filename = 'original-helical-pair.bcad', file = join(f.output, filename);
  await writeFile(file, JSON.stringify(stock));
  let saved = stock;
  const verified = [];
  for (const [a, b] of [[0, 1], [1, 0]]) {
    await f.freshOpen(file, stock, 'original-gear-inputs-' + a);
    await frame();
    const rows = f.page.locator('.outliner .ol-row > button.ol');
    await rows.nth(a).click();await rows.nth(b).click({ modifiers: ['Shift'] });
    const selected = await f.page.evaluate(() => window.__studioSelection.selection.bodies);
    assert.deepEqual(selected, [a, b]);
    const before = await undoButtons();
    await clickModelCommand(f.page, 'Combine', 'Intersect');
    if (expectResult) {
      await f.changed(stock);
      const result = await f.doc();
      assert.deepEqual(result.nodes.slice(0, 2), stock.nodes);
      assert.deepEqual(result.nodes[2], { id: 'n2', kind: 'intersect',
        left: { node: a, side: 'solid' }, right: { node: b, side: 'solid' } });
      await frame();
      const native = await verifyResult(result, 'helical-intersect-native-' + a);
      await f.snapshot('helical-intersect-result-' + a);
      await f.undo();
      await f.same(stock);
      assert.equal((await f.bodies()).bodies.length, 2);
      if (a === 0) await f.snapshot('helical-intersect-undo');
      await f.redo();
      await f.same(result);
      verified.push(native);
      f.report.observations.push({ order: selected, mass: native.mass, topology: native.report.topology, digest: native.digest });
      saved = result;
      continue;
    }
    const warning = await f.waitToast(/manifold|could not|refused/i, 120000);
    assert.match(warning, baseline ? /could not be joined into one solid/ : /Intersect could not form a solid/);
    assert.match(warning, a === 0 ? /has 1 uses/ : /has 3 uses/);
    await f.same(stock);
    assert.deepEqual(await undoButtons(), before);
    const accepted = (await f.bodies()).bodies;
    assert.equal(accepted.length, 2);
    assert.ok(accepted.every(body => Math.abs(body.volume - 6729.5331434245) < 1e-6));
    await f.page.locator('.toast').getByText('Details', { exact: true }).click();
    await f.snapshot('intersect-refusal-' + a);
    f.report.observations.push({ order: selected, warning, retainedBodies: accepted.length, history: before });
  }
  await projectOpen();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(filename, { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await projectOpen();
  await button('Open ' + filename, versions()).click();
  await f.same(saved);
  await button('Project and versions').click();
  await frame();
  if (expectResult) {
    const reopened = await verifyResult(saved, 'helical-intersect-reopened-native');
    assert.equal(reopened.digest, verified[1].digest);
    near(verified[0].mass.volume, verified[1].mass.volume, 1e-7);
    verified[0].mass.centroid.forEach((coord, axis) => near(coord, verified[1].mass.centroid[axis], 1e-7));
    await f.snapshot('helical-intersect-project-reopened');
  } else await f.snapshot('both-original-gears-framed');
  assert.deepEqual(f.report.downloads, []);
});
