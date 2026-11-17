import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
const output = process.argv[2];
const fixture = 'handover/notes/trimmed-surface-region-2026-10-30/studio/run-01/outside-hole.bcad';
const originalBytes = await readFile(fixture), original = JSON.parse(originalBytes);
const id = 'obj_3', name = 'D341 · panel · region 1';
const target = doc => doc.direct.objects.find(o => o.id === id);
const pins = ['apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/src/ui/surfaceInspection.ts', 'apps/cad-studio/test/trimmed-surface-inspection-browser.mjs', 'apps/cad-studio/' + fixture];
const f = await createFlow({ name: 'trimmed-surface-inspection', output, envFrozen: 'SURFACE_INSPECTION_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: '#1 original outside-hole point classification and explicit whole-support Iso scope; unchanged affine numerical result and original trims.',
  limits: ['Original D341 affine planar support only plus derived inside-loop variant. No generic curved trim accuracy or new clipping implementation. No native evaluator rerun.'],
  snapshotExtra: () => ({ dirty: !!document.querySelector('[aria-label="Unsaved changes"]') }),
  oracleSource: String.raw`import json,sys,re
d=json.load(sys.stdin)
text=d['source']
m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',text,re.S);assert m,text
p=json.loads(m.group(1)); assert len(p)==2,p
for a,b in zip(p,[[20,-4,3],[20,20,3]]):
 assert all(abs(x-y)<1e-9 for x,y in zip(a,b)),(a,b)
assert re.search(r'degree\s*:\s*1\s*;',text)
assert re.search(r'weights\s*:\s*\[1,\s*1\]',text)
print(json.dumps({'status':'PASS','controlPoints':p,'expectedStart':[20,-4,3],'expectedEnd':[20,20,3],'scope':'Independent affine/literal source poles; not a native rerun'}))`,
});
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry', exact: true });
const row = label => panel().locator('.kv').filter({ hasText: new RegExp('^' + label) }).locator('b');
async function set(label, value) { const field = panel().getByLabel(label, { exact: true }); await field.fill(String(value)); await field.press('Tab'); }
async function select() { await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(name, { exact: true })).click(); await panel().waitFor(); }
async function probe(u, v, state) {
  await set('u', u); await set('v', v);
  assert.deepEqual((await row('Point').innerText()).split(',').map(Number), [20 + 5 * u, -11 + 5 * v, 3]);
  assert.deepEqual((await row('Normal').innerText()).split(',').map(Number), [0, 0, 1]);
  assert.ok((await row('Region').innerText()).includes(state));
}
async function open(doc, fileName) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await chooser.setFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await f.same(doc);
}
await f.run(async () => {
  const create = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await create({ ...options, acceptDownloads: false });
    await context.addInitScript(() => {
      const urls = new Map(), create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
      window.__surfaceSaves = [];
      URL.createObjectURL = function (blob) { const url = create.call(this, blob); urls.set(url, blob); return url; };
      HTMLAnchorElement.prototype.click = function () { const blob = urls.get(this.href); if (!blob || !this.download.endsWith('.bcad')) return click.call(this); window.__surfaceSaves.push(blob.text()); };
    }); return context;
  };
  await f.newPage(); await open(original, 'outside-hole.bcad'); await select();
  const before = await f.snapshot('01-original');
  f.phase = 'original removed and kept point labels';
  await probe(0, 2.5, 'Removed region'); await f.same(original); await f.snapshot('02-removed');
  await probe(4, 2.5, 'Remaining surface'); await f.same(original); await f.snapshot('03-kept');
  f.phase = 'explicit support-only Iso scope before action';
  await panel().getByLabel('Surface direction').selectOption('u'); await set('At u', 0);
  const iso = panel().getByRole('button', { name: 'Iso-curve', exact: true });
  const scope = await panel().getByRole('note', { name: 'Iso-curve scope' }).innerText();
  assert.match(scope, /whole support surface/); assert.match(scope, /trim loops are not applied/);
  const described = await iso.evaluate(e => (e.getAttribute('aria-describedby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' '));
  assert.equal(described, scope); await iso.scrollIntoViewIfNeeded(); await f.snapshot('04-before-iso');
  await iso.click(); await f.changed(original); const withIso = await f.doc();
  assert.deepEqual(target(withIso), target(original));
  for (const [key, value] of Object.entries(original.direct.sources)) assert.equal(withIso.direct.sources[key], value);
  assert.deepEqual(withIso.nodes, original.nodes); assert.deepEqual(withIso.outputs, original.outputs);
  const added = withIso.direct.objects.filter(o => !original.direct.objects.some(p => p.id === o.id)); assert.equal(added.length, 1);
  await f.runOracle({ source: withIso.direct.sources[added[0].source] }, '05-support-iso');
  await f.snapshot('05-created'); await f.undo(); await f.same(original); await f.redo(); await f.same(withIso);
  await f.page.getByRole('button', { name: 'Save', exact: true }).click();
  await f.page.waitForFunction(() => window.__surfaceSaves.length === 1);
  const savedText = await f.page.evaluate(() => window.__surfaceSaves[0]); assert.deepEqual(JSON.parse(savedText), withIso);
  const saved = join(output, 'surface-inspection.bcad'); await writeFile(saved, savedText);
  await f.freshOpen(saved, withIso, '06-fresh-open'); await select();
  assert.equal(Number(await panel().getByLabel('u', { exact: true }).inputValue()), 1.7);
  assert.equal(Number(await panel().getByLabel('v', { exact: true }).inputValue()), 3.8);
  await probe(0, 2.5, 'Removed region'); await f.snapshot('07-fresh-removed');
  f.phase = 'derived inside-loop planar control';
  const inside = structuredClone(original); target(inside).trims = [{ ...target(original).trims.find(t => t.keep === 'outside'), keep: 'inside' }];
  await open(inside, 'derived-inside-loop.bcad'); await select();
  assert.equal(Number(await panel().getByLabel('u', { exact: true }).inputValue()), 1.7);
  await probe(0, 2.5, 'Remaining surface'); await probe(4, 2.5, 'Removed region'); await f.same(inside);
  const after = await f.snapshot('08-inside-control');
  assert.equal(before.dirty, false); assert.equal(after.dirty, false);
  f.report.observations.push({ originalFixtureSha256: sha256(originalBytes), originalPointSamples: [[0,2.5,20,1.5,3],[4,2.5,40,1.5,3]], normal: [0,0,1], wholeSupportIso: true, originalTrimsUnchanged: true, freshOpenReset: true, insideVariant: 'Synthetic keep-inside variant of original hole loop, same support' });
});
