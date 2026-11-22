import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { checkApprovedDuctReview, checkChangedDuctPath, reviewPendingDuct } from './duct-proposal-review-browser-steps.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const opposite = process.argv.includes('--opposite-arcs');
const baseline = process.argv.includes('--expect-refused');
const review = process.argv.includes('--review');
assert.ok(!review || (opposite && !baseline), 'Review needs an active opposite-arc duct flow.');
const railId = opposite ? 's-bend' : 'elbow';
const railName = opposite ? 'S-bend rail' : 'Elbow rail';
const ends = opposite ? [
  { direction: 'Left', center: [0, 0, 0], axis: 0, sign: -1 },
  { direction: 'Right', center: [30, 30, 0], axis: 0, sign: 1 },
] : [
  { direction: 'Left', center: [-10, 0, 0], axis: 0, sign: -1 },
  { direction: 'Back', center: [20, 34, 0], axis: 1, sign: 1 },
];
const path = opposite ? { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [30, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] } : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 27, 0], [20, 34, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1] };
const hole = [[-1, -2], [-1, 2], [1, 2], [1, -2]].map(start => ({ kind: 'line', start }));
const sideTags = { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8']] };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3], holes: [hole], sideTags }], outputs: {},
  direct: { sources: { rails: `@model rails { version:0; length-unit:mm;
    @curve #${railId} { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
      control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; } }` },
  objects: [{ id: railId, name: railName, source: 'rails', geometry: railId }] } };
const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/brep-glue.ts',
  'packages/barocss-cad/src/features/revolve.ts', 'packages/barocss-cad/src/brep/edge-continuity.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/engine/errors.ts',
  'apps/cad-studio/src/sketch/useSketchActions.ts', 'apps/cad-studio/src/ui/SketchPanel.tsx'];
if (review) pins.push('apps/cad-studio/test/duct-proposal-review-browser-steps.mjs',
  'packages/barocss-cad-model/src/chat/rectangularDuctProposalReview.ts',
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts', 'packages/barocss-cad-model/src/chat/part/views.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts');

const f = await createFlow({
  name: opposite ? 'exact-rectangular-s-bend-duct' : 'exact-rectangular-duct-sweep', output: process.argv[2],
  envFrozen: review ? 'D1705_SOURCE_FROZEN' : opposite ? 'D1704_SOURCE_FROZEN' : 'D1675_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a centered rectangular duct, inspect both openings and edit the aperture through Studio History.',
  limits: [`One bend-aligned 4 × 6 mm section with one centered rectangular opening, ${opposite ? 'R12/R18 mm quarter arcs' : 'R20 mm quarter elbow'}, desktop WebGPU and local L1 MCP.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf,
  measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const faces = new Map(brep.faces.map(face => [face.id, face]));
const capLoops = face => face.loops.map(id => {
  const loop = loops.get(id);
  return { kind: loop.kind, edges: loop.coedges.map(id => {
    const use = uses.get(id), twin = uses.get(use.twin), edge = edges.get(use.edge), [lo, hi] = curveDomain(edge.curve);
    return { degree: edge.curve.degree, adjacent: faces.get(loops.get(twin.loop).face).name,
      reciprocal: twin.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
      points: [0, .25, .5, .75, 1].map(fraction => evaluateCurve(edge.curve, lo + (hi - lo) * fraction)) };
  }) };
});
const caps = brep.faces.filter(face => /^n1[.](start|end)$/.test(face.name)).map(face =>
  ({ name: face.name, support: faceGeometry(face), loops: capLoops(face) }));
const bendFaces = brep.faces.filter(face => /${opposite ? '[.]first[.]|[.]second[.]' : '[.]bend[.]'}/.test(face.name));
const bend = bendFaces.map(face => faceGeometry(face));
const outer = bendFaces.filter(face => ${JSON.stringify(sideTags.outer)}.some(tag => face.name.endsWith('.side[' + tag + ']')))
  .map(face => [face.name, digestOf(face.surface)]);
const joins = ${JSON.stringify(opposite ? [[1, 12]] : [[0, 0], [1, 20]])}.map(([axis, at]) => brep.edges
  .filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-7))
  .map(edge => ({ ...measureBrepEdgeContinuity(brep, edge.id, { curvature: true }),
    x: edge.curve.controlPoints.map(point => point[0]),
    bound: brep.coedges.filter(use => use.edge === edge.id).map(use => !!use.pcurve) })));
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source,
  caps, bend, outer, joins, openedFaces: brep.faces.filter(face => face.loops.length === 2).map(face => face.name),
  volume: massPropertiesOf(output).volume, quadrature: brepMassProperties(brep, 1).volume,
  digest: digestOf(brep) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const coordinate = (i, axis) => f.sketchPanel().getByLabel(`Point ${i} ${axis}`, { exact: true });
const volumeAt = height => (24 - 2 * height) * (opposite ? 15 * Math.PI : 24 + 10 * Math.PI);
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function verify(label, doc, innerHeight) {
  const read = await f.inspect(label, doc);
  assert.ok(read.check.valid, read.check.issues.join('\n'));
  assert.deepEqual(read.source, { family: 'sweep-curve', id: 'n1' });
  assert.equal(read.check.topology[0].genus, 1);
  assert.deepEqual(read.check.counts, opposite
    ? { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 80, edges: 40, vertices: 24 }
    : { bodies: 1, shells: 1, faces: 26, loops: 28, coedges: 112, edges: 56, vertices: 32 });
  assert.deepEqual([...read.openedFaces].sort(), ['n1.end', 'n1.start']);
  assert.equal(read.caps.length, 2);
  for (const cap of read.caps) {
    const { center, axis, sign } = ends[cap.name === 'n1.start' ? 0 : 1];
    assert.equal(cap.support.kind, 'plane');
    near(cap.support.o[axis], center[axis]);
    cap.support.n.forEach((value, i) => near(value, i === axis ? sign : 0));
    assert.deepEqual(cap.loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of cap.loops) {
      const inner = loop.kind === 'inner', [radial, axial] = inner ? [1, innerHeight / 2] : [2, 3];
      assert.equal(loop.edges.length, 4);
      const tags = inner ? sideTags.holes[0] : sideTags.outer;
      assert.deepEqual(loop.edges.map(edge => edge.adjacent.match(/\[(e\d+)\]/)?.[1]).sort(), tags);
      for (const edge of loop.edges) {
        assert.equal(edge.degree, 1);
        assert.ok(edge.reciprocal);
        for (const point of edge.points) {
          near(point[axis], center[axis]);
          const u = Math.abs(point[1 - axis] - center[1 - axis]), v = Math.abs(point[2]);
          assert.ok(u <= radial + 1e-7 && v <= axial + 1e-7);
          assert.ok(Math.abs(u - radial) <= 1e-7 || Math.abs(v - axial) <= 1e-7);
        }
      }
    }
  }
  assert.equal(read.bend.filter(face => face.kind === 'plane').length, opposite ? 8 : 4);
  const cylinders = read.bend.filter(face => face.kind === 'cylinder').sort((a, b) => a.r - b.r);
  const radii = (opposite ? [12, 18] : [20]).flatMap(r => [[r - 2, -1], [r - 1, 1], [r + 1, -1], [r + 2, 1]]);
  assert.equal(cylinders.length, radii.length);
  radii.forEach(([radius, sense], i) => {
    near(cylinders[i].r, radius);
    assert.equal(cylinders[i].out, sense);
  });
  assert.deepEqual(read.joins.map(joint => joint.length), opposite ? [8] : [8, 8]);
  for (const joint of read.joins) {
    for (const edge of joint) {
      assert.equal(edge.status, 'measured');
      near(edge.maximumAngleDegrees, 0, 1e-5);
      assert.equal(edge.curvature.status, 'measured');
      if (opposite) {
        assert.deepEqual(edge.bound, [true, true]);
        const x = edge.x[0];
        const jumps = edge.x.every(value => Math.abs(value - x) < 1e-7) ? 1 / x + 1 / (30 - x) : 0;
        near(edge.curvature.maximumDifference, jumps);
      }
    }
    if (!opposite) {
      const jumps = joint.map(edge => edge.curvature.maximumDifference).sort((a, b) => a - b);
      [0, 0, 0, 0, 1 / 22, 1 / 21, 1 / 19, 1 / 18].forEach((expected, i) => near(jumps[i], expected));
    }
  }
  near(read.volume, volumeAt(innerHeight));
  near(read.quadrature, volumeAt(innerHeight));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volumeAt(innerHeight));
  f.report.observations.push({ label, innerHeight, volume: read.volume, quadrature: read.quadrature,
    counts: read.check.counts, gap: read.check.maximumPcurveGap, digest: read.digest,
    maximumAngle: Math.max(...read.joins.flat().map(edge => edge.maximumAngleDegrees)) });
  return read;
}

async function showOpening({ direction, center, axis, sign }, label) {
  await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
  await f.page.getByRole('menuitem', { name: direction, exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(name => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === name;
  }, direction.toUpperCase());
  const { opening, wall } = await f.page.evaluate(([center, material]) => ({
    opening: window.__studioSurfacePoint(center), wall: window.__studioSurfacePoint(material),
  }), [center, [center[0], center[1], 2.5]]);
  assert.ok(wall, 'The cap material must face this view');
  near(wall[axis], center[axis], 1e-4);
  assert.ok(!opening || sign * (center[axis] - opening[axis]) > .5, JSON.stringify({ opening, wall }));
  f.report.observations.push({ label, opening: opening ?? null, wall });
  await f.snapshot(label);
}

async function inspectJoints(native) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sweep along ${railName}`, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const angle = result.locator('[data-continuity-angle]');
  for (const [i, joint] of native.joins.entries()) {
    for (const edge of joint) {
      await options.selectOption(edge.edgeId);
      await button('Measure continuity', panel).click();
      await angle.waitFor();
      assert.equal(await angle.textContent(), '0°');
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
    await result.scrollIntoViewIfNeeded();
    await f.snapshot(`04-${i + 1}-duct-junction`);
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
  await chooser.setFiles({ name: 'rectangular-duct-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const savedSource = baseline ? undefined : await f.save('duct-source');

  f.phase = 'Create the Exact duct in Studio';
  await button('Sketch 1', browser()).click();
  await button(railName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    await hud().getByText('The rectangular S-bend needs a solid section', { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(seed);
    f.report.observations.push({ label: 'baseline-opening-refused', text: await hud().innerText() });
    await f.snapshot('01-centered-opening-refused');
    return;
  }
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('01-duct-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const part = await f.doc();
  assert.deepEqual([part.nodes[1].kind, part.nodes[1].mode, part.nodes[1].path], ['sweep-curve', 'exact', path]);
  const native = await verify('applied-native', part, 4);
  f.phase = 'View both open ends and measure their junctions';
  await showOpening(ends[0], '02-inlet-opening');
  await showOpening(ends[1], '03-outlet-opening');
  await inspectJoints(native);

  await f.openFeatureEditor(1, 'edit the duct aperture from Sweep History');
  await f.editor().getByText('Sketch 1 · 4 × 6 mm', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
  assert.equal(await coordinate(1, 'X').inputValue(), '-1');
  assert.equal(await coordinate(2, 'Y').inputValue(), '2');
  f.phase = 'Reject an eccentric opening without changing the part';
  await coordinate(1, 'X').fill('-.75');
  await coordinate(3, 'X').fill('1.25');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/This Sweep needs a centered rectangular opening/);
  await f.same(part);
  await f.snapshot('05-eccentric-opening-refused');
  await coordinate(1, 'X').fill('-1');
  await coordinate(3, 'X').fill('1');
  await coordinate(1, 'Y').fill('-1');
  await coordinate(2, 'Y').fill('1');
  const edited = (await f.finishSketch('06-narrower-aperture')).doc;
  assert.deepEqual(edited.nodes[0].holes[0].map(segment => segment.start), [[-1,-1],[-1,1],[1,1],[1,-1]]);
  assert.deepEqual(edited.nodes[0].sideTags, sideTags);
  assert.deepEqual(edited.nodes[1], part.nodes[1]);
  const after = await verify('edited-native', edited, 2);
  if (opposite) {
    assert.equal(native.outer.length, 8);
    assert.deepEqual(after.outer, native.outer);
  }
  await f.undo();
  await f.same(part);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('exact-rectangular-duct');
  const reopened = (await f.freshOpen(saved.file, edited, '07-fresh-open')).doc;
  assert.equal((await verify('reopened-native', reopened, 2)).digest, after.digest);
  if (opposite) {
    await showOpening(ends[0], '07-reopened-inlet');
    await showOpening(ends[1], '07-reopened-outlet');
  }
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
  assert.equal(await coordinate(1, 'Y').inputValue(), '-1');
  assert.equal(await coordinate(2, 'Y').inputValue(), '1');
  await f.snapshot('08-reopened-aperture-edit');

  f.phase = 'Approve a revision-bound local duct proposal';
  const file = join(f.output, 'duct-proposal.bcad');
  await copyFile(savedSource.file, file);
  const session = { app: f.app, output: f.output, clientName: f.name };
  const reviewed = await withMcpSession(session, file, 'rectangular-duct', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /one centered rectangular opening/);
    const summary = await call('query', { action: 'summary' });
    const rail = summary.direct_curves.find(candidate => candidate.id === railId);
    assert.ok(rail?.revision);
    const op = { tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: rail.id, pathRevision: rail.revision, representation: 'exact' } } };
    const before = await readFile(file);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volumeAt(4), .001);
    assert.deepEqual(await readFile(file), before);
    const result = await call('proposals', { action: 'propose', title: 'Exact rectangular duct', ops: [op] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
    if (!review) return;
    const twin = await call('proposals', { action: 'propose', title: 'Same duct in a second proposal', ops: [op] });
    assert.deepEqual([twin.proposal, twin.applied], ['P2', false]);
    const staged = await readFile(file);
    f.phase = 'Review the pending duct and both native caps before Studio approval';
    const evidence = await reviewPendingDuct(f, call, request, expectedRevision, op.args.values);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*Studio/i);
    assert.deepEqual(await readFile(file), staged);
    return evidence;
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  if (reviewed) await checkChangedDuctPath(session, pending, reviewed, path.controlPoints);
  await f.freshOpen(file, pending, '09-duct-proposal-open');
  await button('Chat').first().click();
  await button('Preview', card('P1')).click();
  await button('Hide', card('P1')).waitFor();
  await f.same(pending);
  if (reviewed) await f.snapshot('09-duct-preview-before-approval');
  await button('Accept', card('P1')).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('10-duct-proposal-approved')).doc;
  assert.deepEqual([approved.nodes[1].mode, approved.nodes[1].path, approved.outputs], ['exact', path, part.outputs]);
  assert.equal((await verify('approved-native', approved, 4)).digest, native.digest);
  if (reviewed) {
    assert.equal(approved.proposals[0].status, 'accepted');
    const approval = approved.history.at(-1);
    assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
    assert.equal(native.digest, reviewed.meta.candidate.bodySha256);
    await f.undo();
    await f.same(pending);
    await f.redo();
    await f.same(approved);
    const saved = await f.save('reviewed-rectangular-duct');
    await f.freshOpen(saved.file, approved, '11-reviewed-duct-fresh-open');
    assert.equal((await verify('approved-draft-reopened', await f.doc(), 4)).digest, native.digest);
    await withMcpSession(session, saved.file, 'reviewed-duct-reopened', async (call, request) => {
      const bytes = await readFile(saved.file);
      await checkApprovedDuctReview(call, request, reviewed);
      assert.deepEqual(await readFile(saved.file), bytes);
    });
  }
});
