import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [0, 12, 0], [12, 12, 0], [16, 12, 0], [20, 12, 0], [38, 12, 0], [38, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] };
const kink = path.controlPoints.map((point, i) => i === 5 ? [20, 30, 0] : point);
const mark = (id, points) => `@curve #${id} { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
  control-points:${JSON.stringify(points)}; weights:${JSON.stringify(path.weights)}; }`;
const rail = 'Spaced S-bend rail';
const representation = 'Exact arc–line–arc';
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nextId: 1, nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
    sideTags: { outer: ['e0'] } }], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm; ${mark('spaced', path.controlPoints)} ${mark('kink', kink)} }` },
    objects: [{ id: 'spaced', name: rail, source: 'rail', geometry: 'spaced' },
      { id: 'kink', name: 'Kinked spaced rail', source: 'rail', geometry: 'kink' }] } };
const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/errors.ts', 'packages/barocss-cad-model/src/chat/part/features.ts'];
const f = await createFlow({
  name: 'exact-spaced-s-bend', output: process.argv[2], envFrozen: 'D1721_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a disk along two tangent bends separated by a native straight span.',
  limits: ['Coplanar R12/R18 opposite quarter circles and 8 mm straight. One circular disk. Desktop WebGPU and local MCP.'],
  ...(!baseline && { inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc);
const { brep } = output;
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const faces = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face])));
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const samples = curve => {
  const [a,b] = curveDomain(curve);
  return [0,.15,.37,.5,.64,.85,1].map(t => evaluateCurve(curve, a + (b-a)*t));
};
const joints = [12, 20].map(x => brep.edges.filter(edge =>
  edge.curve.controlPoints.every(point => Math.abs(point[0] - x) < 1e-7)).map(edge => {
  const edgeUses = brep.coedges.filter(use => use.edge === edge.id);
  return { id: edge.id, degree: edge.curve.degree, bindings: edgeUses.map(use => !!use.pcurve),
    reciprocal: edgeUses.every(use => uses.get(use.twin)?.twin === use.id && uses.get(use.twin)?.sense !== use.sense),
    geometry: edgeUses.map(use => faceGeometry(faces.get(use.loop)).kind),
    points: samples(edge.curve),
    result: measureBrepEdgeContinuity(brep,edge.id,{curvature:true}) };
}));
const caps = brep.faces.flatMap(face => {
  const geometry = faceGeometry(face);
  if (geometry.kind !== 'plane') return [];
  const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
  return [{name:face.name, geometry, loops:loops.map(loop => ({kind:loop.kind, rims:loop.coedges.map(id =>
    samples(edges.get(uses.get(id).edge).curve))}))}];
});
console.log(JSON.stringify({ check: checkBrep(brep,{strict:true}), joints, caps,
  mass: massPropertiesOf(output), independent: brepMassProperties(brep,1), digest: digestOf(brep) }));
` }),
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const status = value => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const firstLength = 6 * Math.PI, secondLength = 9 * Math.PI, run = 8;
const pathLength = firstLength + run + secondLength;
const volume = radius => Math.PI * radius ** 2 * pathLength;
const centroid = radius => {
  const innerMoment = bend => 2 * (bend + radius ** 2 / (4 * bend)) / Math.PI;
  const first = innerMoment(12), second = innerMoment(18);
  return [(firstLength * (12 - first) + run * 16 + secondLength * (20 + second)) / pathLength,
    (firstLength * first + run * 12 + secondLength * (30 - second)) / pathLength, 0];
};
const near = (value, target, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - target) <= tolerance, JSON.stringify({ value, target, tolerance }));

async function verify(label, doc, radius) {
  const native = await f.inspect(label, doc);
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.topology.map(body => body.genus), [0]);
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 28, edges: 14, vertices: 8 });
  assert.equal(native.caps.length, 2);
  for (const [name, x0, y0, sense] of [['n1.start', 0, 0, -1], ['n1.end', 38, 30, 1]]) {
    const cap = native.caps.find(face => face.name === name);
    assert.ok(cap, name);
    cap.geometry.n.forEach((value, axis) => near(value, axis === 1 ? sense : 0));
    assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer']);
    assert.equal(cap.loops[0].rims.length, 2);
    for (const rim of cap.loops[0].rims) for (const [x, y, z] of rim) {
      near(y, y0);
      near(Math.hypot(x - x0, z), radius);
    }
  }
  assert.deepEqual(native.joints.map(joint => joint.length), [2, 2]);
  native.joints.forEach((joint, index) => {
    for (const edge of joint) {
      assert.equal(edge.degree, 2);
      assert.deepEqual(edge.bindings, [true, true]);
      assert.equal(edge.reciprocal, true);
      assert.ok(edge.geometry.every(kind => kind !== 'plane'));
      assert.equal(edge.result.status, 'measured');
      assert.equal(edge.result.curvature.status, 'measured');
      assert.ok(edge.result.curvature.maximumDifference > 0);
      near(edge.result.maximumAngleDegrees, 0, 1e-6);
      for (const [x, y, z] of edge.points) {
        near(x, index ? 20 : 12);
        near(Math.hypot(y - 12, z), radius);
      }
    }
  });
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  const centre = centroid(radius);
  for (const result of [native.mass, native.independent, bodies[0]]) {
    near(result.volume, volume(radius), 2e-6);
    result.centroid.forEach((value, axis) => near(value, centre[axis], 2e-6));
  }
  f.report.observations.push({ label, radius, volume: native.mass.volume, digest: native.digest,
    centre, gap: native.check.maximumPcurveGap, angles: native.joints.map(edges => edges.map(edge => edge.result.maximumAngleDegrees)) });
  return native;
}

async function studyJoints(native, label) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Sweep along ' + rail, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const edge of native.joints.flat()) {
    await options.selectOption(edge.id);
    await button('Measure continuity', panel).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
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
  await chooser.setFiles({ name: 'spaced-s-bend-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await f.snapshot('01-opened-spaced-rail');
  const source = baseline ? null : await f.save('spaced-rail-source');
  await button('Sketch 1', browser()).click();
  await button(baseline ? rail : 'Kinked spaced rail', browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await status('refused').waitFor();
  assert.ok(await button('Apply', hud()).isDisabled());
  await f.same(seed);
  const refusal = await hud().innerText();
  assert.match(refusal, baseline ? /outside the exact Sweep range/i : /tangent/i);
  await f.snapshot(baseline ? '02-baseline-spaced-refused' : '02-kink-refused');
  if (baseline) return;

  f.phase = 'Apply a circular Exact Sweep on the spaced S-bend';
  await button(rail, browser()).click();
  await hud().locator('.hud-step').getByText(representation, { exact: true }).waitFor();
  await status('preview').waitFor();
  await f.snapshot('03-spaced-exact-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const accepted = (await f.snapshot('04-spaced-s-bend-applied')).doc;
  assert.deepEqual([accepted.nodes[1].kind, accepted.nodes[1].mode, accepted.nodes[1].path], ['sweep-curve', 'exact', path]);
  const original = await verify('diameter-four-native', accepted, 2);
  await studyJoints(original, '05-both-spaced-joints');

  f.phase = 'Refuse axis contact and edit the saved diameter';
  await f.openFeatureEditor(1, 'spaced Sweep');
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('24'); await button('Apply', f.editor()).click();
  await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
  await f.same(accepted);
  await diameter.fill('6');
  const edited = (await f.applyEditor(accepted, '06-spaced-diameter-six')).doc;
  assert.equal(edited.nodes[0].radius, 3);
  assert.deepEqual(edited.nodes.slice(1), accepted.nodes.slice(1));
  const native = await verify('diameter-six-native', edited, 3);
  await f.undo(); await f.same(accepted);
  await f.redo(); await f.same(edited);
  const saved = await f.save('spaced-s-bend');
  await f.freshOpen(saved.file, edited, '07-spaced-s-bend-reopened');
  const reopened = await verify('reopened-native', await f.doc(), 3);
  assert.equal(reopened.digest, native.digest);
  await studyJoints(reopened, '08-both-reopened-joints');
  await f.openFeatureEditor(1, 'reopened spaced Sweep');
  assert.equal(Number(await f.editor().getByLabel('Diameter', { exact: true }).inputValue()), 6);
  await f.editor().getByText(representation, { exact: true }).waitFor();
  await f.snapshot('09-spaced-history');

  f.phase = 'Approve the same revision-pinned sweep in Studio';
  const proposalFile = join(f.output, 'spaced-proposal.bcad');
  await copyFile(source.file, proposalFile);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, proposalFile, 'spaced-s-bend', async call => {
    const expectedRevision = await currentPartRevision(call);
    const { direct_curves: curves } = await call('query', { action: 'summary' });
    const picked = curves.find(curve => curve.id === 'spaced'), other = curves.find(curve => curve.id === 'kink');
    assert.ok(picked?.revision && other?.revision);
    const op = pathRevision => ({ tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: picked.id, pathRevision, representation: 'exact' } } });
    const before = await readFile(proposalFile);
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op(other.revision)] }, true);
    assert.match(stale.error, /path geometry changed/);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op(picked.revision)] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volume(2), 0.001);
    assert.deepEqual(await readFile(proposalFile), before);
    const proposal = await call('proposals', { action: 'propose', title: 'Exact spaced S-bend Sweep', ops: [op(picked.revision)] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(proposalFile, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  await f.freshOpen(proposalFile, pending, '10-spaced-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click(); await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click(); await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('11-spaced-proposal-approved')).doc;
  assert.deepEqual([approved.nodes, approved.outputs], [accepted.nodes, accepted.outputs]);
  assert.equal((await verify('approved-native', approved, 2)).digest, original.digest);
});
