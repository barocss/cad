import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/part-file-insertion-browser.mjs', 'apps/cad-studio/src/App.tsx',
  ...(baseline ? [] : ['apps/cad-studio/src/app/studioPartInsertion.ts'])];
const f = await createFlow({
  name: 'part-file-insertion', output: process.argv[2], envFrozen: 'PART_FILE_INSERTION_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Verify the caller-owned desktop Insert part flow and its prior file/history behavior.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
function inspect(model) {
  const [output] = partSnapshot(model).outputs;
  return { volume: massPropertiesOf(output).volume, strict: checkBrep(output.brep, { strict: true }).valid };
}
console.log(JSON.stringify({ base: inspect(doc), placed: doc.instances.map(instance => ({ id: instance.id, position: instance.position, ...inspect(instance.doc) })) }));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const docOf = (w, d, h) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [w, d] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: h }],
  outputs: { b1: { node: 1, side: 'solid' } },
});
const base = docOf(40, 30, 20), child = docOf(10, 8, 6);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);

async function insert(name, buffer) {
  const trigger = async () => {
    if (await button('Insert part').isVisible()) return button('Insert part').click();
    await button('More tools').click();
    await f.page.getByRole('menuitem', { name: 'Insert part', exact: true }).click();
  };
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), trigger()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer });
}

async function verify(label, doc) {
  const [instance] = doc.instances;
  assert.equal(doc.instances.length, 1);
  assert.deepEqual(doc.nodes, base.nodes);
  assert.deepEqual(instance.doc, child);
  assert.equal(instance.name, 'Fixture spacer');
  assert.equal(instance.part.source, 'Fixture spacer.bcad');
  assert.deepEqual(instance.position, [60, 0, 0]);
  assert.deepEqual(instance.rotation, [0, 0, 0]);
  const result = await f.inspect(label, doc);
  assert.ok(result.base.strict && result.placed[0].strict);
  near(result.base.volume, 24000);
  near(result.placed[0].volume, 480);
  await f.page.locator('.outliner .instance').filter({ hasText: 'Fixture spacer' }).waitFor();
  const trigger = f.page.getByTitle('Frame all (F)', { exact: true });
  await trigger.click();
  await f.ready();
  f.report.observations.push({ label, id: instance.id, name: instance.name, volume: result.placed[0].volume, position: instance.position });
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'fixture-base.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base)),
  });
  await f.same(base);
  f.phase = 'Refuse an unreadable part file without modifying the open model';
  const before = await f.snapshot('base-before-insert');
  await insert('Invalid child.bcad', Buffer.from('invalid cad file'));
  await f.waitToast(/Could not insert this part/);
  await f.same(base);
  const refused = await f.snapshot('invalid-file-refused');
  assert.deepEqual(refused.history, before.history);

  f.phase = 'Insert a valid native part and verify its placed geometry and source';
  await insert('Fixture spacer.bcad', Buffer.from(JSON.stringify(child)));
  await f.changed(base);
  const accepted = await f.doc();
  await verify('inserted-part', accepted);
  const priorFailure = f.page.getByText('Could not insert this part', { exact: true });
  await priorFailure.waitFor({ state: baseline ? 'visible' : 'hidden' });
  await f.snapshot('inserted-part');
  await f.undo();
  await f.same(base);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('native-part-insertion');
  const reopened = (await f.freshOpen(saved.file, accepted, 'reopened-native-part')).doc;
  await verify('native-part-reopened', reopened);
  await f.snapshot('reopened-part-fitted');

  if (!baseline) {
    f.phase = 'Preserve a newer Open failure during a successful Insert retry';
    await insert('Invalid child again.bcad', Buffer.from('invalid cad file'));
    await f.waitToast(/Could not insert this part/);
    await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
      name: 'Unreadable model.bcad', mimeType: 'application/json', buffer: Buffer.from('invalid cad file'),
    });
    await f.waitToast(/Could not open this file/);
    await f.same(reopened);
    await insert('Second spacer.bcad', Buffer.from(JSON.stringify(child)));
    await f.changed(reopened);
    const next = await f.doc();
    assert.deepEqual(next.instances[0], reopened.instances[0]);
    assert.equal(next.instances[1].name, 'Second spacer');
    await f.waitToast(/Could not open this file/);
    await f.snapshot('newer-open-failure-preserved');
  }
});
