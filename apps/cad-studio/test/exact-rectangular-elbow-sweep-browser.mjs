import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const lineArc = process.argv.includes('--line-and-arc');
const arcLine = process.argv.includes('--arc-and-line');
assert.ok(!lineArc || !arcLine);
const singleJoin = lineArc || arcLine;
const baseline = process.argv.includes('--expect-refused');
assert.ok(!baseline || singleJoin);
const shortRail = [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0]];
const path = singleJoin ? { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: arcLine ? shortRail.toReversed() : shortRail,
  weights: arcLine ? [1, Math.SQRT1_2, 1, 1, 1] : [1, 1, 1, Math.SQRT1_2, 1] } : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 27, 0], [20, 34, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1] };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } }], outputs: {},
  direct: { sources: { rails: `@model rails { version:0; length-unit:mm;
    @curve #elbow { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
      control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; } }` },
  objects: [{ id: 'elbow', name: 'Elbow rail', source: 'rails', geometry: 'elbow' }] } };

const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad/src/brep/edge-continuity.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/engine/errors.ts',
  'apps/cad-studio/src/ui/SweepHistoryInputs.tsx', 'apps/cad-studio/src/sketch/useSketchActions.ts',
];
const f = await createFlow({
  name: 'exact-rectangular-elbow-sweep', output: process.argv[2], envFrozen: arcLine ? 'D1751_SOURCE_FROZEN' : lineArc ? 'D1746_SOURCE_FROZEN' : 'D1674_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a rectangle along a tangent elbow, inspect the native joints and edit the underlying sketch.',
  limits: ['One R20 mm quarter bend with a 10 mm straight lead, optional 14 mm tail and one bend-aligned rectangle through desktop WebGPU and local L1 MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  massPropertiesOf, measureBrepEdgeContinuity, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const stations = [0, .2, .5, .8, 1], at = ([lo, hi], t) => lo + (hi - lo) * t;
const faces = brep.faces.map(face => ({ name: face.name, support: faceGeometry(face), loops: face.loops }));
const bend = faces.filter(face => face.name.includes('.bend.')).map(face => {
  const surface = brep.faces.find(native => native.name === face.name).surface, { u, v } = surfaceDomain(surface);
  return { support: face.support,
    points: stations.flatMap(s => stations.map(t => evaluateSurface(surface, at(u, s), at(v, t)))) };
});
const caps = faces.filter(face => /^n1[.](start|end)$/.test(face.name)).map(face => ({
  name: face.name, support: face.support, edges: face.loops.flatMap(loop =>
    brep.loops.find(candidate => candidate.id === loop).coedges.map(id => {
      const use = brep.coedges.find(candidate => candidate.id === id);
      const twin = brep.coedges.find(candidate => candidate.id === use.twin);
      const { curve } = brep.edges.find(candidate => candidate.id === use.edge);
      return { degree: curve.degree, reciprocal: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
        bound: !!use.pcurve && !!twin?.pcurve, points: stations.map(t => evaluateCurve(curve, at(curveDomain(curve), t))) };
    })),
}));
const joins = ${JSON.stringify(singleJoin ? [[0, 0]] : [[0, 0], [1, 20]])}.map(([axis, location]) =>
  brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis] - location) < 1e-7))
    .map(edge => measureBrepEdgeContinuity(brep, edge.id, { curvature: true })));
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source, bend, caps, joins,
  volume: massPropertiesOf(output).volume, quadrature: brepMassProperties(brep, 1).volume, digest: digestOf(brep) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const widthInput = () => f.sketchPanel().getByLabel('Edge 1 length', { exact: true });
const volumeAt = width => width * 6 * ((singleJoin ? 10 : 24) + 10 * Math.PI);
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function verify(label, doc, width) {
  const read = await f.inspect(label, doc);
  assert.ok(read.check.valid, read.check.issues.join('\n'));
  assert.deepEqual(read.source, { family: 'sweep-curve', id: 'n1' });
  assert.equal(read.check.topology[0].genus, 0);
  assert.deepEqual(read.check.counts, singleJoin
    ? { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 }
    : { bodies: 1, shells: 1, faces: 14, loops: 14, coedges: 56, edges: 28, vertices: 16 });
  assert.equal(read.caps.length, 2);
  for (const cap of read.caps) {
    const straight = cap.name.endsWith('.start') !== arcLine;
    assert.equal(cap.support.kind, 'plane');
    const [axis, at, normal] = straight ? [0, -10, [-1, 0, 0]] : [1, singleJoin ? 20 : 34, [0, 1, 0]];
    near(cap.support.o[axis], at);
    cap.support.n.forEach((value, i) => near(value, normal[i]));
    assert.equal(cap.edges.length, 4);
    for (const edge of cap.edges) {
      assert.equal(edge.degree, 1);
      assert.ok(edge.reciprocal);
      if (singleJoin && !straight) assert.ok(edge.bound, 'The curved cap has two native chart bindings');
      for (const point of edge.points) {
        near(point[axis], at);
        const radial = straight ? point[1] : point[0] - 20;
        assert.ok(Math.abs(radial) <= width / 2 + 1e-7 && Math.abs(point[2]) <= 3 + 1e-7);
        assert.ok(Math.abs(Math.abs(radial) - width / 2) <= 1e-7 || Math.abs(Math.abs(point[2]) - 3) <= 1e-7);
      }
    }
  }
  const cylinders = read.bend.filter(face => face.support.kind === 'cylinder');
  const planes = read.bend.filter(face => face.support.kind === 'plane');
  assert.equal(cylinders.length, 2);
  assert.equal(planes.length, 2);
  cylinders.sort((a, b) => a.support.r - b.support.r).forEach((face, i) => {
    const radius = 20 + (i ? 1 : -1) * width / 2;
    near(face.support.r, radius);
    for (const [x, y, z] of face.points) {
      near(Math.hypot(x, y - 20), radius);
      assert.ok(Math.abs(z) <= 3 + 1e-7);
    }
  });
  for (const plane of planes) near(Math.abs(plane.support.o[2]), 3);
  assert.deepEqual(read.joins.map(junction => junction.length), singleJoin ? [4] : [4, 4]);
  for (const junction of read.joins) {
    for (const seam of junction) {
      assert.equal(seam.status, 'measured');
      near(seam.maximumAngleDegrees, 0, 1e-5);
      assert.equal(seam.curvature.status, 'measured');
    }
    const jumps = junction.map(seam => seam.curvature.maximumDifference).sort((a, b) => a - b);
    [0, 0, 1 / (20 + width / 2), 1 / (20 - width / 2)].forEach((expected, i) => near(jumps[i], expected));
  }
  near(read.volume, volumeAt(width));
  near(read.quadrature, volumeAt(width));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volumeAt(width));
  f.report.observations.push({ label, width, volume: read.volume, quadrature: read.quadrature, counts: read.check.counts,
    gap: read.check.maximumPcurveGap, digest: read.digest,
    maximumAngle: Math.max(...read.joins.flat().map(seam => seam.maximumAngleDegrees)) });
  return read;
}

async function inspectJoints(native, prefix = '03') {
  f.phase = 'Inspect the four native edges at each elbow junction';
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Sweep along Elbow rail', browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const angle = result.locator('[data-continuity-angle]');
  for (const [i, junction] of native.joins.entries()) {
    for (const seam of junction) {
      await options.selectOption(seam.edgeId);
      await button('Measure continuity', panel).click();
      await angle.waitFor();
      assert.equal(await angle.textContent(), '0°');
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
    await result.scrollIntoViewIfNeeded();
    await f.snapshot(`${prefix}-${i + 1}-native-junction`);
  }
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
  await chooser.setFiles({ name: 'rectangular-elbow-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const source = baseline ? undefined : await f.save('rectangular-source-input');

  f.phase = 'Create the Exact rectangular elbow in Studio';
  await button('Sketch 1', browser()).click();
  await button('Elbow rail', browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await hud().locator('.hud-step').getByText(arcLine ? 'Exact arc and line' : lineArc ? 'Exact line and arc' : 'Exact line–arc–line', { exact: true }).waitFor();
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    await hud().getByText(arcLine ? 'The arc-and-line Sweep needs a circle' : 'The line-and-arc Sweep needs a circular outer section', { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(seed);
    await f.snapshot('01-solid-rectangle-refused');
    return;
  }
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('01-rectangular-elbow-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const applied = (await f.snapshot('02-elbow-applied')).doc;
  assert.deepEqual([applied.nodes[1].kind, applied.nodes[1].mode, applied.nodes[1].path], ['sweep-curve', 'exact', path]);
  const native = await verify('applied-native', applied, 4);
  await inspectJoints(native);

  await f.openFeatureEditor(1, 'edit the rectangular profile from Sweep History');
  await f.editor().getByText('Sketch 1 · 4 × 6 mm', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  assert.equal(await widthInput().inputValue(), '4');
  f.phase = 'Refuse axis contact while keeping the accepted rectangle';
  await widthInput().fill('40');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/The rectangle reaches the bend axis/);
  await f.same(applied);
  assert.equal(await widthInput().inputValue(), '40');
  await f.snapshot('04-width-contact-refused');
  await widthInput().fill('6');
  const edited = (await f.finishSketch('05-wider-elbow')).doc;
  assert.equal(edited.nodes[0].profile, 'rectangle');
  const [left, bottom] = edited.nodes[0].min, [right, top] = edited.nodes[0].max;
  near(right - left, 6);
  near(top - bottom, 6);
  assert.deepEqual(edited.nodes[1], applied.nodes[1]);
  const larger = await verify('edited-native', edited, 6);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('rectangular-elbow');
  const reopened = (await f.freshOpen(saved.file, edited, '06-fresh-open')).doc;
  const reopenedNative = await verify('reopened-native', reopened, 6);
  assert.equal(reopenedNative.digest, larger.digest);
  if (singleJoin) await inspectJoints(reopenedNative, '06-reopened');
  await f.openFeatureEditor(1);
  await f.editor().getByText('Sketch 1 · 6 × 6 mm', { exact: true }).waitFor();
  await f.snapshot('07-reopened-history');
  if (singleJoin) {
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    assert.equal(await widthInput().inputValue(), '6');
    await widthInput().fill('4');
    const restored = (await f.finishSketch('07-width-restored-after-open')).doc;
    assert.deepEqual(restored.nodes[1], applied.nodes[1]);
    assert.equal((await verify('width-restored-native', restored, 4)).digest, native.digest);
  }

  f.phase = 'Approve a revision-bound rectangular elbow proposal';
  const file = join(f.output, 'rectangular-elbow-proposal.bcad');
  await copyFile(source.file, file);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'rectangular-elbow', async call => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, arcLine ? /An arc–line path accepts [^.]* rectangle aligned with the bend frame/
      : lineArc ? /A line–arc path accepts [^.]* rectangle aligned with the bend frame/
      : /rectangle aligned with the bend frame/);
    const summary = await call('query', { action: 'summary' });
    const rail = summary.direct_curves.find(candidate => candidate.id === 'elbow');
    assert.ok(rail?.revision);
    const op = { tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: rail.id, pathRevision: rail.revision, representation: 'exact' } } };
    const before = await readFile(file);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volumeAt(4), .001);
    assert.deepEqual(await readFile(file), before);
    const result = await call('proposals', { action: 'propose', title: 'Exact rectangular elbow', ops: [op] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  await f.freshOpen(file, pending, '08-agent-proposal-open');
  await button('Chat').first().click();
  await button('Preview', card('P1')).click();
  await button('Hide', card('P1')).waitFor();
  await f.same(pending);
  await button('Accept', card('P1')).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('09-agent-proposal-approved')).doc;
  assert.deepEqual([approved.nodes[1].mode, approved.nodes[1].path, approved.outputs], ['exact', path, applied.outputs]);
  assert.equal((await verify('approved-native', approved, 4)).digest, native.digest);
});
