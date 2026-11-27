import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const sourceEdge = { 3: 'n1.side0|n1.top', 4: 'n1.side1|n1.top' };
const ref = node => ({ node, side: 'solid' });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [80, 50] },
    { id: 'n1', kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: 0.44 },
    { id: 'n2', kind: 'sheet-corner-relief', parent: ref(1), edges: ['n1.side0|n1.side1'], shape: 'square', size: 3 },
    { id: 'n3', kind: 'sheet-flange', parent: ref(2), edges: [sourceEdge[3]], length: 20 },
    { id: 'n4', kind: 'sheet-flange', parent: ref(3), edges: [sourceEdge[4]], length: 20 },
  ],
  outputs: { b4: ref(4) }, nextId: 5,
};
const f = await createFlow({
  name: 'two-flange-reference-reopen', output: process.argv[2], envFrozen: 'D2053_SOURCE_FROZEN',
  qualification: 'Recover the original two held Flanges after a legacy 80×50 to 95×65 sheet resize.',
  limits: ['One rectangular plate with one square corner relief and two 90° upper Flanges.'],
  initialFiles: [
    'apps/cad-studio/test/flange-bend-owners-browser.mjs',
    'apps/cad-studio/src/state/referenceDecisions.ts',
    'apps/cad-studio/src/state/historyFeatureApply.ts',
    'apps/cad-studio/src/ui/ReferenceDecisions.tsx',
    'packages/barocss-cad-model/src/engine/references.ts',
  ],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCadPart, flatPatternOf, checkBrep, brepMassProperties } from '@barocss/cad';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { refreshSignatures } from '@barocss/cad-model/engine/references';
import { prefixDoc } from '@barocss/cad-model/engine/doc';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const mode = process.argv[3] && JSON.parse(process.argv[3]);
const evaluate = async input => evaluatePart(input, 1, 8, 'refs');
if (mode === 'sign') {
  const reply = await evaluate(doc);
  assert.ok(reply.ok);
  console.log(JSON.stringify(await refreshSignatures(doc, reply.bodies, evaluate)));
} else if (mode === 'signature') {
  const active = { ...doc, nodes: doc.nodes.map(node => {
    if (node.kind !== 'sheet-flange') return node;
    const copy = { ...node };
    delete copy.held;
    delete copy.suppressed;
    delete copy.rematched;
    return copy;
  }) };
  const reply = await evaluate(prefixDoc(active, active.nodes.length));
  assert.ok(reply.ok);
  const signed = await refreshSignatures(active, reply.bodies, evaluate);
  console.log(JSON.stringify(signed.nodes.slice(3).map(node => node.sigs)));
} else {
  const part = evaluateCadPart(toPartDocument(doc));
  const outputs = part.outputs.map(o => ({
    check: checkBrep(o.brep, { strict: true }), bends: o.sheet?.bends ?? [],
    flat: o.sheet?.bends.length === 2 ? flatPatternOf(o) : null, volume: brepMassProperties(o.brep, 1).volume,
  }));
  console.log(JSON.stringify(outputs));
}
`,
  snapshotExtra: () => ({ dirty: !!document.querySelector('[aria-label="Unsaved changes"]') }),
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const references = () => f.page.getByRole('region', { name: 'References', exact: true });
const row = id => references().getByRole('group', { name: new RegExp(`\\(${id}\\)$`) });
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const pickedEdges = () => f.page.evaluate(() => window.__studioSelection.selection.edges);
const near = (actual, expected, tol = 1e-7) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} != ${expected}`);
const increment = 1.5 * (17 - 3 + Math.PI * 2.25 / 2);
const flatIncrease = 17 - 3 + Math.PI * (1.5 + 0.44 * 1.5) / 2;
const legacySize = [95, 65];

async function saveInput(name, doc) {
  const file = join(f.output, name + '.bcad');
  await writeFile(file, JSON.stringify(doc));
  return file;
}
async function checkNative(state, active) {
  const [width, depth] = state.doc.nodes[0].max;
  const [stock] = await f.inspect(state.label + '-native', state.doc);
  assert.ok(stock.check.valid, JSON.stringify(stock.check.issues));
  const expectedVolume = (width * depth - 9) * 1.5 +
    (active.includes(3) ? width - 3 : 0) * increment + (active.includes(4) ? depth - 3 : 0) * increment;
  near(stock.volume, expectedVolume);
  assert.equal(state.bodies.bodies.length, 1);
  near(state.bodies.bodies[0].volume, expectedVolume);
  assert.deepEqual(stock.bends.map(bend => bend.name), active.map(id => `n${id}.bend`));
  if (active.length === 2) {
    assert.equal(stock.flat.bends.length, 2);
    for (const [i, nativeBend] of stock.bends.entries()) {
      const bend = stock.flat.bends.find(value => value.faces.length && value.faces.every(face => [nativeBend.inner, nativeBend.outer].includes(face)));
      assert.ok(bend);
      const [a, b] = bend.centre;
      near(Math.hypot(...b.map((v, k) => v - a[k])), [width - 3, depth - 3][i]);
      near(bend.angle, 90);
      assert.equal(bend.direction, 'up');
    }
    const { min, max } = stock.flat.box;
    const extents = max.map((v, i) => v - min[i]).sort((a, b) => b - a);
    [width + flatIncrease, depth + flatIncrease].forEach((expected, i) => near(extents[i], expected));
  }
  f.report.observations.push({ label: state.label, expectedVolume, volume: stock.volume, bends: stock.bends.map(bend => bend.name) });
}
async function candidate(id) {
  const group = row(`n${id}`);
  await group.waitFor();
  const details = group.locator('details');
  if (!(await details.evaluate(node => node.open))) await details.locator('summary').click();
  const exact = details.locator('.muted > div').filter({ hasText: new RegExp(`^Candidate \\d+: ${sourceEdge[id].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  const text = await exact.innerText({ timeout: 5000 });
  return { group, number: /^Candidate (\d+):/.exec(text)[1] };
}
async function preview(id, doc) {
  const { group, number } = await candidate(id);
  const savedHistory = await history();
  await group.getByRole('button', { name: new RegExp(`^Preview candidate ${number} for `) }).click();
  await f.same(doc);
  assert.deepEqual(await history(), savedHistory);
  return { group, number };
}
const confirm = ({ group, number }) => group.getByRole('button', { name: new RegExp(`^Use candidate ${number} for `) }).click();

await f.run(async () => {
  const signed = await f.inspect('original-signed-fixture', seed, 'sign');
  for (const node of signed.nodes.slice(2)) assert.equal(node.sigs[node.edges[0]].k, 'line');
  const originalFile = await saveInput('original-80x50', signed);
  const legacy = { ...signed, nodes: signed.nodes.map((node, i) => i === 0 ? { ...node, max: legacySize } : node) };
  const legacyFile = await saveInput('legacy-95x65-signed-before-resize', legacy);

  const opened = await f.freshOpen(originalFile, signed, '01-original-two-flanges');
  await checkNative(opened, [3, 4]);
  f.phase = 'open the legacy resized file with both original Flange signatures';
  await f.newPage();
  await f.openFile(legacyFile, 5);
  const held = await f.snapshot('02-legacy-resized-open');
  assert.deepEqual(held.doc.nodes[0].max, legacySize);
  assert.ok(held.doc.nodes[3].held && held.doc.nodes[4].held, 'The legacy fixture must hold both original choices');
  await checkNative(held, []);
  const heldHistory = await history();
  await f.dismissToasts();
  f.phase = 'preview and attempt the downstream upper rim before recovering its parent';
  const downstream = await preview(4, held.doc);
  await f.snapshot('03a-downstream-preview-keeps-two-holds');
  assert.equal((await pickedEdges()).length, 1);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await pickedEdges(), []);
  await f.same(held.doc);
  assert.deepEqual(await history(), heldHistory);

  await confirm(downstream);
  await f.changed(held.doc);
  const downstreamOnly = await f.snapshot('03b-downstream-first-one-flange');
  assert.deepEqual(downstreamOnly.doc.nodes[3], held.doc.nodes[3]);
  assert.deepEqual(downstreamOnly.doc.nodes[4].edges, [sourceEdge[4]]);
  assert.equal(downstreamOnly.doc.nodes[4].held, undefined);
  await checkNative(downstreamOnly, [4]);
  await confirm(await preview(3, downstreamOnly.doc));
  await f.changed(downstreamOnly.doc);
  const downstreamFirst = await f.snapshot('03c-downstream-first-both-confirmed');
  await checkNative(downstreamFirst, [3, 4]);
  assert.deepEqual(downstreamFirst.doc.nodes.slice(3).map(node => node.sigs),
    await f.inspect('downstream-first-parent-signatures', downstreamFirst.doc, 'signature'));
  const downstreamSaved = await f.save('two-flanges-downstream-first');
  await checkNative(await f.freshOpen(downstreamSaved.file, downstreamFirst.doc, '03d-downstream-first-fresh-open'), [3, 4]);
  assert.equal(await references().count(), 0);
  await f.freshOpen(legacyFile, held.doc, '03e-legacy-seed-restored-for-upstream-first');

  f.phase = 'confirm the original upper rim of the earlier Flange';
  await confirm(await preview(3, held.doc));
  await f.changed(held.doc);
  const first = await f.snapshot('04-first-flange-confirmed');
  assert.equal(first.doc.nodes[3].held, undefined);
  assert.ok(first.doc.nodes[4].held);
  await checkNative(first, [3]);

  f.phase = 'confirm the original remaining upper rim';
  await confirm(await preview(4, first.doc));
  await f.changed(first.doc);
  const both = await f.snapshot('05-both-flanges-confirmed');
  assert.equal(await references().count(), 0);
  assert.deepEqual(both.doc.nodes.slice(0, 3), held.doc.nodes.slice(0, 3));
  assert.deepEqual(both.doc.nodes.slice(3).map(node => node.edges[0]), [sourceEdge[3], sourceEdge[4]]);
  assert.deepEqual(both.doc.nodes.slice(3).map(node => node.sigs), await f.inspect('current-parent-signatures', both.doc, 'signature'));
  await checkNative(both, [3, 4]);
  await f.undo();
  await f.same(first.doc);
  await row('n4').waitFor();
  await f.undo();
  await f.same(held.doc);
  await row('n3').waitFor();
  await row('n4').waitFor();
  await f.snapshot('06-undo-restores-both-choices');
  await f.redo();
  await f.same(first.doc);
  await f.redo();
  await f.same(both.doc);

  const saved = await f.save('two-flanges-repaired');
  const reopened = await f.freshOpen(saved.file, both.doc, '07-fresh-open-both-flanges');
  await checkNative(reopened, [3, 4]);
  assert.equal(await references().count(), 0);
  await f.page.locator('.outliner .ol-row > button.ol').first().click();
  await button('Show the flat pattern').click();
  const flat = f.page.getByRole('dialog', { name: 'Flat pattern', exact: true });
  await flat.waitFor();
  assert.match(await flat.innerText(), /112\.393 × 82\.393 mm · 2 bends/);
  const drawing = flat.getByLabel('Flat pattern drawing', { exact: true });
  assert.equal(await drawing.getByLabel('Bend up', { exact: true }).count(), 2);
  const rows = flat.getByRole('list', { name: 'Flat bend angles', exact: true });
  assert.deepEqual(await rows.getByRole('listitem').allTextContents(), ['n3', 'n4'].map(id =>
    `${id}.bend · UP · Bend 90° · Included 90° · R1.5 · K 0.44 · BA 3.393 · BD 2.607`));
  await f.same(both.doc);
  await f.snapshot('08-reopened-flat-pattern');
});
