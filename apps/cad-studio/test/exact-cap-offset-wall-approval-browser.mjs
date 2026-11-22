import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const cap = 'n0.v-max';
const walls = ['n0.normal', 'n0.reverse'];
const wall = { id: 'RADIAL-2', source: 'Keep the radial wall at 2 ± 0.01 mm.', hard: true,
  check: { query: { fn: 'radial_wall', a: walls[0], b: walls[1] }, op: '==', value: 2, tol: 0.01, unit: 'mm' } };
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const seed = thickness => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { thickness }, nextId: 1,
  nodes: [{
    id: 'n0', kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: { parameter: 'thickness' }, side: 'reverse',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    },
  }],
  outputs: { b0: { node: 0, side: 'solid' } },
  requirements: [wall],
});
const pins = [
  'apps/cad-studio/test/exact-cap-offset-wall-approval-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/thickenWall.ts',
  'packages/barocss-cad-model/src/engine/exactThickenCapEdit.ts',
  'packages/barocss-cad/src/features/exact-cylinder-cap-offset.ts',
];
const f = await createFlow({
  name: 'exact-cap-offset-wall-approval', envFrozen: 'D1647_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Approve a signed upper-cap Offset with a pinned radial-wall requirement; refuse a known thin wall.',
  limits: ['Local stdio MCP and desktop WebGPU. One upright Exact semicylinder and one original upper-cap Offset.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const report = checkBrep(brep, { strict: true });
  return { key, valid: report.valid, volume: brepMassProperties(brep, 1).volume, digest: digestOf(brep),
    geometry: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const proposal = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const requirement = () => f.page.getByRole('listitem', { name: `Requirement ${wall.id}`, exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'cap-offset-wall-approval' }, file, label, run);
const near = (got, want, tolerance = 1e-8) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);

async function propose(thickness) {
  const label = thickness === 2 ? 'qualified' : 'thin', file = join(f.output, `${label}-proposal.bcad`);
  const doc = seed(thickness);
  await writeFile(file, JSON.stringify(doc));
  const baseRevision = await mcp(file, label, async call => {
    const baseline = await call('requirements', { action: 'evidence' });
    const made = await call('proposals', {
      action: 'propose', title: `Offset with a ${thickness} mm radial wall`, requirements: [wall.id], ops: [
        { tool: 'features', args: { action: 'command', command: 'offset-face', faces: [cap], values: { d: 2 } } },
      ],
    });
    assert.deepEqual([made.proposal, made.applied], ['P1', false]);
    assert.deepEqual(made.checks.after, { pass: Number(thickness === 2), fail: Number(thickness === 1), unknown: 0 });
    return baseline.revision;
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [doc.nodes, doc.outputs]);
  assert.equal(pending.proposals[0].base_evidence_revision, baseRevision);
  return { file, pending, baseRevision };
}

async function evidence(file, label, expectedRevision, oldRevision) {
  const bytes = await readFile(file);
  const proof = await mcp(file, label, async call => {
    const stale = await call('requirements', { action: 'evidence', expectedRevision: oldRevision }, true);
    assert.match(stale.error, /OUTPUT_STALE/);
    assert.equal(stale.files, undefined);
    const result = await call('requirements', { action: 'evidence', ...(expectedRevision && { expectedRevision }) });
    const [artifact] = result.files;
    assert.equal(artifact.sha256, sha256(Buffer.from(artifact.text)));
    const row = JSON.parse(artifact.text).evidence.find(row => row.requirement?.id === wall.id);
    assert.deepEqual([row.result.run, row.result.verdict, row.result.value.entities, row.freshness.state],
      [result.revision, 'pass', walls, 'current']);
    near(row.result.number, 2);
    return { revision: result.revision, row };
  });
  assert.deepEqual(await readFile(file), bytes);
  return proof;
}

async function checkShape(label, doc, height, distance) {
  assert.deepEqual(doc.nodes[0], seed(2).nodes[0]);
  const node = doc.nodes[1];
  assert.deepEqual([node.kind, node.faces, node.parent, node.distance, node.target],
    ['offset-face', [cap], { node: 0, side: 'solid' }, distance, undefined]);
  assert.deepEqual(doc.outputs, { b1: { node: 1, side: 'solid' } });
  const result = await f.inspect(label, doc);
  assert.equal(result.length, 1);
  const [solid] = result, { geometry } = solid;
  assert.equal(solid.valid, true);
  assert.deepEqual([geometry[cap].o[2], geometry['n0.v-min'].o[2]], [height, 0]);
  for (const [name, radius, sense] of [[walls[0], 10, 1], [walls[1], 8, -1]]) {
    const skin = geometry[name];
    assert.deepEqual([skin.kind, skin.a, skin.out], ['cylinder', [0, 0, 1], sense]);
    near(skin.r, radius);
    near(skin.c[0], 20);
    near(skin.c[1], 20);
  }
  const expectedVolume = 18 * Math.PI * height, { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(solid.volume, expectedVolume);
  near(bodies[0].volume, expectedVolume);
  f.report.observations.push({ label, height, volumes: [solid.volume, bodies[0].volume], expectedVolume, digest: solid.digest });
  return solid.digest;
}

async function preview(file, pending, label) {
  await f.freshOpen(file, pending, label);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Chat').first().click();
  await button('Preview', proposal()).click();
  await proposal().getByLabel('Volume change').waitFor();
  await f.same(pending);
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
  const thin = await propose(1);
  await preview(thin.file, thin.pending, '01-thin-pending');
  f.phase = 'Refuse the measured 1 mm wall in Studio';
  await button('Accept', proposal()).click();
  const refusal = await f.waitToast(/P1 could not be applied.*RADIAL-2.*measured 1 mm/);
  await f.same(thin.pending);
  await f.snapshot('02-thin-refused');
  f.report.observations.push({ refusal });

  const good = await propose(2);
  await preview(good.file, good.pending, '03-qualified-pending');
  await f.snapshot('04-qualified-preview');
  f.phase = 'Approve the revision-pinned 2 mm wall in Studio';
  await button('Accept', proposal()).click();
  await f.changed(good.pending);
  const approved = await f.doc(), decision = approved.proposals[0].decided.evidence_revisions;
  assert.equal(approved.proposals[0].status, 'accepted');
  assert.equal(decision.before, good.baseRevision);
  assert.notEqual(decision.before, decision.after);
  const approvals = approved.history.filter(entry => entry.kind === 'accept');
  assert.equal(approvals.length, 1);
  assert.deepEqual(approvals[0].evidence_revisions, decision);
  await requirement().and(f.page.locator('.req.pass')).waitFor();
  await checkShape('05-approved-native', approved, 14, 2);
  await f.snapshot('05-approved-wall');
  const saved = await f.save('approved-cap-offset');
  const approvedProof = await evidence(saved.file, 'approved-evidence', decision.after, decision.before);
  assert.equal(approvedProof.revision, decision.after);

  await f.openFeatureEditor(1, 'upper cap Offset');
  await button('Edit offset', f.editor()).click();
  const edit = f.page.getByRole('dialog', { name: 'Edit Offset face', exact: true });
  const offset = edit.getByLabel('Offset', { exact: true });
  assert.equal(await offset.inputValue(), '2');
  await offset.fill('-3');
  await edit.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', edit).click();
  await f.changed(approved);
  const edited = await f.doc();
  assert.deepEqual(edited.proposals[0].decided.evidence_revisions, decision);
  const editedDigest = await checkShape('06-edited-native', edited, 9, -3);
  const editedFile = await f.save('edited-cap-offset');
  await f.freshOpen(editedFile.file, edited, '07-fresh-open');
  await requirement().and(f.page.locator('.req.pass')).waitFor();
  assert.equal(await checkShape('07-reopened-native', await f.doc(), 9, -3), editedDigest);
  const reopened = await evidence(editedFile.file, 'reopened-evidence', undefined, decision.after);
  assert.notEqual(reopened.revision, decision.after);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('08-reopened-wall');
  f.report.observations.push({ decision, approvedProof, reopened });
});
