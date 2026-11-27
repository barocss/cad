import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const captureLoss = process.argv.includes('--capture-loss');
const legacyGrip = baseline && !captureLoss;
const width = 12, depth = 8, height = 8;
const top = [[width, depth / 2, height], [width / 2, 0, height], [width / 2, depth, height], [0, depth / 2, height]];
const edges = [1, 0, 2, 3].map(side => `n1.side${side}|n1.top`);
const anchor = top[0], direction = [Math.SQRT1_2, 0, Math.SQRT1_2];
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [width, depth] },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
  ], outputs: { b1: { node: 1, side: 'solid' } },
};
const f = await createFlow({
  name: 'box-top-fillet-history', output: process.argv[2], envFrozen: captureLoss ? 'D2059_SOURCE_FROZEN' : 'D2058_SOURCE_FROZEN',
  qualification: 'Create a four-upper-edge box Fillet and drag the History radius from its first original rim.',
  limits: ['One terminal constant Fillet on the four original top edges of one numerical horizontal rectangular Extrude.'],
  initialFiles: ['apps/cad-studio/src/state/historyFilletRadiusReceipt.ts', 'apps/cad-studio/src/app/useHistoryFilletRadius.ts',
    'apps/cad-studio/src/viewport/useCommandGizmos.ts', ...(captureLoss ? ['apps/cad-studio/src/viewport/viewportPointerInput.ts',
      ...(!baseline ? ['apps/cad-studio/src/viewport/filletScalarDraft.ts'] : [])] : []),
    ...(legacyGrip ? [] : [
      'apps/cad-studio/src/state/historyBoxTopFillet.ts', 'packages/barocss-cad-model/src/engine/nativeBoxTopFillets.ts',
    ])],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => ({key, digest: digestOf(brep),
  report: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  faces: brep.faces.map(face => ({ name: face.name, ...faceGeometry(face) }))
}))));`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = () => f.page.locator('.hud');
const field = () => hud().getByLabel('Radius', { exact: true });
const handle = (key = 'r') => f.page.locator(`g.gizmo-handle[data-handle="${key}"]`);
const preview = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const nearby = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

async function view(name) {
  await button(name, f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function orbit(yaw, pitch) {
  const current = () => f.page.evaluate(() => window.__studioCamera());
  const box = await f.page.locator('.vp-canvas').boundingBox();
  for (let i = 0; i < 3; i++) {
    const camera = await current();
    const dx = (camera.yaw - yaw) / .008, dy = (pitch - camera.pitch) / .008;
    if (Math.hypot(dx, dy) < .05) break;
    const [x, y] = [box.x + box.width * .55, box.y + box.height * .55];
    await f.page.mouse.move(x, y);
    await f.page.mouse.down({ button: 'right' });
    await f.page.mouse.move(x + dx, y + dy, { steps: 12 });
    await f.page.mouse.up({ button: 'right' });
  }
  const camera = await current();
  assert.ok(camera.ortho);
  near(camera.yaw, yaw, .003);
  near(camera.pitch, pitch, .003);
}
async function position(radius, key) {
  const expected = await f.screenOf(anchor.map((value, i) => value + radius * direction[i]));
  const { x, y, width, height } = await handle(key).locator('circle').boundingBox();
  const actual = [x + width / 2, y + height / 2];
  return { expected, actual, errorPx: nearby(expected, actual) };
}
async function openHistory() {
  await f.openFeatureEditor(2, 'shared four upper rims');
  if (!legacyGrip) await handle().locator('title').filter({ hasText: /when viewed end-on/ }).waitFor({ state: 'attached' });
}
async function verify(doc, label, radius) {
  const node = doc.nodes[2];
  assert.deepEqual(node.edges, edges);
  assert.equal(node.radius, radius);
  const [body, ...remaining] = await f.inspect(label, doc);
  assert.deepEqual(remaining, []);
  assert.equal(body.report.valid, true, JSON.stringify(body.report.issues));
  assert.deepEqual([body.report.counts.bodies, body.report.counts.shells, body.report.topology[0].genus], [1, 1, 0]);
  const loss = 2 * (width + depth) * (1 - Math.PI / 4) * radius ** 2 - 4 * (5 / 3 - Math.PI / 2) * radius ** 3;
  near(body.volume, width * depth * height - loss);
  near((await f.bodies()).bodies[0].volume, body.volume);
  const cylinders = body.faces.filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, 4);
  for (const [axis, stations] of [[0, [radius, depth - radius]], [1, [radius, width - radius]]]) {
    for (const station of stations) {
      const cylindersAtStation = cylinders.filter(face => Math.abs(face.a[axis]) > 0.99 && Math.abs(face.c[1 - axis] - station) < 1e-8);
      assert.equal(cylindersAtStation.length, 1);
      const [face] = cylindersAtStation;
      near(face.r, radius);
      near(face.c[2], height - radius);
      assert.equal(face.out, 1);
    }
  }
  f.report.observations.push({ label, radius, volume: body.volume, digest: body.digest });
  return body.digest;
}
async function drag(before, radius, label) {
  await orbit(0, Math.PI / 4);
  const { actual: [x, y], errorPx } = await position(1);
  assert.ok(errorPx < .75);
  const [begin, projected, across] = await Promise.all([f.screenOf(anchor), f.screenOf(anchor.map((value, i) => value + 10 * direction[i])),
    f.screenOf([anchor[0], anchor[1] + 1, anchor[2]])]);
  const projectionPx = nearby(begin, projected), pixelsPerMm = nearby(begin, across);
  assert.ok(projectionPx < .15);
  await f.page.mouse.move(x, y);
  await f.page.mouse.down();
  await f.page.mouse.move(x, y - pixelsPerMm * (radius - 1), { steps: 10 });
  await preview();
  assert.equal(Number(await field().inputValue()), radius);
  await f.page.mouse.move(x, y, { steps: 10 });
  await f.page.waitForFunction(() => Number(document.querySelector('.hud input[aria-label="Radius"]')?.value) === 1);
  await f.page.mouse.move(x, y - pixelsPerMm * (radius - 1), { steps: 10 });
  await f.page.waitForFunction(expected => Number(document.querySelector('.hud input[aria-label="Radius"]')?.value) === expected, radius);
  await preview();
  await f.same(before);
  await f.snapshot(label);
  await f.page.mouse.up();
  assert.equal(Number(await field().inputValue()), radius);
  f.report.observations.push({ label, projectionPx, pixelsPerMm, errorPx });
}

async function loseCapture(before, history) {
  const owner = history ? 'history' : 'creation';
  f.phase = `Drop live pointer capture during a valid ${owner} R2 preview`;
  await orbit(0, Math.PI / 4);
  const { actual: [x, y] } = await position(1, history ? 'r' : 'radius');
  const span = nearby(await f.screenOf(anchor), await f.screenOf([anchor[0], anchor[1] + 1, anchor[2]]));
  const beforeHistory = await readHistory();
  await f.page.evaluate(() => {
    const canvas = document.querySelector('canvas.vp-canvas');
    window.__filletCapture = { id: null, lost: [] };
    canvas.addEventListener('pointerdown', event => {
      if (event.isTrusted) window.__filletCapture.id = event.pointerId;
    }, { once: true });
    canvas.addEventListener('lostpointercapture', event => {
      window.__filletCapture.lost.push({ id: event.pointerId, trusted: event.isTrusted });
    }, { once: true });
  });
  await f.page.mouse.move(x, y);
  await f.page.mouse.down();
  try {
    await f.page.mouse.move(x, y - span, { steps: 10 });
    await preview();
    assert.equal(Number(await field().inputValue()), 2);
    await f.same(before);
    const id = await f.page.evaluate(() => {
      const canvas = document.querySelector('canvas.vp-canvas'), id = window.__filletCapture.id;
      if (id === null || !canvas.hasPointerCapture(id)) return null;
      canvas.releasePointerCapture(id);
      return id;
    });
    assert.notEqual(id, null, 'Chrome must own this real pointer under the canvas');
    await f.page.mouse.move(x + 1, y - span);
    await f.page.waitForFunction(id => window.__filletCapture.lost.some(event => event.id === id && event.trusted), id);
  } finally {
    await f.page.mouse.up();
  }
  await f.same(before);
  assert.deepEqual(await readHistory(), beforeHistory);
  if (baseline) {
    assert.equal(Number(await field().inputValue()), 2);
    assert.equal(await button('Apply', hud()).isEnabled(), true);
    await f.snapshot(`${owner}-capture-lost-stale-r2`);
    if (!history) { await field().fill('1'); await preview(); }
  } else if (history) {
    await hud().waitFor({ state: 'hidden' });
    await f.editor().waitFor();
    assert.equal(Number(await f.editor().getByLabel('Radius', { exact: true }).inputValue()), 1);
    await f.snapshot(`${owner}-capture-lost-restored-r1`);
  } else {
    await preview();
    assert.equal(Number(await field().inputValue()), 1);
    assert.equal(await button('Apply', hud()).isEnabled(), true);
    await f.snapshot(`${owner}-capture-lost-restored-r1`);
  }
  f.report.observations.push({ label: 'trusted-lostpointercapture', owner, baseline,
    events: await f.page.evaluate(() => window.__filletCapture.lost) });
}

const readHistory = () => f.page.evaluate(() => ({
  undo: document.querySelector('button[aria-label="Undo"]').disabled,
  redo: document.querySelector('button[aria-label="Redo"]').disabled,
  nodes: [...document.querySelectorAll('.history .hs')].map(item => item.dataset.nodeIndex),
  selection: window.__studioSelection?.selection,
  dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
}));

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'rectangular-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)),
  });
  await f.same(stock);
  f.phase = 'Select four original upper rims';
  await view('Top');
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  for (const [i, point] of top.entries()) {
    if (i) await f.page.keyboard.down('Shift');
    try { await f.worldClick(point); } finally { if (i) await f.page.keyboard.up('Shift'); }
    await f.page.waitForFunction(count => window.__studioSelection.selection.edges.length === count, i + 1);
  }
  if (await button('Close chat').isVisible()) await button('Close chat').click();
  await f.command('Fillet');
  await field().fill('1');
  await preview();
  if (captureLoss) {
    await view('Iso');
    await loseCapture(stock, false);
  }
  await button('Apply', hud()).click();
  await f.changed(stock);
  const created = await f.doc();
  await verify(created, '01-created-native', 1);
  await view('Iso');
  if (captureLoss) {
    await openHistory();
    await f.editor().getByLabel('Radius', { exact: true }).fill('2');
    await f.applyEditor(created, 'setup-existing-redo');
    await f.undo();
    await f.same(created);
    assert.equal(await button('Redo').isEnabled(), true);
  }
  await openHistory();
  const positionAtOpen = await position(1);
  const ownsOriginal = (await handle().locator('title').allTextContents()).some(title => title.includes('when viewed end-on'));
  f.report.observations.push({ label: 'history-anchor', ...positionAtOpen, ownsOriginal });
  await f.snapshot(legacyGrip ? '02-generic-history-grip' : '02-original-upper-rim');
  if (legacyGrip) {
    assert.ok(positionAtOpen.errorPx > 5 && !ownsOriginal);
    return;
  }
  assert.ok(positionAtOpen.errorPx < .75 && ownsOriginal);
  if (captureLoss) {
    await loseCapture(created, true);
    if (baseline) return;
    await f.save('history-after-capture-loss');
  }
  await drag(created, 2, '03-history-cancel-preview');
  await button('Cancel', hud()).click();
  await f.same(created);
  if (!(await f.editor().isVisible())) await openHistory();
  await drag(created, 2, '04-history-apply-preview');
  await button('Apply', hud()).click();
  await f.changed(created);
  const edited = await f.doc();
  assert.deepEqual(edited, { ...created, nodes: [...created.nodes.slice(0, 2), { ...created.nodes[2], radius: 2 }] });
  const digest = await verify(edited, '05-edited-native', 2);
  await f.undo();
  await f.same(created);
  await f.redo();
  await f.same(edited);
  await f.undo();
  await f.same(created);
  if (!(await f.editor().isVisible())) await openHistory();
  const redo = await button('Redo').isEnabled();
  const editorRadius = f.editor().getByLabel('Radius', { exact: true });
  await editorRadius.fill('20');
  await button('Apply', f.editor()).click();
  await f.editor().getByRole('status').filter({ hasText: /radius|fillet/i }).waitFor();
  await f.same(created);
  assert.equal(await button('Redo').isEnabled(), redo);
  await f.snapshot('05-oversized-radius-refused');
  await editorRadius.fill('2');
  await f.applyEditor(created, '06-typed-radius');
  await f.same(edited);
  assert.equal(await verify(edited, '07-typed-native', 2), digest);
  const saved = await f.save('four-upper-fillets');
  const opened = await f.freshOpen(saved.file, edited, '08-fresh-open');
  assert.equal(await verify(opened.doc, '09-opened-native', 2), digest);
  await view('Iso');
  await f.snapshot('10-reopened-four-fillets');
});
