import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const wallCheck = process.argv.includes('--wall-check');
const wall = { id: 'RADIAL-2', source: 'Keep the radial wall at 2 ± 0.01 mm.', hard: true,
  check: { query: { fn: 'radial_wall', a: 'n0.normal', b: 'n0.reverse' }, op: '==', value: 2, tol: 0.01, unit: 'mm' } };
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const weights = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1];
const surface = {
  degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
  controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
  weights: weights.map(weight => [weight, weight]),
};
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [
    { id: 'n0', kind: 'thicken', name: 'Semicylinder', thickness: 2, side: 'reverse', mode: 'exact-cylinder', surface },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [5, 15], max: [35, 35] },
    { id: 'n2', kind: 'extrude', sketch: 1, from: 8, height: 9 },
  ],
  outputs: { b0: { node: 0, side: 'solid' }, b2: { node: 2, side: 'solid' } },
  ...(wallCheck ? { requirements: [wall] } : {}),
};
const pins = [
  'apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs', 'apps/cad-studio/test/model-rail-helper.mjs',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts', 'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts', 'packages/barocss-cad/src/brep/thicken-cylinder.ts',
];
if (wallCheck) pins.push('packages/barocss-cad-model/src/engine/axialThickenCut.ts', 'packages/barocss-cad-model/src/chat/thickenWall.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'apps/cad-studio/test/mcp-browser-session.mjs');
const f = await createFlow({
  name: 'exact-cylinder-axial-cut', output: process.argv[2], envFrozen: wallCheck ? 'D1642_SOURCE_FROZEN' : 'D1641_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: wallCheck ? 'Approve a full axial crop, refuse a partial crop and check current radial wall evidence after native Open.'
    : 'Subtract a box across one end of an Exact semicylinder Thicken, edit the cutting plane and reopen the native part.',
  limits: ['One upright two-quarter semicylinder and one rectangular cutter with full XY clearance. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const report = checkBrep(brep, { strict: true });
  const cap = brep.faces.find(face => face.name === 'n2.bottom');
  const loop = cap && brep.loops.find(loop => loop.id === cap.loops[0]);
  const rims = (loop?.coedges ?? []).map(id => {
    const use = brep.coedges.find(use => use.id === id);
    const { curve } = brep.edges.find(edge => edge.id === use.edge);
    const [a, b] = curveDomain(curve);
    const samples = Array.from({ length: 17 }, (_, i) => evaluateCurve(curve, a + (b - a) * i / 16));
    return { degree: curve.degree, samples };
  });
  const { volume, centroid } = brepMassProperties(brep, 1);
  return { key, valid: report.valid, genus: report.topology[0]?.genus, counts: report.counts,
    volume, centroid, family: brep.source.family, vertices: brep.vertices.map(v => v.point),
    geometry: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face, 30)])), rims, digest: digestOf(brep) };
})));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const near = (got, expected, tolerance = 1e-8) => assert.ok(Math.abs(got - expected) < tolerance, `${got} != ${expected}`);
const target = { node: 0, side: 'solid' }, tool = { node: 2, side: 'solid' };
const retainedFaces = ['n0.normal', 'n0.reverse', 'n0.u-max', 'n0.u-min', 'n0.v-min', 'n2.bottom'];
const proposal = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const requirement = () => f.page.getByRole('listitem', { name: `Requirement ${wall.id}`, exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'exact-cylinder-axial-cut', autonomy: 1 }, file, label, run);

async function propose(file, title) {
  return mcp(file, title, async call => {
    const result = await call('proposals', { action: 'propose', title, requirements: [wall.id], ops: [
      { tool: 'features', args: { action: 'command', command: 'difference', bodies: ['b0', 'b2'] } },
    ] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
    return result.checks.after;
  });
}

async function checkEvidence(file, label, oldRevision) {
  const bytes = await readFile(file);
  const evidence = await mcp(file, label, async call => {
    if (oldRevision) {
      const stale = await call('requirements', { action: 'evidence', expectedRevision: oldRevision }, true);
      assert.match(stale.error, /OUTPUT_STALE/);
      assert.equal(stale.files, undefined);
    }
    const result = await call('requirements', { action: 'evidence' });
    const { evidence } = JSON.parse(result.files[0].text);
    const row = evidence.find(row => row.requirement?.id === wall.id);
    assert.deepEqual([row.result.run, row.result.verdict, row.freshness.state, row.result.value.entities],
      [result.revision, 'pass', 'current', ['n0.normal', 'n0.reverse']]);
    near(row.result.number, 2);
    return { revision: result.revision, row };
  });
  assert.deepEqual(await readFile(file), bytes);
  return evidence;
}

async function check(label, doc, height) {
  assert.deepEqual(doc.nodes, [...seed.nodes.slice(0, 2), { ...seed.nodes[2], from: height }, { id: 'n3', kind: 'difference', parent: target, tool }]);
  assert.deepEqual(doc.outputs, { b3: { node: 3, side: 'solid' } });
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [part] = rows;
  const { key, valid, genus, counts, geometry } = part;
  assert.deepEqual([key, valid, genus, counts.bodies, counts.shells, counts.faces, counts.edges, counts.vertices],
    ['b3', true, 0, 1, 1, 6, 12, 8]);
  assert.deepEqual(Object.keys(geometry).sort(), retainedFaces);
  for (const [name, radius, sense] of [['n0.normal', 10, 1], ['n0.reverse', 8, -1]]) {
    const cylinder = geometry[name];
    assert.deepEqual([cylinder.kind, cylinder.out, cylinder.a], ['cylinder', sense, [0, 0, 1]]);
    near(cylinder.c[0], 20);
    near(cylinder.c[1], 20);
    near(cylinder.r, radius);
  }
  for (const [name, z, sense] of [['n0.v-min', 0, -1], ['n2.bottom', height, 1]]) {
    const face = geometry[name];
    assert.deepEqual([face.kind, face.n], ['plane', [0, 0, sense]]);
    near(face.o[2], z);
  }
  for (const x of [10, 12, 28, 30]) for (const z of [0, height]) {
    const matches = part.vertices.filter(p => Math.hypot(p[0] - x, p[1] - 20, p[2] - z) < 1e-8);
    assert.equal(matches.length, 1);
  }
  assert.deepEqual(part.rims.map(rim => rim.degree).sort(), [1, 1, 2, 2]);
  const radii = [];
  for (const { degree, samples } of part.rims) {
    samples.forEach(point => near(point[2], height));
    if (degree === 1) {
      samples.forEach(point => near(point[1], 20));
      near(Math.abs(samples[0][0] - samples.at(-1)[0]), 2);
      continue;
    }
    const radius = Math.round(Math.hypot(samples[0][0] - 20, samples[0][1] - 20));
    radii.push(radius);
    for (const [x, y] of samples) {
      near(Math.hypot(x - 20, y - 20), radius);
      assert.ok(y >= 20 - 1e-8);
    }
    const crown = samples[8];
    near(crown[0], 20);
    near(crown[1], 20 + radius);
  }
  assert.deepEqual(radii.sort((a, b) => a - b), [8, 10]);
  const volume = 18 * Math.PI * height;
  near(part.volume, volume);
  near(part.centroid[0], 20);
  near(part.centroid[1], 20 + 488 / (27 * Math.PI));
  near(part.centroid[2], height / 2);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, volume);
  return part;
}

await f.run(async () => {
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const file = join(f.output, 'semicylinder-and-cutter.bcad');
  await writeFile(file, JSON.stringify(seed));
  if (wallCheck) {
    const partial = join(f.output, 'partial-wall-cutter.bcad');
    const partialSeed = { ...seed, nodes: seed.nodes.map((node, i) => i === 1 ? { ...node, max: [22, 35] } : node) };
    await writeFile(partial, JSON.stringify(partialSeed));
    assert.deepEqual(await propose(partial, 'Partial axial cutter'), { pass: 0, fail: 0, unknown: 1 });
    const pending = JSON.parse(await readFile(partial, 'utf8'));
    await f.freshOpen(partial, pending, '00-partial-pending');
    await button('Chat').first().click();
    await proposal().getByRole('button', { name: 'Preview', exact: true }).click();
    await proposal().getByLabel('Volume change').waitFor();
    await proposal().getByRole('button', { name: 'Accept', exact: true }).click();
    const refusal = await f.waitToast(/P1 could not be applied.*RADIAL-2.*full axial-end cut/);
    await f.same(pending);
    await f.snapshot('00-partial-refused');
    f.report.observations.push({ refusedPartial: refusal });
    assert.deepEqual(await propose(file, 'Full axial cutter'), { pass: 1, fail: 0, unknown: 0 });
  }
  const working = wallCheck ? JSON.parse(await readFile(file, 'utf8')) : seed;
  await f.freshOpen(file, working, '01-input');
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const bodies = f.page.locator('.outliner .ol-row > button.ol');
  assert.equal(await bodies.count(), 2);
  f.phase = 'Subtract through the top end';
  if (wallCheck) {
    await button('Chat').first().click();
    await proposal().getByRole('button', { name: 'Preview', exact: true }).click();
    await proposal().getByLabel('Volume change').waitFor();
    await proposal().getByRole('button', { name: 'Accept', exact: true }).click();
  } else {
    await bodies.filter({ hasText: 'Semicylinder' }).click();
    await bodies.nth(1).click({ modifiers: ['Shift'] });
    await f.snapshot('02-ordered-operands');
    await clickModelCommand(f.page, 'Combine', 'Subtract');
  }
  await f.changed(working);
  const cut = await f.doc(), first = await check('03-cut-native', cut, 8);
  let firstEvidence;
  if (wallCheck) {
    await requirement().and(f.page.locator('.req.pass')).waitFor();
    const approved = await f.save('approved-axial-wall');
    firstEvidence = await checkEvidence(approved.file, 'approved-evidence');
    assert.equal(firstEvidence.revision, cut.proposals[0].decided.evidence_revisions.after);
    assert.equal(cut.history.filter(entry => entry.kind === 'accept').length, 1);
  }
  await f.snapshot('03-cut');

  await f.openFeatureEditor(2, 'cutter Extrude');
  const from = f.editor().getByLabel('Start Z', { exact: true });
  assert.equal(await from.inputValue(), '8');
  await from.fill('6');
  await f.applyEditor(cut, '04-cutter-edited');
  const edited = await f.doc(), second = await check('04-edited-native', edited, 6);

  await f.undo();
  await f.same(cut);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('semicylinder-axial-cut');
  await f.freshOpen(saved.file, edited, '05-fresh-open');
  assert.deepEqual(await check('06-reopened-native', await f.doc(), 6), second);
  if (wallCheck) {
    await requirement().and(f.page.locator('.req.pass')).waitFor();
    const reopenedEvidence = await checkEvidence(saved.file, 'reopened-evidence', firstEvidence.revision);
    assert.notEqual(firstEvidence.revision, reopenedEvidence.revision);
    f.report.observations.push({ firstEvidence, reopenedEvidence });
  }
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('06-reopened-cut');
  f.report.observations.push({ planes: [8, 6], volumes: [first.volume, second.volume], centroid: second.centroid,
    family: second.family, names: retainedFaces, digest: second.digest });
});
