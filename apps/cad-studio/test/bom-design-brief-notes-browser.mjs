import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const [output] = process.argv.slice(2);
const pins = ['apps/cad-studio/src/ui/BomPanel.tsx', 'apps/cad-studio/src/ui/BomBriefNotes.tsx', 'packages/barocss-cad-model/src/bom/designBriefNotes.ts', 'apps/cad-studio/test/bom-design-brief-notes-browser.mjs'];
const A = { value: '검토용 A, "quoted"\nsecond line', basis: 'assumed', source: 'Synthetic source A', why: 'Review intent only' };
const B = { value: '=1+1', basis: 'ambiguous', source: 'Synthetic source B' };
const part = notes => ({ format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
  outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes } });
const doc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Same box', doc: part(i < 2 ? A : B), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'sharedA' : 'independentB', rev: 'A' } })) };
const f = await createFlow({ name: 'bom-design-brief-notes', output, envFrozen: 'BOM_BRIEF_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: '#274 existing definition design-intent notes only; explicit read/export opt-in, no note authoring or approval.',
  limits: ['Synthetic top-level ordinary made boxes only. No source-revision edit, baseline approval, nested notes or delayed reply acceptance claim.'],
  oracleSource: String.raw`import csv,io,json,sys
d=json.load(sys.stdin)
r=list(csv.reader(io.StringIO(d['csv'],newline=''),strict=True))
assert r[0]==['item no.','item','qty','note scope','design brief notes / occurrence mapping JSON'],r
assert len(r)==2 and r[1][2]=='3',r
g=json.loads(r[1][4]);assert len(g)==2,g
assert g[0]['parts']==['p1','p2'] and g[1]['parts']==['p3'],g
assert g[0]['field']==d['A'] and g[1]['field']==d['B'],g
assert all(x['state']=='note' for x in g)
assert all('confirmed' not in x['field'] for x in g)
print(json.dumps({'status':'PASS','rows':1,'qty':3,'groups':2,'mapping':[['p1','p2'],['p3']],'fieldRoundTrip':True}))`,
});
await f.run(async () => {
  const create = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await create({ ...options, acceptDownloads: false });
    await context.addInitScript(() => {
      const urls = new Map(), url = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
      window.__briefCaptures = [];
      URL.createObjectURL = function (blob) { const value = url.call(this, blob); urls.set(value, blob); return value; };
      HTMLAnchorElement.prototype.click = function () { const blob = urls.get(this.href); if (!blob || !/\.(csv|bcad)$/.test(this.download)) return click.call(this); const name = this.download; window.__briefCaptures.push(blob.text().then(text => ({ name, text }))); };
    });
    return context;
  };
  await f.newPage();
  const open = async (name, value) => { const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]); await chooser.setFiles({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await f.same(value); };
  await open('brief-notes', doc);
  const openBom = async () => { await clickModelCommand(f.page, 'Inspect', 'BOM'); const p = f.page.getByRole('complementary', { name: 'BOM panel' }); await p.getByRole('row', { name: 'BOM line 1', exact: true }).waitFor(); return p; };
  let panel = await openBom();
  const captures = () => f.page.evaluate(() => Promise.all(window.__briefCaptures));
  const baseline = await f.snapshot('01-default-off');
  const total = await panel.getByLabel('BOM totals').innerText();
  assert.equal(await panel.getByLabel('Include design-brief notes').isChecked(), false);
  assert.equal(await panel.getByRole('button', { name: 'Export design-brief notes', exact: true }).count(), 0);
  const rows = panel.getByRole('table', { name: 'BOM lines', exact: true }).getByRole('row');
  assert.equal(await rows.count(), 2);
  assert.equal((await rows.nth(1).getByRole('cell').nth(2).innerText()).trim(), '3');
  await panel.getByLabel('Purchase list with made parts').check();
  await panel.getByRole('button', { name: 'Export purchase list', exact: true }).click();
  const beforeCsv = (await captures()).at(-1).text;
  assert.equal(beforeCsv, 'item no.,item,qty,kind,size,row,catalogue,source,estimate\n1,Same box,3,part,,,,,\n');
  await panel.getByLabel('Include design-brief notes').check();
  const notes = panel.getByRole('region', { name: 'Design-brief notes' });
  await notes.getByText('Occurrences: p1, p2', { exact: true }).waitFor();
  assert.ok((await notes.innerText()).includes('Different notes'));
  assert.ok((await notes.innerText()).includes('Confirmation: Not recorded'));
  await panel.getByRole('button', { name: 'Export design-brief notes', exact: true }).click();
  const csv = (await captures()).at(-1).text;
  await f.runOracle({ csv, A, B }, '02-notes');
  await writeFile(join(output, 'notes.csv'), csv);
  assert.equal(await panel.getByLabel('BOM totals').innerText(), total);
  await panel.getByRole('button', { name: 'Export purchase list', exact: true }).click();
  assert.equal((await captures()).at(-1).text, beforeCsv);
  const shown = await f.snapshot('02-notes-shown');
  for (const k of ['doc', 'selection', 'history']) assert.deepEqual(shown[k], baseline[k], k);
  await f.same(doc);
  await panel.getByLabel('Close BOM').click();
  panel = await openBom();
  assert.equal(await panel.getByLabel('Include design-brief notes').isChecked(), false);
  await panel.getByLabel('Close BOM').click();
  const count = (await captures()).length;
  await f.page.getByRole('button', { name: 'Save', exact: true }).click();
  await f.page.waitForFunction(n => window.__briefCaptures.length > n, count);
  const nativeSave = (await captures()).at(-1);
  assert.ok(nativeSave.name.endsWith('.bcad'));
  const saved = { file: join(output, 'brief-notes.bcad'), doc: JSON.parse(nativeSave.text) };
  assert.deepEqual(saved.doc, doc);
  await writeFile(saved.file, nativeSave.text);
  await f.freshOpen(saved.file, saved.doc, '03-fresh-open');
  panel = await openBom();
  assert.equal(await panel.getByLabel('Include design-brief notes').isChecked(), false);
  await panel.getByLabel('Include design-brief notes').check();
  await panel.getByRole('button', { name: 'Export design-brief notes', exact: true }).click();
  assert.equal((await captures()).at(-1).text, csv);
  await f.same(saved.doc);
  await f.snapshot('04-fresh-notes');
  f.report.observations.push({ label: 'bounded-notes-consumer', qty: 3, displayedTotals: total, nativeMassOracle: 'NOT_RUN; actual01 inspector null exit', defaultCsvUnchanged: true, documentUnchanged: true, freshCsvExact: true });
});
