import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const target = 'n1.side[e1]|n1.side[e4]';
const old = 'n1.side[retired]|n1.side[e4]';
const stable = 'n1.side[e2]|n1.side[e3]';
const ref = node => ({ node, side: 'solid' });
const holeNode = { id: 'n3', kind: 'hole', parent: ref(2), axis: 'z', side: 'max', face: 'n1.top', center: [20, 0], radius: 2 };
const baseDoc = (edges) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'fillet', parent: ref(1), edges, radius: 2 },
    holeNode,
  ],
  outputs: { b3: ref(3) }, nextId: 4,
});

const files = [
  'apps/cad-studio/test/held-paired-fillet-through-hole-browser.mjs',
  'apps/cad-studio/src/state/useHeldFinishEdge.ts',
  'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'packages/barocss-cad-model/src/engine/heldChamferThroughHole.ts',
];
const f = await createFlow({
  name: 'held-paired-fillet-through-hole', output: process.argv[2], envFrozen: 'D1986_SOURCE_FROZEN',
  qualification: 'Explicit History replacement of one retired straight edge in a two-edge constant Fillet before an independent top Through Hole.',
  initialFiles: files, requiredFrozen: files,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({ brep }) => ({
  mass: brepMassProperties(brep, 1),
  check: checkBrep(brep, { strict: true }),
  cylinders: brep.faces.flatMap(face => {
    const g = faceGeometry(face);
    return g.kind === 'cylinder' ? [{ name: face.name, ...g }] : [];
  }),
}));
if (input.prepare) {
  const parent = { ...input.doc, nodes: input.doc.nodes.slice(0, 2), outputs: { b1: { node: 1, side: 'solid' } } };
  const result = evaluateDoc(parent, 1);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const doc = captureSignatures(input.doc, result.bodies);
  console.log(JSON.stringify({ doc, native: inspect(doc) }));
} else console.log(JSON.stringify(inspect(input)));
`,
});
const button = (name, context = f.page) => context.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const stack = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
async function direction(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(async () => {
    let previous, settled = 0;
    for (let i = 0; i < 90 && settled < 4; i++) {
      await new Promise(requestAnimationFrame);
      const pixel = window.__studioScreenOf([20, 0, 5]);
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
async function verify(label, state, repaired) {
  const doc = state.doc;
  assert.equal(state.bodies.bodies.length, 1);
  assert.equal(state.bodies.bodies[0].key, 'b3');
  assert.deepEqual(doc.nodes[3], holeNode);
  const [{ mass, check, cylinders }] = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 1);
  const holeFaces = cylinders.filter(c => c.out === -1 && Math.abs(c.c[0] - 20) < 1e-7 && Math.abs(c.c[1]) < 1e-7);
  assert.equal(holeFaces.length, 2);
  for (const c of holeFaces) near(c.r, 2);
  const filletFaces = cylinders.filter(c => c.out === 1);
  assert.equal(filletFaces.length, repaired ? 2 : 0);
  if (repaired) {
    for (const [x, y] of [[-18, -18], [58, 18]]) {
      const faces = filletFaces.filter(c => Math.abs(c.c[0] - x) < 1e-7 && Math.abs(c.c[1] - y) < 1e-7);
      assert.equal(faces.length, 1);
      near(faces[0].r, 2);
    }
  }
  const volume = 32000 - 40 * Math.PI - (repaired ? 20 * (4 - Math.PI) : 0);
  near(mass.volume, volume);
  near(state.bodies.bodies[0].volume, volume);
  f.report.observations.push({ label, volume, topology: check.counts });
}

await f.run(async () => {
  f.phase = 'prepare exact signed target and held paired Fillet with missing candidate before Through Hole';
  const { doc: targetDoc } = await f.inspect('native-target', { prepare: true, doc: baseDoc([target, stable]) });
  const seed = structuredClone(targetDoc);
  seed.nodes[2] = {
    ...seed.nodes[2],
    edges: [old, stable],
    sigs: {
      [old]: { k: 'line', p: [-24, -24, 5], d: [0.6, 0.8, 0], s: 10 },
      [stable]: targetDoc.nodes[2].sigs[stable],
    },
  };

  f.phase = 'open the held paired Constant Fillet with an active Through Hole';
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'held-paired-fillet-through-hole.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes[3]?.kind === 'hole');
  await f.ready();
  await refs().waitFor();
  assert.equal(await refs().getByText('Reference missing · Feature held', { exact: true }).count(), 1);
  await f.openFeatureEditor(2, 'Fillet');
  const opened = await f.snapshot(baseline ? '00-no-history-replacement' : '01-held-paired-fillet-through-hole');
  await verify('before-native', opened, false);
  assert.deepEqual(opened.doc.nodes[2].edges, [old, stable]);
  assert.equal(opened.doc.nodes[2].suppressed, true);
  assert.ok(opened.doc.nodes[2].held);
  const repick = button('Replace edge', f.editor());
  if (baseline) {
    assert.equal(await repick.count(), 0, 'Previous Studio exposes no History Replace edge for paired Fillet before a Hole');
    f.report.observations.push({ label: 'previous-absence', replaceEdge: 0 });
    return;
  }

  const history = await stack();
  const apply = () => button('Apply edge replacement', f.editor());

  f.phase = 'refuse the circular Hole rim';
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await repick.click();
  await f.editor().getByText('Select an edge on the feature body.', { exact: true }).waitFor();
  await pick([22, 0, 10]);
  await f.page.getByRole('alert').filter({ hasText: 'Edge not selected' }).waitFor();
  assert.equal(await apply().isEnabled(), false);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);
  await f.snapshot('02-hole-rim-refused');

  f.phase = 'refuse the already-used retained Fillet edge';
  await direction('Back right');
  await pick([60, 20, 5]);
  await f.page.getByRole('alert').filter({ hasText: 'This feature already uses that edge.' }).waitFor();
  assert.equal(await apply().isEnabled(), false);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);
  await f.snapshot('03-duplicate-stable-refused');

  f.phase = 'preview the valid original vertical corner edge and cancel without changing document or history';
  await direction('Front left');
  await pick([-20, -20, 5]);
  await f.editor().getByText(target, { exact: true }).waitFor();
  assert.equal(await apply().isEnabled(), true);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);
  await f.snapshot('04-original-edge-preview');
  await button('Cancel edge replacement', f.editor()).click();
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);

  f.phase = 'apply one explicit History replacement and rebuild the downstream Hole';
  await repick.click();
  await f.editor().getByText('Select an edge on the feature body.', { exact: true }).waitFor();
  await pick([-20, -20, 5]);
  await f.editor().getByText(target, { exact: true }).waitFor();
  await apply().click();
  await f.page.waitForFunction(name => window.__studioDoc?.nodes[2]?.edges[0] === name, target);
  await f.ready();
  await refs().waitFor({ state: 'hidden' });
  const repaired = await f.snapshot('05-repaired-with-hole');
  assert.deepEqual(repaired.doc, targetDoc);
  await verify('repaired-native', repaired, true);

  f.phase = 'verify Undo, Redo, native Save and fresh Open';
  await f.closeEditor();
  await f.undo();
  await f.same(opened.doc);
  await refs().waitFor();
  await f.snapshot('06-undo-held-with-hole');
  await f.redo();
  await f.same(repaired.doc);
  await refs().waitFor({ state: 'hidden' });
  const { file } = await f.save('paired-fillet-through-hole');
  const reopened = await f.freshOpen(file, repaired.doc, '07-fresh-open-with-hole');
  assert.equal(await refs().count(), 0);
  await verify('reopened-native', reopened, true);
});
