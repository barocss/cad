import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const railRadius = 20;
const angle = process.argv.includes('--oblique') ? 29 * Math.PI / 180 : 0;
const expectMissing = process.argv.includes('--expect-missing-binding');
const localApproval = process.argv.includes('--local-approval');
const path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: Array.from({ length: 9 }, (_, i) => {
    const a = angle + i * Math.PI / 4, r = i % 2 === 0 ? railRadius : railRadius * Math.SQRT2;
    return [r * Math.cos(a), r * Math.sin(a), 0].map(value => Math.abs(value) < 1e-12 ? 0 : value);
  }),
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
};
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Circular rail', path, mode: 'exact' }],
  outputs: { b1: { node: 1, side: 'solid' } } };
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/brep/edge-continuity.ts',
  ...(!expectMissing ? ['packages/barocss-cad/src/brep/exact-ring-intersect.ts'] : []),
  'packages/barocss-cad-model/src/app/commands.ts', 'apps/cad-studio/src/App.tsx',
];
const f = await createFlow({
  name: 'exact-closed-circle-intersection', output: process.argv[2], envFrozen: 'D1677_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Intersect a closed Exact Sweep with a box through its axis and edit its original circular section.',
  limits: ['One R20 mm rail, an axis-through clipping face, retained x ≥ 0, desktop Chrome WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import {
  brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  massPropertiesOf, measureBrepEdgeContinuity, surfaceDomain,
} from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const at = ([lo, hi], t) => lo + (hi - lo) * t;
const fractions = Array.from({ length: 17 }, (_, i) => i / 16);
const planes = [], support = [];
for (const face of brep.faces) {
  const geometry = faceGeometry(face);
  if (geometry.kind === 'plane') {
    const loops = face.loops.map(id => {
      const loop = brep.loops.find(item => item.id === id);
      return { kind: loop.kind, edges: loop.coedges.map(id => {
        const use = brep.coedges.find(item => item.id === id);
        const edge = brep.edges.find(item => item.id === use.edge);
        const twin = brep.coedges.find(item => item.id === use.twin);
        const samples = fractions.map(t => evaluateCurve(edge.curve, at(curveDomain(edge.curve), use.sense === 'forward' ? t : 1 - t)));
        return { id: edge.id, degree: edge.curve.degree, reciprocal: twin?.twin === id && twin.edge === edge.id && twin.sense !== use.sense,
          samples, ownPcurve: !!use.pcurve, twinPcurve: !!twin?.pcurve };
      }) };
    });
    planes.push({ geometry, name: face.name, loops });
  } else {
    const { u, v } = surfaceDomain(face.surface);
    support.push({ name: face.name, samples: [0, .21, .5, .79, 1].flatMap(s =>
      [0, .19, .5, .81, 1].map(t => evaluateSurface(face.surface, at(u, s), at(v, t)))) });
  }
}
const quadrature = brepMassProperties(brep, 1);
const rims = new Set(planes.flatMap(face => face.loops.flatMap(loop => loop.edges.map(edge => edge.id))));
const joints = brep.edges.map(edge => {
  const result = measureBrepEdgeContinuity(brep, edge.id);
  return { id: edge.id, rim: rims.has(edge.id), status: result.status, reason: result.reason,
    angle: result.maximumAngleDegrees, count: result.sampleCount };
});
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source,
  mass: massPropertiesOf(output), quadrature, planes, support, joints, pcurves: brep.coedges.filter(use => use.pcurve).length,
  digest: digestOf(brep) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const solid = node => ({ node, side: 'solid' });
const near = (value, expected, tolerance) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function verifyHalfRing(label, doc, radius) {
  const geometry = await f.inspect(label, doc);
  assert.ok(geometry.check.valid, geometry.check.issues.join('\n'));
  assert.equal(geometry.check.counts.shells, 1);
  assert.equal(geometry.check.topology[0].genus, 0);
  assert.equal(geometry.source.family, 'analytic-boolean');
  assert.equal(geometry.planes.length, 2);
  assert.ok(geometry.support.length >= 2);
  let supportError = 0, rimError = 0, planeError = 0;
  const capSides = [], rimAngles = [];
  for (const face of geometry.support) {
    for (const [x, y, z] of face.samples)
      supportError = Math.max(supportError, Math.abs(Math.hypot(Math.hypot(x, y) - railRadius, z) - radius));
  }
  for (const cap of geometry.planes) {
    near(cap.geometry.o[0], 0, 1e-7);
    cap.geometry.n.forEach((value, i) => near(value, i === 0 ? -1 : 0, 1e-7));
    assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer']);
    const edges = cap.loops[0].edges;
    assert.ok(edges.length);
    const sign = Math.sign(edges[0].samples[0][1]);
    capSides.push(sign);
    let turn = 0;
    for (const edge of edges) {
      assert.ok(edge.reciprocal);
      let previous;
      for (const [x, y, z] of edge.samples) {
        planeError = Math.max(planeError, Math.abs(x));
        rimError = Math.max(rimError, Math.abs(Math.hypot(y - sign * railRadius, z) - radius));
        const current = [y - sign * railRadius, z];
        if (previous) turn += Math.atan2(previous[0] * current[1] - previous[1] * current[0],
          previous[0] * current[0] + previous[1] * current[1]);
        previous = current;
      }
      assert.equal(edge.degree, 2);
      rimAngles.push({ degree: edge.degree, ownPcurve: edge.ownPcurve, twinPcurve: edge.twinPcurve });
    }
    near(Math.abs(turn), 2 * Math.PI, 1e-6);
  }
  assert.deepEqual(capSides.sort(), [-1, 1]);
  near(supportError, 0, 1e-7);
  near(planeError, 0, 1e-7);
  near(rimError, 0, 1e-6);
  const expectedVolume = Math.PI ** 2 * railRadius * radius ** 2;
  const centroidX = 2 * (railRadius ** 2 + radius ** 2 / 4) / (Math.PI * railRadius);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  for (const volume of [geometry.mass.volume, geometry.quadrature.volume, bodies[0].volume])
    near(volume, expectedVolume, 1e-5);
  for (const center of [geometry.mass.centroid, geometry.quadrature.centroid, bodies[0].centroid])
    center.forEach((value, i) => near(value, i === 0 ? centroidX : 0, 1e-5));
  assert.ok(geometry.joints.some(edge => edge.rim) && geometry.joints.some(edge => !edge.rim));
  for (const joint of geometry.joints) {
    assert.equal(joint.status, expectMissing ? 'unsupported' : 'measured', JSON.stringify(joint));
    if (expectMissing) assert.equal(joint.reason, 'missing-pcurve', JSON.stringify(joint));
    else {
      near(joint.angle, joint.rim ? 90 : 0, 1e-4);
      assert.equal(joint.count, 8);
    }
  }
  f.report.observations.push({ label, radius, expectedVolume, volume: geometry.mass.volume, quadrature: geometry.quadrature.volume,
    workerVolume: bodies[0].volume, centroidX, supportError, planeError, rimError, counts: geometry.check.counts,
    rimAngles, joints: geometry.joints, pcurves: geometry.pcurves, digest: geometry.digest });
  return geometry;
}

async function measureJoints(geometry, stage) {
  f.phase = 'Measure the circular rims and toroidal seams in Studio';
  await browser().getByRole('button', { name: /^Sweep along Circular rail/ }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const edges = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const observed = [];
  for (const rim of [false, true]) {
    const joint = geometry.joints.find(edge => edge.rim === rim);
    await edges.selectOption(joint.id);
    await button('Measure continuity', panel).click();
    if (expectMissing) {
      await result.getByText('Measurement detail', { exact: true }).click();
      assert.match(await result.locator('details[open]').innerText(), /A face has no native parameter curve\./);
    } else {
      const angle = result.locator('[data-continuity-angle]');
      await angle.waitFor();
      for (const value of (await angle.innerText()).replace('°', '').split(' – ').map(Number))
        near(value, rim ? 90 : 0, 1e-4);
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
    observed.push({ rim, text: await result.innerText() });
    await f.snapshot(stage + (rim ? '-native-cut-rim' : '-native-bend-joint'));
  }
  f.report.observations.push({ label: stage === '03' ? 'desktop-continuity' : stage + '-desktop-continuity', observed });
}

async function viewCaps() {
  f.phase = 'View and select the two circular caps in Left orthographic view';
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const centers = [[0, -railRadius, 0], [0, railRadius, 0]];
  const samples = await f.page.evaluate(points => points.map(point => window.__studioSurfacePoint(point)), [...centers, [0, 0, 0]]);
  for (const [i, point] of centers.entries()) {
    assert.ok(samples[i], 'The cap covers its projected center');
    point.forEach((value, k) => near(samples[i][k], value, 1e-4));
  }
  assert.ok(!samples[2] || samples[2][0] > 10, JSON.stringify({ gapRay: samples[2] }));
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const selected = [];
  for (const [i, point] of centers.entries()) {
    const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
    assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
    await f.page.mouse.click(...pixel);
    await f.page.waitForFunction(previous => {
      const faces = window.__studioSelection?.selection.faces;
      return faces?.length === 1 && faces[0].face !== previous;
    }, selected[i - 1] ?? -1);
    selected.push(await f.page.evaluate(() => window.__studioSelection.selection.faces[0].face));
    await f.snapshot('04-' + (i + 1) + '-selected-cut-cap');
  }
  f.report.observations.push({ label: 'desktop-cap-rays', samples, selected });
}

async function approveLocalIntersection(boxed, direct, directDigest) {
  f.phase = 'Propose the same intersection from a revision-bound local Agent command';
  const file = join(f.output, 'proposed-half-ring.bcad');
  const before = JSON.stringify(boxed);
  await writeFile(file, before);
  const bodies = Object.keys(boxed.outputs);
  assert.equal(bodies.length, 2);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'half-ring', async call => {
    const revision = await currentPartRevision(call);
    const operation = expectedRevision => ({ tool: 'features', args: { action: 'command',
      command: 'intersect', bodies, expectedRevision } });
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [operation('0'.repeat(16))] }, true);
    assert.match(stale.error, /changed|stale/i);
    const ops = [operation(revision)];
    const dry = await call('features', { action: 'batch', dryRun: true, ops });
    assert.ok(dry.dryRun);
    assert.equal(await readFile(file, 'utf8'), before);
    const result = await call('proposals', { action: 'propose', title: 'Keep the exact half ring', ops });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [boxed.nodes, boxed.outputs]);
  await f.freshOpen(file, pending, '08-local-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('09-local-proposal-approved')).doc;
  assert.deepEqual([approved.nodes, approved.outputs], [direct.nodes, direct.outputs]);
  assert.equal((await verifyHalfRing('local-approved', approved, 2)).digest, directDigest);
}

await f.run(async () => {
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
  await chooser.setFiles({ name: 'closed-exact-ring.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  near((await f.bodies()).bodies[0].volume, 2 * Math.PI ** 2 * railRadius * 2 ** 2, 1e-7);

  f.phase = 'Create a box whose left face crosses the ring axis';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Box');
  const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
  for (const [field, value] of Object.entries({ 'Width X': 30, 'Depth Y': 60, 'Height Z': 10, 'At X': 0, 'At Y': -30, 'At Z': -5 }))
    await box.getByLabel(field, { exact: true }).fill(String(value));
  await box.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', box).click();
  await f.changed(seed);
  const boxed = (await f.snapshot('01-ring-and-box')).doc;
  assert.deepEqual(boxed.nodes.slice(0, 2), seed.nodes);
  assert.deepEqual([boxed.nodes[2].min, boxed.nodes[2].max, boxed.nodes[3].from, boxed.nodes[3].height],
    [[0, -30], [30, 30], -5, 10]);
  f.phase = 'Intersect the Exact Sweep ring with the box';
  await button('Sweep along Circular rail', browser()).click();
  await button('Box', browser()).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Intersect');
  await f.changed(boxed);
  const cut = (await f.snapshot('02-intersected-half-ring')).doc;
  assert.deepEqual([cut.nodes[4].kind, cut.nodes[4].left, cut.nodes[4].right], ['intersect', solid(1), solid(3)]);
  const nativeCut = await verifyHalfRing('intersected', cut, 2);
  await measureJoints(nativeCut, '03');
  await viewCaps();

  f.phase = 'Edit the source diameter and replay the downstream Intersect';
  await f.openFeatureEditor(1);
  await f.editor().getByLabel('Diameter', { exact: true }).fill('6');
  const edited = (await f.applyEditor(cut, '05-diameter-six-intersection')).doc;
  assert.equal(edited.nodes[0].radius, 3);
  assert.deepEqual(edited.nodes.slice(1), cut.nodes.slice(1));
  const { digest } = await verifyHalfRing('diameter-six', edited, 3);
  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('closed-circle-box-intersection');
  const reopened = (await f.freshOpen(saved.file, edited, '06-fresh-open')).doc;
  const reopenedGeometry = await verifyHalfRing('reopened', reopened, 3);
  assert.equal(reopenedGeometry.digest, digest);
  if (!expectMissing) await measureJoints(reopenedGeometry, '06-reopened');
  await f.openFeatureEditor(1);
  assert.equal(await f.editor().getByLabel('Diameter', { exact: true }).inputValue(), '6');
  await f.snapshot('07-reopened-editable-sweep');
  if (localApproval) await approveLocalIntersection(boxed, cut, nativeCut.digest);
});
