// #274: real BOM read reply delivery timing only; no product payload replacement.
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
const a = assembly(fieldsA), b = assembly(fieldsB), bad = structuredClone(b);
bad.instances[2].doc.nodes[1].height = 0;
assert.deepEqual(a.instances.map(x => x.id), b.instances.map(x => x.id));
const withoutNotes = doc => { const copy = structuredClone(doc); for (const i of copy.instances) delete i.doc.brief; return copy; };
assert.deepEqual(withoutNotes(a), withoutNotes(b));
// Independent expected evaluation wire shape: notes and nextId are not evaluator inputs.
const expectedRootRead = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {},
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({
    id, name: 'Same box', position: [i * 15, 0, 0], rotation: [0, 0, 0],
    part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' },
    doc: { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
      nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] },
        { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
      outputs: { b1: { node: 1, side: 'solid' } } },
  })),
};
const pins = [
  'apps/cad-studio/test/bom-note-currentness-browser.mjs', 'apps/cad-studio/src/App.tsx',
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
  name: 'bom-note-currentness', output, envFrozen: 'BOM_NOTE_CURRENTNESS_FROZEN',
  initialFiles: pins, requiredFrozen: pins, oracleSource,
  qualification: '#274 same-name/same-occurrence Open while a real BOM read reply is held; current notes CSV only.',
  limits: ['Synthetic ordinary made parts. CSV bytes captured from the actual Blob/anchor, not a browser-downloaded file.',
    'Only callback delivery timing is delayed; no Worker result, error or mass payload is synthesized.',
    'No geometry accuracy, schema migration, older-reader, project or worker-restart qualification.'],
});

function observe() {
  const proto = Worker.prototype, post = proto.postMessage;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  if (!descriptor?.set) throw Error('Native Worker onmessage required');
  const requests = new WeakMap(), nodeTables = new WeakMap(), queue = [], samples = [], replies = [], readRequests = [];
  let armed = false, expectedA = null, target = null, held = null, afterB = false;
  const sample = phase => samples.push({ phase,
    doc: JSON.parse(JSON.stringify(window.__studioDoc)),
    text: document.querySelector('[aria-label="Design-brief notes"]')?.textContent ?? '',
    exports: window.__noteCaptures.length,
    exportPresent: !!document.querySelector('[aria-label="Export design-brief notes"]'),
  });
  proto.postMessage = function(request, ...args) {
    if (!nodeTables.has(this)) nodeTables.set(this, new Map());
    const table = nodeTables.get(this);
    // Observe actual wire additions across all request slots; never change outgoing data.
    for (const wire of [request?.doc, request?.base]) {
      for (const [id, node] of wire?.added ?? []) table.set(id, structuredClone(node));
    }
    if (request?.type === 'part' && request.slot === 'read') {
      if (!requests.has(this)) requests.set(this, new Map());
      const read = { id: request.id, revision: request.revision, nativeSource: request.nativeSource,
        wire: structuredClone(request.doc),
        doc: { ...request.doc.doc, nodes: request.doc.ids.map(id => {
          if (!table.has(id)) throw Error('Unobserved wire node ID ' + id);
          return structuredClone(table.get(id));
        }) },
        acceptedDocAtPost: JSON.parse(JSON.stringify(window.__studioDoc)),
      };
      requests.get(this).set(request.id, read); readRequests.push(read);
      if (armed) {
        if (JSON.stringify(read.acceptedDocAtPost) !== expectedA) throw Error('A owner changed before armed read');
        armed = false; target = { worker: this, ...read };
      }
    }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(proto, 'onmessage', { configurable: true, get: descriptor.get, set(callback) {
    descriptor.set.call(this, callback && function(event) {
      const request = requests.get(this)?.get(event.data?.id);
      if (request && event.data.result) replies.push({ request, response: event.data });
      if (target?.worker === this) {
        if (!held && event.data?.id === target.id && event.data.result) held = { request, response: event.data };
        if (held) { queue.push(() => callback.call(this, event)); return; }
      }
      callback.call(this, event);
    });
  } });
  window.__noteHold = {
    arm(doc) { if (armed || target) throw Error('One hold only'); expectedA = JSON.stringify(doc); if (JSON.stringify(window.__studioDoc) !== expectedA) throw Error('A must be accepted'); armed = true; },
    read: () => ({ held, queued: queue.length, readRequests, replies, samples }),
    markB() { afterB = true; sample('B accepted before release'); },
    async release() {
      if (!held || !afterB) throw Error('Real A response and accepted B required');
      while (queue.length) { queue.shift()(); sample('callback'); await new Promise(resolve => setTimeout(resolve, 0)); sample('tick'); }
      target = null; sample('released');
    },
  };
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
async function noNotes() {
  assert.equal(await panel().getByRole('region', { name: 'Design-brief notes', exact: true }).count(), 0);
  assert.equal(await panel().getByRole('button', { name: 'Export design-brief notes', exact: true }).count(), 0);
  assert.equal(await panel().getByRole('button', { name: 'Export purchase list', exact: true }).isEnabled(), false);
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
  try {
    f.phase = 'A loaded and initial notes explicitly included';
    await open(a); await ensureBom();
    await panel().getByRole('row', { name: 'BOM line 1', exact: true }).waitFor();
    await panel().getByLabel('Include design-brief notes').check();
    assert.ok((await panel().innerText()).includes(fieldsA[0].value));
    await panel().getByLabel('Close BOM', { exact: true }).click();
    await f.page.evaluate(doc => window.__noteHold.arm(doc), a);
    await ensureBom();
    await f.page.waitForFunction(() => !!window.__noteHold.read().held);
    const held = await f.page.evaluate(() => window.__noteHold.read().held);
    assert.equal(held.response.result.ok, true);
    assert.deepEqual(held.request.acceptedDocAtPost, a);
    assert.equal('brief' in held.request.wire.doc, false);
    assert.deepEqual(held.request.doc, expectedRootRead);
    assert.equal(held.request.nativeSource.requestId, held.request.id);
    assert.equal(held.request.nativeSource.revision, held.request.revision);
    await writeFile(join(output, 'held-A-original.json'), JSON.stringify(held, null, 2));
    f.report.observations.push({ label: 'held-A-authentication', heldScope: 'root assembly BOM read, not child', requestId: held.request.id,
      revision: held.request.revision, nativeSource: held.request.nativeSource,
      acceptedNotes: held.request.acceptedDocAtPost.instances.map(i => i.doc.brief.notes), wireBriefPresent: 'brief' in held.request.wire.doc, responseId: held.response.id, ok: held.response.result.ok });
    assert.equal(held.response.id, held.request.id);
    await noNotes();
    await f.snapshot('01-real-A-read-held');

    f.phase = 'same-name same-IDs B accepted before original FIFO release';
    await open(b, false); await ensureBom();
    await f.page.evaluate(() => window.__noteHold.markB());
    await noNotes(); assert.equal((await captures()).length, 0);
    await f.snapshot('02-B-pending-no-notes');
    await f.page.evaluate(() => window.__noteHold.release());
    await f.same(b);
    const trace = await f.page.evaluate(() => window.__noteHold.read());
    for (const sample of trace.samples) {
      assert.deepEqual(sample.doc, b);
      assert.equal(sample.text.includes('NOTE_A_'), false);
      assert.equal(sample.exports, 0);
    }
    const first = await exportB('03-current-B-notes');
    const completedReads = await f.page.evaluate(() => window.__noteHold.read());
    const bRootReads = completedReads.readRequests.filter(r => JSON.stringify(r.acceptedDocAtPost) === JSON.stringify(b) && r.doc.instances?.length === 3);
    assert.ok(bRootReads.length > 0);
    for (const read of bRootReads) assert.deepEqual(read.doc, expectedRootRead);
    await writeFile(join(output, 'worker-read-trace-after-B.json'), JSON.stringify(completedReads, null, 2));
    await f.snapshot('03-current-B-notes');

    f.phase = 'actual zero-height child refusal cannot export old notes';
    await open(bad, false); await ensureBom();
    const error = panel().getByRole('alert'); await error.waitFor();
    assert.match(await error.innerText(), /height must not be zero/);
    await noNotes(); assert.equal((await captures()).length, 1);
    assert.deepEqual(await f.doc(), bad);
    const failures = await f.page.evaluate(() => window.__noteHold.read().replies.filter(r => r.response.result?.ok === false));
    assert.ok(failures.some(r => r.request.doc?.nodes?.some(n => n.kind === 'extrude' && n.height === 0)));
    await f.snapshot('04-failed-child-no-notes');
    f.phase = 'B recovery requires new opt-in and exports identical current notes';
    await open(b); await ensureBom();
    assert.deepEqual(await exportB('05-recovered-B-notes'), first);
    await f.snapshot('05-recovered-B-notes');
    await writeFile(join(output, 'worker-read-trace.json'), JSON.stringify(await f.page.evaluate(() => window.__noteHold.read()), null, 2));
    f.report.observations.push({ label: 'note-currentness', sameFilename: filename, sameOccurrenceIDs: ['p1', 'p2', 'p3'],
      heldRequest: held.request, heldResultOK: held.response.result.ok, callbackSamples: trace.samples.length,
      noExportsDuringHold: true, oldFieldsAbsent: true, actualFailedChild: failures.map(r => ({ request: r.request, error: r.response.result.error })),
      initialAOptInClosedBeforeHold: true, oldOpenConsentPersistence: 'NOT_TESTED: A panel was closed before the held second read',
      csvBoundary: 'Blob/anchor original bytes, not browser download', recoveryBytesExact: true });
  } finally {
    await writeFile(join(output, 'observer-final.json'), JSON.stringify(await f.page.evaluate(() => window.__noteHold.read()), null, 2));
  }
});
