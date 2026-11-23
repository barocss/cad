import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const railName = 'Paired duct rail';
const path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1],
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
const f = await createFlow({
  name: 'exact-line-arc-paired-duct', output: process.argv[2], envFrozen: 'D1782_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep two rectangular passages along a straight rail into a tangent arc.',
  limits: ['A bend-aligned 4 × 10 mm rectangle, two axial lanes centered at ±2 mm, a 10 mm straight span and an R20 quarter arc. Desktop WebGPU.'],
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
      return { side: faces.get(loops.get(twin.loop).face).name, bound: !!use.pcurve && !!twin.pcurve,
        reciprocal: twin.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
        degree: edge.curve.degree, points: edge.curve.controlPoints };
    }) };
  }),
}));
const joints = brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[0]) < 1e-7)).map(edge => ({
  ...measureBrepEdgeContinuity(brep, edge.id, { curvature: true }),
  bound: brep.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve),
}));
console.log(JSON.stringify({ source: brep.source, check: checkBrep(brep, { strict: true }), caps, joints,
  wallNames: brep.faces.filter(face => face.name.includes('.side[')).map(face => face.name),
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
const pathLength = 10 + 10 * Math.PI;
const volumeAt = halfHeight => (36 - 4 * halfHeight) * pathLength;

async function verify(label, doc, firstHalfHeight) {
  const native = await f.inspect(label, doc);
  assert.deepEqual(native.source, { family: 'sweep-curve', id: 'n1' });
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 });
  assert.equal(native.check.topology[0].genus, 2);
  assert.ok(native.check.maximumPcurveGap < 1e-8);
  assert.equal(native.wallNames.length, 24);
  assert.equal(native.caps.length, 2);
  for (const cap of native.caps) {
    const start = cap.name === 'n1.start';
    const axis = start ? 0 : 1;
    assert.equal(cap.plane.kind, 'plane');
    near(cap.plane.o[axis], start ? -10 : 20);
    near(cap.plane.n[axis], start ? -1 : 1);
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
        if (!start) assert.ok(edge.bound, 'The bend cap and its adjacent wall need native charts');
        return edge.points;
      });
      const transverse = points.map(point => point[1 - axis] - (start ? 0 : 20));
      const height = points.map(point => point[2]);
      near(Math.min(...transverse), -radial);
      near(Math.max(...transverse), radial);
      near(Math.min(...height), center - axial);
      near(Math.max(...height), center + axial);
      for (const point of points) near(point[axis], start ? -10 : 20);
    }
  }
  assert.equal(native.joints.length, 12);
  for (const joint of native.joints) {
    assert.equal(joint.status, 'measured');
    assert.equal(joint.curvature.status, 'measured');
    assert.ok(joint.bound);
    near(joint.maximumAngleDegrees, 0, 1e-5);
  }
  const area = 36 - 4 * firstHalfHeight;
  const radialVariance = (40 * 4 ** 2 - (40 - area) * 2 ** 2) / (12 * area);
  const bendCentroidX = 2 * (20 + radialVariance / 20) / Math.PI;
  const expectedCentroid = [
    (10 * Math.PI * bendCentroidX - 50) / pathLength,
    10 * Math.PI * (20 - bendCentroidX) / pathLength,
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
    joins: native.joints.map(joint => joint.edgeId) });
  return native;
}

async function showEnd(direction, label) {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: direction, exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(name => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === name;
  }, direction.toUpperCase());
  const inlet = direction === 'Left';
  const center = inlet ? [-10, 0] : [20, 20];
  const axis = inlet ? 0 : 1;
  const sign = inlet ? -1 : 1;
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
  for (const joint of joints) {
    await options.selectOption(joint.edgeId);
    await button('Measure continuity', panel).click();
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot('04-native-joins');
}

async function openFirstPassage() {
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
}

async function approveWithAgent(source, expected) {
  const file = join(f.output, 'paired-duct-agent-proposal.bcad');
  await copyFile(source.file, file);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'paired-duct-proposal', async call => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /line–arc ducts accept two rectangular openings/);
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
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('11-agent-approved')).doc;
  assert.equal((await verify('approved-native', approved, 1)).digest, expected.digest);
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
  f.phase = 'Apply the paired duct Sweep';
  await button('Sketch 1', browser()).click();
  await button(railName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await hud().locator('.hud-step').getByText('Exact line and arc', { exact: true }).waitFor();
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
  await showEnd('Left', '02-inlet');
  await showEnd('Back', '03-outlet');
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
  await showEnd('Left', '06-reopened-inlet');
  await showEnd('Back', '07-reopened-outlet');
  await openFirstPassage();
  await coordinate(1, 'Y').fill('-3');
  await coordinate(2, 'Y').fill('-1');
  const restored = (await f.finishSketch('08-restored-first-passage')).doc;
  assert.equal((await verify('restored-native', restored, 1)).digest, original.digest);
  f.phase = 'Stage and approve the local Agent proposal';
  await approveWithAgent(source, original);
});
