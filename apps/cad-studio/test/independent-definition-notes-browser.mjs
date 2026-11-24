import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const output = process.argv[2];
const original = { value: 'Original design intent', basis: 'assumed', source: 'Synthetic fixture', why: 'Review only' };
const firstText = 'Independent, "new intent"\n두 번째 줄';
const reopenedText = '=1+1 first cell\nFinal, "measured" — 의도';
const box = notes => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 5], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 2, id: 'n1' }],
  outputs: { b1: { node: 1, side: 'solid' } },
  ...(notes ? { brief: { version: 1, notes } } : {}),
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nodes: [], outputs: {}, parameters: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({
    id, name: 'Same box', doc: box(i < 2 ? original : undefined), position: [15 * i, 0, 0], rotation: [0, 0, 0],
    part: { id: i < 2 ? 'sharedA' : 'independentB', rev: 'A' },
  })),
};
const pins = [
  'apps/cad-studio/src/ui/InstancePanel.tsx', 'apps/cad-studio/src/ui/InstanceBriefNotes.tsx',
  'apps/cad-studio/src/state/instanceBriefNotes.ts', 'packages/barocss-cad-model/src/assembly/definitions.ts',
  'packages/barocss-cad-model/src/bom/designBriefNotes.ts',
];
const f = await createFlow({
  name: 'independent-definition-notes', output, envFrozen: 'D1903_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Make a shared ordinary part independent, edit its definition note, then repeat the edit after native Save and fresh Open.',
  limits: ['Three synthetic ordinary made parts. Synthetic baseline for currentness checks.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { bomView, deriveBom } from '@barocss/cad-model/team/assembly';
import { draftBaseline, moveBaseline, verifyBaseline } from '@barocss/cad-model/team/baseline';
import { userToken } from '@barocss/cad-model/team/ecr';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const view = await bomView(doc, async part => evaluatePart(part, 1));
if (JSON.parse(process.argv[3]) === 'seed') {
  const draft = draftBaseline(doc, deriveBom(view), view);
  const review = await moveBaseline(draft.doc, draft.baseline.id, 'review', userToken('2026-11-24T00:00:00Z'));
  const approved = await moveBaseline(review.doc, draft.baseline.id, 'approved', userToken('2026-11-24T00:00:01Z'));
  console.log(JSON.stringify(approved.doc));
} else console.log(JSON.stringify(verifyBaseline(doc, 'BL1')));
`,
  oracleSource: String.raw`import csv,io,json,sys
d=json.load(sys.stdin)
rows=list(csv.reader(io.StringIO(d['csv'],newline=''),strict=True))
assert rows[0]==['item no.','item','qty','note scope','design brief notes / occurrence mapping JSON']
assert len(rows)==2 and rows[1][:3]==['1','Same box','3']
assert rows[1][3]=='Design brief notes: intent, not approval'
mapping={}
for group in json.loads(rows[1][4]):
 for part in group['parts']:
  assert part not in mapping, part
  mapping[part]={k:v for k,v in group.items() if k!='parts'}
assert mapping==d['expected'], mapping
print(json.dumps({'status':'PASS','qty':3,'completeFields':True,'occurrences':sorted(mapping)}))
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const inspector = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const notes = () => inspector().getByRole('region', { name: 'Definition design-brief notes' });
const bom = () => f.page.getByRole('complementary', { name: 'BOM panel' });

async function choose(id) {
  const row = f.page.locator(`[data-browser-instance-path="${id}"]`);
  if (!(await row.getAttribute('class')).split(' ').includes('sel')) await row.click();
  await notes().waitFor();
}
async function edit(text, expected) {
  await choose('p2');
  await button('Edit notes', notes()).click();
  const input = notes().getByLabel('Definition notes', { exact: true });
  assert.equal(await input.inputValue(), expected);
  await input.fill(text);
  await button('Save notes', notes()).click();
  await f.page.waitForFunction(v => window.__studioDoc?.instances[1]?.doc.brief?.notes?.value === v, text);
  await f.ready();
  const doc = await f.doc(), field = doc.instances[1].doc.brief.notes;
  assert.equal(field.value, text);
  assert.equal(field.source, text);
  assert.equal(field.basis, 'stated');
  assert.equal(field.confirmed.by, 'user');
  assert.ok(Number.isFinite(Date.parse(field.confirmed.at)));
  assert.deepEqual(Object.keys(field).sort(), ['basis', 'confirmed', 'source', 'value']);
  return doc;
}
async function openBom() {
  await clickModelCommand(f.page, 'Inspect', 'BOM');
  await bom().getByRole('row', { name: 'BOM line 1', exact: true }).waitFor();
  await bom().getByLabel('Purchase list with made parts', { exact: true }).check();
  assert.match(await bom().getByLabel('BOM totals').innerText(), /^3 parts/);
}
async function download(name, label) {
  const pending = f.page.waitForEvent('download');
  await button(name, bom()).click();
  const download = await pending;
  const file = join(output, label + '.csv');
  await download.saveAs(file);
  assert.equal(await download.failure(), null);
  return readFile(file);
}
const closeBom = () => bom().getByLabel('Close BOM', { exact: true }).click();
async function checkNotes(doc, label) {
  await openBom();
  assert.equal(await bom().getByLabel('Include design-brief notes', { exact: true }).isChecked(), false);
  await bom().getByLabel('Include design-brief notes', { exact: true }).check();
  const bytes = await download('Export design-brief notes', label);
  const expected = Object.fromEntries(doc.instances.map(({ id, doc: part }) => [id, part.brief?.notes
    ? { state: 'note', field: part.brief.notes } : { state: 'absent' }]));
  await f.runOracle({ csv: bytes.toString('utf8'), expected }, label);
  return bytes;
}
function checkInvariant(base, doc, definition) {
  assert.deepEqual(doc.instances[0], base.instances[0]);
  assert.deepEqual(doc.instances[2], base.instances[2]);
  assert.deepEqual(doc.baselines, base.baselines);
  assert.equal(doc.instances[1].part.id, definition);
  const copy = structuredClone(doc.instances[1]);
  copy.doc.brief = base.instances[1].doc.brief;
  copy.part = base.instances[1].part;
  assert.deepEqual(copy, base.instances[1]);
}

await f.run(async () => {
  f.phase = 'open approved synthetic assembly';
  const base = await f.inspect('seed-baseline', seed, 'seed');
  assert.deepEqual(await f.inspect('source-baseline', base, 'check'), { intact: true, mismatches: [], current: true, changed: [] });
  await f.newPage();
  await f.openFile({ name: 'definition-notes.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base)) }, 0);
  await f.same(base);
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await openBom();
  const purchase = await download('Export purchase list', '01-purchase-before');
  const totals = await bom().getByLabel('BOM totals').innerText();
  await closeBom();
  await choose('p2');
  await f.snapshot('01-shared-definition');

  f.phase = 'make the selected shared occurrence independent';
  await button('Make independent', inspector()).click();
  await f.changed(base);
  const separated = await f.doc(), definition = separated.instances[1].part.id;
  assert.ok(definition && !base.instances.some(item => item.part.id === definition));
  assert.deepEqual(separated.instances[1].doc, base.instances[1].doc);
  checkInvariant(base, separated, definition);
  await f.snapshot('02-independent-definition');

  f.phase = 'save the independent definition note and verify its history';
  const edited = await edit(firstText, original.value);
  checkInvariant(base, edited, definition);
  await f.snapshot('03-independent-note-saved');
  await f.undo(); await f.same(separated);
  await f.undo(); await f.same(base);
  await f.redo(); await f.same(separated);
  await f.redo(); await f.same(edited);
  const proof = await f.inspect('edited-baseline', edited, 'check');
  assert.deepEqual(proof, { intact: true, mismatches: [], current: false, changed: ['part p2'] });
  await checkNotes(edited, '04-edited-notes');
  await closeBom();
  const first = await f.save('first-independent-note');
  await f.freshOpen(first.file, edited, '04-fresh-open-first-note');

  f.phase = 'save a new definition note after fresh Open';
  const reedited = await edit(reopenedText, firstText);
  checkInvariant(base, reedited, definition);
  await f.snapshot('05-reopened-note-reeedited');
  await f.undo(); await f.same(edited);
  await f.redo(); await f.same(reedited);
  const second = await f.save('second-independent-note');
  await f.freshOpen(second.file, reedited, '06-fresh-open-second-note');
  checkInvariant(base, await f.doc(), definition);
  assert.deepEqual(await f.inspect('reopened-baseline', reedited, 'check'), proof);
  const after = await checkNotes(reedited, '07-final-notes');
  assert.ok(after.includes(Buffer.from('=1+1 first cell')));
  assert.equal(await bom().getByLabel('BOM totals').innerText(), totals);
  assert.deepEqual(await download('Export purchase list', '08-purchase-final'), purchase);
  await f.same(reedited);
  await f.snapshot('07-final-bom-note-mapping');
  f.report.observations.push({ definition, openEdits: 2, baseline: proof, total: totals, purchaseBytes: purchase.length });
});
