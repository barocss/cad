import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/loft-two-section-mode-browser.mjs', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/app/bodies.ts', 'apps/cad-studio/src/ui/BodyBrowserRows.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/engine/part.ts'];
const f = await createFlow({
  name: 'loft-two-section-mode', output: process.argv[2], envFrozen: 'D1170_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Show the effective two-section Ruled mode in History and the Browser, preserving legacy flags and user body names.',
  limits: ['Desktop WebGPU 1440×1000 and 1024×800. Synthetic unguided coaxial circles only; no guided/frame or general legacy qualification.', 'Existing independent native conical-frustum volume check applies only to the two-section cases. Three-section Smooth is a naming/mode/document control, not a general geometry claim.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), part = toPartDocument(doc);
const out = evaluateCadPart(part).outputs[0], props = massPropertiesOf(out);
console.log(JSON.stringify({ valid: checkOutput(out).valid, count: out.bodyCount, volume: props.volume, method: props.method }));
`,
});
const circle = (i, radius, z) => ({ id: `n${i}`, kind: 'sketch', profile: 'circle', center: [0, 0], radius,
  ...(z ? { plane: { origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] } } : {}) });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [circle(0, 3, 0), circle(1, 6, 20), circle(2, 4, 10)], outputs: {},
};
let viewport = { width: 1440, height: 1000 };
const tag = label => `${viewport.width}x${viewport.height}-${label}`;
const snapshot = label => f.snapshot(tag(label));
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const bodyRow = () => browser().locator('.ol-row > button.ol[title="Double-click to rename"]');
async function browserName(expected, doc) {
  await f.same(doc);
  await browser().getByRole('button', { name: expected, exact: true }).waitFor();
  assert.equal(await bodyRow().count(), 1);
  assert.equal(await bodyRow().innerText(), expected);
  await f.same(doc);
}
async function renameBody(before, name) {
  await bodyRow().dblclick();
  const input = f.page.getByRole('textbox', { name: 'Body name', exact: true });
  await input.fill(name); await input.press('Enter'); await input.waitFor({ state: 'hidden' });
  const expected = { ...before, bodies: { ...before.bodies, b5: { ...before.bodies?.b5, name } } };
  await f.same(expected); await browserName(name, expected); return expected;
}
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const settled = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
async function open(doc, name) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: `${name}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function start(indices) {
  for (const [i, index] of indices.entries()) await button(`Sketch ${index + 1}`).click(i ? { modifiers: ['Shift'] } : {});
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  await settled();
}
async function verify(doc, label) {
  const loft = doc.nodes[5], native = await f.inspect(tag(label), doc), expected = 20 * Math.PI * (9 + 18 + 36) / 3;
  f.report.observations.push({ label: tag(label), loft, ...native, expected });
  assert.ok(native.valid && native.count === 1 && Math.abs(native.volume - expected) < 1e-6, JSON.stringify(native));
  assert.equal(loft.kind, 'loft');
  assert.deepEqual(loft.from, [0, 1]);
  assert.deepEqual(loft.sections, [{ sketch: 3, z: 0 }, { sketch: 4, z: 20 }]);
}
await f.run(async () => {
  const newPage = f.newPage;
  f.newPage = async (...args) => { await newPage(...args); await f.page.setViewportSize(viewport); };
  for (const size of [{ width: 1440, height: 1000 }, { width: 1024, height: 800 }]) {
    viewport = size;
    await f.newPage();
    await open(seed, 'D1170-loft-modes');
    f.phase = 'choose the upper section before the lower section';
    await start([1, 0]);
    const mode = () => hud().getByLabel('Smooth (through the middle sections)', { exact: true });
    if (baseline) {
      await mode().selectOption('yes');
      await settled();
      await snapshot('smooth-offered-for-two');
      await button('Apply', hud()).click();
      await f.changed(seed);
      const after = await snapshot('smooth-choice-lost');
      await verify(after.doc, 'baseline-still-ruled');
      assert.equal(after.doc.nodes[5].smooth, undefined);
      assert.fail('Two-section creation offers Smooth while the result stays Ruled');
    }
    assert.equal(await mode().count(), 0);
    await hud().getByText('Ruled · 2 sections', { exact: true }).waitFor();
    await hud().getByText('Sketch 1 → Sketch 2 (height order)', { exact: true }).waitFor();
    await f.same(seed);
    await snapshot('ruled-two-section-preview');
    await button('Apply', hud()).click();
    await f.changed(seed);
    const after = await snapshot('ruled-two-section-applied');
    await verify(after.doc, 'applied-conical-frustum');
    await browserName('Loft 2 sections', after.doc);
    assert.equal(after.doc.nodes[5].smooth, undefined);
    await f.openFeatureEditor(5, 'read Ruled in Loft History');
    await f.editor().getByText('Ruled · 2 sections', { exact: true }).waitFor();
    assert.equal(await f.editor().getByLabel('Smooth', { exact: true }).count(), 0);
    await snapshot('history-ruled');
    await f.closeEditor();
    await f.undo();
    await f.same(seed);
    await f.redo();
    await f.same(after.doc);
    await browserName('Loft 2 sections', after.doc);
    const saved = await f.save(tag('loft-two-section'));
    const reopened = await f.freshOpen(saved.file, after.doc, tag('loft-reopened'));
    await verify(reopened.doc, 'reopened-conical-frustum');
    await browserName('Loft 2 sections', reopened.doc);
    const legacy = structuredClone(after.doc);
    legacy.nodes[5].smooth = true;
    await open(legacy, 'D1170-legacy-two-section-smooth');
    await verify(legacy, 'legacy-flag-effective-ruled');
    await browserName('Loft 2 sections', legacy);
    assert.equal((await f.doc()).nodes[5].smooth, true, 'Display must not normalize the authored legacy flag');
    await f.openFeatureEditor(5, 'read the mode of the legacy two-section flag');
    await f.editor().getByText('Ruled · 2 sections', { exact: true }).waitFor();
    await f.same(legacy);
    await snapshot('legacy-effective-ruled');
    await f.closeEditor();
    const legacySaved = await f.save(tag('legacy-two-section-unchanged'));
    const named = await renameBody(legacy, 'Workshop frustum');
    await verify(named, 'user-name-preserves-legacy-frustum');
    await snapshot('user-name-wins');
    await f.undo(); await f.same(legacy); await browserName('Loft 2 sections', legacy);
    await f.redo(); await f.same(named); await browserName('Workshop frustum', named);
    const namedSaved = await f.save(tag('user-named-legacy'));
    await f.freshOpen(namedSaved.file, named, tag('user-named-legacy-reopened'));
    await browserName('Workshop frustum', named); await verify(named, 'user-named-reopened-frustum');
    await f.freshOpen(legacySaved.file, legacy, tag('legacy-unnamed-reopened'));
    await browserName('Loft 2 sections', legacy); await verify(legacy, 'legacy-reopened-frustum');
    assert.equal((await f.doc()).nodes[5].smooth, true);
    await open(seed, 'D1170-three-section-control');
    await start([1, 0, 2]);
    await mode().selectOption('yes');
    await settled();
    await hud().getByText('Sketch 1 → Sketch 3 → Sketch 2 (height order)', { exact: true }).waitFor();
    await button('Apply', hud()).click();
    await f.changed(seed);
    const smooth = await snapshot('three-section-smooth-control');
    assert.equal(smooth.doc.nodes.at(-1).smooth, true);
    assert.deepEqual(smooth.doc.nodes.at(-1).from, [0, 2, 1]);
    await browserName('Loft 3 sections · smooth', smooth.doc);
    await f.openFeatureEditor(smooth.doc.nodes.length - 1, 'read three-section Smooth in History');
    assert.equal(await f.editor().getByLabel('Smooth', { exact: true }).isChecked(), true);
    await f.closeEditor();
    await f.undo(); await f.same(seed); await f.redo(); await f.same(smooth.doc);
    await browserName('Loft 3 sections · smooth', smooth.doc);
    const smoothSaved = await f.save(tag('three-section-smooth'));
    await f.freshOpen(smoothSaved.file, smooth.doc, tag('three-section-smooth-reopened'));
    await browserName('Loft 3 sections · smooth', smooth.doc);
    await f.openFeatureEditor(smooth.doc.nodes.length - 1, 'reopened three-section Smooth');
    assert.equal(await f.editor().getByLabel('Smooth', { exact: true }).isChecked(), true);
    await f.closeEditor();
    f.report.observations.push({ ...viewport, legacyEffectiveRuledBrowserName: true, legacyDocumentUnchanged: true, userNameWins: true, threeSectionSmoothSuffix: true, undoRedoSaveFreshOpen: true });
  }
});
