import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
const baseline = process.argv.includes('--expect-refused');
const q = Math.SQRT1_2;
const segments = [
  { id: 'first', name: 'First arc', points: [[0, 0, 0], [12, 0, 0], [12, 12, 0]], weights: [1, q, 1] },
  { id: 'second', name: 'Second arc', points: [[12, 12, 0], [12, 30, 0], [12, 30, 18]], weights: [1, q, 1] },
  { id: 'outlet', name: 'Straight outlet', points: [[12, 30, 18], [12, 30, 23], [12, 30, 28]], weights: [1, 1, 1] },
];
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [...segments[0].points, ...segments[1].points.slice(1), ...segments[2].points.slice(1)],
  weights: [1, q, 1, q, 1, 1, 1] };
const section = { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
  holes: [[{ kind: 'arc', start: [{ parameter: 'BoreRadius' }, 0], center: [0, 0], direction: 'cw' }]],
  sideTags: { outer: ['e0'], holes: [['bore']] } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { BoreRadius: 1 },
  nextId: 1, nodes: [section], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm;
    ${segments.map(({ id, points, weights }) => `@curve #${id} { type:nurbs; degree:2; knots:[0,0,0,1,1,1];
      control-points:${JSON.stringify(points)}; weights:${JSON.stringify(weights)}; }`).join('\n')} }` },
    objects: segments.map(({ id, name }) => ({ id, name, source: 'rail', geometry: id })) } };
const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/engine/errors.ts'];
const f = await createFlow({
  name: 'exact-perpendicular-outlet-sweep', output, envFrozen: 'D1906_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Join two perpendicular quarter arcs and one straight tangent outlet, then sweep an editable concentric annulus.',
  ...(!baseline && { inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  massPropertiesOf, measureBrepEdgeContinuity, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [out] } = partSnapshot(doc), { brep } = out;
const parameters = [0, .13, .3, .5, .73, 1];
const at = (range, t) => range[0] + (range[1] - range[0]) * t;
const byId = entries => new Map(entries.map(value => [value.id, value]));
const loops = byId(brep.loops), coedges = byId(brep.coedges), edges = byId(brep.edges);
const caps = [], cylinders = [], other = [];
for (const face of brep.faces) {
  const geometry = faceGeometry(face);
  if (geometry.kind === 'plane') {
    caps.push({ geometry, name: face.name, loops: face.loops.map(id => {
      const loop = loops.get(id);
      return { kind: loop.kind, rims: loop.coedges.map(use => {
        const { curve } = edges.get(coedges.get(use).edge), range = curveDomain(curve);
        return { degree: curve.degree, samples: parameters.map(t => evaluateCurve(curve, at(range, t))) };
      }) };
    }) });
  } else {
    const { u, v } = surfaceDomain(face.surface);
    const witness = { name: face.name, digest: digestOf(face.surface),
      samples: parameters.flatMap(s => parameters.map(t => evaluateSurface(face.surface, at(u, s), at(v, t)))) };
    if (geometry.kind === 'cylinder') cylinders.push({ ...witness, geometry });
    else other.push(witness);
  }
}
const seams = ['first', 'outlet'].map((kind, i) => {
  const axis = i ? 2 : 1, constant = i ? 18 : 12;
  return { kind, edges: brep.edges.filter(edge => edge.curve.controlPoints.every(p => Math.abs(p[axis] - constant) < 1e-8))
    .map(edge => {
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      return { id: edge.id, degree: edge.curve.degree, samples: parameters.map(t => evaluateCurve(edge.curve, at(curveDomain(edge.curve), t))),
        reciprocal: uses.length === 2 && uses[0].twin === uses[1].id && uses[1].twin === uses[0].id && uses[1].sense !== uses[0].sense,
        charts: uses.map(use => !!use.pcurve), continuity: measureBrepEdgeContinuity(brep, edge.id, { curvature: true }) };
    }) };
});
console.log(JSON.stringify({ topology: checkBrep(brep,{strict:true}), caps, cylinders, other, seams,
  mass: massPropertiesOf(out), quadrature: brepMassProperties(brep,1), digest: digestOf(brep) }));
` }),
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const status = label => hud().locator('.status').filter({ hasText: new RegExp(`^${label}$`) });
const near = (a, b, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, JSON.stringify({ a, b, tolerance }));
const volume = inner => Math.PI * (4 - inner ** 2) * (15 * Math.PI + 10);
const isBore = name => /\[bore\]|\.hole0\./.test(name);

function rimRadius(point, center, axis) {
  const offset = point.map((value, i) => value - center[i]);
  near(offset[axis], 0);
  return Math.hypot(...offset.filter((_, i) => i !== axis));
}

async function verify(label, doc) {
  const inner = doc.parameters.BoreRadius;
  const shape = await f.inspect(label, doc);
  const { topology, caps, cylinders, seams, mass, quadrature } = shape;
  assert.ok(topology.valid, topology.issues.join('\n'));
  assert.equal(topology.topology.length, 1);
  assert.equal(topology.topology[0].shells, 1);
  assert.equal(topology.topology[0].genus, 1);
  assert.deepEqual(topology.counts, { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 56, edges: 28, vertices: 16 });
  assert.equal(caps.length, 2);
  for (const [center, normal, axis] of [[[0, 0, 0], [-1, 0, 0], 0], [[12, 30, 28], [0, 0, 1], 2]]) {
    const cap = caps.find(c => c.geometry.n.every((value, i) => Math.abs(value - normal[i]) < 1e-8));
    assert.ok(cap);
    near(cap.geometry.o[axis], center[axis]);
    assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer', 'inner']);
    for (const loop of cap.loops) {
      assert.equal(loop.rims.length, 2);
      for (const rim of loop.rims) {
        assert.equal(rim.degree, 2);
        for (const point of rim.samples) near(rimRadius(point, center, axis), loop.kind === 'inner' ? inner : 2);
      }
    }
  }
  assert.equal(cylinders.length, 4);
  for (const [out, radius] of [[1, 2], [-1, inner]]) {
    const walls = cylinders.filter(face => face.geometry.out === out);
    assert.equal(walls.length, 2);
    for (const { geometry, samples } of walls) {
      near(geometry.c[0], 12); near(geometry.c[1], 30); near(geometry.r, radius);
      near(Math.abs(geometry.a[2]), 1);
      near(Math.min(...samples.map(point => point[2])), 18);
      near(Math.max(...samples.map(point => point[2])), 28);
      for (const [x, y] of samples) near(Math.hypot(x - 12, y - 30), radius);
    }
  }
  const angles = [];
  for (const { kind, edges } of seams) {
    const [center, axis] = kind === 'first' ? [[12, 12, 0], 1] : [[12, 30, 18], 2];
    const radii = edges.map(edge => {
      assert.equal(edge.degree, 2);
      assert.ok(edge.reciprocal);
      assert.deepEqual(edge.charts, [true, true]);
      assert.equal(edge.continuity.status, 'measured');
      near(edge.continuity.maximumAngleDegrees, 0, 1e-6);
      angles.push(edge.continuity.maximumAngleDegrees);
      const radii = edge.samples.map(point => rimRadius(point, center, axis));
      for (const radius of radii) near(radius, radii[0]);
      return radii[0];
    }).sort((a, b) => a - b);
    assert.equal(edges.length, 4);
    radii.forEach((radius, i) => near(radius, i < 2 ? inner : 2));
  }
  const q = 4 + inner ** 2, length = 15 * Math.PI + 10;
  const arcCentroid = [36 / 5 + (576 + q) / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - (1296 + q) / (60 * Math.PI)];
  const centroid = arcCentroid.map((value, i) => (15 * Math.PI * value + 10 * [12, 30, 23][i]) / length);
  const { bodies: [body] } = await f.bodies();
  for (const measured of [mass, quadrature, body]) {
    near(measured.volume, volume(inner), 2e-6);
    measured.centroid.forEach((value, axis) => near(value, centroid[axis], 2e-6));
  }
  f.report.observations.push({ label, inner, volume: mass.volume, centroid: mass.centroid,
    gap: topology.maximumPcurveGap, angles, topology: topology.counts, digest: shape.digest });
  return shape;
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: 'orthogonal-outlet-sweep.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 1);
  await f.same(seed);
  f.phase = 'join the two quarter arcs';
  await button('First arc', browser()).click();
  await button('Second arc', browser()).click({ modifiers: ['Shift'] });
  await button('Join').click();
  await f.changed(seed);
  const twoArcs = await f.doc();
  f.phase = 'append the straight outlet to the joined arcs';
  await button('Joined curve', browser()).last().click();
  await button('Straight outlet', browser()).click({ modifiers: ['Shift'] });
  await button('Join').click();
  await f.changed(twoArcs);
  const joined = (await f.snapshot('01-joined-outlet-path')).doc;
  const rail = joined.direct.objects.find(object => object.name === 'Joined curve' && !object.hidden);
  assert.ok(rail);
  assert.deepEqual(joined.nodes, seed.nodes);
  const savedRail = baseline ? null : await f.save('joined-outlet-input');
  f.phase = 'preview exact perpendicular Sweep with the joined tangent outlet';
  await button('Sketch 1', browser()).click();
  await button(rail.name, browser()).last().click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  if (baseline) {
    await status('refused').waitFor();
    assert.equal(await button('Apply', hud()).isEnabled(), false);
    await f.same(joined);
    f.report.observations.push({ label: 'previous-refusal', text: await hud().innerText() });
    await f.snapshot('02-exact-outlet-refused');
    return;
  }
  await hud().locator('.hud-step').getByText('Exact arc–arc–line', { exact: true }).waitFor();
  await status('preview').waitFor();
  await f.snapshot('02-exact-outlet-preview');
  await button('Apply', hud()).click();
  await f.changed(joined);
  await f.ready();
  const accepted = (await f.snapshot('03-exact-outlet-applied')).doc;
  assert.deepEqual([accepted.nodes[1].kind, accepted.nodes[1].mode, accepted.nodes[1].path], ['sweep-curve', 'exact', path]);
  const native = await verify('original', accepted);

  f.phase = 'refuse outer-wall contact and edit the bore to 1.5 mm';
  const panel = await f.openParameters();
  const input = panel.getByLabel('Value of BoreRadius', { exact: true });
  assert.equal(await input.inputValue(), '1');
  await input.fill('2');
  await input.press('Enter');
  assert.match(await f.waitToast(/Parameters not changed/), /strictly positive wall clearance around the bore/);
  await f.same(accepted);
  await f.snapshot('04-wall-contact-refused');
  await f.closeParameters(panel);
  const edited = (await f.setParameter('BoreRadius', 1.5, '05-bore-edited')).doc;
  assert.deepEqual(edited.nodes, accepted.nodes);
  const changed = await verify('bore-edited', edited);
  const exterior = shape => [...shape.other.filter(face => !isBore(face.name)),
    ...shape.cylinders.filter(face => face.geometry.out === 1)].map(face => [face.name, face.digest]);
  assert.equal(exterior(native).length, 6);
  assert.deepEqual(exterior(changed), exterior(native));
  await f.undo(); await f.same(accepted);
  await f.redo(); await f.same(edited);
  const saved = await f.save('perpendicular-outlet-sweep');
  await f.freshOpen(saved.file, edited, '06-native-reopened');
  assert.equal((await verify('reopened', await f.doc())).digest, changed.digest);
  f.phase = 'inspect the actual bore opening along the straight outlet';
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const a = window.__studioScreenOf([12, 30, 28]), b = window.__studioScreenOf([12, 30, 27]);
    return a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
  });
  const outlet = await f.page.evaluate(() => ({
    opening: window.__studioSurfacePoint([12, 30, 28]),
    land: window.__studioSurfacePoint([13.75, 30, 28]),
  }));
  assert.ok(outlet.land, JSON.stringify(outlet));
  near(outlet.land[2], 28, 1e-4);
  assert.ok(!outlet.opening || outlet.opening[2] < 27.75, JSON.stringify(outlet));
  await f.snapshot('06-outlet-bore-opening');

  f.phase = 'approve the same outlet from a revision-bound local Agent proposal';
  const proposalFile = join(f.output, 'outlet-proposal.bcad');
  await copyFile(savedRail.file, proposalFile);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, proposalFile, 'outlet-sweep', async call => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.representation, /perpendicular planes .* optional straight tangent inlet or outlet/);
    const summary = await call('query', { action: 'summary' });
    const source = summary.direct_curves.find(item => item.id === rail.id);
    assert.ok(source?.revision);
    const op = { tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: source.id, pathRevision: source.revision, representation: 'exact' } } };
    const before = await readFile(proposalFile);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volume(1), .001);
    assert.deepEqual(await readFile(proposalFile), before);
    const proposed = await call('proposals', { action: 'propose', title: 'Exact perpendicular Sweep with outlet', ops: [op] });
    assert.deepEqual([proposed.proposal, proposed.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(proposalFile, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [joined.nodes, joined.outputs]);
  await f.freshOpen(proposalFile, pending, '07-agent-proposal-open');
  await button('Chat').first().click();
  const proposal = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', proposal).click();
  await button('Hide', proposal).waitFor();
  await f.same(pending);
  await button('Accept', proposal).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('08-agent-approved')).doc;
  assert.deepEqual([approved.nodes, approved.outputs], [accepted.nodes, accepted.outputs]);
  assert.equal((await verify('approved', approved)).digest, native.digest);
});
