import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const flow = await createFlow({
  name: 'capsule-shell', output: process.argv[2], envFrozen: 'CAPSULE_SHELL_SOURCE_FROZEN',
  initialFiles: ['packages/barocss-cad/src/part/part-shell.ts', 'packages/barocss-cad/src/features/revolve.ts',
    ...(baseline ? [] : ['packages/barocss-cad/src/part/part-capsule-shell.ts'])],
  qualification: 'Open one complete hemisphere of a full revolved capsule and edit its exact wall.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurfaceD1, surfaceDomain } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { bodyMesh } from '@barocss/cad-model/engine/mesh';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ key, brep }] = partBreps(doc);
console.log(JSON.stringify({
  key, displayFaces: bodyMesh(brep, 0).faces.map(face => face.name), mass: brepMassProperties(brep, 1), check: checkBrep(brep, { strict: true, pcurveSamples: 11 }),
  faces: brep.faces.map(face => {
    const { u, v } = surfaceDomain(face.surface);
    const samples = [0.2, 0.55, 0.8].flatMap(s => [0.25, 0.65].map(t => {
      const { point, du, dv } = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
      const sign = face.sense === 'forward' ? 1 : -1;
      return { point, normal: [du[1]*dv[2]-du[2]*dv[1], du[2]*dv[0]-du[0]*dv[2], du[0]*dv[1]-du[1]*dv[0]].map(x => sign*x) };
    }));
    const border = face.loops.flatMap(id => brep.loops.find(loop => loop.id === id).coedges).map(id => {
      const edgeId = brep.coedges.find(use => use.id === id).edge;
      const { curve } = brep.edges.find(edge => edge.id === edgeId);
      const [from, to] = curveDomain(curve);
      return [0, 0.2, 0.5, 0.8, 1].map(t => evaluateCurve(curve, from + t * (to - from)));
    });
    return { name: face.name, samples, border };
  }),
}));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, outputs: { b1: { node: 1, side: 'solid' } },
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'arc', start: [0, -10], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [10, 0] },
      { kind: 'arc', start: [10, 40], center: [0, 40], direction: 'ccw' },
      { kind: 'line', start: [0, 50] },
    ] },
    { id: 'n1', kind: 'revolve', sketch: 0, axis: 'y', angle: 360 },
  ],
};
const button = (name, scope = flow.page) => scope.getByRole('button', { name, exact: true });
const hud = () => flow.page.getByRole('dialog', { name: 'Shell', exact: true });
const waitStatus = status => hud().locator('.status').filter({ hasText: new RegExp('^' + status + '$') }).waitFor();
const near = (actual, expected, tol = 1e-7) => assert.ok(Math.abs(actual - expected) <= tol, actual + ' vs ' + expected);

async function view(name) {
  const direct = button(name, flow.page.locator('.views'));
  if (await direct.count()) await direct.click();
  else {
    await button('View cube directions', flow.page.getByRole('group', { name: 'View cube', exact: true })).click();
    await flow.page.getByRole('menuitem', { name, exact: true }).click();
  }
}
async function stablePixel(point) {
  const pixel = await flow.page.evaluate(async point => {
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
  assert.ok(pixel);
  return pixel;
}
async function viewOpening(label) {
  await view('Back');
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  await stablePixel([10, 40, 0]);
  await flow.snapshot(label);
}
async function stock(label) {
  const doc = await flow.doc(), native = await flow.inspect(label, doc), [body] = (await flow.bodies()).bodies;
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.equal(native.key, 'b1');
  assert.equal(native.faces.length, 6);
  assert.deepEqual(native.displayFaces, ['n1.side0', 'n1.side1', 'n1.side2']);
  near(native.mass.volume, (4000 + 4000 / 3) * Math.PI);
  near(body.volume, native.mass.volume);
  for (const name of ['n1.side2#1', 'n1.side2#2']) {
    const face = native.faces.find(face => face.name === name);
    assert.ok(face, name);
    for (const { point: [x, y, z] } of face.samples) {
      assert.ok(y > 40);
      near(Math.hypot(x, y - 40, z), 10);
    }
  }
}

async function shell(label, thickness) {
  const doc = await flow.doc(), native = await flow.inspect(label, doc), [body] = (await flow.bodies()).bodies;
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  const { sigs, ...feature } = doc.nodes[2];
  assert.deepEqual(feature, { id: 'n2', kind: 'shell', parent: { node: 1, side: 'solid' }, thickness, open: ['n1.side2'] });
  if (sigs) assert.deepEqual(Object.keys(sigs), ['n1.side2']);
  assert.equal(native.key, 'b2');
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 36, edges: 18, vertices: 10 });
  assert.equal(native.check.topology[0].genus, 0);
  const inner = 10 - thickness, deltaArea = 100 - inner * inner;
  const volume = Math.PI * (40 * deltaArea + 2 * (1000 - inner ** 3) / 3);
  const axialCentroid = Math.PI * (800 * deltaArea - (10 ** 4 - inner ** 4) / 4) / volume;
  near(native.mass.volume, volume);
  near(body.volume, volume);
  near(native.mass.centroid[0], 0);
  near(native.mass.centroid[1], axialCentroid);
  near(native.mass.centroid[2], 0);
  assert.deepEqual(native.faces.filter(face => face.name.startsWith('n1.')).map(face => face.name),
    ['n1.side0#1', 'n1.side0#2', 'n1.side1#1', 'n1.side1#2']);
  const rim = native.faces.filter(face => /^n2\.rim#/.test(face.name));
  assert.equal(rim.length, 2);
  for (const { border } of rim) {
    assert.equal(border.length, 4);
    const rings = [];
    for (const edge of border) {
      const radii = edge.map(([x, y, z]) => { near(y, 40); return Math.hypot(x, z); });
      const min = Math.min(...radii), max = Math.max(...radii);
      if (Math.abs(max - min) < 1e-7) rings.push(min);
      else { near(min, inner); near(max, 10); }
    }
    assert.equal(rings.length, 2);
    near(Math.min(...rings), inner);
    near(Math.max(...rings), 10);
  }
  for (const face of native.faces) {
    const innerWall = face.name.includes('.in.');
    for (const { point: [x, y, z], normal: [nx, ny, nz] } of face.samples) {
      if (rim.includes(face)) {
        near(y, 40);
        assert.ok(ny > 0);
      } else {
        assert.ok(y < 40);
        near(y < 0 ? Math.hypot(x, y, z) : Math.hypot(x, z), innerWall ? inner : 10);
        const radial = nx * x + (y < 0 ? ny * y : 0) + nz * z;
        assert.ok(innerWall ? radial < 0 : radial > 0);
      }
    }
  }
  flow.report.observations.push({ label, thickness, volume, nativeVolume: native.mass.volume, axialCentroid });
  return doc;
}

await flow.run(async () => {
  flow.phase = 'Open the full revolved capsule';
  await flow.newPage();
  await flow.openFile({ name: 'revolved-capsule.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }, 2);
  await flow.same(source);
  await stock('capsule-source');
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await view('Top');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  await flow.page.mouse.click(...await stablePixel([4, 46, Math.sqrt(48)]));
  await flow.page.waitForFunction(() => window.__studioSelection?.selection.faces.length === 1);

  flow.phase = 'Select the complete upper hemisphere and start Shell';
  await clickModelCommand(flow.page, 'Modify', 'Shell');
  await hud().getByLabel('Wall', { exact: true }).fill('1');
  if (baseline) {
    await waitStatus('refused');
    const code = hud().locator('.hud-error code');
    assert.match(await code.textContent(), /only straight walls can be left open \(side2\)/i);
    await hud().getByText('Kernel detail', { exact: true }).click();
    assert.ok(await button('Apply', hud()).isDisabled());
    await flow.same(source);
    await flow.snapshot('00-previous-curved-opening-refusal');
    await button('Cancel', hud()).click();
    await flow.same(source);
    await stock('source-after-cancel');
    return;
  }
  await waitStatus('preview');
  await flow.same(source);
  await button('Apply', hud()).click();
  await flow.changed(source);
  const first = await shell('shell-1-native', 1);
  await flow.snapshot('01-shell-side-view');
  await viewOpening('02-open-end');

  flow.phase = 'Refuse a wall that reaches the capsule axis';
  await flow.openFeatureEditor(2, 'Shell 1 mm');
  const editor = flow.editor(), wall = editor.getByLabel('Wall', { exact: true });
  await wall.fill('10');
  await button('Apply', editor).click();
  await editor.locator('.hud-error-title').waitFor();
  await flow.same(first);
  await flow.snapshot('03-axis-collapse-refused');

  flow.phase = 'Edit the wall, undo and reopen the exact shell';
  await wall.fill('2');
  await button('Apply', editor).click();
  await flow.changed(first);
  const second = await shell('shell-2-native', 2);
  await flow.snapshot('04-wall-2');
  await flow.undo();
  await flow.same(first);
  await flow.redo();
  await flow.same(second);
  const { file } = await flow.save('open-capsule-shell');
  await flow.freshOpen(file, second, '05-fresh-open');
  await shell('reopened-shell-native', 2);
  await viewOpening('06-reopened-end');
});
