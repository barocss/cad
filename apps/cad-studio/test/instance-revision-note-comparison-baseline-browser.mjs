import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

// Synthetic design intent only. No private source, approval or manufacturing data.
const oldNote = { value: 'Synthetic current note A', basis: 'assumed', source: 'Synthetic fixture A', why: 'Synthetic reasoning A' };
const newNote = { value: 'Synthetic offered note B', basis: 'stated', source: 'Synthetic fixture B', why: 'Synthetic reasoning B' };
const part = () => ({ format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
  outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes: oldNote, purpose: { value: 'Synthetic preserved purpose', basis: 'stated', source: 'Fixture' } } });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: `Synthetic box ${i + 1}`, doc: part(), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'sharedA' : 'independentB', rev: 'A' } })) };
const fileName = 'synthetic-note-offer.bcad';
const f = await createFlow({ name: 'instance-revision-note-comparison-baseline', output: process.argv[2], envFrozen: 'INSTANCE_REVISION_NOTE_COMPARISON_BASELINE_FROZEN',
  initialFiles: ['apps/cad-studio/test/instance-revision-note-comparison-baseline-browser.mjs', 'apps/cad-studio/src/ui/InstancePanel.tsx', 'apps/cad-studio/src/ui/InstanceInspector.tsx', 'apps/cad-studio/src/ui/InstanceBriefNotes.tsx', 'apps/cad-studio/src/state/instanceBriefNotes.ts', 'packages/barocss-cad-model/src/assembly/definitions.ts'],
  qualification: 'Baseline: public file revision offer exposes revision/name but no current/offered note text comparison; Keep and Accept preserve their existing semantics.',
  limits: ['Synthetic ordinary shared definition with two occurrences and one unrelated definition only.', 'No approval/authentication claim, nested/pattern/linked-source coverage, stale asynchronous ownership race, native-save roundtrip or geometry accuracy claim.', 'Stored nodes/outputs/placements are compared, not independently recomputed geometry.', 'Baseline is expected to fail once a note comparison UI is implemented.'] });
const instance = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const waiting = () => instance().getByRole('status', { name: 'Revision waiting', exact: true });
const choose = async () => { const row = f.page.locator('[data-browser-instance-path="p1"]'); if (!(await row.getAttribute('class')).split(' ').includes('sel')) await row.click(); await instance().waitFor(); };
const noPending = doc => { const copy = structuredClone(doc); delete copy.pendingParts; return copy; };
async function offer(doc) {
  await choose();
  await f.page.getByLabel('New revision file', { exact: true }).setInputFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await waiting().waitFor(); await f.ready();
  const pending = await f.doc();
  assert.equal(pending.pendingParts.sharedA.rev, 'B');
  assert.equal(pending.pendingParts.sharedA.name, fileName);
  assert.deepEqual(pending.pendingParts.sharedA.doc, doc);
  return pending;
}
await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: 'synthetic-note-assembly.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 0);
  await f.ready(); await choose();
  const base = await f.doc(); // Reader-normalized accepted document, not raw seed JSON order.
  assert.equal(base.instances.length, 3); assert.deepEqual(base.instances[0].doc.brief.notes, oldNote);
  assert.deepEqual(base.instances[0].doc, base.instances[1].doc);
  const incoming = structuredClone(base.instances[0].doc); incoming.brief.notes = newNote;
  const pending = await offer(incoming);
  assert.deepEqual(noPending(pending), noPending(base));
  const status = await waiting().innerText();
  assert.match(status, /Rev B is ready/); assert.ok(status.includes(fileName)); assert.match(status, /all 2 instances/);
  const notes = instance().getByRole('region', { name: 'Definition design-brief notes', exact: true });
  await notes.getByText('Linked parts, patterns and pending revisions are not editable here.', { exact: true }).waitFor();
  const visibleText = await instance().innerText();
  assert.ok(!visibleText.includes(oldNote.value), 'Baseline current note text is not displayed while revision waits');
  assert.ok(!visibleText.includes(newNote.value), 'Baseline offered note text is not displayed');
  await f.same(pending); await f.snapshot('01-offer-without-note-comparison');
  await waiting().getByRole('button', { name: 'Keep Rev A', exact: true }).click();
  await waiting().waitFor({ state: 'hidden' }); await f.ready();
  const kept = await f.doc(); assert.equal(kept.pendingParts, undefined); assert.deepEqual(noPending(kept), noPending(base));
  await f.snapshot('02-kept-A');
  const pendingAgain = await offer(incoming); assert.deepEqual(pendingAgain, pending);
  await waiting().getByRole('button', { name: 'Accept Rev B', exact: true }).click();
  await f.page.waitForFunction(() => window.__studioDoc?.instances?.slice(0, 2).every(i => i.part.rev === 'B'));
  await f.ready(); const accepted = await f.doc();
  assert.equal(accepted.pendingParts, undefined);
  const expected = noPending(base);
  expected.instances = expected.instances.map((inst, index) => index < 2 ? { ...inst, doc: incoming, part: { ...inst.part, rev: 'B', source: fileName } } : inst);
  assert.deepEqual(noPending(accepted), expected); // Includes unrelated instance, placement, all non-note part fields and root metadata.
  assert.deepEqual(accepted.instances[2], base.instances[2]);
  await choose(); await notes.getByText(newNote.value, { exact: true }).waitFor();
  await f.same(accepted); await f.snapshot('03-accepted-B');
  f.report.observations.push({ publicRevisionFileInput: true, pendingRevision: 'B', pendingName: fileName, sharedOccurrences: ['p1', 'p2'], currentAndOfferedTextAbsentBeforeAcceptance: true, keepRestoresAcceptedData: true, acceptOnlyChangesNotesAndExpectedRevisionSource: true, unrelatedInstanceExact: true, storedGeometryAndPlacementExact: true });
});
