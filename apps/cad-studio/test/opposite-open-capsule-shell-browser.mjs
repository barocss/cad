import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const paths = [
  'apps/cad-studio/test/opposite-open-capsule-shell-browser.mjs',
  'packages/barocss-cad/src/part/part-capsule-shell.ts',
  'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
];
const f = await createFlow({
  name: 'opposite-open-capsule-shell', output: process.argv[2], envFrozen: 'OPPOSITE_OPEN_CAPSULE_FROZEN',
  initialFiles: paths, requiredFrozen: paths,
  qualification: 'Select the two original hemispheres of an exact capsule and Shell the open barrel.',
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, curveDomain, evaluateCurve, evaluateSurfaceD1, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs: [output] } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const { brep } = output;
console.log(JSON.stringify({
  report: checkBrep(brep, { strict: true }), mass: massPropertiesOf(output),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex'),
  faces: brep.faces.map(face => {
    const { u, v } = surfaceDomain(face.surface);
    const samples = [0.1, 0.37, 0.9].flatMap(a => [0, 0.4, 1].map(b => {
      const sample = evaluateSurfaceD1(face.surface, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0]));
      const sign = face.sense === 'forward' ? 1 : -1;
      const { point, du, dv } = sample;
      return { point, normal: [du[1]*dv[2] - du[2]*dv[1], du[2]*dv[0] - du[0]*dv[2],
        du[0]*dv[1] - du[1]*dv[0]].map(value => sign * value) };
    }));
    const rim = face.name?.includes('.rim.') ? face.loops.flatMap(id => brep.loops.find(loop => loop.id === id).coedges).map(id => {
      const edge = brep.coedges.find(use => use.id === id).edge;
      const { curve } = brep.edges.find(item => item.id === edge);
      const [a, b] = curveDomain(curve);
      return [0, 0.3, 0.7, 1].map(t => evaluateCurve(curve, a + t * (b - a)));
    }) : [];
    return { name: face.name, samples, rim, surface: face.surface.controlPoints };
  }),
}));
`,
});

const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'arc', start: [0, -10], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [10, 0] },
      { kind: 'arc', start: [10, 40], center: [0, 40], direction: 'ccw' },
      { kind: 'line', start: [0, 50] },
    ] },
    { id: 'n1', kind: 'revolve', sketch: 0, axis: 'y', angle: 360 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const status = value => hud().locator('.status').getByText(value, { exact: true }).waitFor();
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

async function stablePixel(point) {
  const xy = await f.page.evaluate(async point => {
    let previous, stable = 0;
    for (let i = 0; i < 360; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const xy = window.__studioScreenOf(point);
      stable = xy && previous && Math.hypot(xy[0] - previous[0], xy[1] - previous[1]) < 0.01 ? stable + 1 : 0;
      if (stable >= 5 && document.elementFromPoint(...xy)?.matches('canvas.vp-canvas')) return xy;
      previous = xy;
    }
    return null;
  }, point);
  assert.ok(xy);
  return xy;
}

async function openStock(label) {
  await f.newPage();
  await f.openFile({ name: 'original-capsule.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)) }, 2);
  await f.same(stock);
  const native = await f.inspect(`${label}-stock-native`, stock);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  return native.faces.filter(face => face.name.startsWith('n1.side1#')).map(face => ({ name: face.name, surface: face.surface }));
}

async function chooseEnds(order) {
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await frame();
  await f.page.mouse.click(...await stablePixel([4, order[0] === 0 ? -6 : 46, Math.sqrt(48)]));
  await f.page.keyboard.down('Shift');
  try {
    await f.page.mouse.click(...await stablePixel([4, order[1] === 0 ? -6 : 46, Math.sqrt(48)]));
  } finally {
    await f.page.keyboard.up('Shift');
  }
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.faces), order.map(face => ({ body: 0, face })));
}

async function inspectTube(label, doc, thickness, original, order) {
  assert.deepEqual(doc.nodes.slice(0, 2), stock.nodes);
  const { sigs, ...feature } = doc.nodes[2];
  assert.deepEqual(feature, { id: 'n2', kind: 'shell', parent: { node: 1, side: 'solid' }, thickness,
    open: order.map(face => `n1.side${face}`) });
  if (sigs) assert.deepEqual(Object.keys(sigs).sort(), ['n1.side0', 'n1.side2']);
  const native = await f.inspect(`${label}-native`, doc);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 32, edges: 16, vertices: 8 });
  assert.equal(native.report.topology[0].genus, 1);
  assert.equal(native.mass.method, 'closed-form');
  const inner = 10 - thickness, volume = 40 * Math.PI * (100 - inner ** 2);
  near(native.mass.volume, volume);
  native.mass.centroid.forEach((value, i) => near(value, [0, 20, 0][i]));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  assert.deepEqual(native.faces.filter(face => face.name.startsWith('n1.')).map(face => ({ name: face.name, surface: face.surface })), original);
  const innerCharts = native.faces.filter(face => face.name.startsWith('n2.in.n1.side1#'));
  assert.equal(innerCharts.length, 2);
  for (const { samples } of innerCharts) {
    for (const { point: [x, y, z], normal: [nx, ny, nz] } of samples) {
      near(Math.hypot(x, z), inner);
      assert.ok(y >= -1e-9 && y <= 40 + 1e-9);
      assert.ok(nx * x + nz * z < 0);
      near(ny, 0);
    }
  }
  for (const [rim, y, sign] of [['n2.rim.lower', 0, -1], ['n2.rim.upper', 40, 1]]) {
    const charts = native.faces.filter(face => face.name.startsWith(rim + '#'));
    assert.equal(charts.length, 2);
    for (const face of charts) {
      assert.equal(face.rim.length, 4);
      for (const { point, normal } of face.samples) {
        near(point[1], y);
        assert.ok(normal[1] * sign > 0);
      }
      const rings = [];
      for (const edge of face.rim) {
        const radii = edge.map(([x, axial, z]) => { near(axial, y); return Math.hypot(x, z); });
        const min = Math.min(...radii), max = Math.max(...radii);
        if (Math.abs(max - min) < 1e-7) rings.push(min);
        else { near(min, inner); near(max, 10); }
      }
      assert.equal(rings.length, 2);
      near(Math.min(...rings), inner);
      near(Math.max(...rings), 10);
    }
  }
  f.report.observations.push({ label, thickness, volume, nativeVolume: native.mass.volume, digest: native.digest });
  return native.digest;
}

async function showThrough(label) {
  await button('Front', f.page.locator('.views')).click();
  await frame();
  await stablePixel([10, 0, 0]);
  await f.snapshot(label);
}

await f.run(async () => {
  let editedDigest;
  for (const [order, label] of [[[0, 2], 'lower-first'], [[2, 0], 'upper-first']]) {
    f.phase = `Open and select the two hemispheres, ${label}`;
    const original = await openStock(label);
    await chooseEnds(order);
    await f.snapshot(`${label}-picked`);
    await clickModelCommand(f.page, 'Modify', 'Shell');
    await hud().getByLabel('Wall', { exact: true }).fill('1');
    if (baseline) {
      await status('refused');
      assert.match(await hud().locator('.hud-error code').textContent(), /only straight walls can be left open/);
      await hud().getByText('Kernel detail', { exact: true }).click();
      await f.snapshot('baseline-pair-refused');
      await button('Cancel', hud()).click();
      await f.same(stock);
      return;
    }
    await status('preview');
    await f.same(stock);
    await f.snapshot(`${label}-preview`);
    await button('Cancel', hud()).click();
    await f.same(stock);
    await clickModelCommand(f.page, 'Modify', 'Shell');
    await hud().getByLabel('Wall', { exact: true }).fill('1');
    await status('preview');
    await button('Apply', hud()).click();
    await f.changed(stock);
    const first = await f.doc();
    await inspectTube(`${label}-created`, first, 1, original, order);
    await f.openFeatureEditor(2, 'Shell 1 mm');
    const editor = f.editor(), wall = editor.getByLabel('Wall', { exact: true });
    await wall.fill('10');
    await button('Apply', editor).click();
    await editor.locator('.hud-error-title').waitFor();
    await f.same(first);
    await wall.fill('2');
    await button('Apply', editor).click();
    await f.changed(first);
    const second = await f.doc();
    const digest = await inspectTube(`${label}-edited`, second, 2, original, order);
    if (editedDigest) assert.equal(digest, editedDigest);
    editedDigest = digest;
    await showThrough(`${label}-tube`);
    await f.undo();
    await f.same(first);
    await f.redo();
    await f.same(second);
    const saved = await f.save(label);
    const reopened = (await f.freshOpen(saved.file, second, `${label}-reopened`)).doc;
    assert.equal(await inspectTube(`${label}-reopened`, reopened, 2, original, order), digest);
    await showThrough(`${label}-reopened-through`);
  }
});
