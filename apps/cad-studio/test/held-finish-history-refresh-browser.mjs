import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const n2Old = 'n1.side[e1]|n1.side[e4]', n2New = 'n1.side[e4]|n1.side[e5]';
const n3Old = 'n1.side[e1]|n2.face', n3New = 'n1.side[e5]|n2.face';
const ref = node => ({ node, side: 'solid' });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'chamfer', parent: ref(1), edges: [n2Old], distance: 4 },
    { id: 'n3', kind: 'chamfer', parent: ref(2), edges: [n3Old], distance: 1 },
  ],
  outputs: { b3: ref(3) }, nextId: 4,
};

const files = [
  'apps/cad-studio/test/held-finish-history-refresh-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/useHeldFinishEdge.ts',
  'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'apps/cad-studio/src/state/referenceDecisions.ts',
];
const f = await createFlow({
  name: 'held-finish-history-refresh', output: process.argv[2], envFrozen: 'D1991_SOURCE_FROZEN',
  qualification: 'History Replace edge on an earlier held constant finish before a downstream held finish refreshes downstream References candidates.',
  initialFiles: files, requiredFrozen: files,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({ brep }) => {
  const check = checkBrep(brep, { strict: true });
  return { valid: check.valid, topology: check.topology, ...brepMassProperties(brep, 1) };
});
if (input.prepare) {
  const r1 = evaluateDoc({ ...input.doc, nodes: input.doc.nodes.slice(0, 2), outputs: { b1: { node: 1, side: 'solid' } } }, 1);
  if (!r1.ok) throw new Error(JSON.stringify(r1));
  let doc = captureSignatures(input.doc, r1.bodies);
  const r2 = evaluateDoc({ ...doc, nodes: doc.nodes.slice(0, 3), outputs: { b2: { node: 2, side: 'solid' } } }, 1);
  if (!r2.ok) throw new Error(JSON.stringify(r2));
  doc = captureSignatures(doc, r2.bodies);
  console.log(JSON.stringify({ doc, native: inspect(doc) }));
} else console.log(JSON.stringify(inspect(input)));
`,
});

const button = (name, context = f.page) => context.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const stack = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const n3Delta = 5 * Math.SQRT2 / 2;

async function direction(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(async () => {
    let previous, settled = 0;
    for (let i = 0; i < 90 && settled < 4; i++) {
      await new Promise(requestAnimationFrame);
      const pixel = window.__studioScreenOf([20, 1, 5]);
      settled = previous && Math.hypot(pixel[0] - previous[0], pixel[1] - previous[1]) < 0.01 ? settled + 1 : 0;
      previous = pixel;
    }
    if (settled < 4) throw new Error('View has not settled');
  });
}

async function pick(point) {
  const xy = await f.page.evaluate(pt => window.__studioScreenOf(pt), point);
  assert.ok(xy?.length === 2 && xy.every(Number.isFinite));
  assert.equal(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.vp-canvas'), xy), true);
  await f.page.mouse.move(...xy);
  await f.page.mouse.click(...xy);
}

async function native(label, doc, widthY, hasN2, hasN3) {
  const [model] = await f.inspect(label, doc);
  assert.ok(model.valid);
  assert.equal(model.method, 'planar-exact');
  assert.equal(model.topology.length, 1);
  assert.equal(model.topology[0].genus, 0);
  const expected = 80 * widthY * 10 - (hasN2 ? 80 : 0) - (hasN3 ? n3Delta : 0);
  near(model.volume, expected);
  f.report.observations.push({ label, volume: model.volume, expected, method: model.method });
}

await f.run(async () => {
  f.phase = 'prepare exact signed dependent Chamfer chain';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed });
  const retired = structuredClone(doc);
  retired.nodes[0].min[1] = -18;
  retired.nodes[0].sideTags.outer[0] = 'e5';

  f.phase = 'open retired model holding both parent and dependent Chamfer';
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'd1991-retired.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(retired)),
  });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes[3]?.kind === 'chamfer');
  await f.ready();
  const heldRows = refs().getByText('Choose a reference · Feature held', { exact: true });
  await heldRows.nth(1).waitFor();
  await f.openFeatureEditor(2, 'Chamfer');
  const opened = await f.snapshot(baseline ? '00-previous-no-replace-edge' : '01-both-held-history-open');
  await native('both-held', opened.doc, 38, false, false);
  assert.equal(opened.doc.nodes[2].suppressed, true);
  assert.equal(opened.doc.nodes[3].suppressed, true);

  const repick = button('Replace edge', f.editor());
  if (baseline) {
    assert.equal(await repick.count(), 0, 'Previous Studio exposes no History Replace edge on held Chamfer before a downstream held Chamfer');
    f.report.observations.push({ label: 'previous-absence', replaceEdge: 0 });
    return;
  }

  const history = await stack();
  const apply = () => button('Apply edge replacement', f.editor());

  f.phase = 'refuse face click and cancel History replacement without mutating document or history';
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await repick.click();
  await f.editor().getByText('Select an edge on the feature body.', { exact: true }).waitFor();
  await pick([20, 1, 10]);
  await f.page.getByRole('alert').filter({ hasText: 'Edge not selected' }).waitFor();
  assert.equal(await apply().isEnabled(), false);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);

  f.phase = 'preview replacement edge n1.side[e4]|n1.side[e5] in viewport and cancel cleanly';
  await direction('Front left');
  await pick([-20, -18, 5]);
  await f.editor().getByText(n2New, { exact: true }).waitFor();
  assert.equal(await apply().isEnabled(), true);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);
  await f.snapshot('02-history-replace-preview');
  await button('Cancel edge replacement', f.editor()).click();
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);

  f.phase = 'apply History edge replacement on n2 and verify downstream n3 candidate refreshes';
  await repick.click();
  await f.editor().getByText('Select an edge on the feature body.', { exact: true }).waitFor();
  await pick([-20, -18, 5]);
  await f.editor().getByText(n2New, { exact: true }).waitFor();
  await apply().click();
  await f.changed(opened.doc);
  await f.ready();
  assert.equal(await heldRows.count(), 1);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await refs().getByRole('button', { name: 'Use candidate 1 for Chamfer 1 (n3)', exact: true }).waitFor();
  assert.ok((await refs().innerHTML()).includes(n3New), 'Refreshed downstream candidate should name n1.side[e5]|n2.face');
  const n2Applied = await f.snapshot('03-history-applied-downstream-refreshed');
  assert.deepEqual(n2Applied.doc.nodes[2].edges, [n2New]);
  assert.equal(n2Applied.doc.nodes[2].suppressed, undefined);
  assert.equal(n2Applied.doc.nodes[2].held, undefined);
  assert.equal(n2Applied.doc.nodes[3].suppressed, true);
  assert.deepEqual(n2Applied.doc.nodes[3].edges, [n3Old]);
  await native('n2-history-applied', n2Applied.doc, 38, true, false);

  f.phase = 'preview and confirm refreshed downstream n3 candidate';
  const afterN2Stack = await stack();
  await refs().getByRole('button', { name: 'Preview candidate 1 for Chamfer 1 (n3) in model', exact: true }).click();
  await f.same(n2Applied.doc);
  assert.deepEqual(await stack(), afterN2Stack);
  const previewN3 = await f.snapshot('04-downstream-candidate-preview');
  assert.equal(previewN3.notices.length, 0);
  assert.equal(previewN3.selection?.selection?.edges?.length, 1);

  await refs().getByRole('button', { name: 'Use candidate 1 for Chamfer 1 (n3)', exact: true }).click();
  await refs().waitFor({ state: 'hidden' });
  await f.ready();
  const allConfirmed = await f.snapshot('05-both-restored');
  assert.deepEqual(allConfirmed.doc.nodes[3].edges, [n3New]);
  assert.equal(allConfirmed.doc.nodes[3].suppressed, undefined);
  assert.equal(allConfirmed.doc.nodes[3].held, undefined);
  await native('both-restored', allConfirmed.doc, 38, true, true);

  f.phase = 'verify two-step Undo and Redo preserve refreshed downstream state';
  await f.undo();
  await f.same(n2Applied.doc);
  assert.equal(await heldRows.count(), 1);
  assert.ok((await refs().innerHTML()).includes(n3New));
  await native('undo-1', await f.doc(), 38, true, false);

  await f.undo();
  await f.same(opened.doc);
  assert.equal(await heldRows.count(), 2);
  await native('undo-2', await f.doc(), 38, false, false);

  await f.redo();
  await f.same(n2Applied.doc);
  assert.equal(await heldRows.count(), 1);
  assert.ok((await refs().innerHTML()).includes(n3New));
  await native('redo-1', await f.doc(), 38, true, false);

  await f.redo();
  await f.same(allConfirmed.doc);
  await refs().waitFor({ state: 'hidden' });
  await native('redo-2', await f.doc(), 38, true, true);

  f.phase = 'save .bcad and verify fresh Open in a new Studio tab';
  const saved = await f.save('d1991-repaired');
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles(saved.file);
  await f.page.waitForFunction(() => window.__studioDoc?.nodes[3]?.kind === 'chamfer');
  await f.ready();
  assert.equal(await refs().count(), 0);
  const reopened = await f.snapshot('06-fresh-open');
  assert.deepEqual(reopened.doc.nodes[2].edges, [n2New]);
  assert.deepEqual(reopened.doc.nodes[3].edges, [n3New]);
  assert.equal(reopened.doc.nodes[2].held, undefined);
  assert.equal(reopened.doc.nodes[3].held, undefined);
  await native('fresh-open', reopened.doc, 38, true, true);
});
