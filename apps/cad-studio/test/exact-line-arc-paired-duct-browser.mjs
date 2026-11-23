import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkApprovedDuctReview, checkChangedDuctPath, reviewPendingPairedDuct } from './duct-proposal-review-browser-steps.mjs';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const reviewBaseline = process.argv.includes('--expect-review-unavailable');
const review = process.argv.includes('--review');
const tail = process.argv.includes('--straight-tail') ? 14 : 0;
const sameTurn = process.argv.includes('--spaced-same-turn');
const spaced = sameTurn || process.argv.includes('--spaced-opposite');
const oppositeArcs = process.argv.includes('--opposite-arcs');
const arcAndLine = process.argv.includes('--arc-and-line');
assert.ok([spaced, !!tail, oppositeArcs, arcAndLine].filter(Boolean).length <= 1);
const revolvedEnds = spaced || oppositeArcs;
const threePieces = tail > 0 || spaced;
const forwardEnds = [
  { direction: 'Left', axis: 0, sign: -1, center: revolvedEnds ? [0, 0] : [-10, 0] },
  spaced ? { direction: sameTurn ? 'Left' : 'Right', axis: 0, sign: sameTurn ? -1 : 1, center: [sameTurn ? -6 : 30, 38] }
    : oppositeArcs ? { direction: 'Right', axis: 0, sign: 1, center: [30, 30] }
    : { direction: 'Back', axis: 1, sign: 1, center: [20, 20 + tail] },
];
const ends = arcAndLine ? forwardEnds.toReversed() : forwardEnds;
const junctionPlanes = spaced ? [[1, 12], [1, 20]] : oppositeArcs ? [[1, 12]] : tail ? [[0, 0], [1, 20]] : [[0, 0]];
const junctions = junctionPlanes.map((_, index) => index);
const representation = spaced ? 'Exact arc–line–arc' : oppositeArcs ? 'Exact two-arc path' : tail ? 'Exact line–arc–line' : arcAndLine ? 'Exact arc and line' : 'Exact line and arc';
assert.ok([baseline, reviewBaseline, review].filter(Boolean).length <= 1);
const railName = 'Paired duct rail';
const straightToArc = [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0]];
const path = spaced ? {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0], [12, 20, 0], [12, 38, 0], [sameTurn ? -6 : 30, 38, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1],
} : oppositeArcs ? {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [30, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
} : tail ? {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 20 + tail / 2, 0], [20, 20 + tail, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1],
} : {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: arcAndLine ? straightToArc.toReversed() : straightToArc,
  weights: arcAndLine ? [1, Math.SQRT1_2, 1, 1, 1] : [1, 1, 1, Math.SQRT1_2, 1],
};
const hole = center => [[-1, center - 1], [-1, center + 1], [1, center + 1], [1, center - 1]]
  .map(start => ({ kind: 'line', start }));
const sideTags = { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5], holes: [hole(-2), hole(2)], sideTags }],
  outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm;
    @curve #rail { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
      control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; } }` },
  objects: [{ id: 'rail', name: railName, source: 'rail', geometry: 'rail' }] },
};
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/brep/brep-glue.ts',
  'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs',
];
if (review || reviewBaseline) pins.push(
  'packages/barocss-cad-model/src/chat/rectangularDuctProposalReview.ts',
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
  'packages/barocss-cad-model/src/chat/part/views.ts',
  'apps/cad-studio/test/duct-proposal-review-browser-steps.mjs',
);
const f = await createFlow({
  name: spaced ? 'exact-spaced-paired-duct' : 'exact-line-arc-paired-duct', output: process.argv[2],
  envFrozen: arcAndLine ? (review || reviewBaseline ? 'D1801_SOURCE_FROZEN' : 'D1800_SOURCE_FROZEN') : oppositeArcs ? (review || reviewBaseline ? 'D1799_SOURCE_FROZEN' : 'D1798_SOURCE_FROZEN') : sameTurn ? (review || reviewBaseline ? 'D1796_SOURCE_FROZEN' : 'D1795_SOURCE_FROZEN') : spaced ? (review || reviewBaseline ? 'D1794_SOURCE_FROZEN' : 'D1792_SOURCE_FROZEN') : (review || reviewBaseline)
    ? (tail ? 'D1787_SOURCE_FROZEN' : 'D1783_SOURCE_FROZEN')
    : (tail ? 'D1786_SOURCE_FROZEN' : 'D1782_SOURCE_FROZEN'),
  initialFiles: pins, requiredFrozen: pins,
  extraFrozen: review ? [
    'packages/barocss-cad-model/src/chat/pairedLineArcDuctEvidence.ts',
    ...(revolvedEnds ? ['packages/barocss-cad-model/src/chat/pairedSpacedArcDuctEvidence.ts'] : []),
  ] : [],
  qualification: spaced ? 'Carry two rectangular passages through two bends and a straight span.'
    : oppositeArcs ? 'Sweep two rectangular passages through two directly joined opposite turns.'
    : arcAndLine ? 'Sweep two rectangular passages from an arc into a tangent straight span.'
    : 'Sweep two rectangular passages along a straight rail into a tangent arc.',
  limits: [spaced ? 'A 4 × 10 mm section, two 2 × 2 mm lanes, R12/R18 quarter bends, an 8 mm straight span and desktop WebGPU.' : oppositeArcs ? 'A 4 × 10 mm section, two 2 × 2 mm passages, directly joined R12/R18 quarter arcs and desktop WebGPU.' : `A bend-aligned 4 × 10 mm rectangle, two axial lanes centered at ±2 mm, a 10 mm straight span and an R20 quarter arc${tail ? ' followed by a 14 mm straight span' : ''}. Desktop WebGPU.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const faces = new Map(brep.faces.map(face => [face.id, face]));
const caps = brep.faces.filter(face => /^n1[.](start|end)$/.test(face.name)).map(face => ({
  name: face.name, plane: faceGeometry(face), loops: face.loops.map(id => {
    const loop = loops.get(id);
    return { kind: loop.kind, edges: loop.coedges.map(id => {
      const use = uses.get(id), twin = uses.get(use.twin), edge = edges.get(use.edge);
      return { id: edge.id, side: faces.get(loops.get(twin.loop).face).name, bound: !!use.pcurve && !!twin.pcurve,
        reciprocal: twin.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
        degree: edge.curve.degree, points: edge.curve.controlPoints };
    }) };
  }),
}));
const planes = ${JSON.stringify(junctionPlanes)};
const joints = planes.flatMap(([axis, at], index) => brep.edges
  .filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-7)).map(edge => ({
    ...measureBrepEdgeContinuity(brep, edge.id, { curvature: true }), junction: index,
    bound: brep.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve),
  })));
console.log(JSON.stringify({ source: brep.source, check: checkBrep(brep, { strict: true }), caps, joints,
  wallNames: brep.faces.filter(face => face.name.includes('.side[')).map(face => face.name),
  wallPlanes: brep.faces.filter(face => face.name.includes('.side[')).map(face => ({ name: face.name, plane: faceGeometry(face) }))
    .filter(item => item.plane.kind === 'plane'),
  mass: massPropertiesOf(output), quadrature: brepMassProperties(brep, 1), digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const coordinate = (index, axis) => f.sketchPanel().getByLabel(`Point ${index} ${axis}`, { exact: true });
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const sortedTags = tags => [...tags].sort();
const run = spaced ? 8 : 0;
const pathLength = revolvedEnds ? run + 15 * Math.PI : 10 + 10 * Math.PI + tail;
const volumeAt = halfHeight => (36 - 4 * halfHeight) * pathLength;

async function verify(label, doc, firstHalfHeight) {
  const native = await f.inspect(label, doc);
  assert.deepEqual(native.source, { family: 'sweep-curve', id: 'n1' });
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, threePieces
    ? { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 }
    : { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 });
  assert.equal(native.check.topology[0].genus, 2);
  assert.ok(native.check.maximumPcurveGap < 1e-8);
  assert.equal(native.wallNames.length, threePieces ? 36 : 24);
  assert.equal(native.caps.length, 2);
  for (const cap of native.caps) {
    const start = cap.name === 'n1.start';
    const { axis, sign, center } = ends[start ? 0 : 1];
    const at = center[axis];
    assert.equal(cap.plane.kind, 'plane');
    near(cap.plane.o[axis], at);
    near(cap.plane.n[axis], sign);
    assert.deepEqual(cap.loops.map(loop => loop.kind).sort(), ['inner', 'inner', 'outer']);
    for (const [tags, radial, axial, center] of [
      [sideTags.outer, 2, 5, 0],
      [sideTags.holes[0], 1, firstHalfHeight, -2],
      [sideTags.holes[1], 1, 1, 2],
    ]) {
      const loop = cap.loops.find(loop => sortedTags(loop.edges.map(edge => edge.side.match(/\[(e\d+)\]$/)?.[1])).join() === sortedTags(tags).join());
      assert.ok(loop, `Missing ${cap.name} loop for ${tags.join(', ')}`);
      assert.equal(loop.edges.length, 4);
      const points = loop.edges.flatMap(edge => {
        assert.equal(edge.degree, 1);
        assert.ok(edge.reciprocal);
        // Revolved terminal caps use exact planar boundaries. Both stored charts are required at every internal join.
        if (!revolvedEnds && (!start || threePieces || arcAndLine)) assert.ok(edge.bound, 'Each terminal edge needs two native charts');
        return edge.points;
      });
      const transverse = points.map(point => point[1 - axis] - ends[start ? 0 : 1].center[1 - axis]);
      const height = points.map(point => point[2]);
      near(Math.min(...transverse), -radial);
      near(Math.max(...transverse), radial);
      near(Math.min(...height), center - axial);
      near(Math.max(...height), center + axial);
      for (const point of points) near(point[axis], at);
    }
  }
  assert.equal(native.joints.length, 12 * junctions.length);
  for (const junction of junctions) assert.equal(native.joints.filter(joint => joint.junction === junction).length, 12);
  for (const joint of native.joints) {
    assert.equal(joint.status, 'measured');
    assert.equal(joint.curvature.status, 'measured');
    assert.ok(joint.bound);
    near(joint.maximumAngleDegrees, 0, 1e-5);
  }
  const area = 36 - 4 * firstHalfHeight;
  const radialVariance = (40 * 4 ** 2 - (40 - area) * 2 ** 2) / (12 * area);
  const bendCentroidX = 2 * (20 + radialVariance / 20) / Math.PI;
  const firstArc = 6 * Math.PI, secondArc = 9 * Math.PI;
  const firstRadial = 2 * (12 + radialVariance / 12) / Math.PI;
  const secondRadial = 2 * (18 + radialVariance / 18) / Math.PI;
  const expectedCentroid = revolvedEnds ? [
    (firstArc * firstRadial + run * 12 + secondArc * (sameTurn ? -6 + secondRadial : 30 - secondRadial)) / pathLength,
    (firstArc * (12 - firstRadial) + run * (12 + run / 2) + secondArc * (12 + run + secondRadial)) / pathLength,
    (8 * firstHalfHeight - 8) / area,
  ] : [
    (10 * Math.PI * bendCentroidX - 50 + tail * 20) / pathLength,
    (10 * Math.PI * (20 - bendCentroidX) + tail * (20 + tail / 2)) / pathLength,
    (8 * firstHalfHeight - 8) / area,
  ];
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  for (const props of [native.mass, native.quadrature, bodies[0]]) {
    near(props.volume, volumeAt(firstHalfHeight));
    props.centroid.forEach((value, axis) => near(value, expectedCentroid[axis]));
  }
  f.report.observations.push({ label, digest: native.digest, volume: native.mass.volume,
    quadratureVolume: native.quadrature.volume, chartGap: native.check.maximumPcurveGap,
    joins: native.joints.map(joint => joint.edgeId),
    ...(revolvedEnds ? { centroid: native.quadrature.centroid,
      capEdgesWithBothCharts: native.caps.map(cap => cap.loops.flatMap(loop => loop.edges).filter(edge => edge.bound).length) } : {}) });
  return native;
}

async function showEnd(direction, label, index = 0) {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: direction, exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(name => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === name;
  }, direction.toUpperCase());
  const { center, axis, sign } = ends[index];
  const [first, web, second] = await f.page.evaluate(center => [-2, 0, 2].map(z => window.__studioSurfacePoint([...center, z])), center);
  assert.ok(web, 'Material between the passages must face the viewport');
  near(web[axis], center[axis], 1e-4);
  for (const opening of [first, second]) {
    assert.ok(!opening || sign * (center[axis] - opening[axis]) > .5, JSON.stringify({ opening, web }));
  }
  f.report.observations.push({ label, first, web, second });
  await f.snapshot(label);
}

async function inspectJoints(joints) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sweep along ${railName}`, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const angle = result.locator('[data-continuity-angle]');
  for (const junction of junctions) {
    for (const joint of joints.filter(item => item.junction === junction)) {
      await options.selectOption(joint.edgeId);
      await button('Measure continuity', panel).click();
      await angle.waitFor();
      assert.equal(await angle.textContent(), '0°');
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
    await result.scrollIntoViewIfNeeded();
    await f.snapshot(threePieces ? `04-native-joins-${junction + 1}` : '04-native-joins');
  }
}

async function openFirstPassage() {
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
}

async function approveWithAgent(source, expected) {
  const file = join(f.output, 'paired-duct-agent-proposal.bcad');
  const session = { app: f.app, output: f.output, clientName: f.name };
  await copyFile(source.file, file);
  const reviewed = await withMcpSession(session, file, 'paired-duct-proposal', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, arcAndLine ? /arc–line duct also accepts this paired section/ : oppositeArcs ? /two directly joined opposite-turn arcs accept this paired section/i : sameTurn ? /Same-turn arc–line–arc ducts also accept this paired section/ : spaced ? /opposite-turn arc–line–arc duct accepts this paired section/
      : tail ? /line–arc–line duct also accepts this paired section/ : /line–arc ducts accept two rectangular openings/);
    const rail = (await call('query', { action: 'summary' })).direct_curves.find(curve => curve.id === 'rail');
    assert.ok(rail?.revision);
    const op = { tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: rail.id, pathRevision: rail.revision, representation: 'exact' } } };
    const before = await readFile(file);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    near(dry.change.volume, volumeAt(1), .001);
    assert.deepEqual(await readFile(file), before);
    const staged = await call('proposals', { action: 'propose', title: 'Sweep the exact paired duct', ops: [op] });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    if (reviewBaseline) {
      const pending = await readFile(file);
      const { proposals: [proposal] } = await call('proposals', { action: 'list' });
      assert.equal(proposal.id, 'P1');
      assert.match(proposal.modelReviewRevision, /^[a-f\d]{64}$/);
      const result = await call('query', { action: 'render', proposal: 'P1', expectedRevision,
        expectedProposalRevision: proposal.modelReviewRevision }, true);
      assert.equal(result.code, 'MODEL_REVIEW_REPLAY_FAILED');
      assert.deepEqual(await readFile(file), pending);
      f.report.observations.push({ label: 'paired-duct-image-review-unavailable', result });
    }
    if (review) {
      const pending = await readFile(file);
      const result = await reviewPendingPairedDuct(f, call, request, expectedRevision, rail.revision, expected, sideTags, { tail, spaced, sameTurn, oppositeArcs, arcAndLine });
      assert.deepEqual(await readFile(file), pending);
      return result;
    }
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  await f.freshOpen(file, pending, '09-agent-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('10-agent-preview');
  if (reviewBaseline) return;
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('11-agent-approved')).doc;
  assert.equal((await verify('approved-native', approved, 1)).digest, expected.digest);
  if (reviewed) {
    const saved = await f.save('paired-duct-reviewed');
    const reopened = (await f.freshOpen(saved.file, approved, '12-approved-fresh-open')).doc;
    assert.equal((await verify('approved-reopened-native', reopened, 1)).digest, expected.digest);
    await withMcpSession(session, saved.file, 'paired-duct-approved', (call, request) => checkApprovedDuctReview(call, request, reviewed));
    await checkChangedDuctPath(session, pending, reviewed, path.controlPoints);
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
  await chooser.setFiles({ name: 'paired-duct-source.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const source = baseline ? undefined : await f.save('paired-duct-source');
  if (reviewBaseline) {
    await approveWithAgent(source);
    return;
  }
  f.phase = 'Apply the paired duct Sweep';
  await button('Sketch 1', browser()).click();
  await button(railName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await hud().locator('.hud-step').getByText(representation, { exact: true }).waitFor();
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    assert.match(await hud().innerText(), /centered rectangular opening/);
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(seed);
    f.report.observations.push({ label: 'original-refusal', text: await hud().innerText() });
    await f.snapshot('01-refused');
    return;
  }
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('01-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const part = await f.doc();
  assert.deepEqual([part.nodes[1].kind, part.nodes[1].mode, part.nodes[1].path], ['sweep-curve', 'exact', path]);
  const original = await verify('applied-native', part, 1);
  await showEnd(ends[0].direction, '02-inlet');
  await showEnd(ends[1].direction, '03-outlet', 1);
  await inspectJoints(original.joints);

  f.phase = 'Refuse invalid passage edits';
  await openFirstPassage();
  await coordinate(1, 'X').fill('-.75');
  await coordinate(3, 'X').fill('1.25');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/center both openings across the radial width/i);
  await f.same(part);
  await f.snapshot('04-eccentric-passage-refused');
  await f.dismissToasts();
  await coordinate(1, 'X').fill('-1');
  await coordinate(3, 'X').fill('1');
  await coordinate(2, 'Y').fill('1');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/axial web|touch|intersect/i);
  await f.same(part);
  await f.snapshot('04-touching-passages-refused');
  await f.dismissToasts();
  f.phase = 'Narrow the first passage';
  await coordinate(1, 'Y').fill('-2.5');
  await coordinate(2, 'Y').fill('-1.5');
  const edited = (await f.finishSketch('04-narrower-first-passage')).doc;
  assert.deepEqual(edited.nodes[0].holes[0].map(segment => segment.start), [[-1, -2.5], [-1, -1.5], [1, -1.5], [1, -2.5]]);
  assert.deepEqual(edited.nodes[0].holes[1], part.nodes[0].holes[1]);
  assert.deepEqual(edited.nodes[0].sideTags, sideTags);
  assert.deepEqual(edited.nodes[1], part.nodes[1]);
  const narrower = await verify('edited-native', edited, .5);
  assert.deepEqual(narrower.wallNames, original.wallNames);
  assert.deepEqual(narrower.joints.map(joint => joint.edgeId), original.joints.map(joint => joint.edgeId));

  await f.undo();
  await f.same(part);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('exact-line-arc-paired-duct');
  const reopened = (await f.freshOpen(saved.file, edited, '05-fresh-open')).doc;
  assert.equal((await verify('reopened-native', reopened, .5)).digest, narrower.digest);
  await showEnd(ends[0].direction, '06-reopened-inlet');
  await showEnd(ends[1].direction, '07-reopened-outlet', 1);
  await openFirstPassage();
  await coordinate(1, 'Y').fill('-3');
  await coordinate(2, 'Y').fill('-1');
  const restored = (await f.finishSketch('08-restored-first-passage')).doc;
  assert.equal((await verify('restored-native', restored, 1)).digest, original.digest);
  f.phase = 'Stage and approve the local Agent proposal';
  await approveWithAgent(source, original);
});
