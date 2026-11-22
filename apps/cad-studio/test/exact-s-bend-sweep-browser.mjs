import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { createFlow } from './flow-helper.mjs';

const weight = Math.SQRT1_2;
const clamp = [0, 0, 0, 1, 1, 1];
const first = [[0, 0, 0], [12, 0, 0], [12, 12, 0]];
const second = [[12, 12, 0], [12, 30, 0], [30, 30, 0]];
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [...first, ...second.slice(1)], weights: [1, weight, 1, weight, 1] };
const mark = (id, knots, points, weights) => `@curve #${id} { type:nurbs; degree:2; knots:${JSON.stringify(knots)};
  control-points:${JSON.stringify(points)}; weights:${JSON.stringify(weights)}; }`;
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2, sideTags: { outer: ['e0'] } }], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm;
    ${mark('first', clamp, first, [1, weight, 1])}
    ${mark('second', clamp, second, [1, weight, 1])}
    ${mark('kink', path.knots, [...first, [30, 12, 0], [30, -6, 0]], path.weights)} }` },
  objects: [
    { id: 'first', name: 'First arc', source: 'rail', geometry: 'first' },
    { id: 'second', name: 'Second arc', source: 'rail', geometry: 'second' },
    { id: 'kink', name: 'Kinked rail', source: 'rail', geometry: 'kink' },
  ] } };

const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'apps/cad-studio/src/ui/SweepHistoryInputs.tsx'];
const baseline = process.argv.includes('--expect-refused');
const f = await createFlow({
  name: 'exact-s-bend-sweep', output: process.argv[2], envFrozen: 'D1681_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Join opposite circular arcs, Sweep an editable exact disk and inspect the native tangent joint.',
  limits: ['Desktop WebGPU and local MCP, two 90° arcs with radii 12 and 18 mm, one circular disk.'],
  ...(!baseline && { inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf,
  measureBrepEdgeContinuity, revolutionOf, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const values = [0, .17, .31, .61, .84, 1];
const at = ([a,b], t) => a + (b-a)*t;
const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop,face])));
const edgeOfUse = id => brep.edges.find(edge => edge.id === brep.coedges.find(use => use.id === id).edge);
const caps = [], walls = [];
for (const face of brep.faces) {
  const geometry = faceGeometry(face);
  if (geometry.kind === 'plane') {
    const rim = brep.loops.find(loop => loop.id === face.loops[0]);
    caps.push({name:face.name, geometry, points: rim.coedges.flatMap(id => {
      const curve = edgeOfUse(id).curve;
      return values.map(t => evaluateCurve(curve, at(curveDomain(curve),t)));
    }) });
  } else {
    const {u,v} = surfaceDomain(face.surface);
    walls.push({profile:revolutionOf(face.surface,100)?.profile, points:values.flatMap(s =>
      values.map(t => evaluateSurface(face.surface,at(u,s),at(v,t)))) });
  }
}
const seams = brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[1]-12) < 1e-7))
  .map(edge => {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    const result = measureBrepEdgeContinuity(brep,edge.id,{curvature:true});
    return {id:edge.id, degree:edge.curve.degree, bindings:uses.map(use => !!use.pcurve),
      internal:uses.every(use => faceGeometry(facesByLoop.get(use.loop)).kind !== 'plane'),
      points:values.map(t => evaluateCurve(edge.curve,at(curveDomain(edge.curve),t))), result,
      curvature:result.curvature?.samples?.map(sample => ({
        point:evaluateCurve(edge.curve,sample.parameter), difference:sample.difference })) };
  });
console.log(JSON.stringify({ check:checkBrep(brep,{strict:true}), caps, walls, seams, source:brep.source,
  mass:massPropertiesOf(output), quadrature:brepMassProperties(brep,1), digest:digestOf(brep) }));
` }),
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const status = value => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const railName = 'Joined curve';
const representation = 'Exact two-arc path';
const near = (value, target, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - target) <= tolerance, JSON.stringify({ value, target, tolerance }));
const volume = radius => Math.PI * radius ** 2 * 15 * Math.PI;
const centroid = radius => {
  const correction = bend => 2 * (bend + radius ** 2 / (4 * bend)) / Math.PI;
  const a = correction(12), b = correction(18);
  return [(12 * a + 18 * (30 - b)) / 30, (12 * (12 - a) + 18 * (12 + b)) / 30, 0];
};

async function verify(label, doc, radius) {
  const shape = await f.inspect(label, doc);
  assert.ok(shape.check.valid, shape.check.issues.join('\n'));
  assert.equal(shape.check.topology[0].genus, 0);
  assert.deepEqual(shape.check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  assert.deepEqual(shape.source, { family: 'sweep-curve', id: 'n1' });
  const caps = shape.caps.sort((a,b) => a.geometry.o[0] - b.geometry.o[0]);
  assert.equal(caps.length, 2);
  let capError = 0, torusError = 0, seamError = 0, curvatureError = 0;
  for (const [i, cap] of caps.entries()) {
    assert.equal(cap.name, i === 0 ? 'n1.start' : 'n1.end');
    const at = i === 0 ? 0 : 30;
    near(cap.geometry.o[0], at);
    cap.geometry.n.forEach((v,k) => near(v, k === 0 ? (i === 0 ? -1 : 1) : 0));
    for (const [x,y,z] of cap.points) capError = Math.max(capError, Math.abs(x-at), Math.abs(Math.hypot(y-at,z)-radius));
  }
  assert.deepEqual(shape.walls.map(({ profile }) => Math.round(profile.c[0])).sort((a,b) => a-b), [12,12,18,18]);
  for (const { profile, points } of shape.walls) {
    assert.equal(profile.kind, 'arc');
    const left = profile.c[0] < 15;
    const R = left ? 12 : 18;
    near(profile.c[0], R);
    near(profile.r, radius);
    for (const [x,y,z] of points)
      torusError = Math.max(torusError, Math.abs(Math.hypot(Math.hypot(x-(left ? 0 : 30),y-12)-R,z)-radius));
  }
  assert.equal(shape.seams.length, 2);
  for (const seam of shape.seams) {
    assert.equal(seam.degree, 2);
    assert.deepEqual(seam.bindings, [true, true]);
    assert.ok(seam.internal);
    assert.equal(seam.result.status, 'measured');
    assert.equal(seam.result.sampleCount, 8);
    near(seam.result.maximumAngleDegrees, 0, 1e-6);
    assert.equal(seam.result.curvature.status, 'measured');
    assert.equal(seam.curvature.length, 8);
    for (const [x,y,z] of seam.points) seamError = Math.max(seamError, Math.abs(y-12), Math.abs(Math.hypot(x-12,z)-radius));
    for (const { point:[x], difference } of seam.curvature) {
      const dx = x-12;
      const expected = Math.abs(dx) / radius * (1/(12+dx) + 1/(18-dx));
      curvatureError = Math.max(curvatureError, Math.abs(expected-difference));
    }
  }
  for (const error of [capError,torusError,seamError,curvatureError]) near(error, 0, 1e-7);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  const expected = volume(radius), centre = centroid(radius);
  for (const result of [shape.mass, shape.quadrature, bodies[0]]) {
    near(result.volume, expected, 2e-6);
    result.centroid.forEach((value,i) => near(value, centre[i], 2e-6));
  }
  f.report.observations.push({label,radius,expected,volume:shape.mass.volume,workerVolume:bodies[0].volume,
    centroid:shape.mass.centroid,capError,torusError,seamError,curvatureError,gap:shape.check.maximumPcurveGap,
    counts:shape.check.counts,digest:shape.digest,seams:shape.seams.map(({id,result}) => ({
      id,angle:result.maximumAngleDegrees,curvatureJump:result.curvature.maximumDifference }))});
  return shape;
}

async function inspectJoint(shape, label) {
  f.phase = 'Measure both native edges at the S-bend joint';
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Sweep along ' + railName, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const angle = result.locator('[data-continuity-angle]');
  for (const seam of shape.seams) {
    await options.selectOption(seam.id);
    await button('Measure continuity', panel).click();
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
  await chooser.setFiles({ name: 'opposing-arc-sweep-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  f.phase = 'Join the two selected native curves';
  await button('First arc', browser()).click();
  await button('Second arc', browser()).click({ modifiers: ['Shift'] });
  await button('Join').click();
  await f.changed(seed);
  const joined = (await f.snapshot('01-joined-arcs')).doc;
  assert.deepEqual(joined.nodes, seed.nodes);
  const rail = joined.direct.objects.find(object => object.name === railName);
  assert.ok(rail && !rail.hidden);

  const savedRail = baseline ? null : await f.save('joined-s-bend-input');
  f.phase = baseline ? 'Preview the Exact Sweep on the joined path' : 'Refuse a non-tangent pair of arcs';
  await button('Sketch 1', browser()).click();
  await button(baseline ? railName : 'Kinked rail', browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  if (baseline) {
    await status('refused').waitFor();
    await hud().getByText('Path is outside the exact Sweep range', { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(joined);
    f.report.observations.push({ label: 'baseline-exact-refused', text: await hud().innerText() });
    await f.snapshot('02-exact-s-bend-refused');
    return;
  }
  await status('refused').waitFor();
  await hud().getByText('The two arcs are not tangent', { exact: true }).waitFor();
  assert.ok(await button('Apply', hud()).isDisabled());
  await f.same(joined);
  await f.snapshot('02-kink-refused');
  f.phase = 'Preview the Exact Sweep on the joined path';
  await button(railName, browser()).click();
  await hud().locator('.hud-step').getByText(representation, { exact: true }).waitFor();
  await status('preview').waitFor();
  await f.snapshot('03-s-bend-preview');
  await button('Apply', hud()).click();
  await f.changed(joined);
  const accepted = (await f.snapshot('04-s-bend-applied')).doc;
  assert.deepEqual([accepted.nodes[1].kind, accepted.nodes[1].mode, accepted.nodes[1].path],
    ['sweep-curve', 'exact', path]);
  const native = await verify('accepted', accepted, 2);
  await inspectJoint(native, '05-tangent-joint');

  await f.openFeatureEditor(1);
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('24');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
  await f.same(accepted);
  await f.snapshot('06-touching-axis-refused');
  await diameter.fill('6');
  const edited = (await f.applyEditor(accepted, '07-diameter-edited')).doc;
  assert.equal(edited.nodes[0].radius, 3);
  assert.deepEqual(edited.nodes.slice(1), accepted.nodes.slice(1));
  const beforeOpen = await verify('diameter-six', edited, 3);
  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('s-bend-sweep');
  await f.freshOpen(saved.file, edited, '08-reopened');
  const reopened = await verify('reopened', await f.doc(), 3);
  assert.equal(reopened.digest, beforeOpen.digest);
  await inspectJoint(reopened, '09-reopened-joint');
  await f.openFeatureEditor(1);
  assert.equal(await f.editor().getByLabel('Diameter', { exact: true }).inputValue(), '6');
  await f.editor().getByText(representation, { exact: true }).waitFor();
  await f.snapshot('10-reopened-history');

  f.phase = 'Approve a revision-bound S-bend Sweep proposal';
  const proposalFile = join(f.output, 's-bend-proposal.bcad');
  await copyFile(savedRail.file, proposalFile);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, proposalFile, 's-bend-sweep', async call => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.representation, /tangent circular arcs of opposite curvature/);
    const summary = await call('query', { action: 'summary' });
    const source = summary.direct_curves.find(candidate => candidate.id === rail.id);
    const kinked = summary.direct_curves.find(candidate => candidate.id === 'kink');
    assert.ok(source?.revision && kinked?.revision && source.revision !== kinked.revision);
    const op = pathRevision => ({ tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: source.id, pathRevision, representation: 'exact' } } });
    const before = await readFile(proposalFile);
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op(kinked.revision)] }, true);
    assert.match(stale.error, /path geometry changed/);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op(source.revision)] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volume(2), .001);
    assert.deepEqual(await readFile(proposalFile), before);
    const proposal = await call('proposals', { action: 'propose', title: 'Exact S-bend Sweep', ops: [op(source.revision)] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(proposalFile, 'utf8'));
  assert.deepEqual([pending.nodes,pending.outputs], [joined.nodes,joined.outputs]);
  await f.freshOpen(proposalFile, pending, '11-local-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('12-local-proposal-approved')).doc;
  assert.deepEqual([approved.nodes,approved.outputs], [accepted.nodes,accepted.outputs]);
  assert.equal((await verify('local-approved', approved, 2)).digest, native.digest);
});
