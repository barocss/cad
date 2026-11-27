import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/draftEdit.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/toolDefinitions.ts', 'apps/cad-studio/server/cadMcp.ts'];
const f = await createFlow({
  name: 'pivot-hinge-agent', output: process.argv[2], envFrozen: 'PIVOT_HINGE_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  extraFrozen: baseline ? [] : ['packages/barocss-cad-model/src/chat/part/pivotHingeEdit.ts'],
  qualification: 'Discover and propose an exact fixed-edge replacement, then approve it in Studio.',
  limits: ['One base part with an original rectangular extrusion and one authored Move. Local MCP autonomy L1.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { pivotFaceCommand } from '@barocss/cad-model/app/pivotFaceCommand';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] && JSON.parse(process.argv[3]) === 'author') {
  const result = evaluateDoc(doc, 1);
  if (!result.ok || result.bodies.length !== 1) throw new Error('Could not build source stock.');
  const [body] = result.bodies;
  const face = body.mesh.faces.findIndex(member => member.nativePlaneName === 'n1.side0');
  const edge = body.mesh.edges.findIndex(member => member.names.includes('n1.side0|n1.top'));
  const ctx = { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [{ body: 0, edge }], bodies: [] } };
  console.log(JSON.stringify(pivotFaceCommand.build(ctx, { deg: 12 })));
} else {
  const [{ brep }] = partSnapshot(doc).outputs;
  const vertices = Object.fromEntries(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  console.log(JSON.stringify({ digest: digestOf(brep), strict: checkBrep(brep, { strict: true }).valid,
    closed: brep.shells.every(shell => shell.closed),
    topology: [brep.bodies.length, brep.shells.length, brep.faces.length, brep.loops.length, brep.coedges.length, brep.edges.length, brep.vertices.length],
    vertices: Object.values(vertices), edges: brep.edges.map(edge => ({ edge, endpoints: edge.vertices.map(id => vertices[id]),
      uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id, use.sense, brep.faces.find(face => face.loops.includes(use.loop)).id]) })),
    mass: brepMassProperties(brep, 1) }));
}
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 3, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 6, height: 12 },
    { kind: 'translate', id: 'n2', parent: { node: 1, side: 'solid' }, offset: [20, -10, 8] },
  ], outputs: { b2: { node: 2, side: 'solid' } },
};
const index = stock.nodes.length, upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0', rear = 'n1.side2|n1.top';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-6;
const pointNear = (a, b) => a.every((value, i) => near(value, b[i]));
const inset = 12 * Math.tan(Math.PI / 15), expectedVolume = 40 * 12 * (20 - inset / 2);
const centroidZ = bottom => 20 + (bottom ? -1 : 1) * inset / (20 - inset / 2);

async function prove(label, doc, original, bottom) {
  const actual = await f.inspect(label, doc);
  const name = bottom ? lower : upper;
  const hinge = actual.edges.find(entry => entry.edge.name === name);
  assert.deepEqual(hinge, original.edges.find(entry => entry.edge.name === name));
  assert.deepEqual([actual.strict, actual.closed, actual.topology], [true, true, [1, 1, 6, 6, 24, 12, 8]]);
  assert.ok(near(actual.mass.volume, expectedVolume));
  for (const x of [24, 64]) {
    for (const point of [[x, -13 + (bottom ? 0 : inset), 14], [x, 7, 14], [x, -13 + (bottom ? inset : 0), 26], [x, 7, 26]])
      assert.ok(actual.vertices.some(vertex => pointNear(vertex, point)), JSON.stringify(point));
  }
  const [body] = (await f.bodies()).bodies;
  assert.ok(near(body.volume, expectedVolume) && near(body.centroid[2], centroidZ(bottom)));
  f.report.observations.push({ label, hinge: name, nativeEdge: hinge.edge.id, endpoints: hinge.endpoints,
    volume: actual.mass.volume, studioCentroid: body.centroid, digest: actual.digest });
  return actual;
}

async function frame() {
  await button('Iso', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}

await f.run(async () => {
  const original = await f.inspect('01-translated-stock', stock);
  const source = await f.inspect('01-author-upper-pivot', stock, 'author');
  const pivot = source.nodes[index], input = join(f.output, 'upper-pivot.bcad');
  assert.deepEqual([pivot.hingeEdge, pivot.pull, pivot.angle], [upper, '-z', 12]);
  await writeFile(input, JSON.stringify(source));
  let savedBytes = await readFile(input);
  const proposalId = await withMcpSession({ app: f.app, output: f.output, clientName: 'pivot-hinge-agent-review' },
    input, 'pivot-hinge', async call => {
      const revision = await currentPartRevision(call);
      savedBytes = await readFile(input);
      const detail = await call('query', { action: 'edit_fields', index });
      const choice = detail.fields.find(field => field.key === 'hingeEdge');
      assert.equal(detail.revision, revision);
      const edit = { action: 'edit', index, values: { hingeEdge: lower }, expectedRevision: revision };
      const propose = args => ({ action: 'propose', title: 'Fix the lower edge of the original Pivot face',
        ops: [{ tool: 'features', args }] });
      async function deny(args, reason) {
        const refusal = await call('proposals', propose(args), true);
        assert.match(JSON.stringify(refusal), reason);
        assert.deepEqual(await readFile(input), savedBytes);
      }
      if (baseline) {
        assert.equal(choice, undefined);
        await deny(edit, /no value.*hingeEdge/);
        return null;
      }
      const describe = await call('describe', { tool: 'features', action: 'edit' });
      assert.match(JSON.stringify(describe), /values\.hingeEdge/);
      assert.equal(choice.kind, 'choice');
      assert.equal(choice.value, upper);
      assert.deepEqual(choice.options.map(option => option.value).sort(), [upper, lower, 'n1.side0|n1.side1', 'n1.side0|n1.side3'].sort());
      assert.equal(choice.options.find(option => option.value === lower).label, 'Z min');
      assert.match((await call('features', edit, true)).error, /propos/i);
      assert.deepEqual(await readFile(input), savedBytes);
      await deny({ ...edit, expectedRevision: undefined }, /current expectedRevision/);
      await deny({ ...edit, expectedRevision: revision === '0000000000000000' ? '1111111111111111' : '0000000000000000' }, /part changed/i);
      await deny({ ...edit, values: { hingeEdge: lower, deg: 11 } }, /only values\.hingeEdge/);
      await deny({ ...edit, values: { hingeEdge: rear } }, /fixed edge on the original Pivot face/i);
      await deny({ ...edit, values: { hingeEdge: upper } }, /already has this fixed edge/i);
      const proposal = await call('proposals', propose(edit));
      assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
      assert.equal(proposal.change.volume, undefined, 'The two hinge positions have the same volume.');
      assert.ok(Math.abs(proposal.change.centroid[2] - centroidZ(true)) < 0.001);
      const pending = await readFile(input);
      assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
      assert.deepEqual(await readFile(input), pending);
      return proposal.proposal;
    });
  const pending = JSON.parse(await readFile(input, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  await f.freshOpen(input, pending, '02-open-native-upper-pivot');
  const before = await prove('02-accepted-upper', pending, original, false);
  await frame();
  if (baseline) {
    await f.snapshot('02-baseline-studio-upper-hinge');
    return;
  }

  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposalId}`, exact: true });
  await card.waitFor();
  await f.snapshot('03-pending-original-hinge');
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('04-preview-lower-hinge');
  await button('Hide', card).click();
  await f.same(pending);
  await f.snapshot('05-hide-keeps-original');

  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc(), next = accepted.nodes[index], approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', proposalId, 'user']);
  assert.deepEqual([accepted.nodes.slice(0, index), accepted.outputs], [source.nodes.slice(0, index), source.outputs]);
  assert.deepEqual([accepted.nodes.length, next.id, next.angle, next.faces, next.parent, next.hingeEdge, next.pull],
    [source.nodes.length, pivot.id, 12, pivot.faces, pivot.parent, lower, 'z']);
  assert.deepEqual(next.sigs[pivot.faces[0]], pivot.sigs[pivot.faces[0]]);
  assert.equal(next.sigs[upper], undefined);
  assert.deepEqual(next.sigs[lower].p, [44, -13, 14]);
  const after = await prove('06-approved-lower', accepted, original, true);
  assert.notEqual(after.digest, before.digest);
  await f.snapshot('06-approved-lower-hinge');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('agent-approved-lower-hinge');
  await f.freshOpen(saved.file, saved.doc, '07-reopen-native-lower-hinge');
  assert.equal((await prove('07-reopened-lower', saved.doc, original, true)).digest, after.digest);
  await frame();
  await f.openFeatureEditor(index, 'approved Pivot face');
  await button('Edit pivot face', f.editor()).click();
  const hud = f.page.getByRole('dialog', { name: 'Edit Pivot face', exact: true });
  await hud.locator('.status').getByText('preview', { exact: true }).waitFor();
  assert.deepEqual([await hud.getByLabel('Fixed edge').inputValue(), await hud.getByLabel('Angle').inputValue()], [lower, '12']);
  await f.snapshot('07-reopened-history-lower-hinge');
});
