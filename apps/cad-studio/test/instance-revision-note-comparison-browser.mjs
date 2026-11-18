import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const oldText = 'Current <b>synthetic</b> note A';
const secrets = ['PRIVATE_SOURCE_SENTINEL', 'PRIVATE_WHY_SENTINEL', 'PRIVATE_TIME_SENTINEL', 'PRIVATE_PURPOSE_SENTINEL', 'PRIVATE_ROOT_SENTINEL', 'PRIVATE_P3_SENTINEL'];
const field = value => ({ value, basis: 'assumed', source: `<img src=x>${secrets[0]}`, why: secrets[1], said: 'unverified', confirmed: { by: 'user', at: secrets[2] } });
const part = value => ({ format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes: field(value), purpose: { value: secrets[3], basis: 'stated' } } });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0, brief: { version: 1, notes: field(secrets[4]) },
 instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: `Synthetic box ${i + 1}`, doc: part(i === 2 ? secrets[5] : oldText), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'sharedA' : 'independentB', rev: 'A' } })) };
const fileName = 'synthetic-note-offer.bcad';
const f = await createFlow({ name: 'instance-revision-note-comparison', output: process.argv[2], envFrozen: 'INSTANCE_REVISION_NOTE_COMPARISON_FROZEN',
 initialFiles: ['apps/cad-studio/test/instance-revision-note-comparison-browser.mjs', 'apps/cad-studio/src/state/instanceRevisionNotes.ts', 'apps/cad-studio/src/ui/InstanceRevisionNotes.tsx', 'apps/cad-studio/src/ui/InstancePanel.tsx', 'apps/cad-studio/src/ui/InstanceInspector.tsx', 'packages/barocss-cad-model/src/assembly/definitions.ts'],
 qualification: 'Public file revision notes comparison: explicit disclosure, plain text, scoped metadata redaction, selection/offer/Undo reset, Keep/Accept and native roundtrip.',
 limits: ['Synthetic ordinary two-shared/one-independent definition only; no linked source, nested/pattern or asynchronous completion race coverage.', 'Stored geometry data invariance only, not geometry certification. Stored confirmation presence is not authenticated approval.', 'Sentinels are synthetic. Non-disclosure assertions concern the comparison DOM, not unrelated application UI.'] });
const instance = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const waiting = () => instance().getByRole('status', { name: 'Revision waiting', exact: true });
const compare = () => instance().getByRole('region', { name: 'Revision note comparison', exact: true });
const side = name => compare().getByRole('region', { name: `${name} revision note`, exact: true });
async function select(id) { const row = f.page.locator(`[data-browser-instance-path="${id}"]`); if (!(await row.getAttribute('class')).split(' ').includes('sel')) await row.click(); await instance().waitFor(); }
const stripPending = d => { const c = structuredClone(d); delete c.pendingParts; return c; };
async function closed(doc) {
 await compare().getByRole('button', { name: 'Compare design-brief notes', exact: true }).waitFor();
 assert.equal(await side('Current').count(), 0); assert.equal(await side('Offered').count(), 0);
 const html = await compare().innerHTML(); for (const s of [oldText, 'Offered synthetic B', 'Replacement synthetic B', ...secrets]) assert.ok(!html.includes(s));
 await f.same(doc);
}
async function reveal(doc, offered, change = 'changed') {
 await compare().getByRole('button', { name: 'Compare design-brief notes', exact: true }).click();
 await side('Current').getByText(oldText, { exact: true }).waitFor();
 await side('Offered').getByText(offered ?? 'No design-brief note recorded.', { exact: true }).waitFor();
 assert.match(await side('Current').innerText(), /Current · Rev A/); assert.match(await side('Offered').innerText(), /Offered · Rev B/);
 await compare().getByText(`Note text ${change}.`, { exact: false }).waitFor();
 const html = await compare().innerHTML(); for (const s of secrets) assert.ok(!html.includes(s));
 assert.ok(!html.includes('unverified')); assert.equal(await compare().locator('img, a, script').count(), 0);
 assert.equal(await side('Current').locator('b').filter({ hasText: 'synthetic' }).count(), 0, 'Note markup must remain plain text');
 assert.match(await side('Current').innerText(), /Basis: assumed/); assert.match(await side('Current').innerText(), /Stored user-confirmation record present/);
 await f.same(doc);
}
async function offer(incoming) {
 await f.page.getByLabel('New revision file', { exact: true }).setInputFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
 await f.page.waitForFunction(value => !!window.__studioDoc?.pendingParts?.sharedA && window.__studioDoc.pendingParts.sharedA.doc?.brief?.notes?.value === value, incoming.brief?.notes?.value);
 await waiting().waitFor(); await f.ready(); const doc = await f.doc(); assert.equal(doc.pendingParts.sharedA.rev, 'B'); assert.deepEqual(doc.pendingParts.sharedA.doc, incoming); return doc;
}
await f.run(async () => {
 await f.newPage(); await f.openFile({ name: 'synthetic-note-assembly.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 0); await f.ready(); await select('p1');
 const base = await f.doc(); const incoming = structuredClone(base.instances[0].doc); incoming.brief.notes = { ...incoming.brief.notes, value: 'Offered synthetic B' };
 let pending = await offer(incoming); assert.deepEqual(stripPending(pending), stripPending(base)); await closed(pending); await f.snapshot('01-collapsed');
 await reveal(pending, incoming.brief.notes.value); await waiting().evaluate(el => el.scrollIntoView({ block: 'start' })); await f.snapshot('02-explicit-comparison');
 await compare().getByRole('button', { name: 'Hide note comparison', exact: true }).click(); await closed(pending); await reveal(pending, incoming.brief.notes.value);
 await select('p2'); await closed(pending); await reveal(pending, incoming.brief.notes.value); await select('p1'); await closed(pending); await reveal(pending, incoming.brief.notes.value);
 const replacement = structuredClone(incoming); replacement.brief.notes.value = 'Replacement synthetic B'; replacement.brief.notes.why = 'PRIVATE_REPLACED_WHY';
 pending = await offer(replacement); await closed(pending); await reveal(pending, replacement.brief.notes.value); assert.ok(!(await compare().innerHTML()).includes('PRIVATE_REPLACED_WHY')); await waiting().evaluate(el => el.scrollIntoView({ block: 'start' })); await f.snapshot('03-replaced-offer');
 await select('p3'); assert.equal(await compare().count(), 0); await f.same(pending); await select('p1'); await closed(pending); await reveal(pending, replacement.brief.notes.value);
 // A public Open of a same-content document must not inherit the old disclosure.
 await f.openFile({ name: 'synthetic-pending-reopened.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pending)) }, 0);
 await f.ready(); assert.deepEqual(await f.doc(), pending); pending = await f.doc(); await select('p1'); await closed(pending);
 const metadataOnly = structuredClone(base.instances[0].doc); metadataOnly.brief.notes.source = 'PRIVATE_METADATA_ONLY_SOURCE';
 pending = await offer(metadataOnly); await closed(pending); await reveal(pending, oldText, 'unchanged');
 await compare().getByText('Note metadata also differs;', { exact: false }).waitFor(); assert.ok(!(await compare().innerHTML()).includes('PRIVATE_METADATA_ONLY_SOURCE'));
 await waiting().getByRole('button', { name: 'Keep Rev A', exact: true }).click(); await waiting().waitFor({ state: 'hidden' }); await f.ready();
 assert.deepEqual(stripPending(await f.doc()), stripPending(base)); assert.equal((await f.doc()).pendingParts, undefined); assert.equal(await compare().count(), 0);
 // Explicit offered removal is a comparison, never an implicit clear operation.
 const removed = structuredClone(incoming); delete removed.brief.notes;
 pending = await offer(removed); await closed(pending); await reveal(pending, null, 'removed'); await waiting().evaluate(el => el.scrollIntoView({ block: 'start' })); await f.snapshot('04-offered-removal');
 await waiting().getByRole('button', { name: 'Keep Rev A', exact: true }).click(); await waiting().waitFor({ state: 'hidden' }); await f.ready();
 pending = await offer(incoming); await closed(pending); await reveal(pending, incoming.brief.notes.value);
 await waiting().getByRole('button', { name: 'Accept Rev B', exact: true }).click(); await f.page.waitForFunction(() => window.__studioDoc?.instances?.[0]?.part?.rev === 'B'); await f.ready();
 const accepted = await f.doc(); const expected = stripPending(base); expected.instances = expected.instances.map((i, k) => k < 2 ? { ...i, doc: incoming, part: { ...i.part, rev: 'B', source: fileName } } : i);
 assert.deepEqual(stripPending(accepted), expected); assert.equal(accepted.pendingParts, undefined); assert.equal(await compare().count(), 0); await f.snapshot('05-accepted');
 await f.undo(); await f.same(pending); await select('p1'); await closed(pending); await f.redo(); await f.same(accepted); assert.equal(await compare().count(), 0);
 const saved = await f.save('synthetic-accepted-notes'); assert.deepEqual(saved.doc, accepted); await f.freshOpen(saved.file, saved.doc, '06-fresh-open'); await select('p1');
 assert.equal(await compare().count(), 0); await instance().getByRole('region', { name: 'Definition design-brief notes', exact: true }).getByText(incoming.brief.notes.value, { exact: true }).waitFor(); await f.same(saved.doc);
 f.report.observations.push({ defaultCollapsed: true, explicitDisclosureOnly: true, plainTextMarkup: true, comparisonProvenanceRedacted: true, sharedSelectionReset: true, sameRevisionOfferReset: true, unrelatedSelectionNoComparison: true, sameContentOpenReset: true, metadataOnlyTextUnchanged: true, keepAndOfferedRemovalNonmutating: true, acceptedOnlyExpectedFieldsChanged: true, undoDoesNotRestoreDisclosure: true, nativeSaveFreshOpen: true });
});
