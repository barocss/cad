import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { checkSavedOutletDrag } from './paired-elbow-outlet-handle-browser-steps.mjs';
import { checkChangedOutletRail, checkReopenedOutlet, reviewPendingOutlet } from './paired-elbow-outlet-review-browser-steps.mjs';

const arcFirst = process.argv.includes('--arc-first');
const baseline = process.argv.includes('--expect-refused');
const reviewUnavailable = process.argv.includes('--expect-review-unavailable');
const reviewOutlet = process.argv.includes('--review-outlet');
const expectMissingHandle = process.argv.includes('--expect-history-handle-absent');
const historyHandle = process.argv.includes('--history-handle');
const path = arcFirst ? {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[20, 20, 0], [20, 0, 0], [0, 0, 0], [-5, 0, 0], [-10, 0, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1],
} : {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 27, 0], [20, 34, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1],
};
const axis = arcFirst ? 0 : 1, sign = arcFirst ? -1 : 1;
const tailLength = arcFirst ? 10 : 14;
const outlet = path.controlPoints.at(-1);
const straightPiece = arcFirst ? 'line' : 'tail';
const junctionPlanes = arcFirst ? [[0, 0]] : [[0, 0], [1, 20]];
const hole = center => [[-1, center - 1], [-1, center + 1], [1, center + 1], [1, center - 1]]
  .map(start => ({ kind: 'line', start }));
const sideTags = { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] };
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5], holes: [hole(-2), hole(2)], sideTags },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Paired duct rail', path, mode: 'exact' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const retainedRail = process.env.D1790_RETAINED_RAIL;
if (retainedRail) {
  const railDoc = JSON.parse(await readFile(retainedRail, 'utf8'));
  assert.deepEqual([railDoc.nodes, railDoc.outputs], [source.nodes, source.outputs]);
  assert.equal(railDoc.direct.objects.length, 1);
  source.direct = railDoc.direct;
}
const pins = [
  'apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs',
  'packages/barocss-cad/package.json',
  'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/part/views.ts',
  'apps/cad-studio/test/paired-elbow-outlet-review-browser-steps.mjs',
  'apps/cad-studio/test/paired-elbow-outlet-handle-browser-steps.mjs',
  ...(historyHandle || arcFirst ? ['packages/barocss-cad-model/src/app/pairedElbowOutletOffsetHandle.ts'] : []),
  ...(reviewOutlet ? [
    'apps/cad-studio/test/duct-proposal-review-browser-steps.mjs',
    'packages/barocss-cad-model/src/chat/pairedElbowOutletOffsetEvidence.ts',
    'packages/barocss-cad-model/src/chat/pairedElbowOutletProposalReview.ts',
    'packages/barocss-cad-model/src/chat/pairedLineArcDuctEvidence.ts',
  ] : []),
];
const f = await createFlow({
  name: 'offset-paired-elbow-outlet', output: process.argv[2], envFrozen: arcFirst ? (reviewOutlet || reviewUnavailable ? 'D1806_SOURCE_FROZEN' : 'D1805_SOURCE_FROZEN') : 'D1788_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Move the original straight outlet cap of a paired rectangular Exact Sweep.',
  limits: [arcFirst ? 'Two 2 × 2 mm through passages on an R20 bend and a 10 mm straight tail. Desktop Studio WebGPU.'
    : 'Two 2 × 2 mm through passages on a 10 mm straight lead, R20 bend, and a 14 mm straight tail. Desktop Studio WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry, measureBrepEdgeContinuity } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const evaluated = evaluateDoc(doc, 0);
const ends = brep.faces.filter(face => /^n1[.](start|end)$/.test(face.name)).map(face => ({
  name: face.name, plane: faceGeometry(face), loops: face.loops.map(id => {
    const loop = brep.loops.find(loop => loop.id === id);
    return { kind: loop.kind, edges: loop.coedges.map(id => {
      const use = brep.coedges.find(use => use.id === id), twin = brep.coedges.find(candidate => candidate.id === use.twin);
      const other = brep.loops.find(loop => loop.id === twin.loop);
      const edge = brep.edges.find(edge => edge.id === use.edge);
      return { id: edge.id, wall: brep.faces.find(face => face.id === other.face).name,
        bound: !!use.pcurve && !!twin.pcurve, points: edge.curve.controlPoints };
    }) };
  }),
}));
const joins = ${JSON.stringify(junctionPlanes)}.flatMap(([axis, at]) => brep.edges.filter(edge =>
  edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-7)).map(edge => ({
    continuity: measureBrepEdgeContinuity(brep, edge.id, { curvature: true }),
    charts: brep.coedges.filter(use => use.edge === edge.id).map(use => use.pcurve),
  })));
const incidence = { faces: brep.faces.map(({ id, name, loops, sense }) => [id, name, loops, sense]),
  edges: brep.edges.map(({ id, name, vertices }) => [id, name, vertices]),
  coedges: brep.coedges.map(({ id, edge, loop, sense, twin }) => [id, edge, loop, sense, twin]),
  loops: brep.loops, shells: brep.shells, bodies: brep.bodies };
const fixedSurfaces = brep.faces.filter(face => face.name !== 'n1.end' && !face.name.startsWith('n1.${straightPiece}.'));
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  mesh: evaluated.ok && evaluated.bodies[0].mesh.faces.map(({ name, index }) => [name, index]),
  digest: digestOf(brep), ends, joins, incidence, fixedSurfaces, vertices: brep.vertices }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const phase = (panel, value) => panel.locator('.status').filter({ hasText: new RegExp('^' + value + '$') }).waitFor();
const cap = 'n1.end';
const distanceField = panel => panel.getByLabel('Offset', { exact: true });
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-7, JSON.stringify({ actual, expected }));
const initialVolume = 32 * ((arcFirst ? 10 : 24) + 10 * Math.PI);
const shiftedOutlet = (point, distance) => point.map((value, coordinate) => value + (coordinate === axis ? sign * distance : 0));

async function verify(label, doc, distance, original) {
  const result = await f.inspect(label, doc);
  assert.ok(result.check.valid, result.check.issues.join('\n'));
  assert.equal(result.check.topology[0].genus, 2);
  assert.deepEqual(result.check.counts, arcFirst
    ? { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 }
    : { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 });
  assert.ok(result.check.maximumPcurveGap < 1e-8);
  assert.deepEqual(result.incidence, original.incidence);
  assert.deepEqual(result.fixedSurfaces, original.fixedSurfaces);
  assert.deepEqual(result.joins, original.joins);
  assert.equal(result.joins.length, 12 * junctionPlanes.length);
  assert.ok(result.joins.every(join => join.continuity.status === 'measured'
    && Math.abs(join.continuity.maximumAngleDegrees) < 1e-6 && join.charts.every(Boolean)));
  assert.deepEqual(result.ends.find(end => end.name === 'n1.start'), original.ends.find(end => end.name === 'n1.start'));
  const oldCap = original.ends.find(end => end.name === cap), movedCap = result.ends.find(end => end.name === cap);
  assert.equal(movedCap.plane.kind, 'plane');
  closeTo(movedCap.plane.o[axis], outlet[axis] + sign * distance);
  assert.deepEqual(movedCap.plane.n, oldCap.plane.n);
  assert.deepEqual(movedCap.loops.map(loop => loop.kind).sort(), ['inner', 'inner', 'outer']);
  for (const [index, loop] of movedCap.loops.entries()) {
    assert.equal(loop.edges.length, 4);
    const old = oldCap.loops[index];
    for (const [edgeIndex, edge] of loop.edges.entries()) {
      const prior = old.edges[edgeIndex];
      assert.deepEqual([edge.id, edge.wall, edge.bound], [prior.id, prior.wall, true]);
      edge.points.forEach((point, i) => shiftedOutlet(prior.points[i], distance).forEach((value, coordinate) => closeTo(point[coordinate], value)));
    }
  }
  assert.equal(result.vertices.length, original.vertices.length);
  for (const [index, vertex] of result.vertices.entries()) {
    const prior = original.vertices[index];
    assert.equal(vertex.id, prior.id);
    const move = Math.abs(prior.point[axis] - outlet[axis]) < 1e-7;
    shiftedOutlet(prior.point, move ? distance : 0).forEach((value, coordinate) => closeTo(vertex.point[coordinate], value));
  }
  const expectedVolume = initialVolume + 32 * distance;
  const expectedCentroid = original.mass.centroid.map((value, axis) =>
    (value * initialVolume + shiftedOutlet(outlet, distance / 2)[axis] * 32 * distance) / expectedVolume);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  for (const props of [result.mass, bodies[0]]) {
    closeTo(props.volume, expectedVolume);
    props.centroid.forEach((value, axis) => closeTo(value, expectedCentroid[axis]));
  }
  f.report.observations.push({ label, distance, ...(arcFirst ? { capX: movedCap.plane.o[0] } : { capY: movedCap.plane.o[1] }), volume: result.mass.volume,
    centroid: result.mass.centroid, digest: result.digest, chartGap: result.check.maximumPcurveGap });
  return result;
}

async function approveWithAgent(savedSource, original, expected) {
  const file = join(f.output, 'paired-elbow-outlet-agent-proposal.bcad');
  await copyFile(savedSource.file, file);
  const session = { app: f.app, output: f.output, clientName: f.name };
  const reviewed = await withMcpSession(session, file, 'outlet-offset', async (call, request) => {
    const expectedRevision = await currentPartRevision(call), before = await readFile(file);
    const description = await call('describe', { command: 'offset-face' });
    assert.match(description.selection, /original straight outlet/);
    const op = { tool: 'features', args: { action: 'command', command: 'offset-face', faces: [cap], values: { d: -4 }, expectedRevision } };
    const refusal = await call('features', { action: 'batch', dryRun: true, ops: [{ ...op, args: { ...op.args, values: { d: -tailLength } } }] }, true);
    assert.match(JSON.stringify(refusal), /straight outlet|tail|collaps/i);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.ok(dry.dryRun);
    assert.deepEqual(await readFile(file), before);
    const staged = await call('proposals', { action: 'propose', title: 'Move the paired outlet inward by 4 mm', ops: [op] });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    if (reviewUnavailable) {
      const { proposals: [pending] } = await call('proposals', { action: 'list' });
      assert.equal(pending.modelReviewRevision, undefined);
      const beforeReview = await readFile(file);
      const refusal = await call('query', { action: 'render', proposal: 'P1', expectedRevision,
        expectedProposalRevision: pending.proposalRevision }, true);
      assert.equal(refusal.code, 'MODEL_REVIEW_UNAVAILABLE');
      assert.deepEqual(await readFile(file), beforeReview);
      f.report.observations.push({ label: 'pending-outlet-image-refused', code: refusal.code });
    }
    if (reviewOutlet) return reviewPendingOutlet(f, file, call, request, expectedRevision, retainedRail, arcFirst);
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs, pending.direct], [source.nodes, source.outputs, source.direct]);
  if (reviewed && retainedRail) await checkChangedOutletRail(session, pending, reviewed, path.controlPoints);
  await f.freshOpen(file, pending, '08-agent-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('09-agent-preview');
  if (reviewUnavailable) return;
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('10-agent-approved')).doc;
  assert.deepEqual(approved.direct, pending.direct);
  const result = await verify('approved-native', approved, -4, original);
  assert.equal(result.digest, expected?.digest ?? reviewed.meta.candidate.bodySha256);
  if (reviewOutlet) {
    const reopened = await checkReopenedOutlet(f, session, approved, reviewed);
    assert.equal((await verify('review-reopened-native', reopened, -4, original)).digest, result.digest);
  }
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
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
  await chooser.setFiles({ name: 'paired-elbow.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  const original = await f.inspect('original-native', source);
  assert.ok(original.check.valid, original.check.issues.join('\n'));
  const savedSource = baseline ? undefined : await f.save('paired-elbow-source');
  if (reviewUnavailable || reviewOutlet) return approveWithAgent(savedSource, original);

  f.phase = 'Pick the original outlet cap in Studio';
  await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
  await f.page.getByRole('menuitem', { name: arcFirst ? 'Left' : 'Back', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(label => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === label;
  }, arcFirst ? 'LEFT' : 'BACK');
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [...outlet.slice(0, 2), retainedRail ? 4 : 0]);
  assert.ok(pixel && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  const capIndex = original.mesh.find(([name]) => name === cap)?.[1];
  assert.ok(Number.isInteger(capIndex));
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.length === 1
    && window.__studioSelection.selection.faces[0].face === index, capIndex);

  f.phase = 'Open Offset face on the original outlet';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  if (baseline) {
    await phase(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    f.report.observations.push({ label: 'outlet-offset-refused', text: await panel.innerText(), capIndex });
    await f.snapshot('01-original-outlet-offset-refused');
    return;
  }
  await phase(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), 0);
  await distanceField(panel).fill('4');
  await phase(panel, 'preview');
  await f.same(source);
  await f.snapshot('01-outward-preview');
  await button('Apply', panel).click();
  await f.changed(source);
  const outward = (await f.snapshot('02-outward-applied')).doc;
  const node = outward.nodes[2];
  assert.deepEqual(outward.nodes.slice(0, 2), source.nodes);
  assert.deepEqual([node.kind, node.parent, node.faces, node.distance], ['offset-face', { node: 1, side: 'solid' }, [cap], 4]);
  assert.ok(node.sigs[cap]);
  await verify('outward-native', outward, 4, original);

  await f.openFeatureEditor(2, 'open the outlet offset in History');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await edit.getByLabel('Mode', { exact: true }).count(), 0);
  assert.equal(await distanceField(edit).inputValue(), '4');
  const undoLabel = await button('Undo').getAttribute('data-tip');
  await distanceField(edit).fill(String(-tailLength));
  await phase(edit, 'refused');
  assert.ok(await button('Apply', edit).isDisabled());
  const error = edit.locator('.hud-error');
  const details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /straight outlet|tail|collaps/i);
  assert.equal(await button('Undo').getAttribute('data-tip'), undoLabel);
  await f.same(outward);
  await f.snapshot('03-collapse-refused');
  await distanceField(edit).fill('-4');
  await phase(edit, 'preview');
  await button('Apply', edit).click();
  await f.changed(outward);
  const inward = (await f.snapshot('04-inward-applied')).doc;
  assert.deepEqual(inward.nodes, [...source.nodes, { ...node, distance: -4 }]);
  const native = await verify('inward-native', inward, -4, original);

  await f.undo();
  await f.same(outward);
  await f.redo();
  await f.same(inward);
  const saved = await f.save('paired-elbow-outlet-offset');
  const reopened = (await f.freshOpen(saved.file, inward, '05-fresh-open')).doc;
  assert.equal((await verify('reopened-native', reopened, -4, original)).digest, native.digest);
  if (expectMissingHandle || historyHandle || arcFirst) {
    await checkSavedOutletDrag(f, reopened, (label, doc, distance) => verify(label, doc, distance, original),
      expectMissingHandle, distance => shiftedOutlet(outlet, distance));
    if (!arcFirst) return;
  }
  if (arcFirst) return approveWithAgent(savedSource, original, native);
  await f.openFeatureEditor(2, 'reopened outlet offset');
  await button('Edit offset', f.editor()).click();
  const reopenedEdit = hud('Edit Offset face');
  assert.equal(await distanceField(reopenedEdit).inputValue(), '-4');
  await button('Cancel', reopenedEdit).click();
  await f.same(reopened);
  await f.snapshot('06-reopened-offset-edit');
  await approveWithAgent(savedSource, original, native);
});
