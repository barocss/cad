// #274: real public opt-in controls across Open, opt-out and panel Close/reopen.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const [output] = process.argv.slice(2);
const filename = 'same-notes.bcad';
const field = (version, group) => ({
  value: `NOTE_${version}_${group}, "quoted"\nsecond line`, basis: 'stated',
  source: `SOURCE_${version}_${group}`, why: `REASON_${version}_${group}`,
});
const fieldsA = [field('A', 'shared'), field('A', 'independent')];
const fieldsB = [field('B', 'shared'), field('B', 'independent')];
const part = notes => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
  outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes },
});
const assembly = fields => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Same box', doc: part(fields[i < 2 ? 0 : 1]),
    position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })),
});
const a = assembly(fieldsA), b = assembly(fieldsB);
assert.deepEqual(a.instances.map(x => x.id), b.instances.map(x => x.id));
const withoutNotes = doc => { const copy = structuredClone(doc); for (const i of copy.instances) delete i.doc.brief; return copy; };
assert.deepEqual(withoutNotes(a), withoutNotes(b));
const pins = [
  'apps/cad-studio/test/bom-note-open-consent-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/BomPanel.tsx', 'apps/cad-studio/src/ui/BomBriefNotes.tsx',
  'apps/cad-studio/src/engine/client.ts', 'packages/barocss-cad-model/src/bom/designBriefNotes.ts',
  'packages/barocss-cad-model/src/bom/bom.ts',
];
const oracleSource = String.raw`import csv,io,json,sys,hashlib
from pathlib import Path
d=json.load(sys.stdin)
raw=Path(d['file']).read_bytes()
assert hashlib.sha256(raw).hexdigest()==d['sha256']
text=raw.decode('utf-8')
rows=list(csv.reader(io.StringIO(text,newline=''),strict=True))
assert rows[0]==['item no.','item','qty','note scope','design brief notes / occurrence mapping JSON'],rows
assert len(rows)==2 and rows[1][:3]==['1','Same box','3'],rows
assert rows[1][3]=='Design brief notes: intent, not approval',rows[1][3]
groups=json.loads(rows[1][4])
assert groups==[{'parts':['p1','p2'],'state':'note','field':d['fields'][0]}, {'parts':['p3'],'state':'note','field':d['fields'][1]}],groups
for old in d['oldFields']:
 for v in old.values():
  if isinstance(v,str) and '_A_' in v: assert v not in text and v not in json.dumps(groups,ensure_ascii=False),v
assert 'NOTE_A_' not in text and 'SOURCE_A_' not in text and 'REASON_A_' not in text
print(json.dumps({'status':'PASS','rows':1,'qty':3,'occurrences':['p1','p2','p3'],'fullFieldEquality':True,'AFieldsAbsent':True,'bytes':len(raw),'sha256':d['sha256']}))
`;
const f = await createFlow({
  name: 'bom-note-open-consent', output, envFrozen: 'BOM_NOTE_OPEN_CONSENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins, oracleSource,
  qualification: '#274 open opt-in consent across same-name/occurrence document replacement, opt-out, Close/reopen and explicit re-consent.',
  limits: ['Synthetic ordinary made parts. CSV bytes captured from the actual Blob/anchor, not a browser-downloaded file.',
    'No Worker requests or responses are changed; no delayed callback or retained React callback injection.',
    'No geometry accuracy, schema migration, older-reader, project or worker-restart qualification.'],
});

function observe() {
  const urls = new Map(), createUrl = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
  window.__noteCaptures = [];
  URL.createObjectURL = function(blob) { const url = createUrl.call(this, blob); if (blob.type === 'text/csv') urls.set(url, blob); return url; };
  HTMLAnchorElement.prototype.click = function() {
    const blob = urls.get(this.href);
    if (blob && this.download.endsWith(' design-brief notes.csv')) {
      const name = this.download;
      window.__noteCaptures.push(blob.arrayBuffer().then(buffer => ({ name, bytes: [...new Uint8Array(buffer)] })));
      return;
    }
    return click.call(this);
  };
}
const panel = () => f.page.getByRole('complementary', { name: 'BOM panel', exact: true });
const captures = () => f.page.evaluate(() => Promise.all(window.__noteCaptures));
async function open(doc, ready = true) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await chooser.setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.page.waitForFunction(expected => JSON.stringify(window.__studioDoc) === expected, JSON.stringify(doc));
  assert.deepEqual(await f.doc(), doc);
  if (ready) await f.ready();
}
async function ensureBom() {
  if (!await panel().isVisible()) await clickModelCommand(f.page, 'Inspect', 'BOM');
  await panel().waitFor();
}
async function exportB(label) {
  await panel().getByRole('row', { name: 'BOM line 1', exact: true }).waitFor();
  const checkbox = panel().getByLabel('Include design-brief notes', { exact: true });
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(await panel().getByRole('button', { name: 'Export design-brief notes', exact: true }).count(), 0);
  await checkbox.check();
  const region = panel().getByRole('region', { name: 'Design-brief notes', exact: true });
  assert.ok((await region.innerText()).includes(fieldsB[0].value));
  assert.equal((await region.innerText()).includes('NOTE_A_'), false);
  const n = (await captures()).length;
  await panel().getByRole('button', { name: 'Export design-brief notes', exact: true }).click();
  const all = await captures(); assert.equal(all.length, n + 1);
  const capture = all.at(-1), bytes = Buffer.from(capture.bytes), file = join(output, label + '.csv');
  assert.equal(capture.name, 'same-notes design-brief notes.csv');
  await writeFile(file, bytes);
  await f.runOracle({ file, sha256: sha256(bytes), fields: fieldsB, oldFields: fieldsA }, label);
  await f.same(b);
  f.report.files.push({ file, bytes: bytes.length, sha256: sha256(bytes), boundary: 'original CSV Blob/anchor, no browser download' });
  return bytes;
}
await f.run(async () => {
  const create = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => { const context = await create({ ...options, acceptDownloads: false }); await context.addInitScript(observe); return context; };
  await f.newPage();
  f.phase = 'A with notes consent remains open across Open B';
  await open(a); await ensureBom();
  await panel().getByRole('row', { name: 'BOM line 1', exact: true }).waitFor();
  await panel().getByLabel('Include design-brief notes').check();
  assert.ok((await panel().innerText()).includes(fieldsA[0].value));
  await f.snapshot('01-A-open-consent');
  assert.equal((await captures()).length, 0);
  await open(b); await ensureBom();
  const first = await exportB('02-B-fresh-consent');
  await f.snapshot('02-B-fresh-consent');
  f.phase = 'explicit opt-out removes notes export without modifying document';
  await panel().getByLabel('Include design-brief notes').uncheck();
  assert.equal(await panel().getByRole('button', { name: 'Export design-brief notes', exact: true }).count(), 0);
  assert.equal((await captures()).length, 1); await f.same(b);
  assert.deepEqual(await exportB('03-B-reconsent'), first);
  f.phase = 'close and reopen require fresh session consent';
  await panel().getByLabel('Close BOM', { exact: true }).click();
  await ensureBom();
  assert.deepEqual(await exportB('04-B-panel-reopened'), first);
  await f.snapshot('04-B-panel-reopened');
  assert.equal((await captures()).length, 3);
  await f.same(b);
  f.report.observations.push({ label: 'open-consent-boundary', sameFilename: filename,
    sameOccurrenceIDs: ['p1', 'p2', 'p3'], AConsentOpenAtDocumentSwitch: true,
    BRequiredFreshConsent: true, optOutAndReconsent: true, panelReopenRequiredConsent: true,
    documentUnchanged: true, actualExports: 3,
    retainedReactCallbackInvocation: 'NOT_RUN; this driver exercises actual current public controls only',
    workerDelayedReply: 'NOT_RUN; covered separately by bom-note-currentness-browser.mjs' });
});
