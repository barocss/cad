import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({
  name: 'worm-history-form', output: process.argv[2], envFrozen: 'WORM_HISTORY_FROZEN',
  initialFiles: ['apps/cad-studio/test/worm-history-form-browser.mjs'],
  qualification: 'Throated worm History offers only ZA, while cylindrical wheel History still supports ZI and ZA.',
  limits: ['No manufacturing qualification or additional worm family support.', 'Native JSON Open uses in-memory data; no physical downloads.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const r = evaluateDoc(doc, 1); if (!r.ok) throw Error(JSON.stringify(r.error));
console.log(JSON.stringify(r.bodies.map(b => ({ key: b.key, volume: b.volume, notes: b.notes }))));
`,
});
const wheel = { id: 'n0', kind: 'worm-wheel', module: 3, starts: 2, diameter: 44, hand: 'right', teeth: 30, faceWidth: 20, bore: 20, center: [0, 0], generator: 'worm-wheel@0' };
const worm = { id: 'n1', kind: 'worm', starts: 2, form: 'ZA', length: 66, bore: 12, mesh: { gear: 0 }, generator: 'worm@0' };
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [wheel, worm], outputs: { b0: { node: 0, side: 'solid' }, b1: { node: 1, side: 'solid' } }, nextId: 2 };
const gamma = Math.atan(6 / 44);
const cylindrical = { ...source, nodes: [{ id: 'n0', kind: 'gear', module: 3 * Math.cos(gamma), helixAngle: gamma * 180 / Math.PI, hand: 'right', teeth: 30, faceWidth: 20, bore: 20, center: [0, 0], generator: 'spur-gear@0' }, { ...worm, form: 'ZI' }] };
async function open(doc) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'worm.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
const form = () => f.editor().getByRole('combobox', { name: /Worm form/ });
async function options(expected) {
  assert.deepEqual(await form().locator('option').evaluateAll(xs => xs.map(x => x.value)), expected);
}
async function verify(doc, label) {
  const evaluated = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(evaluated.length, 2); assert.equal(worker.length, 2);
  for (const b of evaluated) {
    assert.ok(Number.isFinite(b.volume) && b.volume > 0);
    assert.ok(Math.abs(worker.find(x => x.key === b.key).volume - b.volume) < 1e-6);
  }
  if (doc.nodes[0].kind === 'worm-wheel') assert.ok(evaluated.some(b => b.notes.some(n => /Meshes with n0, enveloping it/.test(n.text))));
}
await f.run(async () => {
  await f.newPage(); await open(source); await verify(source, '01-throated');
  await f.openFeatureEditor(1); await options(['ZA']); assert.equal(await form().inputValue(), 'ZA');
  await f.snapshot('02-throated-form-only-ZA');
  await f.editor().getByLabel('Length', { exact: true }).fill('70');
  const longer = (await f.applyEditor(source, '03-length-70')).doc;
  assert.deepEqual(longer.nodes[1], { ...worm, length: 70 }); await verify(longer, '04-longer-pair');
  await f.undo(); await f.same(source); await f.redo(); await f.same(longer);
  await f.page.getByRole('button', { name: 'New part', exact: true }).click(); await f.ready(); await open(longer);
  await f.openFeatureEditor(1); await options(['ZA']); await f.editor().getByLabel('Length', { exact: true }).fill('74');
  await f.closeEditor(); await f.same(longer);
  await open(cylindrical); await f.openFeatureEditor(1); await options(['ZI', 'ZA']); assert.equal(await form().inputValue(), 'ZI');
  await form().selectOption('ZA'); const za = (await f.applyEditor(cylindrical, '05-cylindrical-ZA')).doc;
  assert.deepEqual(za.nodes[1], { ...worm }); await verify(za, '06-cylindrical-ZA-evaluation');
  await f.undo(); await f.same(cylindrical); await f.redo(); await f.same(za);
  await f.openFeatureEditor(1); await options(['ZI', 'ZA']); await form().selectOption('ZI');
  const zi = (await f.applyEditor(za, '07-cylindrical-ZI')).doc; assert.deepEqual(zi, cylindrical);
  await verify(zi, '08-cylindrical-ZI-evaluation'); assert.deepEqual(f.report.downloads, []);
});
