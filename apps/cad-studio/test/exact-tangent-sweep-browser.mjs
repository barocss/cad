import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const turnWeight = Math.SQRT1_2, straightLength = 10, bendRadius = 20;
const line = [[-10, 0, 0], [-5, 0, 0], [0, 0, 0]], bend = [[0, 0, 0], [20, 0, 0], [20, 20, 0]];
const kink = [[...line[0]], [...line[1]], [0, 0, 0], [0, 20, 0], [-20, 20, 0]];
const clamp = [0, 0, 0, 1, 1, 1], joinedKnots = [0, 0, 0, 1, 1, 2, 2, 2];
const joinedPath = { degree: 2, knots: joinedKnots, controlPoints: [...line, ...bend.slice(1)],
  weights: [1, 1, 1, turnWeight, 1] };
const mark = (id, knots, points, weights) => `@curve #${id} { type:nurbs; degree:2; knots:${JSON.stringify(knots)};
  control-points:${JSON.stringify(points)}; weights:${JSON.stringify(weights)}; }`;
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 }], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm;
    ${mark('line', clamp, line, [1, 1, 1])}
    ${mark('bend', clamp, bend, [1, turnWeight, 1])}
    ${mark('kink', joinedKnots, kink, [1, 1, 1, turnWeight, 1])} }` },
  objects: [
    { id: 'line', name: 'Straight rail', source: 'rail', geometry: 'line' },
    { id: 'bend', name: 'Tangent bend', source: 'rail', geometry: 'bend' },
    { id: 'kink', name: 'Kinked rail', source: 'rail', geometry: 'kink' },
  ] } };

const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/brep-glue.ts',
  'packages/barocss-cad/src/brep/edge-continuity.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/errors.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'apps/cad-studio/src/ui/SweepHistoryInputs.tsx', 'apps/cad-studio/src/ui/DirectPanel.tsx',
  'apps/cad-studio/test/mcp-browser-session.mjs',
];
const f = await createFlow({
  name: 'exact-tangent-sweep', output: process.argv[2], envFrozen: 'D1670_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Join Direct rails, create the exact Sweep, measure both native joints, edit its disk and reopen the part.',
  limits: ['One disk, one straight-to-quarter-arc rail, desktop WebGPU and local L1 MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity, revolutionOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const tangencies = brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[0]) < 1e-7))
  .map(edge => measureBrepEdgeContinuity(brep, edge.id, { curvature: true }));
const curved = brep.faces.filter(face => faceGeometry(face).kind === 'other')
  .map(face => revolutionOf(face.surface, 100)?.profile ?? null);
console.log(JSON.stringify({ report: checkBrep(brep, { strict: true }), expectedSource: brep.source,
  mass: massPropertiesOf(output), quadrature: brepMassProperties(brep, 1).volume,
  caps: brep.faces.filter(face => faceGeometry(face).kind === 'plane').map(face => [face.name, faceGeometry(face)]),
  cylinders: brep.faces.map(face => faceGeometry(face)).filter(face => face.kind === 'cylinder'), curved,
  tangencies, digest: digestOf(brep), bodyCount: output.bodyCount }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const status = value => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const near = (value, target, tolerance = 1e-7) => assert.ok(Math.abs(value - target) < tolerance, `${value} != ${target}`);
const volume = radius => Math.PI * radius ** 2 * (straightLength + Math.PI * bendRadius / 2);

async function measure(label, doc, radius) {
  const receipt = await f.inspect(label, doc);
  assert.ok(receipt.report.valid && receipt.bodyCount === 1);
  assert.equal(receipt.report.topology[0].genus, 0);
  assert.deepEqual(receipt.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  assert.equal(receipt.expectedSource.family, 'sweep-curve');
  assert.deepEqual(receipt.caps.map(([name]) => name.split('.').at(-1)).sort(), ['end', 'start']);
  for (const [name, plane] of receipt.caps) {
    const [axis, at, normal] = name.endsWith('.start') ? [0, -10, [-1, 0, 0]] : [1, 20, [0, 1, 0]];
    near(plane.o[axis], at);
    normal.forEach((component, index) => near(plane.n[index], component));
  }
  assert.equal(receipt.cylinders.length, 2);
  receipt.cylinders.forEach(support => near(support.r, radius));
  assert.equal(receipt.curved.length, 2);
  assert.ok(receipt.curved.every(profile => profile?.kind === 'arc'));
  receipt.curved.forEach(profile => { near(profile.c[0], bendRadius); near(profile.r, radius); });
  near(receipt.mass.volume, volume(radius));
  near(receipt.quadrature, volume(radius));
  assert.equal(receipt.tangencies.length, 2);
  for (const seam of receipt.tangencies) {
    assert.equal(seam.status, 'measured');
    assert.ok(seam.maximumAngleDegrees < 1e-5);
    assert.equal(seam.curvature.status, 'measured');
    assert.ok(seam.curvature.maximumDifference > 0.01);
  }
  f.report.observations.push({ label, radius, volume: receipt.mass.volume, quadrature: receipt.quadrature, digest: receipt.digest,
    counts: receipt.report.counts, gap: receipt.report.maximumPcurveGap,
    seams: receipt.tangencies.map(({ edgeId, maximumAngleDegrees, curvature }) => [edgeId, maximumAngleDegrees, curvature.maximumDifference]) });
  return receipt;
}

async function visibleContinuity(native) {
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Bodies'); i++) await filter.click();
  assert.match(await filter.innerText(), /Bodies/);
  await f.worldClick([-6, 0, 2]);
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const reading = result.locator('[data-continuity-angle]');
  for (const item of native.tangencies) {
    await options.selectOption(item.edgeId);
    await button('Measure continuity', panel).click();
    await reading.waitFor();
    assert.equal(await reading.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await f.snapshot('05-tangent-joints');
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
  await chooser.setFiles({ name: 'exact-tangent-sweep.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  f.phase = 'Join the saved line and tangent arc in Studio';
  await button('Straight rail', browser()).click();
  await button('Tangent bend', browser()).click({ modifiers: ['Shift'] });
  await button('Join').click();
  await f.changed(seed);
  const joined = (await f.snapshot('01-joined-direct-rail')).doc;
  assert.deepEqual(joined.nodes, seed.nodes);
  const rail = joined.direct.objects.find(object => object.name === 'Joined curve');
  assert.ok(rail);
  const savedRail = await f.save('joined-path-input');

  f.phase = 'Refuse an exact path with a corner and preview the tangent rail';
  await button('Sketch 1', browser()).click();
  await button('Kinked rail', browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await status('refused').waitFor();
  await hud().getByText('The line and arc are not tangent', { exact: true }).waitFor();
  assert.ok(await button('Apply', hud()).isDisabled());
  await f.same(joined);
  await f.snapshot('02-kink-refused');
  await button('Joined curve', browser()).click();
  await hud().locator('.hud-step').getByText('Exact line and arc', { exact: true }).waitFor();
  await status('preview').waitFor();
  await f.snapshot('03-tangent-preview');
  await button('Apply', hud()).click();
  await f.changed(joined);
  const accepted = (await f.snapshot('04-tangent-applied')).doc;
  assert.deepEqual([accepted.nodes[1].kind, accepted.nodes[1].mode, accepted.nodes[1].path], ['sweep-curve', 'exact', joinedPath]);
  const native = await measure('accepted-native', accepted, 2);
  await visibleContinuity(native);

  f.phase = 'Edit the disk diameter and retain the exact path';
  await f.openFeatureEditor(1, 'change input disk');
  await f.editor().getByText('Exact line and arc', { exact: true }).waitFor();
  const diameter = f.editor().getByLabel('Diameter', { exact: true });
  await diameter.fill('40');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
  await f.same(accepted);
  await f.snapshot('06-bend-clearance-refusal');
  await diameter.fill('6');
  const edited = (await f.applyEditor(accepted, '07-diameter-edited')).doc;
  assert.deepEqual(edited.nodes[1], accepted.nodes[1]);
  assert.equal(edited.nodes[0].radius, 3);
  const larger = await measure('edited-native', edited, 3);
  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('exact-tangent-sweep');
  await f.freshOpen(saved.file, edited, '08-reopened');
  assert.equal((await measure('reopened-native', await f.doc(), 3)).digest, larger.digest);
  await f.openFeatureEditor(1);
  await f.editor().getByText('Joined curve · Degree 2 NURBS · Copied', { exact: true }).waitFor();
  await f.editor().getByText('Exact line and arc', { exact: true }).waitFor();
  await f.snapshot('09-reopened-history');

  f.phase = 'Propose the same joined rail through local MCP and approve in Studio';
  const pendingFile = join(f.output, 'sweep-proposal.bcad');
  await copyFile(savedRail.file, pendingFile);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, pendingFile, 'tangent-sweep', async call => {
    const expectedRevision = await currentPartRevision(call);
    const summary = await call('query', { action: 'summary' });
    const path = summary.direct_curves.find(candidate => candidate.id === rail.id);
    assert.ok(path?.revision);
    const args = { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: path.id, pathRevision: path.revision, representation: 'exact' } };
    const result = await call('proposals', { action: 'propose', title: 'Exact Sweep along the tangent join',
      ops: [{ tool: 'features', args }] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(pendingFile));
  assert.deepEqual(pending.nodes, joined.nodes);
  assert.deepEqual(pending.outputs, joined.outputs);
  await f.freshOpen(pendingFile, pending, '10-proposal-open');
  await button('Chat').first().click();
  await button('Preview', card('P1')).click();
  await button('Hide', card('P1')).waitFor();
  await f.same(pending);
  await button('Accept', card('P1')).click();
  await f.changed(pending);
  const approved = (await f.snapshot('11-proposal-approved')).doc;
  assert.deepEqual(approved.nodes[0], accepted.nodes[0]);
  for (const key of ['id', 'kind', 'mode', 'path', 'sketch', 'name'])
    assert.deepEqual(approved.nodes[1][key], accepted.nodes[1][key], key);
  assert.deepEqual(approved.outputs, accepted.outputs);
  assert.equal((await measure('approved-native', approved, 2)).digest, native.digest);
});
