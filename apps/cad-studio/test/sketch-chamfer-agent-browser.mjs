import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const original = [[0, 0], [40, 0], [40, 30], [0, 30]];
const sides = ['e1', 'e2', 'e3', 'e4'];
const expected = [[0, 0], [34, 0], [40, 6], [40, 30], [0, 30]];
const expectedSides = ['e1', 'e5', 'e2', 'e3', 'e4'];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { kind: 'sketch', profile: 'polygon', points: original, outline: {
      points: original, lengths: { 2: 40 }, hv: { h: [0, 2], v: [1, 3] },
      rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
    }, sideTags: { outer: sides }, id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const pins = [
  'apps/cad-studio/test/sketch-chamfer-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx', 'apps/cad-studio/src/state/useProposalPreview.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/chat/part/sketchChamfer.ts',
  'packages/barocss-cad-model/src/chat/contract.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  'packages/barocss-cad-model/src/sketch/corner.ts', 'packages/barocss-cad-model/src/sketch/reopen.ts',
];
const f = await createFlow({
  name: 'sketch-chamfer-agent', envFrozen: 'D1692_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Discover, stage, preview and approve a sketch chamfer. Save and freshly open its editable native result.',
  limits: ['One independent constrained XY profile, desktop Studio WebGPU, scripted local L1 MCP.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [body] = partSnapshot(doc).outputs;
const b = body.brep;
assert.ok(checkBrep(b, { strict: true }).valid && b.shells.every(shell => shell.closed));
console.log(JSON.stringify({ volume: massPropertiesOf(body).volume,
  faces: b.faces.map(face => [face.name, faceGeometry(face).kind]), points: b.vertices.map(v => v.point) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const session = { app: f.app, output: f.output, clientName: f.name };
const propose = (call, args, denied = false) => call('proposals', {
  action: 'propose', title: 'Chamfer the (40, 0) sketch corner by 6 mm', ops: [{ tool: 'features', args }],
}, denied);

await f.run(async () => {
  const file = join(f.output, 'agent-chamfer-source.bcad');
  const sourceText = JSON.stringify(source);
  await writeFile(file, sourceText);
  await f.freshOpen(file, source, '01-original-extrusion');
  const before = await f.inspect('native-before', source);
  assert.ok(Math.abs(before.volume - 40 * 30 * 10) < 1e-8);

  f.phase = 'Discover the current corner, try refusals and stage one proposal';
  const args = await withMcpSession(session, file, 'sketch-chamfer', async call => {
    const schema = await call('describe', { tool: 'features', action: 'edit' });
    assert.deepEqual(schema.input.properties.sketchChamfer.required, ['sketch', 'sides', 'distance']);
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.deepEqual([fields.index, fields.id, fields.revision], [0, 'n0', await currentPartRevision(call)]);
    const corner = fields.sketchCorners.find(item => item.point[0] === 40 && item.point[1] === 0);
    assert.deepEqual(corner.sides, ['e1', 'e2']);
    const sketchChamfer = { sketch: fields.id, sides: corner.sides, distance: 6 };
    const op = { action: 'edit', index: fields.index, expectedRevision: fields.revision, sketchChamfer };
    for (const [edit, problem] of [
      [{ expectedRevision: undefined }, /expectedRevision/i],
      [{ sketchChamfer: { ...sketchChamfer, sketch: 'n1' } }, /ID of one independent saved outline/],
      [{ sketchChamfer: { ...sketchChamfer, sides: ['e1', 'e3'] } }, /straight sides of one corner/],
      [{ sketchChamfer: { ...sketchChamfer, distance: 30 } }, /shorter than both edges/],
    ]) {
      assert.match((await propose(call, { ...op, ...edit }, true)).error, problem);
      assert.equal(await readFile(file, 'utf8'), sourceText);
    }
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args: op }] });
    assert.equal(dry.dryRun, true);
    assert.ok(Math.abs(dry.change.volume + 180) < 1e-8);
    assert.equal(await readFile(file, 'utf8'), sourceText);
    const proposal = await propose(call, op);
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    const staged = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), staged);
    return op;
  });

  const staged = await readFile(file);
  const pending = JSON.parse(staged);
  assert.deepEqual(pending.nodes, source.nodes);
  await f.freshOpen(file, pending, '02-open-proposal');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await card.getByLabel('Volume change').getByText(/^−180(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  assert.deepEqual(await readFile(file), staged);
  await f.snapshot('03-preview-with-original-retained');
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot('04-approved-chamfer');
  assert.equal(doc.proposals[0].status, 'accepted');
  const approval = doc.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
  const [sketch, extrude] = doc.nodes;
  assert.deepEqual([sketch.id, sketch.points, sketch.sideTags.outer], ['n0', expected, expectedSides]);
  assert.deepEqual(sketch.outline.lengths, { 3: 40 });
  assert.deepEqual(sketch.outline.rules, source.nodes[0].outline.rules);
  assert.deepEqual([extrude, doc.outputs], [source.nodes[1], source.outputs]);
  const after = await f.inspect('native-after', doc);
  assert.ok(Math.abs(after.volume - (40 * 30 - 6 * 6 / 2) * 10) < 1e-8);
  assert.equal(after.faces.length, 7);
  assert.ok(after.faces.every(([, type]) => type === 'plane'));
  const names = after.faces.map(([name]) => name);
  assert.ok(expectedSides.every(id => names.includes(`n1.side[${id}]`)));
  assert.equal(after.points.length, 10);
  for (const [x, y] of expected) for (const z of [0, 10])
    assert.ok(after.points.some(p => Math.hypot(x - p[0], y - p[1], z - p[2]) < 1e-8));

  const saved = await f.save('agent-chamfer-approved');
  await f.freshOpen(saved.file, saved.doc, '05-fresh-open');
  assert.deepEqual(await f.inspect('native-reopened', await f.doc()), after);
  await withMcpSession(session, saved.file, 'reopened-chamfer', async call => {
    const now = await currentPartRevision(call);
    const before = await readFile(saved.file);
    assert.notEqual(now, args.expectedRevision);
    assert.match((await propose(call, args, true)).error, /part changed/i);
    assert.deepEqual(await readFile(saved.file), before);
  });
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.tool('Select', 's');
  await f.frame(original);
  const outline = f.sketchPanel().getByRole('group', { name: 'Outline points' });
  for (const [index, [x, y]] of expected.entries()) {
    assert.equal(Number(await outline.getByLabel(`Point ${index + 1} X`, { exact: true }).inputValue()), x);
    assert.equal(Number(await outline.getByLabel(`Point ${index + 1} Y`, { exact: true }).inputValue()), y);
  }
  assert.equal(await outline.getByLabel('Point 6 X', { exact: true }).count(), 0);
  await f.snapshot('06-reopened-editable-outline');
  assert.deepEqual(await readFile(file), staged);
});
