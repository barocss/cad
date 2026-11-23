import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs',
  'apps/cad-studio/src/viewport/useCommandGizmos.ts',
  'apps/cad-studio/src/viewport/scalarHandleDrag.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad-model/src/engine/nativeCircle.ts',
];
const f = await createFlow({
  name: 'closed-circular-fillet-handle', output: process.argv[2], envFrozen: 'D1864_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create a Constant Fillet by dragging from the stable native seam of one complete circular rim.',
  limits: ['One upright radius-8 cylinder, one top rim selection, Constant Fillet creation and actual desktop Studio.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, surfaceDomain, surfaceEvaluator } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep, key }] = partBreps(doc);
const faces = brep.faces.filter(face => face.name?.startsWith('n2.face#')).map(face => {
  const domain = surfaceDomain(face.surface), at = surfaceEvaluator(face.surface), samples = [];
  for (const u of [0, .25, .5, .75, 1]) for (const v of [0, .25, .5, .75, 1])
    samples.push(at(domain.u[0] + u * (domain.u[1] - domain.u[0]), domain.v[0] + v * (domain.v[1] - domain.v[0])));
  return { name: face.name, samples };
});
console.log(JSON.stringify({ key, digest: digestOf(brep), valid: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  edges: brep.edges.filter(edge => edge.name?.includes('.top')).map(edge => ({ name: edge.name, id: edge.id, vertices: edge.vertices })),
  faces }));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 8 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const targets = ['n1.side0#1|n1.top', 'n1.side0#2|n1.top'];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Fillet', exact: true });
const input = () => hud().getByLabel('Radius', { exact: true });
const handle = () => f.page.locator('g.gizmo-handle[data-handle="radius"] circle');
const anchor = radius => [8 + radius * Math.SQRT1_2, 0, 10 + radius * Math.SQRT1_2];
const screen = point => f.page.evaluate(world => window.__studioScreenOf(world), point);
const preview = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

async function frame(view) {
  await button(view, f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function start() {
  await frame('Top');
  const canvas = await f.page.locator('.vp-canvas').boundingBox();
  await f.page.mouse.click(canvas.x + 8, canvas.y + 8);
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.worldClick([8 * Math.SQRT1_2, 8 * Math.SQRT1_2, 10]);
  await f.page.waitForFunction(() => window.__studioSelection?.selection?.edges?.length === 1);
  await f.command('Fillet');
  await input().fill('0.6');
  await preview();
  await handle().waitFor();
}

async function measure(label, radius) {
  const expected = await screen(anchor(radius)), box = await handle().boundingBox();
  assert.ok(box);
  const actual = [box.x + box.width / 2, box.y + box.height / 2];
  const errorPx = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
  f.report.observations.push({ label, radius, expected, actual, errorPx });
  return { actual, expected, errorPx };
}

async function orbitEndOn() {
  for (let i = 0; i < 3; i++) {
    const { yaw, pitch } = await f.page.evaluate(() => window.__studioCamera());
    const dx = yaw / .008, dy = (Math.PI / 4 - pitch) / .008;
    if (Math.hypot(dx, dy) < .05) break;
    const rect = await f.page.locator('.vp-canvas').boundingBox();
    const x = rect.x + rect.width * .55, y = rect.y + rect.height * .55;
    await f.page.mouse.move(x, y);
    await f.page.mouse.down({ button: 'right' });
    await f.page.mouse.move(x + dx, y + dy, { steps: 12 });
    await f.page.mouse.up({ button: 'right' });
  }
  const [x, y, z] = anchor(.6);
  const [grip, advanced, tangent] = await Promise.all([screen([x, y, z]), screen(anchor(2)), screen([x, y + 1, z])]);
  const axisPx = Math.hypot(advanced[0] - grip[0], advanced[1] - grip[1]);
  const perMm = Math.hypot(tangent[0] - grip[0], tangent[1] - grip[1]);
  assert.ok(axisPx < .2 && perMm > 3, JSON.stringify({ axisPx, perMm }));
  f.report.observations.push({ label: 'end-on-rim-direction', axisPx, perMm });
  return perMm;
}

async function verify(label, doc, radius) {
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  assert.deepEqual([...doc.nodes[2].edges].sort(), targets);
  assert.equal(doc.nodes[2].radius, radius);
  const native = await f.inspect(label, doc);
  assert.ok(native.valid.valid);
  assert.deepEqual(native.valid.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  assert.deepEqual(native.faces.map(face => face.name).sort(), ['n2.face#1', 'n2.face#2']);
  const expected = 640 * Math.PI - 2 * Math.PI * (8 * (1 - Math.PI / 4) * radius ** 2 - (5 / 6 - Math.PI / 4) * radius ** 3);
  near(native.volume, expected, 2e-6);
  near((await f.bodies()).bodies[0].volume, expected, 2e-6);
  for (const { samples } of native.faces) for (const [x, y, z] of samples)
    near(Math.hypot(Math.hypot(x, y) - (8 - radius), z - (10 - radius)), radius, 2e-6);
  f.report.observations.push({ label, radius, volume: native.volume, referenceVolume: expected, digest: native.digest });
  return native.digest;
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'closed-rim-cylinder.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  const original = await f.inspect('original-round-prism', source);
  assert.deepEqual(original.edges.map(edge => edge.name).sort(), targets);
  assert.equal(new Set(original.edges.flatMap(edge => edge.vertices)).size, 2);
  await start();
  const top = await measure('top-handle', .6);
  await f.snapshot(baseline ? '01-top-baseline' : '01-top-original-anchor');
  await frame('Iso');
  const iso = await measure('isometric-handle', .6);
  await f.snapshot(baseline ? '02-isometric-baseline' : '02-isometric-original-anchor');
  if (baseline) {
    assert.ok(top.errorPx > 20 && iso.errorPx > 10, JSON.stringify({ top, iso }));
    await button('Apply', hud()).click();
    await f.changed(source);
    await verify('03-baseline-native-still-admits', await f.doc(), .6);
    return;
  }
  assert.ok(top.errorPx < .75 && iso.errorPx < .75, JSON.stringify({ top, iso }));
  f.phase = 'Drag the original rim handle with its guide viewed end-on';
  const perMm = await orbitEndOn(), grip = await measure('end-on-before-drag', .6);
  assert.ok(grip.errorPx < .75, JSON.stringify(grip));
  await f.page.mouse.move(...grip.actual);
  await f.page.mouse.down();
  await f.page.mouse.move(grip.actual[0], grip.actual[1] - Math.round(.9 * perMm), { steps: 6 });
  await f.page.locator('.gizmo-readout').filter({ hasText: /Radius 1\.5 mm/ }).waitFor();
  await preview();
  await f.same(source);
  await f.snapshot('03-radius-held');
  await f.page.mouse.up();
  assert.equal(Number(await input().inputValue()), 1.5);
  await button('Apply', hud()).click();
  await f.changed(source);
  const dragged = await f.doc();
  const digest = await verify('04-drag-native', dragged, 1.5);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(dragged);
  await f.undo();
  await f.same(source);
  await start();
  await input().fill('1.5');
  await preview();
  await button('Apply', hud()).click();
  await f.changed(source);
  await f.same(dragged);
  assert.equal(await verify('05-typed-native', await f.doc(), 1.5), digest);
  const saved = await f.save('closed-circular-fillet');
  await f.freshOpen(saved.file, dragged, '06-fresh-open');
  assert.equal(await verify('06-reopened-native', dragged, 1.5), digest);
});
