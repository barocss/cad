import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--expect-generic');
const create = process.argv.includes('--create');
const edges = ['n1.bottom|n1.side1', 'n1.side1|n1.top'];
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [{ kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [8, 0], center: [0, 0], direction: 'ccw' }, { kind: 'line', start: [0, 8] }] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const pins = ['apps/cad-studio/src/state/historyFilletRadiusReceipt.ts', 'apps/cad-studio/src/app/useHistoryFilletRadius.ts',
  'apps/cad-studio/src/viewport/useCommandGizmos.ts', 'packages/barocss-cad-model/src/engine/nativeFilletTorus.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts'];
if (create) pins.push('packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/circularFilletPair.ts');
const f = await createFlow({
  name: create ? 'paired-circular-fillet-create' : 'paired-circular-history-fillet', output: process.argv[2],
  envFrozen: create ? 'D1716_SOURCE_FROZEN' : 'D1715_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: create ? 'Select the two original circular rims and create one Constant Fillet.' :
    'Edit the shared Constant Fillet radius of the two original circular rims in Studio History.',
  limits: ['One R8 quarter-sector extruded 10 mm, one terminal two-rim Fillet and desktop WebGPU.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, revolutionOf, surfaceDomain } from '@barocss/cad';
import { withNode } from '@barocss/cad-model/engine/doc';
import { evaluatePart, partBreps } from '@barocss/cad-model/engine/evaluate';
import { toSig } from '@barocss/cad-model/engine/references';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const result = evaluatePart(doc, 1, 8, 'refs');
  assert.ok(result.ok && result.bodies.length === 1);
  const { edges } = signaturesOf(result.bodies[0]);
  const names = ['n1.bottom|n1.side1', 'n1.side1|n1.top'];
  const sigs = Object.fromEntries(names.map(name => {
    const edge = edges.get(name);
    assert.ok(edge?.kind === 'curve' && !edge.shared);
    return [name, toSig(edge)];
  }));
  console.log(JSON.stringify(withNode(doc, { kind: 'fillet', radius: .6, parent: { node: 1, side: 'solid' }, edges: names, sigs })));
} else {
  const [{ brep }] = partBreps(doc);
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const blends = brep.faces.filter(face => face.name?.startsWith('n2.face')).map(face => {
    assert.equal(face.surface.kind, 'surface');
    const revolution = revolutionOf(face.surface, 20);
    assert.ok(revolution?.profile.kind === 'arc');
    const { c, a, profile } = revolution;
    const centre = c.map((value, i) => value + a[i] * profile.c[1]);
    const { u, v } = surfaceDomain(face.surface);
    const lerp = ([p, q], t) => p + (q - p) * t;
    const points = [.19, .5, .81].flatMap(s => [.2, .5, .8].map(t => evaluateSurface(face.surface, lerp(u, s), lerp(v, t))));
    const trims = face.loops.flatMap(id => loops.get(id).coedges.map(id => {
      const use = coedges.get(id), twin = coedges.get(use.twin), edge = edges.get(use.edge), domain = curveDomain(edge.curve);
      assert.ok(twin?.twin === use.id && twin.edge === edge.id && twin.sense !== use.sense);
      return { id: edge.id, adjacent: faces.get(loops.get(twin.loop).face).name.replace(/#\d+$/, ''),
        points: [0, .25, .5, .75, 1].map(t => evaluateCurve(edge.curve, lerp(domain, t))) };
    }));
    return { name: face.name, centre, axis: a, major: profile.c[0], minor: profile.r, points, trims };
  });
  const check = checkBrep(brep, { strict: true });
  console.log(JSON.stringify({ valid: check.valid, counts: check.counts, topology: check.topology,
    volume: brepMassProperties(brep, 1).volume, hash: digestOf(brep), blends }));
}
`,
});
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  JSON.stringify({ actual, expected, tolerance }));
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const handle = () => f.page.locator(`g.gizmo-handle[data-handle="${create ? 'radius' : 'r'}"]`);
const anchor = r => [8 * Math.SQRT1_2 + r / 2, 8 * Math.SQRT1_2 + r / 2, 10 + r * Math.SQRT1_2];
const screen = p => f.page.evaluate(point => window.__studioScreenOf(point), p);
async function verify(doc, radius, label) {
  assert.deepEqual(doc.nodes[2].edges, edges);
  assert.equal(doc.nodes[2].radius, radius);
  const native = await f.inspect(label, doc);
  assert.ok(native.valid);
  assert.equal(native.topology[0].genus, 0);
  assert.equal(native.blends.length, 2);
  const ordered = native.blends.toSorted((a, b) => a.centre[2] - b.centre[2]);
  ordered.forEach((blend, i) => {
    near(blend.centre[0], 0);
    near(blend.centre[1], 0);
    near(blend.centre[2], i ? 10 - radius : radius);
    near(Math.abs(blend.axis[2]), 1);
    near(blend.major, 8 - radius);
    near(blend.minor, radius);
    blend.points.forEach(([x, y, z]) =>
      near(Math.hypot(Math.hypot(x, y) - blend.major, z - blend.centre[2]), radius));
    const cap = i ? 'n1.top' : 'n1.bottom';
    assert.deepEqual(blend.trims.map(trim => trim.adjacent).sort(), [cap, 'n1.side0', 'n1.side1', 'n1.side2'].sort());
    for (const trim of blend.trims) for (const [x, y, z] of trim.points) {
      if (trim.adjacent === cap) {
        near(z, i ? 10 : 0, 2e-6);
        near(Math.hypot(x, y), blend.major, 2e-6);
      } else if (trim.adjacent === 'n1.side1') {
        near(z, blend.centre[2], 2e-6);
        near(Math.hypot(x, y), 8, 2e-6);
      } else {
        near(trim.adjacent === 'n1.side0' ? y : x, 0, 2e-6);
        near(Math.hypot(Math.hypot(x, y) - blend.major, z - blend.centre[2]), radius, 2e-6);
      }
    }
  });
  assert.equal(new Set(ordered.flatMap(blend => blend.trims.map(trim => trim.id))).size, 8);
  const corner = 8 * (1 - Math.PI / 4) * radius ** 2 - (5 / 6 - Math.PI / 4) * radius ** 3;
  const expected = 160 * Math.PI - Math.PI * corner;
  near(native.volume, expected, 2e-6);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expected, 2e-6);
  f.report.observations.push({ label, radius, volume: native.volume, expected, hash: native.hash, tori: ordered.map(blend => blend.name) });
  return native.hash;
}

async function frame(view) {
  if (view === 'Bottom') {
    await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
    await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  } else await button(view, f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function readAnchor(r) {
  const box = await handle().locator('circle').boundingBox();
  if (!box) return null;
  const actual = [box.x + box.width / 2, box.y + box.height / 2], expected = await screen(anchor(r));
  return { actual, expected, gapPx: Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) };
}

async function orbitEndOn() {
  for (let i = 0; i < 3; i++) {
    const camera = await f.page.evaluate(() => window.__studioCamera());
    const dx = (camera.yaw - Math.PI / 4) / .008, dy = (Math.PI / 4 - camera.pitch) / .008;
    if (Math.hypot(dx, dy) < .05) break;
    const rect = await f.page.locator('.vp-canvas').boundingBox();
    const x = rect.x + rect.width * .55, y = rect.y + rect.height * .55;
    await f.page.mouse.move(x, y);
    await f.page.mouse.down({ button: 'right' });
    await f.page.mouse.move(x + dx, y + dy, { steps: 12 });
    await f.page.mouse.up({ button: 'right' });
  }
  const origin = anchor(.6);
  const [a, b, t] = await Promise.all([screen(origin), screen(anchor(2)),
    screen([origin[0] + Math.SQRT1_2, origin[1] - Math.SQRT1_2, origin[2]])]);
  const axisPx = Math.hypot(b[0] - a[0], b[1] - a[1]), perMm = Math.hypot(t[0] - a[0], t[1] - a[1]);
  assert.ok(axisPx < .2 && perMm > 3, JSON.stringify({ axisPx, perMm }));
  return { axisPx, perMm };
}

async function waitForProof() {
  await handle().locator('title').filter({ hasText: /when viewed end-on/ }).waitFor({ state: 'attached' });
}

async function drag(seed, label) {
  const metric = await orbitEndOn();
  const measured = await readAnchor(.6);
  assert.ok(measured && measured.gapPx < .75, JSON.stringify(measured));
  const [x, y] = measured.actual;
  const hud = f.page.locator('.hud'), input = hud.getByLabel('Radius', { exact: true });
  await f.page.mouse.move(x, y);
  await f.page.mouse.down();
  await f.page.mouse.move(x, y - Math.round(.9 * metric.perMm), { steps: 8 });
  await f.page.locator('.gizmo-readout').filter({ hasText: /Radius 1\.5 mm/ }).waitFor();
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.equal(Number(await input.inputValue()), 1.5);
  await f.same(seed);
  await f.snapshot(label);
  await f.page.mouse.up();
  assert.equal(Number(await input.inputValue()), 1.5);
  f.report.observations.push({ label: 'paired-history-end-on', ...metric, ...measured });
  return hud;
}

async function startPairedFillet(label) {
  const midpoint = [8 * Math.SQRT1_2, 8 * Math.SQRT1_2];
  const hud = f.page.getByRole('dialog', { name: 'Fillet', exact: true });
  const field = hud.getByLabel('Radius', { exact: true });
  await frame('Bottom');
  const canvas = await f.page.locator('.vp-canvas').boundingBox();
  await f.page.mouse.click(canvas.x + 8, canvas.y + 8);
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  f.phase = 'Select both original circular rims in the viewport';
  await f.worldClick([...midpoint, 0]);
  await f.page.waitForFunction(() => window.__studioSelection?.selection?.edges?.length === 1);
  await frame('Top');
  await f.page.keyboard.down('Shift');
  try { await f.worldClick([...midpoint, 10]); } finally { await f.page.keyboard.up('Shift'); }
  await f.page.waitForFunction(() => window.__studioSelection?.selection?.edges?.length === 2);
  const closeChat = button('Close chat');
  if (await closeChat.isVisible()) await closeChat.click();
  await f.snapshot(label);
  await f.command('Fillet');
  await field.fill('0.6');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  assert.match(await hud.innerText(), /Picked native edges\s+2\b/);
  return { hud, field };
}

async function commitPairedFillet(hud, label) {
  await button('Apply', hud).click();
  await f.changed(stock);
  return (await f.snapshot(label)).doc;
}

async function createPairedFillet() {
  const { hud, field } = await startPairedFillet('01-create-paired-rims-selected');
  const current = await readAnchor(.6);
  if (baseline) {
    assert.ok(current && current.gapPx > 5, JSON.stringify(current));
    f.report.observations.push({ label: 'original-create-handle', ...current });
    await f.snapshot('02-create-base-paired-handle');
    await field.fill('1.5');
    await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
    const doc = await commitPairedFillet(hud, '03-create-base-typed-radius');
    await verify(doc, 1.5, 'create-paired-typed-r15');
    return;
  }
  assert.ok(current && current.gapPx < .75, JSON.stringify(current));
  f.report.observations.push({ label: 'paired-create-top-anchor', ...current });
  await f.snapshot('02-create-paired-upper-anchor');
  await drag(stock, '03-create-paired-end-on');
  const dragged = await commitPairedFillet(hud, '04-create-paired-applied');
  const hash = await verify(dragged, 1.5, 'create-paired-dragged-r15');
  await f.undo();
  await f.same(stock);
  await f.redo();
  await f.same(dragged);
  await f.undo();
  await f.same(stock);
  const typed = await startPairedFillet('05-create-paired-typed-selection');
  await typed.field.fill('1.5');
  await typed.hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  const typedDoc = await commitPairedFillet(typed.hud, '06-create-paired-typed-applied');
  assert.equal(await verify(typedDoc, 1.5, 'create-paired-typed-r15'), hash);
  const saved = await f.save('created-paired-circular-fillet');
  const reopened = (await f.freshOpen(saved.file, typedDoc, '07-create-paired-reopened')).doc;
  assert.equal(await verify(reopened, 1.5, 'create-paired-reopened-r15'), hash);
  await f.openFeatureEditor(2);
  near(Number(await f.editor().getByLabel('Radius', { exact: true }).inputValue()), 1.5);
  await f.snapshot('08-create-paired-editable-after-open');
}

await f.run(async () => {
  const seed = create ? stock : await f.inspect('paired-circular-seed', stock, 'seed');
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name: 'paired-circular-fillet.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  if (create) return createPairedFillet();
  await verify(seed, .6, 'paired-native-r06');
  await frame('Top');
  await f.openFeatureEditor(2);
  const readout = await readAnchor(.6);
  if (baseline) {
    assert.equal(await handle().locator('title').filter({ hasText: /when viewed end-on/ }).count(), 0);
    assert.ok(!readout || readout.gapPx > 5, JSON.stringify(readout));
    f.report.observations.push({ label: 'original-shared-handle', readout, endOnProof: false });
    await f.snapshot('01-base-paired-history-handle');
    await f.editor().getByLabel('Radius', { exact: true }).fill('1.5');
    const { doc } = await f.applyEditor(seed, '02-base-paired-typed-radius');
    await verify(doc, 1.5, 'paired-typed-native-r15');
    return;
  }
  f.phase = 'Prove the canonical upper rim and drag both circular fillets end-on';
  await waitForProof();
  const top = await readAnchor(.6);
  assert.ok(top && top.gapPx < .75, JSON.stringify(top));
  f.report.observations.push({ label: 'paired-history-top-anchor', ...top });
  await f.snapshot('01-paired-history-upper-anchor');
  const cancelled = await drag(seed, '02a-paired-history-end-on-cancelled');
  await button('Cancel', cancelled).click();
  await f.same(seed);
  if (!(await f.editor().isVisible())) await f.openFeatureEditor(2);
  await waitForProof();
  const applied = await drag(seed, '02b-paired-history-end-on-applied');
  await button('Apply', applied).click();
  await f.changed(seed);
  const { doc } = await f.snapshot('03-paired-history-applied');
  assert.deepEqual(doc.nodes[2].sigs, seed.nodes[2].sigs);
  const hash = await verify(doc, 1.5, 'paired-native-drag-r15');
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(doc);
  await f.undo();
  await f.same(seed);
  if (!(await f.editor().isVisible())) await f.openFeatureEditor(2);
  await f.editor().getByLabel('Radius', { exact: true }).fill('1.5');
  const typed = (await f.applyEditor(seed, '04-paired-history-typed')).doc;
  assert.equal(await verify(typed, 1.5, 'paired-native-typed-r15'), hash);
  const saved = await f.save('paired-circular-fillet');
  const reopened = (await f.freshOpen(saved.file, typed, '05-paired-history-reopened')).doc;
  assert.equal(await verify(reopened, 1.5, 'paired-native-reopened-r15'), hash);
  await frame('Top');
  await f.openFeatureEditor(2);
  await waitForProof();
  const restored = await readAnchor(1.5);
  assert.ok(restored && restored.gapPx < .75, JSON.stringify(restored));
  await f.snapshot('06-paired-history-reopened-handle');
});
