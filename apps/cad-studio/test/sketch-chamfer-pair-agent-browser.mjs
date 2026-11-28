import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/sketch-chamfer-pair-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'packages/barocss-cad-model/src/chat/part/sketchCorner.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  'packages/barocss-cad-model/src/sketch/cornerBatch.ts'];
const f = await createFlow({
  name: 'sketch-chamfer-pair-agent', output: process.argv[2], envFrozen: 'CHAMFER_PAIR_AGENT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Request two unequal chamfers by original side pairs and approve their exact native result in Studio.',
  limits: ['One constrained rectangular contour and two adjacent right-angle corners. The local Agent uses the existing proposal flow.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (doc.seed) {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: [[0,0],[40,0],[40,30],[0,30]], ids: ['e1','e2','e3','e4'],
    hv: { h: [0,2], v: [1,3] }, lengths: { 3: 30 } }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [output] = partSnapshot(doc).outputs;
  assert.ok(checkBrep(output.brep, { strict: true }).valid);
  console.log(JSON.stringify({ hash: digestOf(output.brep), volume: massPropertiesOf(output).volume,
    faces: output.brep.faces.map(face => face.name) }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} versus ${b}`);
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, label, run);

await f.run(async () => {
  const source = await f.inspect('seed', { seed: true });
  const file = join(f.output, 'pending-chamfer-pair.bcad'), initial = Buffer.from(JSON.stringify(source));
  await writeFile(file, initial);
  const expectedRevision = await mcp(file, 'discover-and-propose', async call => {
    const revision = await currentPartRevision(call);
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    const corners = fields.sketchCorners.filter(item => item.point[0] === 40).map(item => item.sides);
    assert.deepEqual(corners, [['e1', 'e2'], ['e2', 'e3']]);
    const chamfer = { sketch: fields.id, corners, distance: 3, outgoingDistance: 4 };
    const edit = { action: 'edit', index: 0, expectedRevision: revision, sketchChamfer: chamfer };
    const propose = (args, error = false) => call('proposals', { action: 'propose', title: 'Chamfer the two corners beside the right edge',
      ops: [{ tool: 'features', args }] }, error);
    if (baseline) {
      assert.match((await propose(edit, true)).error, /outgoingDistance.*saved Chamfer/i);
      assert.deepEqual(await readFile(file), initial);
      return revision;
    }
    const description = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(description.input.properties.sketchChamfer.properties.outgoingDistance.description, /two original perpendicular corners/);
    for (const [args, reason] of [
      [{ ...edit, expectedRevision: '0000000000000000' }, /part changed/i],
      [{ ...edit, sketchChamfer: { ...chamfer, corners: [corners[0], [...corners[0]].reverse()] } }, /once/i],
      [{ ...edit, sketchChamfer: { ...chamfer, corners: [corners[0], ['e2', 'e999']] } }, /side|corner/i],
      [{ ...edit, sketchChamfer: { ...chamfer, corners: [...corners, ['e3', 'e4']] } }, /outgoingDistance/i],
      [{ ...edit, sketchChamfer: { ...chamfer, outgoingDistance: 27 } }, /shared edge/i],
    ]) {
      assert.match((await propose(args, true)).error, reason);
      assert.deepEqual(await readFile(file), initial);
    }
    const proposal = await propose(edit);
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    near(proposal.change.volume, -120);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), pending);
    return revision;
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  await f.freshOpen(file, pending, 'part-before-approval');
  if (baseline) return;

  const manual = JSON.parse(await readFile(process.env.CHAMFER_PAIR_MANUAL, 'utf8'));
  assert.equal(pending.proposals[0].ops[0].args.expectedRevision, expectedRevision);
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await card.getByLabel('Volume change').getByText(/^−120(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  await f.snapshot('agent-chamfer-pair-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc();
  assert.deepEqual([accepted.history.at(-1).kind, accepted.history.at(-1).by.agent], ['accept', 'user']);
  assert.deepEqual([accepted.nodes, accepted.outputs], [manual.nodes, manual.outputs]);
  const native = await f.inspect('agent-native', accepted);
  near(native.volume, 11880);
  near((await f.bodies()).bodies[0].volume, 11880);
  assert.deepEqual(native, await f.inspect('manual-native', manual));
  assert.ok(native.faces.includes('n1.side[e5]') && native.faces.includes('n1.side[e6]'));
  await f.snapshot('agent-chamfer-pair-accepted');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('agent-chamfer-pair');
  await f.freshOpen(saved.file, accepted, 'agent-chamfer-pair-reopened');
  assert.deepEqual(await f.inspect('reopened-native', accepted), native);
  f.report.observations.push({ expectedRevision, ...native });
});
