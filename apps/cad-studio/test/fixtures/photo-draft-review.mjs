import assert from 'node:assert/strict';

export const inspectorSource = `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { brepBounds } from '../../packages/barocss-cad/src/brep/brep-bounds.ts';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const file = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(file.instances.map(inst => {
  const [{ brep }] = partBreps(inst.doc), { min, max } = brepBounds(brep);
  return { id: inst.id, volume: brepMassProperties(brep, 1).volume, size: max.map((value, axis) => value - min[axis]),
    valid: checkBrep(brep, { strict: true }).valid, closed: brep.shells.every(shell => shell.closed), solids: brep.bodies.filter(body => body.kind === 'solid').length };
})));`;

export async function reviewPhotoDraft(f, original, pending, calibration) {
  const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
  const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  const instance = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
  const banner = () => f.page.getByRole('status', { name: 'Editing a part in place', exact: true });
  const row = id => f.page.locator(`[data-browser-instance-path="${id}"]`);
  const openPart = async id => { await row(id).click(); await button('Edit part', instance()).click(); await banner().waitFor(); await f.ready(); };
  const front = () => button('Front', f.page.locator('.views')).click();
  const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const visibleHead = expected => f.page.waitForFunction(id => (window.__studioInstanceAt([0, -27, -7])?.id ?? null) === id, expected);
  const near = (value, expected, tolerance = 1e-7) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} != ${expected}`);

  assert.deepEqual(pending.nodes, original.nodes);
  assert.deepEqual(pending.instances, original.instances);
  assert.equal(pending.proposals[0].status, 'open');
  assert.match(pending.proposals[0].plan, /Supplied outside diameter 84 mm/);
  // Prove saved proposals replay outside the attachment session.
  const savedPending = await f.save('photo-draft-pending');
  await f.freshOpen(savedPending.file, pending, '03-pending-reopened');
  if (!await card().isVisible()) await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await front(); await frame(); await visibleHead('p1');
  assert.equal(await row('p1').count(), 0);
  await f.same(pending);
  await f.snapshot('04-draft-preview');
  await button('Show before', card()).click();
  await visibleHead(null); await f.same(pending);
  await button('Hide', card()).click();
  await f.same(pending);
  await button('Preview', card()).click(); await button('Hide', card()).waitFor();
  await button('Accept', card()).click(); await f.changed(pending);
  const approved = await f.doc();
  assert.equal(approved.proposals[0].decided.by, 'user');
  const ids = ['p1', 'p2', 'p3', 'p4'];
  assert.deepEqual(approved.instances.map(part => [part.id, part.name]), ids.map((id, i) => [id, calibration.parts[i].name]));
  const originalNative = await f.inspect('05-native-solids', approved);
  assert.deepEqual(originalNative.map(part => [part.id, part.valid, part.closed, part.solids]), ids.map(id => [id, true, true, 1]));
  const [head, handle] = approved.instances;
  near(head.doc.nodes[0].radius * 2, 84);
  near(originalNative[0].size[0], 84);
  near(originalNative[0].size[1], 84);
  near(originalNative[0].size[2], calibration.parts[0].depthMM);
  near(originalNative[0].volume, Math.PI * (42 ** 2 - head.doc.nodes[0].holes[0][0].start[0] ** 2) * head.doc.nodes[1].height, 1e-6);
  near(originalNative[1].volume, calibration.parts[1].widthMM * calibration.parts[1].heightMM * calibration.parts[1].depthMM, 1e-6);
  for (const [i, part] of approved.instances.entries()) assert.equal(part.doc.nodes.length, 2, ids[i]);
  await f.snapshot('05-user-approved');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);

  await row('p4').click(); await button('Hide', instance()).click(); await f.changed(approved);
  const hidden = await f.doc();
  assert.equal(hidden.instances[3].hidden, true);
  assert.deepEqual(hidden.instances.slice(0, 3), approved.instances.slice(0, 3));
  await f.snapshot('06-button-hidden');
  await f.undo(); await f.same(approved);

  // Cancel the first local edit. Finish the same edit and then revise the handle separately.
  await openPart('p1');
  await f.openFeatureEditor(1, 'Ring head');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('88');
  await f.applyEditor(await f.doc(), '07-head-local-edit');
  await button('Cancel', banner()).click(); await button('Discard', banner()).click();
  await banner().waitFor({ state: 'hidden' }); await f.same(approved);
  await openPart('p1');
  await f.openFeatureEditor(1, 'Ring head');
  await f.editor().getByLabel('Diameter', { exact: true }).fill('88');
  await f.applyEditor(await f.doc(), '08-new-diameter');
  await button('Finish', banner()).click(); await banner().waitFor({ state: 'hidden' });
  const headEdit = await f.doc();
  assert.deepEqual(headEdit.instances.slice(1), approved.instances.slice(1));
  near(headEdit.instances[0].doc.nodes[0].radius, 44);
  assert.equal(headEdit.proposals[0].plan, approved.proposals[0].plan);
  await openPart('p2');
  const length = handle.doc.nodes[1].height + 5;
  await f.openFeatureEditor(1, 'Handle');
  await f.editor().getByLabel('Distance', { exact: true }).fill(String(length));
  await f.applyEditor(await f.doc(), '09-new-handle-length');
  await button('Finish', banner()).click(); await banner().waitFor({ state: 'hidden' });
  const both = await f.doc();
  near(both.instances[1].doc.nodes[1].height, length);
  assert.deepEqual(both.instances.filter((_, i) => i !== 1), headEdit.instances.filter((_, i) => i !== 1));
  await f.undo(); await f.same(headEdit);
  await f.redo(); await f.same(both);
  const saved = await f.save('photo-draft-edited');
  await f.freshOpen(saved.file, both, '10-edited-reopened');
  await button('Right', f.page.locator('.views')).click(); await frame();
  await f.snapshot('11-edited-right');
  const current = await f.inspect('11-edited-native', await f.doc());
  near(current[0].size[0], 88);
  near(current[0].size[1], 88);
  near(current[1].size[2], length);
  assert.deepEqual(current.slice(2), originalNative.slice(2));
  f.report.observations.push({ originalNative, editedNative: current });
}
