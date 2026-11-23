import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--observe-base');
const path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
  weights: Array.from({ length: 9 }, (_, index) => index % 2 ? Math.SQRT1_2 : 1),
};
const holeAt = halfHeight => [[-1, -halfHeight], [-1, halfHeight], [1, halfHeight], [1, -halfHeight]]
  .map(start => ({ kind: 'line', start }));
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3], holes: [holeAt(2)],
      sideTags: { outer: ['top', 'outer', 'bottom', 'inner'], holes: [['hole-inner', 'hole-bottom', 'hole-outer', 'hole-top']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Closed circular rail', path, mode: 'exact' },
  ], outputs: { b1: { node: 1, side: 'solid' } } };
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/brep/exact-ring-intersect.ts', 'packages/barocss-cad/src/brep/edge-continuity.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs',
];
if (!baseline) pins.push('packages/barocss-cad/src/brep/exact-rectangular-duct-intersect.ts');
const f = await createFlow({
  name: 'exact-rectangular-duct-intersection', output: process.argv[2], envFrozen: 'D1765_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Intersect one exact closed rectangular duct with a centered box in desktop Studio.',
  limits: ['One R20 mm rail, outer 4 × 6 mm and centered 2 × 4 or 2 × 2 mm cavity, retained x ≥ 0, desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const check = checkBrep(brep, { strict: true });
const faces = brep.faces.map(face => {
  const geometry = faceGeometry(face);
  const loops = face.loops.map(id => {
    const loop = brep.loops.find(item => item.id === id);
    return { kind: loop.kind, edges: loop.coedges.map(id => {
      const use = brep.coedges.find(item => item.id === id);
      const edge = brep.edges.find(item => item.id === use.edge);
      const twin = brep.coedges.find(item => item.id === use.twin);
      return { id: edge.id, points: edge.curve.controlPoints, degree: edge.curve.degree, sense: use.sense,
        reciprocal: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
        pcurves: Boolean(use.pcurve && twin?.pcurve) };
    }) };
  });
  return { name: face.name, geometry, loops };
});
const joints = brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id));
let mass = null, quadrature = null;
try { mass = massPropertiesOf(output); } catch {}
try { quadrature = brepMassProperties(brep, 1); } catch {}
console.log(JSON.stringify({ source: brep.source, check, faces, joints, mass, quadrature,
  chartCount: brep.coedges.filter(use => use.pcurve).length, digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function begin() {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'closed-rectangular-duct.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  near((await f.bodies()).bodies[0].volume, 640 * Math.PI);

  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Box');
  const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
  for (const [field, value] of Object.entries({ 'Width X': 30, 'Depth Y': 60, 'Height Z': 10, 'At X': 0, 'At Y': -30, 'At Z': -5 })) {
    await box.getByLabel(field, { exact: true }).fill(String(value));
  }
  await box.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', box).click();
  await f.changed(seed);
  const boxed = (await f.snapshot('01-duct-and-box')).doc;
  assert.deepEqual(boxed.nodes.slice(0, 2), seed.nodes);
  assert.deepEqual([boxed.nodes[2].min, boxed.nodes[2].max, boxed.nodes[3].from, boxed.nodes[3].height],
    [[0, -30], [30, 30], -5, 10]);
  return boxed;
}

function verifyCut(native, cavityHalfHeight) {
  assert.deepEqual(native.source, { family: 'analytic-boolean', id: 'n4' });
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.equal(native.check.topology[0].genus, 1);
  assert.equal(native.chartCount, native.check.counts.coedges);
  assert.ok(native.check.maximumPcurveGap < 1e-8);
  const volume = 20 * Math.PI * (24 - 4 * cavityHalfHeight);
  near(native.mass.volume, volume);
  near(native.quadrature.volume, volume, 1e-6);
  assert.equal(native.joints.length, 24);
  assert.equal(native.faces.filter(face => face.geometry.kind === 'cylinder').length, 4);

  const caps = native.faces.filter(({ geometry }) => geometry.kind === 'plane' && geometry.n[0] < -.99);
  assert.equal(caps.length, 2);
  const seen = [];
  for (const { geometry, loops } of caps) {
    near(geometry.o[0], 0);
    assert.deepEqual(loops.map(loop => loop.kind), ['outer', 'inner']);
    const meanY = loops[0].edges.flatMap(edge => edge.points).reduce((sum, point) => sum + point[1], 0) / 8;
    const centerY = meanY > 0 ? 20 : -20;
    near(meanY, centerY);
    seen.push(centerY);
    for (const [index, loop] of loops.entries()) {
      assert.equal(loop.edges.length, 4);
      let area = 0;
      for (const edge of loop.edges) {
        assert.equal(edge.degree, 1);
        assert.equal(edge.points.length, 2);
        assert.ok(edge.reciprocal && edge.pcurves);
        for (const [x, y, z] of edge.points) {
          near(x, 0);
          near(Math.abs(y - centerY), index ? 1 : 2);
          near(Math.abs(z), index ? cavityHalfHeight : 3);
        }
        const [a, b] = edge.points;
        area -= (edge.sense === 'forward' ? 1 : -1) * ((a[1] - centerY) * b[2] - a[2] * (b[1] - centerY)) / 2;
      }
      near(area, index ? -4 * cavityHalfHeight : 24);
    }
  }
  assert.deepEqual(seen.sort((a, b) => a - b), [-20, 20]);
  for (const joint of native.joints) {
    assert.equal(joint.status, 'measured');
    assert.equal(joint.sampleCount, 8);
    near(joint.minimumAngleDegrees, 90);
    near(joint.maximumAngleDegrees, 90);
  }
  return caps;
}

async function measureInStudio(native, caps, stage, expectRefused = false) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await browser().getByRole('button', { name: /^Sweep along Closed circular rail/ }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const pick = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const capEdgeIds = new Set(caps.flatMap(cap => cap.loops.flatMap(loop => loop.edges.map(edge => edge.id))));
  const corner = native.joints.find(joint => !capEdgeIds.has(joint.edgeId)).edgeId;
  const samples = [corner, ...caps.flatMap(cap => cap.loops.map(loop => loop.edges[0].id))];
  for (const id of expectRefused ? samples.slice(0, 1) : samples) {
    await pick.selectOption(id);
    await button('Measure continuity', panel).click();
    if (expectRefused) {
      const detail = result.locator('details[open]');
      if (!await detail.count()) await result.getByText('Measurement detail', { exact: true }).click();
      assert.match(await detail.innerText(), /A face has no native parameter curve\./);
    } else {
      const reading = result.locator('[data-continuity-angle]');
      await reading.waitFor();
      assert.equal(await reading.textContent(), '90°');
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(stage);
}

async function capRays(stage, materialZ = 2.5) {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const material = [[0, -20, materialZ], [0, 20, materialZ]], cavity = [[0, -20, 0], [0, 20, 0]];
  const samples = await f.page.evaluate(points => points.map(point => window.__studioSurfacePoint(point)), [...material, ...cavity]);
  for (const [index, point] of material.entries()) {
    assert.ok(samples[index], 'A material ray hits its cap.');
    point.forEach((value, axis) => near(samples[index][axis], value, 1e-4));
  }
  for (const point of samples.slice(2)) assert.ok(!point || point[0] > 0.1, JSON.stringify({ cavityRay: point }));
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const selected = [];
  for (const [index, materialPoint] of material.entries()) {
    const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), materialPoint);
    assert.ok(pixel && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), pixel));
    await f.page.mouse.click(...pixel);
    await f.page.waitForFunction(previous => {
      const faces = window.__studioSelection?.selection.faces;
      return faces?.length === 1 && faces[0].face !== previous;
    }, selected[index - 1] ?? -1);
    selected.push(await f.page.evaluate(() => window.__studioSelection.selection.faces[0].face));
    await f.snapshot(stage + '-cap-' + (index + 1));
  }
  f.report.observations.push({ label: stage + '-cap-rays', samples, selected });
}

async function editCavity(halfHeight, label) {
  await f.openFeatureEditor(1);
  await f.editor().getByText('Exact closed circle', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
  await f.sketchPanel().getByLabel('Point 1 Y', { exact: true }).fill(String(-halfHeight));
  await f.sketchPanel().getByLabel('Point 2 Y', { exact: true }).fill(String(halfHeight));
  const { doc } = await f.finishSketch(label);
  assert.deepEqual(doc.nodes[0].holes[0], holeAt(halfHeight));
  assert.deepEqual(doc.nodes[0].sideTags, seed.nodes[0].sideTags);
  return doc;
}

async function localApproval(boxed, cut, native) {
  const file = join(f.output, 'centered-duct-proposal.bcad'), bytes = JSON.stringify(boxed);
  await writeFile(file, bytes);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'centered-duct-intersection', async call => {
    const revision = await currentPartRevision(call);
    const op = expectedRevision => ({ tool: 'features', args: {
      action: 'command', command: 'intersect', bodies: Object.keys(boxed.outputs), expectedRevision,
    } });
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op('0'.repeat(16))] }, true);
    assert.match(stale.error, /changed|stale/i);
    const ops = [op(revision)];
    assert.ok((await call('features', { action: 'batch', dryRun: true, ops })).dryRun);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const staged = await call('proposals', { action: 'propose', title: 'Intersect the closed rectangular duct', ops });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [boxed.nodes, boxed.outputs]);
  await f.freshOpen(file, pending, '08-local-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('09-local-proposal-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot('10-local-proposal-approved');
  assert.deepEqual([doc.nodes, doc.outputs], [cut.nodes, cut.outputs]);
  const approved = await f.inspect('local-approved-native', doc);
  verifyCut(approved, 2);
  assert.equal(approved.digest, native.digest);
}

await f.run(async () => {
  const boxed = await begin();
  f.phase = 'Intersect the closed rectangular duct with the box';
  await button('Sweep along Closed circular rail', browser()).click();
  await button('Box', browser()).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Intersect');
  await f.page.waitForFunction(count => window.__studioDoc.nodes.length > count
    || [...document.querySelectorAll('.toast[role="alert"]')].some(node => /intersect|boolean|could not/i.test(node.textContent)), boxed.nodes.length);
  if ((await f.doc()).nodes.length === boxed.nodes.length) {
    assert.ok(baseline, 'Expected an accepted centered intersection');
    await f.same(boxed);
    const refused = await f.snapshot('02-intersection-refused');
    f.report.observations.push({ label: 'intersection-refused', notices: refused.notices });
    return;
  }
  await f.changed(boxed);
  const cut = (await f.snapshot('02-rectangular-duct-intersection')).doc;
  assert.deepEqual([cut.nodes[4].kind, cut.nodes[4].left, cut.nodes[4].right],
    ['intersect', { node: 1, side: 'solid' }, { node: 3, side: 'solid' }]);
  const native = await f.inspect('intersection-native', cut);
  const measured = native.joints.filter(joint => joint.status === 'measured').length;
  f.report.observations.push({ label: 'intersection-native', valid: native.check.valid, issues: native.check.issues, counts: native.check.counts,
    charts: native.chartCount, measured, joints: native.joints.length, volume: native.mass?.volume, digest: native.digest });
  if (baseline) {
    if (measured === 0 && native.chartCount === 0) {
      const caps = native.faces.filter(({ geometry }) => geometry.kind === 'plane' && geometry.n[0] < -.99);
      assert.equal(caps.length, 2);
      await measureInStudio(native, caps, '03-original-continuity-refused', true);
    }
    return;
  }
  const caps = verifyCut(native, 2);
  await measureInStudio(native, caps, '03-native-rim-continuity');
  await capRays('04-initial');

  const edited = await editCavity(1, '05-cavity-edited');
  assert.deepEqual(edited.nodes.slice(1), cut.nodes.slice(1));
  const editedNative = await f.inspect('edited-intersection-native', edited);
  verifyCut(editedNative, 1);
  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('centered-rectangular-duct-intersection');
  const reopened = (await f.freshOpen(saved.file, edited, '06-fresh-open')).doc;
  const reopenedNative = await f.inspect('reopened-intersection-native', reopened);
  const reopenedCaps = verifyCut(reopenedNative, 1);
  assert.equal(reopenedNative.digest, editedNative.digest);
  await measureInStudio(reopenedNative, reopenedCaps, '06-reopened-rim-continuity');
  await capRays('07-reopened', 1.5);
  const restored = await editCavity(2, '08-cavity-restored');
  const restoredNative = await f.inspect('restored-intersection-native', restored);
  verifyCut(restoredNative, 2);
  assert.equal(restoredNative.digest, native.digest);
  await localApproval(boxed, cut, native);
});
