import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const three = process.argv.includes('--three');
const multi = three || process.argv.includes('--multi');
const companions = multi ? [{ key: 'b5', volume: 2304, pick: [82, -12, 6] }] : [];
if (three) companions.push({ key: 'b7', volume: 1680, pick: [-39, -12, 5] });
const n2Old = 'n1.side[e1]', n2New = 'n1.side[s1]';
const n3Old = 'n1.side[e1]#3|n2.ceiling', n3New = 'n1.side[s1]#3|n2.ceiling';
const ref = node => ({ node, side: 'solid' });
const stockSketch = multi ? 2 : 0, shellNode = stockSketch + 2, chamferNode = stockSketch + 3;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    ...(multi ? [
      { id: 'n4', kind: 'sketch', profile: 'rectangle', min: [76, -12], max: [88, 4] },
      { id: 'n5', kind: 'extrude', sketch: 0, height: 12 },
    ] : []),
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: stockSketch, height: 12 },
    { id: 'n2', kind: 'shell', parent: ref(shellNode - 1), open: [n2Old], thickness: 2 },
    { id: 'n3', kind: 'chamfer', parent: ref(shellNode), edges: [n3Old], distance: 0.5 },
    ...(three ? [
      { id: 'n6', kind: 'sketch', profile: 'rectangle', min: [-46, -12], max: [-32, 0] },
      { id: 'n7', kind: 'extrude', sketch: chamferNode + 1, height: 10 },
    ] : []),
  ],
  outputs: { ...(multi ? { b5: ref(1) } : {}), b3: ref(chamferNode), ...(three ? { b7: ref(chamferNode + 2) } : {}) },
  nextId: three ? 8 : multi ? 6 : 4,
};
const uBlockSketch = {
  id: 'n0', kind: 'sketch', profile: 'polygon',
  points: [[-20, -20], [10, -20], [10, 10], [30, 10], [30, -20], [60, -20], [60, 20], [-20, 20]],
  sideTags: { outer: ['s1', 's2', 's3', 's4', 's5', 'e2', 'e3', 'e4'] },
};

const files = [
  'apps/cad-studio/test/held-shell-face-pick-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/ui/HistoryFeatureEditor.tsx',
  'apps/cad-studio/src/viewport/sceneSelection.ts',
  'apps/cad-studio/src/state/referenceDecisions.ts',
  'apps/cad-studio/src/state/heldShellFaceReplacement.ts',
  'apps/cad-studio/src/state/useHeldShellFace.ts',
];
const f = await createFlow({
  name: 'held-shell-face-pick', output: process.argv[2], envFrozen: 'D2001_SOURCE_FROZEN',
  qualification: 'Direct 3D viewport planar face pick for a held single-opening Shell refuses non-candidate faces, preserves doc/history on Cancel, requires explicit confirmation, refreshes downstream held Chamfer without auto-applying it, and survives Undo/Redo and native Save/Open.',
  initialFiles: files, requiredFrozen: files,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({ key, brep }) => {
  const check = checkBrep(brep, { strict: true });
  return { key, valid: check.valid, topology: check.topology, ...brepMassProperties(brep, 1) };
});
if (input.prepare) {
  const r1 = evaluateDoc({ ...input.doc, nodes: input.doc.nodes.slice(0, input.shellNode), outputs: { b1: { node: input.shellNode - 1, side: 'solid' } } }, 1);
  if (!r1.ok) throw new Error(JSON.stringify(r1));
  let doc = captureSignatures(input.doc, r1.bodies);
  const r2 = evaluateDoc({ ...doc, nodes: doc.nodes.slice(0, input.shellNode + 1), outputs: { b2: { node: input.shellNode, side: 'solid' } } }, 1);
  if (!r2.ok) throw new Error(JSON.stringify(r2));
  doc = captureSignatures(doc, r2.bodies);
  console.log(JSON.stringify({ doc, native: inspect(doc) }));
} else if (input.independent) {
  console.log(JSON.stringify(partBreps(input.doc).filter(body => input.independent.includes(body.key)).map(({ key, brep }) => ({ key, brep }))));
} else if (input.previewFace) {
  const ev = evaluateDoc(input.doc, 1);
  if (!ev.ok) throw Error('Expected the current source bodies');
  const slot = ev.bodies.findIndex(body => body.key === 'b3');
  if (slot < 0) throw Error('Expected Shell owner b3');
  const faces = ev.bodies[slot].mesh.faces.filter(face => face.name === input.previewFace);
  if (faces.length !== 1 || faces[0].kind !== 'plane') throw Error('Expected one native planar candidate');
  console.log(JSON.stringify({ key: ev.bodies[slot].key, slot, index: faces[0].index, name: faces[0].name, area: faces[0].area }));
} else console.log(JSON.stringify(inspect(input)));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
async function setView(name) {
  await button(name).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(async () => {
    let previous, settled = 0;
    for (let i = 0; i < 90 && settled < 4; i++) {
      await new Promise(requestAnimationFrame);
      const pixel = window.__studioScreenOf([20, 0, 6]);
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
async function open(name, bytes) {
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bytes)) });
  await f.page.waitForFunction(label => document.querySelector('.doc-tab input')?.value === label, name);
  await f.ready();
}
const shellExpected = 14656 - 16 * (4 - Math.PI);
let chamferedExpected = null, independent = null;
async function native(label, doc, state) {
  const models = await f.inspect(label, doc);
  assert.equal(models.length, companions.length + 1);
  const model = models.find(body => body.key === 'b3');
  assert.ok(model);
  if (multi) {
    const heads = await f.bodies();
    for (const { key, volume } of companions) {
      const other = models.find(body => body.key === key);
      assert.ok(other?.valid);
      near(other.volume, volume);
      assert.ok(heads.bodies.some(body => body.key === key));
    }
    const current = await f.inspect(label + '-independent', { independent: companions.map(body => body.key), doc });
    if (!independent) independent = current;
    assert.deepEqual(current, independent);
  }
  assert.ok(model.valid);
  assert.equal(model.topology.length, 1);
  assert.equal(model.topology[0].genus, 0);
  if (state === 'held') near(model.volume, 31200, 1e-7);
  else if (state === 'shell') near(model.volume, shellExpected, 1e-6);
  else if (state === 'both') {
    assert.ok(model.volume < shellExpected - 3 && model.volume > shellExpected - 4, `chamfer volume ${model.volume}`);
    if (chamferedExpected === null) chamferedExpected = model.volume;
    else near(model.volume, chamferedExpected, 1e-7);
  }
  f.report.observations.push({ label, volume: model.volume, method: model.method });
}

await f.run(async () => {
  f.phase = 'prepare exact signed U-block Shell + Chamfer chain';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed, shellNode });
  const edited = structuredClone(doc);
  edited.nodes[stockSketch] = uBlockSketch;

  await f.newPage();
  f.phase = 'open edited U-block holding both Shell (n2) and Chamfer (n3)';
  await open('d2001-shell-face-pick', edited);
  const heldRows = refs().getByText('Choose a reference · Feature held', { exact: true });
  await heldRows.nth(1).waitFor();
  const bothHeld = await f.snapshot('00-both-held');
  assert.equal(bothHeld.doc.nodes[shellNode].suppressed, true);
  assert.equal(bothHeld.doc.nodes[chamferNode].suppressed, true);
  await native('both-held', bothHeld.doc, 'held');

  f.phase = 'open History editor on held Shell (n2)';
  await f.openFeatureEditor(shellNode);
  const replaceFaceBtn = button('Replace face', f.editor());
  if (baseline) {
    assert.equal(await replaceFaceBtn.count(), 0, 'Previous Studio has no Replace face button on held Shell');
    await f.snapshot('00-previous-no-shell-face-pick');
    return;
  }

  const stack = await history();
  const expectedFace = await f.inspect('native-candidate-face', { doc: bothHeld.doc, previewFace: n2New });
  assert.equal(expectedFace.key, 'b3');
  assert.equal(expectedFace.area, 360);
  if (multi) assert.equal(expectedFace.slot, 1, 'Shell is not the first current body');


  f.phase = 'start Replace face, verify wrong face (n1.top) is refused without changing doc or history';
  await replaceFaceBtn.click();
  const applyFaceBtn = button('Apply face replacement', f.editor());
  const cancelFaceBtn = button('Cancel face replacement', f.editor());
  await applyFaceBtn.waitFor();
  assert.equal(await applyFaceBtn.isDisabled(), true, 'Apply face must be disabled before valid pick');

  if (multi) {
    await setView('Front');
    for (const companion of companions) {
      await pick(companion.pick);
      await f.page.getByRole('alert').filter({ hasText: 'Face not selected' }).waitFor();
      await f.same(bothHeld.doc);
      assert.deepEqual(await history(), stack);
      assert.equal(await applyFaceBtn.isDisabled(), true);
      await f.snapshot(companion.key === 'b5' ? '01-foreign-body-refused' : '01-second-foreign-body-refused');
    }
  }
  await setView('Top');
  await pick([0, 15, 12]);
  await f.page.getByRole('alert').filter({ hasText: 'Face not selected' }).waitFor();
  await f.same(bothHeld.doc);
  assert.deepEqual(await history(), stack);
  assert.equal(await applyFaceBtn.isDisabled(), true, 'Apply face stays disabled after wrong face');
  await f.snapshot('01a-wrong-face-refused');

  f.phase = 'pick verified planar candidate n1.side[s1] in 3D viewport without mutating doc or history';
  await setView('Front');
  await pick([-5, -20, 6]);
  await f.page.waitForFunction(() => {
    const btn = document.querySelector('button[aria-label="Apply face replacement"]');
    return !!btn && !btn.disabled;
  });
  await f.same(bothHeld.doc);
  assert.deepEqual(await history(), stack);
  const picked = await f.snapshot('01b-picked-shell-face-preview');
  assert.equal(picked.notices.length, 0, 'Prior refusal notice must retire once valid face is picked');
  assert.equal(picked.doc.nodes[shellNode].suppressed, true);
  assert.equal(picked.doc.nodes[chamferNode].suppressed, true);
  assert.ok((await f.editor().textContent()).includes(n2New));

  f.phase = 'cancel face replacement and verify original doc and history remain unchanged';
  await cancelFaceBtn.click();
  await replaceFaceBtn.waitFor();
  await f.same(bothHeld.doc);
  assert.deepEqual(await history(), stack);

  f.phase = 're-enter Replace face, pick n1.side[s1] again, and explicitly confirm via Apply face';
  await replaceFaceBtn.click();
  await applyFaceBtn.waitFor();
  await pick([-5, -20, 6]);
  await f.page.waitForFunction(() => {
    const btn = document.querySelector('button[aria-label="Apply face replacement"]');
    return !!btn && !btn.disabled;
  });
  await applyFaceBtn.click();
  await f.changed(bothHeld.doc);
  await f.ready();
  await setView('Iso');
  assert.equal(await heldRows.count(), 1, 'Only downstream Chamfer should remain held');
  const shellApplied = await f.snapshot('02-shell-applied-chamfer-refreshed');
  assert.deepEqual(shellApplied.doc.nodes[shellNode].open, [n2New]);
  assert.equal(shellApplied.doc.nodes[shellNode].suppressed, undefined);
  assert.equal(shellApplied.doc.nodes[shellNode].held, undefined);
  assert.equal(shellApplied.doc.nodes[chamferNode].suppressed, true, 'Downstream Chamfer must NOT auto-apply');
  assert.deepEqual(shellApplied.doc.nodes[chamferNode].edges, [n3Old]);
  assert.ok((await refs().innerHTML()).includes(n3New), 'Downstream Chamfer candidate must refresh to n1.side[s1]#3|n2.ceiling');
  await native('shell-applied', shellApplied.doc, 'shell');

  f.phase = 'explicitly confirm refreshed downstream Chamfer (n3)';
  await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 0\.5 \(n3\)/ }).click();
  await refs().waitFor({ state: 'hidden' });
  await f.ready();
  const bothRestored = await f.snapshot('03-both-restored');
  assert.deepEqual(bothRestored.doc.nodes[shellNode].open, [n2New]);
  assert.deepEqual(bothRestored.doc.nodes[chamferNode].edges, [n3New]);
  assert.equal(bothRestored.doc.nodes[chamferNode].suppressed, undefined);
  await native('both-restored', bothRestored.doc, 'both');

  f.phase = 'verify two-step Undo/Redo, native Save and fresh Open';
  await f.undo();
  await f.same(shellApplied.doc);
  assert.equal(await heldRows.count(), 1);
  assert.ok((await refs().innerHTML()).includes(n3New));
  await native('undo-1', await f.doc(), 'shell');

  await f.undo();
  await f.same(bothHeld.doc);
  assert.equal(await heldRows.count(), 2);
  await native('undo-2', await f.doc(), 'held');

  await f.redo();
  await f.same(shellApplied.doc);
  assert.equal(await heldRows.count(), 1);
  assert.ok((await refs().innerHTML()).includes(n3New));
  await native('redo-1', await f.doc(), 'shell');

  await f.redo();
  await f.same(bothRestored.doc);
  await native('redo-2', await f.doc(), 'both');

  const saved = await f.save('d2001-shell-face-pick-saved');
  await f.newPage();
  await open('d2001-shell-face-pick-saved', saved.doc);
  await f.same(bothRestored.doc);
  assert.equal(await refs().count(), 0);
  await native('fresh-open', await f.doc(), 'both');
  await f.snapshot('04-fresh-open');
});
