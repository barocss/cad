import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/circular-pivot-hole-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/state/historyFeatureApply.ts',
  'apps/cad-studio/src/app/circularPatternHolePivot.ts',
  'apps/cad-studio/src/app/patternHoleSpacing.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'circular-pivot-hole', output: process.argv[2], envFrozen: 'CIRCULAR_PIVOT_HOLE_SOURCE_FROZEN',
  qualification: 'WebGPU top-face mouse pick, actual Hole command, circular History pivot, Undo/Redo and OPFS reopen.',
  limits: ['Loaded 4-copy pattern (not authored by this driver), ordinary terminal Through Hole on n1.top@2, Z circular pattern and unchanged count/span.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkBrep, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [body] = evaluateCadPart(toPartDocument(doc)).outputs;
console.log(JSON.stringify({
  valid: checkBrep(body.brep, {strict: true}).valid, count: body.bodyCount,
  stock: body.brep.vertices.map(v => v.point),
  mass: massPropertiesOf(body),
  walls: body.brep.faces.filter(face => face.name?.startsWith('n3.')).map(faceGeometry),
  tops: body.brep.faces.filter(face => /^n1\\.top(?:@\\d+)?$/.test(face.name ?? '')).map(f => [f.name, f.loops.length]),
}));
`,
});

const ref = node => ({ node, side: 'solid' });
const base = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [10, 20], max: [14, 26] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'circular-pattern', parent: ref(1), axis: 'z', count: 4, angle: 90, span: 360 },
  ],
  outputs: { b2: ref(2) }, nextId: 3,
};
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Hole', exact: true });
const field = (name, root = hud()) => root.getByLabel(name, { exact: true });
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const preview = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
const file = 'circular-pivot-hole.bcad';
const projectName = 'Circular pivot hole QA';
const project = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
async function connectProject() {
  await button('Project and versions').click();
  await project().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(projectName);
  await button('Project in this browser', project()).click();
  await project().getByLabel('Project', { exact: true }).waitFor();
}
async function verify(label, doc, px, expectedX, expectedY) {
  const native = await f.inspect(label, doc);
  assert.ok(native.valid);
  assert.equal(native.count, 4);
  assert.equal(native.tops.length, 4);
  assert.deepEqual(native.tops.filter(([, n]) => n > 1), [['n1.top@2', 2]]);
  assert.deepEqual(doc.nodes[3].parent, ref(2));
  assert.equal(doc.nodes[3].face, 'n1.top@2');
  near(doc.nodes[3].center[0], expectedX);
  near(doc.nodes[3].center[1], expectedY);
  assert.equal(native.walls.length, 2);
  for (const w of native.walls) {
    assert.equal(w.kind, 'cylinder');
    near(w.c[0], expectedX); near(w.c[1], expectedY); near(w.r, 1); near(Math.abs(w.a[2]), 1);
  }
  const removed = 8 * Math.PI, volume = 768 - removed;
  near(native.mass.volume, volume);
  near(native.mass.centroid[0], (768 * px - removed * expectedX) / volume);
  near(native.mass.centroid[1], -removed * expectedY / volume);
  near(native.mass.centroid[2], 4);
  for (let k = 0; k < 4; ++k) for (const x of [10, 14]) for (const y of [20, 26]) for (const z of [0, 8]) {
    let u = x - px, v = y;
    for (let j = 0; j < k; ++j) [u, v] = [-v, u];
    assert.equal(native.stock.filter(p => p.every((a, i) => Math.abs(a - [u + px, v, z][i]) < 1e-7)).length, 1);
  }
}
async function equalDraft(pivot) {
  await f.openFeatureEditor(2, 'Circular pattern');
  const input = field('Axis at X', f.editor());
  assert.equal(Number(await input.inputValue()), pivot);
  await input.fill(String(pivot + .125));
  await input.fill(String(pivot));
  // A UI fix may disable Apply for an equal payload instead of relying on the server-side gate.
  const apply = button('Apply', f.editor());
  if (await apply.isEnabled()) {
    await apply.click();
    // Do not close a pending no-op draft and accidentally cancel the bad transaction.
    await f.page.waitForFunction(() => {
      const editor = document.querySelector('.node-editor');
      return !editor || [...editor.querySelectorAll('button')].some(b => b.textContent === 'Apply' && !b.disabled);
    });
  }
  await f.ready();
  await f.closeEditor();
}

await f.run(async () => {
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base)) });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.some(n => n.kind === "circular-pattern"));
  await f.ready();
  const acceptedBase = await f.doc();
  assert.deepEqual(acceptedBase, base);

  f.phase = 'pointer authors ordinary Hole on the third copy';
  await button('Top', f.page.getByRole('group', { name: 'Views' })).click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'TOP');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const picked = [-12, -23, 8];
  const screen = await f.page.evaluate(p => window.__studioScreenOf(p), picked);
  assert.ok(screen?.length === 2);
  assert.ok(await f.page.evaluate(([x,y]) => document.elementFromPoint(x,y)?.matches('canvas.vp-canvas'), screen));
  await f.page.mouse.click(...screen);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.faces.length === 1);
  await f.page.keyboard.press('h');
  await preview();
  near(Number(await field('Centre X').inputValue()), picked[0], .15);
  near(Number(await field('Centre Y').inputValue()), picked[1], .15);
  await field('Centre X').fill('-12');
  await field('Centre Y').fill('-23');
  await field('Diameter').fill('2');
  await preview();
  await f.same(acceptedBase);
  await button('Apply', hud()).click();
  await f.changed(acceptedBase);
  const authored = await f.doc();
  assert.equal(authored.nodes[3].kind, 'hole');
  assert.equal(authored.nodes[3].radius, 1);
  assert.equal(authored.nodes[3].depth, undefined);
  await verify('ordinary-hole', authored, 0, -12, -23);

  f.phase = 'equal-value apply must not add an Undo entry';
  await equalDraft(0);
  f.phase = 'check the implicit-zero round trip and first Undo';
  if (process.env.CIRCULAR_PIVOT_HOLE_LEGACY_UNDO === '1') {
    const legacy = structuredClone(authored);
    legacy.nodes[2].pivot = [0, 0, 0];
    await f.same(legacy);
    await verify('legacy-equal-geometry', legacy, 0, -12, -23);
    await f.snapshot('01-legacy-equal-commit');
    await f.undo();
    await f.same(authored);
    await f.snapshot('02-legacy-first-undo-hole-remains');
    await f.undo();
    await f.same(acceptedBase);
    f.report.zeroRoundTrip = {committedExplicitZero:true, undoCountToPreHole:2};
    assert.deepEqual(f.report.downloads, []);
    return;
  }
  await f.same(authored);
  assert.ok(await button('Undo').isEnabled());
  await f.undo();
  await f.same(acceptedBase);
  await f.snapshot('03-fixed-first-undo-removes-hole');
  f.report.zeroRoundTrip = {committedExplicitZero:false, undoCountToPreHole:1};
  assert.ok(await button('Redo').isEnabled());
  await f.redo();
  await f.same(authored);

  f.phase = 'change the pivot through History Apply';
  let previous = authored;
  for (const px of [.25, 2]) {
    await f.openFeatureEditor(2, 'Circular pattern');
    await field('Axis at X', f.editor()).fill(String(px));
    await f.same(previous);
    const moved = (await f.applyEditor(previous, 'pivot-' + px)).doc;
    assert.deepEqual(moved.nodes[2].pivot, [px, 0, 0]);
    await verify('pivot-' + px + '-native', moved, px, -12 + 2 * px, -23);
    await equalDraft(px);
    await f.same(moved);
    await f.undo();
    await f.same(previous);
    await f.redo();
    await f.same(moved);
    await verify('redo-' + px + '-native', moved, px, -12 + 2 * px, -23);
    previous = moved;
  }

  f.phase = 'mixed Count and Axis edit is refused without changing current geometry';
  await f.openFeatureEditor(2, 'Circular pattern');
  await field('Axis at X', f.editor()).fill('2.25');
  await field('Count', f.editor()).fill('3');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('This Hole cannot safely follow the circular axis edit.', { exact: false }).waitFor();
  await f.same(previous);
  await f.closeEditor();

  f.phase = 'save to OPFS then reload into a fresh Studio document';
  await connectProject();
  await button('Save').click();
  await project().getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
  const stored = await f.page.evaluate(async ([name, file]) => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(name);
    return JSON.parse(await (await (await dir.getFileHandle(file)).getFile()).text());
  }, [projectName, file]);
  assert.deepEqual(stored, previous);
  await button('Close project', project()).click();
  await project().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await connectProject();
  await button('Open ' + file, project()).click();
  await f.same(previous);
  await verify('reopened-native', await f.doc(), 2, -8, -23);
  await f.snapshot('reopened');
  assert.deepEqual(f.report.downloads, []);
});
