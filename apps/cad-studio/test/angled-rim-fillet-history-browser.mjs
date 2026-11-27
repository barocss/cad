import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const width = 12, depth = 8, height = 8;
const origin = [4, 3, 0], along = [0.6, 0.8, 0], outward = [0.8, -0.6, 0];
const direction = [0.8 * Math.SQRT1_2, -0.6 * Math.SQRT1_2, Math.SQRT1_2];
const anchor = [origin[0] + width / 2 * along[0], origin[1] + width / 2 * along[1], height];
const edge = 'n1.side0|n1.top';
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [width, depth],
      plane: { origin, normal: [0, 0, 1], xAxis: along } },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
  ], outputs: { b1: { node: 1, side: 'solid' } },
};
const f = await createFlow({
  name: 'angled-rim-fillet-history', output: process.argv[2], envFrozen: 'D2061_SOURCE_FROZEN',
  qualification: 'Drag one original non-cardinal upper rim in New Fillet and saved perspective History.',
  limits: ['One horizontal rectangular Extrude with a non-cardinal XY sketch frame and one terminal constant top Fillet.'],
  initialFiles: ['apps/cad-studio/test/angled-rim-fillet-history-browser.mjs', 'apps/cad-studio/src/state/historyFilletRadiusReceipt.ts',
    'apps/cad-studio/src/app/useHistoryFilletRadius.ts', 'apps/cad-studio/src/viewport/useCommandGizmos.ts', ...(baseline ? [] : [
      'apps/cad-studio/src/state/historyAngledTopFillet.ts', 'packages/barocss-cad-model/src/engine/nativeAngledTopFillet.ts',
    ])],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => ({key, digest: digestOf(brep),
  report: checkBrep(brep, {strict:true}), volume: brepMassProperties(brep, 1).volume,
  faces: brep.faces.map(face => ({name:face.name, ...faceGeometry(face)}))
}))));`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = () => f.page.locator('.hud');
const field = () => hud().getByLabel('Radius', { exact: true });
const handle = key => f.page.locator(`g.gizmo-handle[data-handle="${key}"]`);
const preview = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const offset = (point, delta, length) => point.map((value, i) => value + delta[i] * length);
const camera = () => f.page.evaluate(() => window.__studioCamera());

async function view(name, ortho) {
  await button(name, f.page.locator('.views')).click();
  if (((await button('Ortho').getAttribute('aria-pressed')) === 'true') !== ortho) await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function orbit(yaw, pitch) {
  const canvas = await f.page.locator('.vp-canvas').boundingBox();
  for (let i = 0; i < 4; i++) {
    const current = await camera();
    const difference = current.yaw - yaw;
    const dx = Math.atan2(Math.sin(difference), Math.cos(difference)) / .008, dy = (pitch - current.pitch) / .008;
    if (Math.hypot(dx, dy) < .03) break;
    const [x, y] = [canvas.x + canvas.width * .55, canvas.y + canvas.height * .55];
    await f.page.mouse.move(x, y);
    await f.page.mouse.down({ button: 'right' });
    await f.page.mouse.move(x + dx, y + dy, { steps: 12 });
    await f.page.mouse.up({ button: 'right' });
  }
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function endOn() {
  const state = await camera();
  let eyeDirection = direction;
  if (!state.ortho) {
    // Intersect the line through the native rim anchor with the current orbit sphere.
    const relative = anchor.map((value, i) => value - state.target[i]);
    const onLine = dot(relative, direction);
    const travel = -onLine + Math.sqrt(state.distance ** 2 - dot(relative, relative) + onLine ** 2);
    assert.ok(travel > 5);
    eyeDirection = offset(relative, direction, travel).map(value => value / state.distance);
  }
  await orbit(Math.atan2(eyeDirection[1], eyeDirection[0]), Math.asin(eyeDirection[2]));
  const projection = distance(await f.screenOf(anchor), await f.screenOf(offset(anchor, direction, 10)));
  assert.ok(projection < .2, `projected ten-millimetre guide is ${projection} px`);
  return { projection, camera: await camera() };
}
async function gripPosition(key, radius) {
  const expected = await f.screenOf(offset(anchor, direction, radius));
  const box = await handle(key).locator('circle').boundingBox();
  assert.ok(box);
  const actual = [box.x + box.width / 2, box.y + box.height / 2];
  return { actual, expected, errorPx: distance(actual, expected) };
}
async function drag(key, before, start, target, label, offsetPx = 0) {
  const sight = await endOn();
  const state = sight.camera, { actual: [x, y], errorPx } = await gripPosition(key, start);
  assert.ok(errorPx < .75, `original rim handle error ${errorPx}`);
  const eye = await f.page.evaluate(() => window.__studioEye());
  const outwardCamera = eye.map((value, i) => (value - state.target[i]) / state.distance);
  const grip = offset(anchor, direction, start);
  const viewDepth = state.ortho ? state.distance : dot(eye.map((value, i) => value - grip[i]), outwardCamera);
  const canvas = await f.page.locator('.vp-canvas').boundingBox();
  const pixelsPerMm = canvas.height / (2 * viewDepth * Math.tan(state.fovY / 2));
  await f.page.mouse.move(x + offsetPx, y);
  await f.page.mouse.down();
  await f.page.mouse.move(x + offsetPx, y - pixelsPerMm * (target - start), { steps: 8 });
  await f.page.waitForFunction(expected => Number(document.querySelector('.hud input[aria-label="Radius"]')?.value) === expected, target);
  await preview();
  await f.same(before);
  await f.snapshot(label);
  await f.page.mouse.up();
  assert.equal(Number(await field().inputValue()), target);
  f.report.observations.push({ label, start, target, errorPx, offsetPx, pixelsPerMm, ...sight });
}
async function verify(doc, radius, label) {
  const node = doc.nodes[2];
  assert.deepEqual(node.edges, [edge]);
  assert.equal(node.radius, radius);
  assert.deepEqual(doc.nodes.slice(0, 2), stock.nodes);
  const [body, ...others] = await f.inspect(label, doc);
  assert.equal(others.length, 0);
  assert.ok(body.report.valid, JSON.stringify(body.report.issues));
  assert.deepEqual([body.report.counts.bodies, body.report.counts.shells, body.report.topology[0].genus], [1, 1, 0]);
  near(body.volume, width * depth * height - width * (1 - Math.PI / 4) * radius ** 2);
  near((await f.bodies()).bodies[0].volume, body.volume);
  const cylinders = body.faces.filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, 1);
  const [round] = cylinders;
  near(round.r, radius);
  near(Math.abs(dot(round.a, along)), 1);
  const projected = round.c.map((value, i) => value - anchor[i]);
  near(dot(projected, outward), -radius);
  near(projected[2], -radius);
  assert.equal(round.out, 1);
  f.report.observations.push({ label, radius, volume: body.volume, digest: body.digest, cylinder: round });
  return body.digest;
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({ name: 'angled-stock.bcad',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)) });
  await f.same(stock);
  await view('Top', true);
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  await f.worldClick(anchor);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  if (await button('Close chat').isVisible()) await button('Close chat').click();
  await f.command('Fillet');
  await field().fill('0.5');
  await preview();
  await drag('radius', stock, .5, 1, '01-create-angled-rim');
  await button('Apply', hud()).click();
  await f.changed(stock);
  const created = await f.doc();
  await verify(created, 1, 'created-native');
  await view('Iso', false);
  await f.openFeatureEditor(2, 'non-cardinal top rim');
  if (!baseline) await handle('r').locator('title').filter({ hasText: /when viewed end-on/ }).waitFor({ state: 'attached' });
  const position = await gripPosition('r', 1);
  const ownsOriginal = (await handle('r').locator('title').allTextContents()).some(text => text.includes('when viewed end-on'));
  f.report.observations.push({ label: 'history-anchor', ...position, ownsOriginal });
  await f.snapshot(baseline ? '02-generic-angled-history-grip' : '02-original-angled-rim');
  if (baseline) { assert.ok(position.errorPx > 5 && !ownsOriginal); return; }
  assert.ok(position.errorPx < .75 && ownsOriginal);
  await drag('r', created, 1, 2, '03-perspective-cancel', 10);
  await button('Cancel', hud()).click();
  await f.same(created);
  if (!(await f.editor().isVisible())) await f.openFeatureEditor(2);
  await drag('r', created, 1, 2, '04-perspective-apply');
  await button('Apply', hud()).click();
  await f.changed(created);
  const edited = await f.doc();
  assert.deepEqual(edited, { ...created, nodes: [...created.nodes.slice(0, 2), { ...created.nodes[2], radius: 2 }] });
  const shape = await verify(edited, 2, 'edited-native');
  await f.undo();
  await f.same(created);
  await f.redo();
  await f.same(edited);
  await f.undo();
  await f.same(created);
  if (!(await f.editor().isVisible())) await f.openFeatureEditor(2);
  await f.editor().getByLabel('Radius', { exact: true }).fill('2');
  await f.applyEditor(created, '05-typed-radius');
  await f.same(edited);
  assert.equal(await verify(edited, 2, 'typed-native'), shape);
  const saved = await f.save('angled-rim-fillet');
  const opened = await f.freshOpen(saved.file, edited, '06-fresh-open');
  assert.equal(await verify(opened.doc, 2, 'opened-native'), shape);
  await view('Iso', false);
  await f.snapshot('07-reopened-angled-fillet');
});
