import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const flags = new Set(process.argv.slice(3));
const companion = !flags.has('--single');
const baseline = flags.has('--baseline');
const pins = ['apps/cad-studio/test/held-draft-companion-browser.mjs', 'apps/cad-studio/src/state/heldDraftFaceReplacement.ts',
  'apps/cad-studio/src/state/heldDraftFaceSession.ts', 'apps/cad-studio/src/state/useHeldDraftFace.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx'];
const f = await createFlow({
  name: 'held-draft-companion', output: process.argv[2], envFrozen: 'D2037_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Explicit Draft cap repair keeps the companion and the untouched Split half unchanged through history and fresh Open.',
  limits: ['Single fixed-neutral Draft on a reversed X Split, with one optional trailing independent rectangular extrusion.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, brep, valid: checkBrep(brep, { strict: true }).valid, volume: brepMassProperties(brep, 1).volume,
}))));
`,
});
const ref = (node, side = 'solid') => ({ node, side });
const cap = 'n2.cut.side1', replacement = 'n2.cut.side3';
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: companion ? 6 : 4,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'split', parent: ref(1), axis: 'x', normal: [-1, 0, 0], at: -30 },
    { id: 'n3', kind: 'draft', parent: ref(2, 'negative'), faces: [cap], angle: 10, pull: 'z', neutral: 0,
      sigs: { [cap]: { k: 'plane', p: [24, 15, 5], d: [1, 0, 0], s: 300 } } },
    ...(companion ? [
      { id: 'n4', kind: 'sketch', profile: 'rectangle', min: [74, 0], max: [86, 12] },
      { id: 'n5', kind: 'extrude', sketch: 4, height: 8 },
    ] : []),
  ],
  outputs: { b2_positive: ref(2, 'positive'), b3: ref(3), ...(companion ? { b5: ref(5) } : {}) },
};
const button = (name, parent = f.page) => parent.getByRole('button', { name, exact: true });
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
async function aim(view) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click({ timeout: 5000 });
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(async () => {
    let prior, stable = 0;
    for (let i = 0; i < 90 && stable < 4; i++) {
      await new Promise(requestAnimationFrame);
      const at = window.__studioScreenOf([30, 15, 5]);
      stable = prior && Math.hypot(at[0] - prior[0], at[1] - prior[1]) < 0.01 ? stable + 1 : 0;
      prior = at;
    }
    if (stable < 4) throw Error('View did not settle');
  });
}
async function pick(point) {
  const at = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  assert.ok(at?.length === 2 && at.every(Number.isFinite));
  assert.equal(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.vp-canvas'), at), true);
  await f.page.mouse.move(...at);
  await f.page.mouse.click(...at);
}
const check = async (label, doc, active, originals) => {
  const all = await f.inspect(label, doc);
  assert.equal(all.length, companion ? 3 : 2);
  assert.ok(all.every(body => body.valid));
  const expected = { b2_positive: 9000, b3: active ? 30 * (300 - 50 * Math.tan(Math.PI / 18)) : 9000, ...(companion ? { b5: 1152 } : {}) };
  for (const body of all) {
    assert.ok(Math.abs(body.volume - expected[body.key]) < 1e-7, JSON.stringify({ key: body.key, volume: body.volume }));
    if (body.key !== 'b3' && originals) assert.deepEqual(body.brep, originals.find(v => v.key === body.key).brep);
  }
  f.report.observations.push({ label, volumes: Object.fromEntries(all.map(body => [body.key, body.volume])) });
  return all;
};
await f.run(async () => {
  await f.newPage();
  f.page.setDefaultTimeout(12000);
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'held-draft-companion.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.page.getByRole('region', { name: 'References', exact: true }).waitFor();
  await f.ready();
  assert.equal((await f.doc()).nodes[3].suppressed, true);
  if (!baseline) {
    const sibling = f.page.locator('[data-browser-body-key="b2_positive"]').locator('xpath=..');
    await button('Hide body', sibling).click();
    await f.ready();
  }
  const before = (await f.snapshot('00-held')).doc;
  const native = await check('native-held', before, false);
  await f.openFeatureEditor(3);
  const start = button('Replace face', f.editor());
  if (baseline) {
    assert.equal(await start.count(), 0);
    await f.snapshot('00-prior-no-replace');
    return;
  }
  const stack = await history();
  async function pickCorrect() {
    f.phase = 'pick and qualify the current Draft cap';
    await aim('Left');
    await pick([30, 15, 5]);
    await f.editor().getByRole('status').filter({ hasText: 'Draft replacement preview: ' + replacement }).waitFor();
  }
  await start.click();
  const apply = button('Apply face replacement', f.editor());
  assert.equal(await apply.isDisabled(), true);
  await aim('Front');
  if (companion) {
    await pick([80, 0, 4]);
    await f.editor().getByRole('status').filter({ hasText: 'not the other Split half' }).waitFor();
    assert.equal(await apply.isDisabled(), true);
    await f.same(before);
    assert.deepEqual(await history(), stack);
    await f.snapshot('01-companion-refused');
  }
  await pickCorrect();
  assert.equal(await apply.isEnabled(), true);
  await f.same(before);
  assert.deepEqual(await history(), stack);
  await f.snapshot('02-preview-no-document-change');
  await button('Cancel face replacement', f.editor()).click();
  await f.same(before);
  assert.deepEqual(await history(), stack);
  await start.click();
  await pickCorrect();
  await apply.click();
  await f.changed(before);
  await f.ready();
  const after = (await f.snapshot('03-explicit-apply')).doc;
  assert.deepEqual(after.nodes[3].faces, [replacement]);
  assert.equal(after.nodes[3].suppressed, undefined);
  assert.deepEqual(after.nodes.slice(4), before.nodes.slice(4));
  assert.deepEqual(after.outputs, before.outputs);
  await check('native-applied', after, true, native);
  await f.undo(); await f.same(before);
  await f.redo(); await f.same(after);
  const saved = await f.save('held-draft-companion');
  const reopened = await f.freshOpen(saved.file, after, '04-fresh-open');
  await check('native-reopened', reopened.doc, true, native);
});
