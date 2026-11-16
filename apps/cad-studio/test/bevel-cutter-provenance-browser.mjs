import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({
  name: 'bevel-cutter-provenance', output: process.argv[2], envFrozen: 'BEVEL_CUTTER_FROZEN',
  initialFiles: ['apps/cad-studio/test/bevel-cutter-provenance-browser.mjs'],
  qualification: 'History angle edits retain explicit cutter provenance; Undo, Redo, reopen and estimate-to-explicit transition.',
  limits: ['Ideal spiral bevel model only; no manufacturing qualification, Rack, Worm or Belt claim.', 'Open uses in-memory native JSON; no physical download.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const r = evaluateDoc(doc, 1);
if (!r.ok) throw Error(JSON.stringify(r.error));
console.log(JSON.stringify({ volume: r.bodies[0].volume, notes: r.bodies[0].notes }));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'bevel-gear', module: 2, teeth: 20, mateTeeth: 40, faceWidth: 10, bore: 8, center: [0, 0], generator: 'bevel-gear@0', spiral: { angle: 35, hand: 'left', cutterRadius: 40 } }],
  outputs: { b0: { node: 0, side: 'solid' } }, nextId: 1,
};
async function open(doc) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'bevel.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function notes(doc, label, estimate) {
  await f.page.locator('.ol-row button.ol').first().click();
  const line = f.page.getByLabel('Generator note', { exact: true }).filter({ hasText: /Spiral β_m/ });
  await line.waitFor();
  const text = await line.innerText();
  assert.ok(text.includes(`${doc.nodes[0].spiral.angle}° left hand on a ${doc.nodes[0].spiral.cutterRadius} mm cutter radius`), text);
  assert.equal(text.includes('an estimate:'), estimate, text);
  assert.equal((await line.getAttribute('class')).includes('warn'), estimate);
  const native = await f.inspect(label, doc), worker = (await f.bodies()).bodies[0];
  assert.ok(Number.isFinite(native.volume) && native.volume > 0);
  assert.ok(Math.abs(worker.volume - native.volume) < 1e-6, JSON.stringify({ native, worker }));
  assert.equal(native.notes.find(n => n.text.startsWith('Spiral β_m')).text, text.trim());
  await f.snapshot(label);
}
async function edit(key, value, before, label) {
  await f.openFeatureEditor(0);
  await f.editor().getByLabel(key, { exact: true }).fill(String(value));
  return (await f.applyEditor(before, label)).doc;
}
await f.run(async () => {
  await f.newPage(); await open(source); await notes(source, '01-explicit-40', false);
  const angle = await edit('Spiral angle β', 30, source, '02-angle-30');
  assert.deepEqual(angle.nodes[0], { ...source.nodes[0], spiral: { ...source.nodes[0].spiral, angle: 30 } });
  await notes(angle, '03-explicit-after-angle', false);
  await f.undo(); await f.same(source); await f.redo(); await f.same(angle);
  await f.page.getByRole('button', { name: 'New part', exact: true }).click(); await f.ready();
  await open(angle); await notes(angle, '04-reopened-explicit', false);
  // Cancel an unaccepted angle change. It must not change the accepted source or provenance.
  await f.openFeatureEditor(0); await f.editor().getByLabel('Spiral angle β', { exact: true }).fill('25');
  await f.closeEditor(); await f.same(angle);
  const estimated = { ...source, nodes: [{ ...source.nodes[0], spiral: { ...source.nodes[0].spiral, cutterEstimate: true } }] };
  await open(estimated);
  const estimatedAngle = await edit('Spiral angle β', 30, estimated, '05-estimated-angle');
  assert.equal(estimatedAngle.nodes[0].spiral.cutterEstimate, true); await notes(estimatedAngle, '06-estimate-retained', true);
  const explicit = await edit('Cutter radius', 45, estimatedAngle, '07-own-radius');
  assert.equal(Object.hasOwn(explicit.nodes[0].spiral, 'cutterEstimate'), false);
  const final = await edit('Spiral angle β', 32, explicit, '08-own-radius-angle');
  assert.deepEqual(final.nodes[0].spiral, { angle: 32, hand: 'left', cutterRadius: 45 });
  await notes(final, '09-own-radius-retained', false);
  assert.deepEqual(f.report.downloads, []);
});
