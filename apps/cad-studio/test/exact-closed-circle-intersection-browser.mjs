import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const railRadius = 20;
const annular = process.argv.includes('--annular');
const boreRadius = annular ? 1 : 0;
const offsetCut = process.argv.includes('--offset');
const firstOffset = offsetCut ? 1 : 0;
const angle = process.argv.includes('--oblique') ? 29 * Math.PI / 180 : 0;
const expectMissing = process.argv.includes('--expect-missing-binding');
const localApproval = process.argv.includes('--local-approval');
assert.ok(!annular || (!offsetCut && angle === 0));
const path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: Array.from({ length: 9 }, (_, i) => {
    const a = angle + i * Math.PI / 4, r = i % 2 === 0 ? railRadius : railRadius * Math.SQRT2;
    return [r * Math.cos(a), r * Math.sin(a), 0].map(value => Math.abs(value) < 1e-12 ? 0 : value);
  }),
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
};
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
    ...(annular ? { holes: [[{ kind: 'arc', start: [boreRadius, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['outer'], holes: [['bore']] } } : {}) },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Circular rail', path, mode: 'exact' }],
  outputs: { b1: { node: 1, side: 'solid' } } };
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/brep/edge-continuity.ts',
  ...(!expectMissing || offsetCut || annular ? ['packages/barocss-cad/src/brep/exact-ring-intersect.ts'] : []),
  ...(offsetCut && !expectMissing ? ['packages/barocss-cad/src/brep/offset-ring-trim.ts'] : []),
  'packages/barocss-cad-model/src/app/commands.ts', 'apps/cad-studio/src/App.tsx',
];
const f = await createFlow({
  name: 'exact-closed-circle-intersection', output: process.argv[2],
  envFrozen: annular ? 'D1755_SOURCE_FROZEN' : offsetCut ? 'D1680_SOURCE_FROZEN' : 'D1677_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: offsetCut ? 'Intersect a closed Exact Sweep with an offset box and edit both the cut position and tube diameter.'
    : 'Intersect a closed Exact Sweep with a box through its axis and edit its original circular section.',
  limits: [offsetCut ? 'One R20 mm rail, a single axis-parallel box face at x = 1 then 2 mm, desktop Chrome WebGPU.'
    : 'One R20 mm rail, an axis-through clipping face, retained x ≥ 0, desktop Chrome WebGPU.'],
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
    angle: result.maximumAngleDegrees, low: result.minimumAngleDegrees, count: result.sampleCount,
    observations: result.samples?.map(({ parameter, angleDegrees }) => ({ point: evaluateCurve(edge.curve, parameter), angleDegrees })) };
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

// Independent integral over the tube disk. Each radius retains azimuths from
// -acos(offset/rho) to +acos(offset/rho) and has volume Jacobian rho.
function offsetMass(radius, offset) {
  const steps = 512, dt = Math.PI / steps;
  let volume = 0, moment = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt, rho = railRadius + radius * Math.cos(t);
    const angle = Math.acos(offset / rho), slice = 2 * (radius * Math.sin(t)) ** 2;
    const factor = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    volume += factor * slice * rho * 2 * angle;
    moment += factor * slice * rho ** 2 * 2 * Math.sin(angle);
  }
  return { volume: volume * dt / 3, centroidX: moment / volume };
}

function expectedCutAngle([x, y], radius) {
  const rho = Math.hypot(x, y);
  return Math.acos(-x * (rho - railRadius) / (rho * radius)) * 180 / Math.PI;
}

async function verifyRingCut(label, doc, radius, offset = 0) {
  const geometry = await f.inspect(label, doc);
  assert.ok(geometry.check.valid, geometry.check.issues.join('\n'));
  assert.equal(geometry.check.counts.shells, 1);
  assert.equal(geometry.check.topology[0].genus, annular ? 1 : 0);
  assert.equal(geometry.source.family, 'analytic-boolean');
  assert.equal(geometry.planes.length, 2);
  assert.ok(geometry.support.length >= 2);
  if (annular) assert.deepEqual(geometry.check.counts, {
    bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 40, edges: 20, vertices: 12,
  });
  let supportError = 0, rimError = 0, planeError = 0;
  const capSides = [], rimAngles = [], capJointIds = [];
  let boreFaces = 0;
  for (const face of geometry.support) {
    const bore = annular && face.name.includes('[bore]');
    if (bore) boreFaces++;
    for (const [x, y, z] of face.samples)
      supportError = Math.max(supportError, Math.abs(Math.hypot(Math.hypot(x, y) - railRadius, z) - (bore ? boreRadius : radius)));
  }
  if (annular) assert.equal(boreFaces, geometry.support.length / 2);
  for (const cap of geometry.planes) {
    near(cap.geometry.o[0], offset, 1e-7);
    cap.geometry.n.forEach((value, i) => near(value, i === 0 ? -1 : 0, 1e-7));
    assert.deepEqual(cap.loops.map(loop => loop.kind), annular ? ['outer', 'inner'] : ['outer']);
    const sign = Math.sign(cap.loops[0].edges[0].samples[0][1]);
    capSides.push(sign);
    const turns = [];
    for (const { kind, edges } of cap.loops) {
      const rimRadius = kind === 'inner' ? boreRadius : radius;
      assert.ok(edges.length);
      capJointIds.push(edges[0].id);
      const ySamples = [];
      let turn = 0;
      for (const edge of edges) {
        assert.ok(edge.reciprocal);
        let previous;
        for (const [x, y, z] of edge.samples) {
          assert.equal(Math.sign(y), sign);
          ySamples.push(y);
          planeError = Math.max(planeError, Math.abs(x - offset));
          const profileX = offset ? Math.hypot(x, y) - railRadius : y - sign * railRadius;
          rimError = Math.max(rimError, Math.abs(Math.hypot(profileX, z) - rimRadius));
          const current = [profileX, z];
          if (previous) turn += Math.atan2(previous[0] * current[1] - previous[1] * current[0],
            previous[0] * current[0] + previous[1] * current[1]);
          previous = current;
        }
        if (!offset) assert.equal(edge.degree, 2);
        rimAngles.push({ degree: edge.degree, ownPcurve: edge.ownPcurve, twinPcurve: edge.twinPcurve });
      }
      near(Math.abs(turn), 2 * Math.PI, 1e-6);
      turns.push(turn);
      if (offset) {
        const width = Math.max(...ySamples) - Math.min(...ySamples);
        const exactWidth = Math.sqrt((railRadius + radius) ** 2 - offset ** 2)
          - Math.sqrt((railRadius - radius) ** 2 - offset ** 2);
        assert.ok(exactWidth - 2 * radius > .004);
        near(width, exactWidth, 1e-6);
      }
    }
    if (annular) near(turns[0] + turns[1], 0, 1e-6);
  }
  assert.deepEqual(capSides.sort(), [-1, 1]);
  near(supportError, 0, 1e-7);
  if (!expectMissing || !offset) {
    near(planeError, 0, 1e-7);
    near(rimError, 0, 1e-6);
  }
  const { volume: expectedVolume, centroidX } = offset ? offsetMass(radius, offset) : {
    volume: Math.PI ** 2 * railRadius * (radius ** 2 - boreRadius ** 2),
    centroidX: 2 * (railRadius ** 2 + (radius ** 2 + boreRadius ** 2) / 4) / (Math.PI * railRadius),
  };
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  if (!expectMissing || !offset) {
    for (const volume of [geometry.mass.volume, geometry.quadrature.volume, bodies[0].volume])
      near(volume, expectedVolume, 1e-5);
    for (const center of [geometry.mass.centroid, geometry.quadrature.centroid, bodies[0].centroid])
      center.forEach((value, i) => near(value, i === 0 ? centroidX : 0, 1e-5));
  }
  assert.ok(geometry.joints.some(edge => edge.rim) && geometry.joints.some(edge => !edge.rim));
  if (annular) assert.equal(geometry.joints.filter(edge => edge.rim).length, 8);
  if (annular || offset && !expectMissing)
    assert.equal(geometry.pcurves, expectMissing ? 0 : geometry.check.counts.coedges);
  for (const joint of geometry.joints) {
    assert.equal(joint.status, expectMissing ? 'unsupported' : 'measured', JSON.stringify(joint));
    if (expectMissing) assert.equal(joint.reason, 'missing-pcurve', JSON.stringify(joint));
    else {
      for (const { point, angleDegrees } of joint.observations)
        near(angleDegrees, !joint.rim ? 0 : offset ? expectedCutAngle(point, radius) : 90, 1e-4);
      assert.equal(joint.count, 8);
    }
  }
  f.report.observations.push({ label, radius, offset, ...(annular ? { boreRadius } : {}), expectedVolume, volume: geometry.mass.volume, quadrature: geometry.quadrature.volume,
    workerVolume: bodies[0].volume, centroidX, supportError, planeError, rimError, counts: geometry.check.counts,
    maximumPcurveGap: geometry.check.maximumPcurveGap, rimAngles, joints: geometry.joints,
    pcurves: geometry.pcurves, digest: geometry.digest });
  return { ...geometry, capJointIds };
}

async function measureJoints(geometry, stage) {
  f.phase = 'Measure cut rims and toroidal seams in Studio';
  await browser().getByRole('button', { name: /^Sweep along Circular rail/ }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const edges = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const observed = [];
  const seam = geometry.joints.find(edge => !edge.rim);
  const rims = (offsetCut || annular ? geometry.capJointIds : geometry.capJointIds.slice(0, 1))
    .map(id => geometry.joints.find(edge => edge.id === id));
  const shown = annular && !expectMissing ? geometry.joints : [seam, ...rims];
  for (const [i, joint] of shown.entries()) {
    await edges.selectOption(joint.id);
    await button('Measure continuity', panel).click();
    if (expectMissing) {
      const detail = result.locator('details[open]');
      if (!await detail.count()) await result.getByText('Measurement detail', { exact: true }).click();
      assert.match(await result.locator('details[open]').innerText(), /A face has no native parameter curve\./);
    } else {
      const angle = result.locator('[data-continuity-angle]');
      await angle.waitFor();
      const values = (await angle.innerText()).replaceAll('°', '').split(' – ').map(Number);
      for (const [j, value] of values.entries()) near(value, values.length === 1 || j > 0 ? joint.angle : joint.low, 5.1e-7);
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
    observed.push({ rim: joint.rim, text: await result.innerText() });
    if (!annular || joint === seam || rims.includes(joint)) {
      const label = joint.rim ? '-native-cut-rim' + (offsetCut || annular ? '-' + i : '') : '-native-bend-joint';
      await f.snapshot(stage + label);
    }
  }
  f.report.observations.push({ label: stage === '03' ? 'desktop-continuity' : stage + '-desktop-continuity', observed });
}

async function viewCaps(offset = 0, radius = 2, stage = '04') {
  f.phase = 'View and select the two cut caps in Left orthographic view';
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const y = Math.sqrt(railRadius ** 2 - offset ** 2);
  const z = annular ? (radius + boreRadius) / 2 : 0;
  const centers = [[offset, -y, z], [offset, y, z]];
  const cavities = annular ? [[offset, -y, 0], [offset, y, 0]] : [];
  const samples = await f.page.evaluate(points => points.map(point => window.__studioSurfacePoint(point)),
    [...centers, [0, 0, 0], ...cavities]);
  for (const [i, point] of centers.entries()) {
    assert.ok(samples[i], 'A material point hits the planar cap');
    point.forEach((value, k) => near(samples[i][k], value, 1e-4));
  }
  assert.ok(!samples[2] || samples[2][0] > 10, JSON.stringify({ gapRay: samples[2] }));
  for (const sample of samples.slice(3))
    assert.ok(!sample || sample[0] > .1, JSON.stringify({ cavityRay: sample }));
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
    await f.snapshot(stage + '-' + (i + 1) + '-selected-cut-cap');
  }
  f.report.observations.push({ label: stage === '04' ? 'desktop-cap-rays' : 'reopened-desktop-cap-rays', samples, selected });
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
    const result = await call('proposals', { action: 'propose', title: offsetCut ? 'Keep the offset Exact ring' : 'Keep the exact half ring', ops });
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
  assert.equal((await verifyRingCut('local-approved', approved, 2, firstOffset)).digest, directDigest);
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
  near((await f.bodies()).bodies[0].volume, 2 * Math.PI ** 2 * railRadius * (2 ** 2 - boreRadius ** 2), 1e-7);

  f.phase = 'Create the clipping box';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Box');
  const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
  for (const [field, value] of Object.entries({ 'Width X': 30, 'Depth Y': 60, 'Height Z': 10, 'At X': firstOffset, 'At Y': -30, 'At Z': -5 }))
    await box.getByLabel(field, { exact: true }).fill(String(value));
  await box.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', box).click();
  await f.changed(seed);
  const boxed = (await f.snapshot('01-ring-and-box')).doc;
  assert.deepEqual(boxed.nodes.slice(0, 2), seed.nodes);
  assert.deepEqual([boxed.nodes[2].min, boxed.nodes[2].max, boxed.nodes[3].from, boxed.nodes[3].height],
    [[firstOffset, -30], [firstOffset + 30, 30], -5, 10]);
  f.phase = 'Intersect the Exact Sweep ring with the box';
  await button('Sweep along Circular rail', browser()).click();
  await button('Box', browser()).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Intersect');
  await f.changed(boxed);
  const cut = (await f.snapshot(offsetCut ? '02-offset-intersection' : '02-intersected-half-ring')).doc;
  assert.deepEqual([cut.nodes[4].kind, cut.nodes[4].left, cut.nodes[4].right], ['intersect', solid(1), solid(3)]);
  const nativeCut = await verifyRingCut('intersected', cut, 2, firstOffset);
  await measureJoints(nativeCut, '03');
  await viewCaps(firstOffset);
  if ((offsetCut || annular) && expectMissing) return;

  let moved = cut;
  if (offsetCut) {
    await f.openFeatureEditor(3);
    const corner = f.editor().getByLabel('Corner X', { exact: true });
    assert.equal(await corner.inputValue(), '1');
    await corner.fill('2');
    moved = (await f.applyEditor(cut, '05-offset-two-intersection')).doc;
    assert.deepEqual([moved.nodes[2].min, moved.nodes[2].max], [[2, -30], [32, 30]]);
    assert.deepEqual(moved.nodes[4], cut.nodes[4]);
    await verifyRingCut('offset-two', moved, 2, 2);
    await f.undo();
    await f.same(cut);
    await f.redo();
    await f.same(moved);
  }
  const offset = offsetCut ? 2 : 0;
  f.phase = 'Edit the source diameter and replay the downstream Intersect';
  await f.openFeatureEditor(1);
  await f.editor().getByLabel('Diameter', { exact: true }).fill('6');
  const edited = (await f.applyEditor(moved, '05-diameter-six-intersection')).doc;
  assert.equal(edited.nodes[0].radius, 3);
  assert.deepEqual(edited.nodes.slice(1), moved.nodes.slice(1));
  const { digest } = await verifyRingCut('diameter-six', edited, 3, offset);
  await f.undo();
  await f.same(moved);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('closed-circle-box-intersection');
  const reopened = (await f.freshOpen(saved.file, edited, '06-fresh-open')).doc;
  const reopenedGeometry = await verifyRingCut('reopened', reopened, 3, offset);
  assert.equal(reopenedGeometry.digest, digest);
  if (!expectMissing) await measureJoints(reopenedGeometry, '06-reopened');
  if (annular) await viewCaps(offset, 3, '06-reopened');
  await f.openFeatureEditor(1);
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  assert.equal(await diameter.inputValue(), '6');
  await f.snapshot('07-reopened-editable-sweep');
  if (annular) {
    await diameter.fill('4');
    const restored = (await f.applyEditor(reopened, '07-reopened-restored-diameter')).doc;
    assert.equal(restored.nodes[0].radius, 2);
    assert.deepEqual(restored.nodes.slice(1), cut.nodes.slice(1));
    assert.equal((await verifyRingCut('restored-after-open', restored, 2)).digest, nativeCut.digest);
    await f.undo();
    await f.same(reopened);
  }
  if (offsetCut) {
    await f.closeEditor();
    await f.openFeatureEditor(3);
    const corner = f.editor().getByLabel('Corner X', { exact: true });
    assert.equal(await corner.inputValue(), '2');
    await f.snapshot('08-reopened-editable-offset');
    await corner.fill('1');
    const movedAgain = (await f.applyEditor(reopened, '09-offset-edited-after-open')).doc;
    assert.deepEqual(movedAgain.nodes[2].min, [1, -30]);
    await verifyRingCut('offset-edited-after-open', movedAgain, 3, 1);
    await f.undo();
    await f.same(reopened);
  }
  if (localApproval) await approveLocalIntersection(boxed, cut, nativeCut.digest);
});
