import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const spacedOpposite = process.argv.includes('--spaced-opposite');
const spaced = spacedOpposite || process.argv.includes('--spaced');
const sameTurn = !spacedOpposite && (spaced || process.argv.includes('--same-turn'));
const run = spaced ? 8 : 0;
const endX = sameTurn ? -6 : 30;
const endY = 30 + run;
const bendName = spacedOpposite ? 'spaced S-bend' : spaced ? 'spaced same-turn bend' : sameTurn ? 'same-turn bend' : 'S-bend';
const first = [[0, 0, 0], [12, 0, 0], [12, 12, 0]];
const second = [[12, 12 + run, 0], [12, endY, 0], [endX, endY, 0]];
const knot = [0, 0, 0, 1, 1, 1];
const weights = [1, Math.SQRT1_2, 1];
const path = spaced ? { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1], controlPoints: [...first, [12, 16, 0], ...second] }
  : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1], controlPoints: [...first, ...second.slice(1)] };
const joinedRail = `@curve #joined { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
  control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; }`;
const arc = (id, points) => `@curve #${id} { type:nurbs; degree:2; knots:${JSON.stringify(knot)};
  control-points:${JSON.stringify(points)}; weights:${JSON.stringify(weights)}; }`;
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } }], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm; ${spaced ? joinedRail : arc('first', first) + ' ' + arc('second', second)} }` },
    objects: spaced ? [{ id: 'joined', name: 'Joined curve', source: 'rail', geometry: 'joined' }] : [
      { id: 'first', name: 'First arc', source: 'rail', geometry: 'first' },
      { id: 'second', name: 'Second arc', source: 'rail', geometry: 'second' },
    ] },
};
const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad-model/src/engine/errors.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'apps/cad-studio/src/ui/SweepHistoryInputs.tsx'];
const baseline = process.argv.includes('--expect-refused');
const f = await createFlow({
  name: spaced ? 'exact-rectangular-arc-line-arc-sweep' : 'exact-rectangular-two-arc-sweep', output: process.argv[2],
  envFrozen: spacedOpposite ? 'D1736_SOURCE_FROZEN' : spaced ? 'D1732_SOURCE_FROZEN' : sameTurn ? 'D1709_SOURCE_FROZEN' : 'D1703_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Sweep an aligned solid rectangle along the exact ${bendName}.`,
  limits: [`Two 90° arcs with radii 12 and 18 mm${spaced ? ', an 8 mm straight span' : ''} and one bend-aligned rectangle in desktop Studio.`],
  ...(!baseline && { inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  massPropertiesOf, measureBrepEdgeContinuity, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const points = [0, .2, .5, .8, 1], at = ([lo, hi], t) => lo + (hi - lo) * t;
const sampled = curve => points.map(t => evaluateCurve(curve, at(curveDomain(curve), t)));
const faces = brep.faces.map(face => ({ name: face.name, support: faceGeometry(face), surface: face.surface, loops: face.loops }));
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const edgeById = new Map(brep.edges.map(edge => [edge.id, edge]));
const reciprocal = (a, b) => a && b && a.twin === b.id && b.twin === a.id && a.edge === b.edge && a.sense !== b.sense;
const caps = faces.filter(face => /^n1[.](start|end)$/.test(face.name)).map(face => ({
  name: face.name, support: face.support, boundary: face.loops.map(id => loops.get(id).coedges.map(id => {
    const use = uses.get(id), edge = edgeById.get(use.edge);
    return { degree: edge.curve.degree, pair: reciprocal(use, uses.get(use.twin)), points: sampled(edge.curve) };
  })),
}));
const walls = faces.filter(face => !caps.some(cap => cap.name === face.name)).map(({ name, support, surface }) => {
  const { u, v } = surfaceDomain(surface);
  return { name, support, points: points.flatMap(s => points.map(t => evaluateSurface(surface, at(u, s), at(v, t)))) };
});
const seams = ${JSON.stringify(spaced ? [12, 20] : [12])}.flatMap(station =>
  brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[1]-station) < 1e-7)).map(edge => {
  const [a, b] = brep.coedges.filter(use => use.edge === edge.id);
  return { station, degree: edge.curve.degree, pair: reciprocal(a, b), points: sampled(edge.curve),
    bindings: [a, b].map(use => !!use.pcurve),
    neighbors: [a, b].map(use => brep.faces.find(face => face.id === loops.get(use.loop).face).name),
    measurement: measureBrepEdgeContinuity(brep, edge.id, { curvature: true }) };
}));
const mass = massPropertiesOf(output), quadrature = brepMassProperties(brep, 1);
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source, caps, walls, seams,
  volume: mass.volume, quadrature: quadrature.volume, centroid: mass.centroid, quadratureCentroid: quadrature.centroid, digest: digestOf(brep) }));
` }),
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const railName = 'Joined curve';
const representation = spaced ? 'Exact arc–line–arc' : 'Exact two-arc path';
const widthInput = () => f.sketchPanel().getByLabel('Edge 1 length', { exact: true });
const volumeAt = width => width * 6 * (15 * Math.PI + run);
const spacedCentroid = width => {
  const first = 6 * Math.PI, second = 9 * Math.PI, length = first + run + second;
  const moment = radius => 2 * (radius + width ** 2 / (12 * radius)) / Math.PI;
  const a = moment(12), b = moment(18);
  return [(first * a + run * 12 + second * (endX + (sameTurn ? b : -b))) / length,
    (first * (12 - a) + run * (12 + run / 2) + second * (12 + run + b)) / length, 0];
};
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

function verifySection(points, axis, at, radial, halfWidth) {
  for (const point of points) {
    near(point[axis], at);
    const u = Math.abs(radial(point)), z = Math.abs(point[2]);
    assert.ok(u <= halfWidth + 1e-7 && z <= 3 + 1e-7);
    assert.ok(Math.abs(u - halfWidth) <= 1e-7 || Math.abs(z - 3) <= 1e-7);
  }
}

async function verify(label, doc, width) {
  const native = await f.inspect(label, doc), half = width / 2;
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.source, { family: 'sweep-curve', id: 'n1' });
  assert.deepEqual(native.check.counts, spaced
    ? { bodies: 1, shells: 1, faces: 14, loops: 14, coedges: 56, edges: 28, vertices: 16 }
    : { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(native.check.topology[0].genus, 0);
  assert.equal(native.caps.length, 2);
  for (const cap of native.caps) {
    const start = cap.name.endsWith('.start'), at = start ? 0 : endX;
    assert.equal(cap.support.kind, 'plane');
    near(cap.support.o[0], at);
    cap.support.n.forEach((value, i) => near(value, i === 0 ? (start || sameTurn ? -1 : 1) : 0));
    const [edges] = cap.boundary;
    assert.equal(cap.boundary.length, 1);
    assert.equal(edges.length, 4);
    for (const edge of edges) {
      assert.equal(edge.degree, 1);
      assert.ok(edge.pair);
      verifySection(edge.points, 0, at, point => point[1] - (start ? 0 : endY), half);
    }
  }
  for (const [name, cx, cy, radius] of [['first', 0, 12, 12], ['second', endX, 12 + run, 18]]) {
    const walls = native.walls.filter(wall => wall.name.startsWith(`n1.${name}.side[`));
    assert.equal(walls.length, 4);
    assert.deepEqual(walls.map(wall => wall.name).sort(), ['e1', 'e2', 'e3', 'e4'].map(id => `n1.${name}.side[${id}]`));
    const cylinders = walls.filter(wall => wall.support.kind === 'cylinder').sort((a, b) => a.support.r - b.support.r);
    const planes = walls.filter(wall => wall.support.kind === 'plane');
    assert.equal(cylinders.length, 2);
    assert.equal(planes.length, 2);
    cylinders.forEach(({ support, points }, i) => {
      const expected = radius + (i ? half : -half);
      near(support.r, expected);
      for (const [x, y, z] of points) {
        near(Math.hypot(x - cx, y - cy), expected);
        assert.ok(Math.abs(z) <= 3 + 1e-7);
      }
    });
    for (const plane of planes) for (const [, , z] of plane.points) near(Math.abs(z), 3);
  }
  if (spaced) {
    const walls = native.walls.filter(wall => wall.name.startsWith('n1.line.side['));
    assert.deepEqual(walls.map(wall => wall.name).sort(), ['e1', 'e2', 'e3', 'e4'].map(id => `n1.line.side[${id}]`));
    for (const wall of walls) {
      assert.equal(wall.support.kind, 'plane');
      for (const point of wall.points) {
        assert.ok(point[1] >= 12 - 1e-7 && point[1] <= 20 + 1e-7);
        verifySection([point], 1, point[1], pt => pt[0] - 12, half);
      }
    }
  }
  assert.equal(native.seams.length, spaced ? 8 : 4);
  for (const seam of native.seams) {
    assert.equal(seam.degree, 1);
    assert.ok(seam.pair);
    assert.deepEqual(seam.bindings, [true, true]);
    const neighbors = spaced ? seam.station === 12 ? ['first', 'line'] : ['line', 'second'] : ['first', 'second'];
    assert.deepEqual(seam.neighbors.map(name => name.split('.')[1]).sort(), neighbors);
    verifySection(seam.points, 1, seam.station, point => point[0] - 12, half);
    const result = seam.measurement;
    assert.equal(result.status, 'measured');
    near(result.maximumAngleDegrees, 0, 1e-5);
    assert.equal(result.curvature.status, 'measured');
    const [x] = seam.points[0];
    const axial = seam.points.every(point => Math.abs(point[0] - x) < 1e-7);
    const expected = !axial ? 0 : spaced ? 1 / Math.abs(x - (seam.station === 12 ? 0 : endX))
      : Math.abs(1 / x + (sameTurn ? -1 : 1) / Math.abs(endX - x));
    near(result.curvature.maximumDifference, expected);
  }
  near(native.volume, volumeAt(width));
  near(native.quadrature, volumeAt(width));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volumeAt(width));
  const centre = spaced ? spacedCentroid(width) : undefined;
  if (centre) for (const values of [native.centroid, native.quadratureCentroid, bodies[0].centroid])
    values.forEach((value, axis) => near(value, centre[axis]));
  f.report.observations.push({ label, width, volume: native.volume, quadrature: native.quadrature,
    digest: native.digest, gap: native.check.maximumPcurveGap, counts: native.check.counts, centre,
    maximumAngle: Math.max(...native.seams.map(seam => seam.measurement.maximumAngleDegrees)),
    curvatureJumps: native.seams.map(seam => seam.measurement.curvature.maximumDifference) });
  return native;
}

async function inspectJoints(native, label = '04-native-junction') {
  f.phase = 'Measure the native wall joins in Studio';
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sweep along ${railName}`, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const seam of native.seams) {
    await options.selectOption(seam.measurement.edgeId);
    await button('Measure continuity', panel).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
}

async function approveProposal(source, joined, rail, native, applied) {
  f.phase = 'Propose the same exact geometry and approve it in Studio';
  const file = join(f.output, 'rectangular-s-bend-proposal.bcad');
  await copyFile(source.file, file);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'rectangular-s-bend', async call => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, spaced ? /arc–line–arc path accepts .* rectangle aligned with the bend frame/
      : /Both two-arc paths accept .* rectangle aligned with the bend frame/);
    const summary = await call('query', { action: 'summary' });
    const saved = summary.direct_curves.find(curve => curve.id === rail.id);
    assert.ok(saved?.revision);
    const op = { tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: rail.id, pathRevision: saved.revision, representation: 'exact' } } };
    const before = await readFile(file);
    const stale = { ...op, args: { ...op.args, values: { ...op.args.values, pathRevision: '0'.repeat(64) } } };
    assert.match((await call('features', { action: 'batch', dryRun: true, ops: [stale] }, true)).error, /revision|changed/i);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volumeAt(4), .001);
    assert.deepEqual(await readFile(file), before);
    const result = await call('proposals', { action: 'propose', title: `Exact rectangular ${bendName}`, ops: [op] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [joined.nodes, joined.outputs]);
  await f.freshOpen(file, pending, '09-agent-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('10-agent-approved')).doc;
  assert.deepEqual([approved.nodes[1].mode, approved.nodes[1].path, approved.outputs], ['exact', path, applied.outputs]);
  assert.equal((await verify('agent-approved-native', approved, 4)).digest, native.digest);
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
  await chooser.setFiles({ name: 'rectangular-s-bend-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  if (!spaced) {
    f.phase = 'Join the two valid tangent arcs';
    await button('First arc', browser()).click();
    await button('Second arc', browser()).click({ modifiers: ['Shift'] });
    await button('Join', f.page).click();
    await f.changed(seed);
  }
  const { doc: joined } = await f.snapshot('01-joined-arcs');
  const rail = joined.direct.objects.find(object => object.name === railName);
  assert.ok(rail);
  const source = baseline ? undefined : await f.save('rectangular-s-bend-source');

  f.phase = `Request the Exact rectangular ${bendName}`;
  await button('Sketch 1', browser()).click();
  await button(railName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    const refusal = spaced ? 'The arc–line–arc Sweep needs a circular outer section'
      : sameTurn ? 'The same-turn Sweep needs a circular outer section' : 'The S-bend needs a circular outer section';
    await hud().getByText(refusal, { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(joined);
    f.report.observations.push({ label: 'baseline-exact-refused', text: await hud().innerText() });
    await f.snapshot('02-rectangle-refused');
    return;
  }
  await hud().locator('.hud-step').getByText(representation, { exact: true }).waitFor();
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('02-exact-preview');
  await button('Apply', hud()).click();
  await f.changed(joined);
  const applied = (await f.snapshot('03-exact-applied')).doc;
  assert.deepEqual([applied.nodes[1].kind, applied.nodes[1].mode, applied.nodes[1].path], ['sweep-curve', 'exact', path]);
  const native = await verify('applied-native', applied, 4);
  await inspectJoints(native);

  await f.openFeatureEditor(1, 'edit the rectangular section from Sweep History');
  await f.editor().getByText('Sketch 1 · 4 × 6 mm', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  assert.equal(await widthInput().inputValue(), '4');
  f.phase = 'Refuse axis contact and widen the original sketch';
  await widthInput().fill('24');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/The rectangle reaches the bend axis/);
  await f.same(applied);
  assert.equal(await widthInput().inputValue(), '24');
  await f.snapshot('05-axis-contact-refused');
  await widthInput().fill('8');
  const edited = (await f.finishSketch('06-wider-section')).doc;
  assert.equal(edited.nodes[0].profile, 'rectangle');
  const [left, bottom] = edited.nodes[0].min, [right, top] = edited.nodes[0].max;
  near(right - left, 8);
  near(top - bottom, 6);
  assert.deepEqual(edited.nodes[1], applied.nodes[1]);
  const larger = await verify('edited-native', edited, 8);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('rectangular-s-bend');
  const { doc: reopened } = await f.freshOpen(saved.file, edited, '07-fresh-open');
  const reopenedNative = await verify('reopened-native', reopened, 8);
  assert.equal(reopenedNative.digest, larger.digest);
  if (spaced) await inspectJoints(reopenedNative, '07-reopened-native-junctions');
  await f.openFeatureEditor(1);
  await f.editor().getByText('Sketch 1 · 8 × 6 mm', { exact: true }).waitFor();
  await f.snapshot('08-reopened-history');
  if (sameTurn || spacedOpposite) {
    f.phase = 'Edit the reopened rectangular section';
    await button('Edit sketch', f.editor()).click();
    await widthInput().fill('4');
    const restored = (await f.finishSketch('08-width-edited-after-open')).doc;
    assert.deepEqual(restored.nodes[1], applied.nodes[1]);
    assert.equal((await verify('width-edited-after-open', restored, 4)).digest, native.digest);
    await f.undo();
    await f.same(reopened);
    await f.redo();
    await f.same(restored);
  }
  await approveProposal(source, joined, rail, native, applied);
});
