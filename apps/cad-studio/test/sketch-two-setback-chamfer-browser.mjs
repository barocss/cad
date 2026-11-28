import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const batch = process.argv.includes('--batch');
const agent = process.argv.includes('--agent');
const editBaseline = process.argv.includes('--edit-baseline');
const edit = process.argv.includes('--edit') || editBaseline;
const points = [[0, 0], [40, 0], [40, 30], [0, 30]];
const pins = [
  'apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs',
  'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  'apps/cad-studio/src/sketch/cornerDraft.ts',
  'apps/cad-studio/src/sketch/constraintInspection.ts',
  'packages/barocss-cad-model/src/sketch/corner.ts',
  ...(batch ? ['packages/barocss-cad-model/src/sketch/cornerBatch.ts'] : []),
  'packages/barocss-cad-model/src/sketch/chamferEdit.ts',
  ...(agent ? [
    'apps/cad-studio/test/mcp-browser-session.mjs',
    'packages/barocss-cad-model/src/chat/contract.ts',
    'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts',
    'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
  ] : []),
];
const f = await createFlow({
  name: 'sketch-two-setback-chamfer', output: process.argv[2], envFrozen: 'TWO_SETBACK_CHAMFER_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: agent ? 'Propose the revision-pinned edit of a saved two-distance Chamfer and verify Studio approval, native parity and fresh Open.'
    : batch ? 'Apply two distinct setbacks together at two right-angle corners of the same outline.'
      : 'Apply two distinct setbacks at one authored right-angle sketch corner and reopen the native extrusion.',
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: doc.points, ids: ['e1','e2','e3','e4'],
    hv: { h: [0, 2], v: [1, 3] }, lengths: doc.batch ? { 3: 30 } : { 2: 40, 3: 30 } }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [output] = partSnapshot(doc).outputs;
  const report = checkBrep(output.brep, { strict: true });
  assert.ok(report.valid, report.issues.join(' | '));
  console.log(JSON.stringify({ volume: massPropertiesOf(output).volume, hash: digestOf(output.brep), counts: report.counts,
    vertices: output.brep.vertices.map(vertex => vertex.point), faces: output.brep.faces.map(face => face.name) }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.sketchPanel().getByRole('group', { name: 'Chamfer', exact: true });
const field = name => panel().getByLabel(name, { exact: true });
const editPanel = () => f.sketchPanel().getByRole('group', { name: 'Edit Chamfer', exact: true });
const editField = name => editPanel().getByLabel(name, { exact: true });
const preview = () => f.page.locator('.sk-corner-preview');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const cut = (incoming, outgoing) => [[0, 0], [40 - incoming, 0], [40, outgoing], [40, 30], [0, 30]];

async function editSketch() {
  await f.openFeatureEditor(1, 'Extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
}

async function startChamfer() {
  await f.worldClick(points[1]);
  if (batch) {
    await f.page.keyboard.down('Shift');
    try { await f.worldClick(points[2]); } finally { await f.page.keyboard.up('Shift'); }
  }
  const tools = f.sketchPanel().getByRole('group', { name: 'Corner tools', exact: true });
  await button('Chamfer', tools).click();
  await panel().waitFor();
  if (batch) assert.deepEqual(await f.page.locator('.sk-corner-target').evaluateAll(items => items.map(item => item.dataset.cornerIndex)), ['1', '2']);
}

async function verifyNative(label, doc, incoming, outgoing) {
  const outline = doc.nodes[0].outline;
  const expected = batch ? [[0, 0], [40 - incoming, 0], [40, outgoing], [40, 30 - incoming], [40 - outgoing, 30], [0, 30]]
    : cut(incoming, outgoing);
  for (const [i, [x, y]] of expected.entries()) {
    near(outline.points[i][0], x);
    near(outline.points[i][1], y);
  }
  assert.deepEqual(doc.nodes[0].sideTags.outer, batch ? ['e1', 'e5', 'e2', 'e6', 'e3', 'e4'] : ['e1', 'e5', 'e2', 'e3', 'e4']);
  near(outline.lengths[1], Math.hypot(incoming, outgoing));
  const angle = outline.rules.find(rule => rule.kind === 'angle' && rule.a === 0 && rule.b === 1);
  near(angle.value, 180 - Math.atan2(outgoing, incoming) * 180 / Math.PI);
  if (batch) {
    near(outline.lengths[3], Math.hypot(incoming, outgoing));
    near(outline.lengths[5], 30);
    near(outline.rules.find(rule => rule.kind === 'angle' && rule.a === 2 && rule.b === 3).value, angle.value);
    near(outline.points[3][1] - outline.points[2][1], 30 - incoming - outgoing);
  }
  const report = await f.inspect(label, doc);
  const volume = (40 * 30 - incoming * outgoing * (batch ? 1 : 0.5)) * 10;
  near(report.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  assert.equal(report.counts.faces, batch ? 8 : 7);
  assert.equal(report.counts.vertices, batch ? 12 : 10);
  assert.ok(report.faces.includes('n1.side[e5]'));
  if (batch) assert.ok(report.faces.includes('n1.side[e6]'));
  for (const [x, y] of expected) for (const z of [0, 10]) {
    assert.ok(report.vertices.some(v => Math.hypot(v[0] - x, v[1] - y, v[2] - z) < 1e-7));
  }
  f.report.observations.push({ label, incoming, outgoing, volume, angle: angle.value, hash: report.hash });
  return report;
}

async function verifyAgentEdit() {
  const sourceBytes = await readFile(process.env.TWO_SETBACK_AGENT_SOURCE);
  const source = JSON.parse(sourceBytes);
  const manual = JSON.parse(await readFile(process.env.TWO_SETBACK_MANUAL_EDIT, 'utf8'));
  const stagedFile = join(f.output, 'agent-working-copy.bcad');
  await writeFile(stagedFile, sourceBytes);
  const session = { app: f.app, output: f.output, clientName: 'two-distance-chamfer' };
  const propose = (call, args, refused = false) => call('proposals', {
    action: 'propose', title: 'Change only the incoming Chamfer distance to 6 mm', ops: [{ tool: 'features', args }],
  }, refused);

  f.phase = 'Discover the named bevel and stage one revision-pinned edit through local MCP';
  const args = await withMcpSession(session, stagedFile, 'discover-and-propose', async (call, request) => {
    const detail = await call('describe', { tool: 'features', action: 'edit' });
    assert.equal(detail.input.properties.sketchChamfer.properties.outgoingDistance.type, 'number');
    const query = { action: 'edit_fields', index: 0, includeSketchCorners: true };
    const raw = await request('tools/call', { name: 'query', arguments: query });
    const fields = JSON.parse(raw.content[0].text);
    assert.equal(raw.isError, false);
    assert.deepEqual(raw.structuredContent, fields);
    assert.equal(fields.revision, await currentPartRevision(call));
    assert.deepEqual(fields.sketchTwoDistanceChamfers, [{ bevel: 'e5', distance: 3, outgoingDistance: 4 }]);
    assert.equal(fields.sketchChamfers, undefined);
    assert.equal((await call('query', { action: 'edit_fields', index: 0 })).sketchTwoDistanceChamfers, undefined);
    const sketchChamfer = { sketch: fields.id, ...fields.sketchTwoDistanceChamfers[0], distance: 6 };
    const edit = { action: 'edit', index: fields.index, expectedRevision: fields.revision, sketchChamfer };
    assert.match((await call('features', edit, true)).error, /propos/i);
    for (const [patch, pattern] of [
      [{ expectedRevision: undefined }, /expectedRevision/i],
      [{ expectedRevision: '0000000000000000' }, /part changed/i],
      [{ sketchChamfer: { ...sketchChamfer, bevel: 'e1' } }, /saved bevel/i],
      [{ sketchChamfer: { ...sketchChamfer, outgoingDistance: undefined } }, /saved bevel/i],
      [{ sketchChamfer: { ...sketchChamfer, bevel: undefined, bevels: ['e5', 'e1'] } }, /outgoingDistance/i],
      [{ sketchChamfer: { ...sketchChamfer, distance: 40 } }, /collapse|cross/i],
      [{ sketchChamfer: { ...sketchChamfer, distance: 3 } }, /same|already/i],
    ]) {
      assert.match((await propose(call, { ...edit, ...patch }, true)).error, pattern);
      assert.deepEqual(await readFile(stagedFile), sourceBytes);
    }
    assert.deepEqual((await call('proposals', { action: 'list' })).proposals, []);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args: edit }] });
    assert.equal(dry.dryRun, true);
    near(dry.change.volume, -60);
    assert.deepEqual(dry.diff.changed.map(feature => feature.id), ['n0']);
    assert.deepEqual(await readFile(stagedFile), sourceBytes);
    const proposed = await propose(call, edit);
    assert.deepEqual([proposed.proposal, proposed.applied], ['P1', false]);
    const stagedBytes = await readFile(stagedFile);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(stagedFile), stagedBytes);
    return edit;
  });
  const stagedBytes = await readFile(stagedFile);
  const pending = JSON.parse(stagedBytes);
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  assert.equal(pending.proposals.length, 1);
  assert.deepEqual(pending.proposals[0].ops[0].args.sketchChamfer, args.sketchChamfer);

  f.phase = 'Review and approve the revision-pinned Chamfer edit in desktop Studio';
  await f.freshOpen(stagedFile, pending, 'agent-two-distance-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await card.getByLabel('Volume change').getByText(/^−60(?:\.0+)? mm³/).waitFor();
  await f.same(pending);
  await f.snapshot('agent-two-distance-preview');
  await button('Hide', card).click();
  await f.same(pending);
  assert.deepEqual(await readFile(stagedFile), stagedBytes);
  await button('Preview', card).click();
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot('agent-two-distance-accepted');
  assert.equal(doc.proposals[0].status, 'accepted');
  const approval = doc.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
  assert.deepEqual([doc.nodes, doc.outputs], [manual.nodes, manual.outputs]);
  const native = await verifyNative('agent-two-distance-native', doc, 6, 4);
  assert.equal(native.hash, (await f.inspect('manual-two-distance-native', manual)).hash);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(doc);
  const saved = await f.save('agent-two-distance-edit');
  const reopened = (await f.freshOpen(saved.file, doc, 'agent-two-distance-reopened')).doc;
  assert.deepEqual(await verifyNative('agent-two-distance-native-reopened', reopened, 6, 4), native);
  await withMcpSession(session, saved.file, 'read-reopened', async call => {
    const acceptedBytes = await readFile(saved.file);
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.notEqual(fields.revision, args.expectedRevision);
    assert.deepEqual(fields.sketchTwoDistanceChamfers, [{ bevel: 'e5', distance: 6, outgoingDistance: 4 }]);
    assert.match((await propose(call, args, true)).error, /part changed/i);
    assert.deepEqual(await readFile(saved.file), acceptedBytes);
  });
}

await f.run(async () => {
  if (agent) return verifyAgentEdit();
  const source = await f.inspect('orthogonal-stock', { points, batch }, 'seed');
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'two-setback-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  await editSketch();
  await startChamfer();
  await field('Distance').waitFor();
  if (baseline) {
    assert.equal(await field('Distance mode').count(), 0);
    await f.snapshot('equal-distance-only');
    await button('Cancel', panel()).click();
    await f.same(source);
    return;
  }

  f.phase = 'Preview two independent setbacks and keep the original outline on refusal and Cancel';
  await field('Distance mode').selectOption('two');
  await field('Incoming distance').fill('3');
  await field('Outgoing distance').fill('4');
  await preview().waitFor();
  await f.same(source);
  await f.snapshot('two-setback-preview');
  await field('Outgoing distance').fill(batch ? '27' : '30');
  if (batch) await panel().getByRole('alert').getByText(/shared edge/i).waitFor();
  assert.equal(await button('Apply', panel()).isDisabled(), true);
  await preview().waitFor({ state: 'hidden' });
  await f.same(source);
  await f.snapshot('oversized-outgoing-refused');
  await button('Cancel', panel()).click();
  await f.same(source);

  f.phase = 'Apply the two-setback bevel, then finish and check the native solid';
  await startChamfer();
  await field('Distance mode').selectOption('two');
  await field('Incoming distance').fill('3');
  await field('Outgoing distance').fill('4');
  await button('Apply', panel()).click();
  await f.same(source);
  const accepted = (await f.finishSketch('two-setback-applied')).doc;
  await verifyNative('two-setback-native', accepted, 3, 4);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('two-setback-chamfer');
  const reopened = (await f.freshOpen(saved.file, accepted, 'two-setback-reopened')).doc;
  await verifyNative('two-setback-native-reopened', reopened, 3, 4);
  if (batch) return;

  if (edit) {
    f.phase = 'Select the saved right-angle bevel and inspect its edit affordance';
    await editSketch();
    await f.worldClick([38.5, 2]);
    const tools = f.sketchPanel().getByRole('group', { name: 'Corner tools', exact: true });
    if (editBaseline) {
      assert.match(await f.sketchPanel().innerText(), /Picked edge 2/);
      assert.equal(await button('Edit Chamfer', tools).count(), 0);
      await f.snapshot('missing-two-distance-edit');
      await f.same(reopened);
      return;
    }

    const startEdit = async () => {
      await button('Edit Chamfer', tools).click();
      await editPanel().waitFor();
      assert.equal(await editField('Incoming distance').inputValue(), '3');
      assert.equal(await editField('Outgoing distance').inputValue(), '4');
      assert.equal(await button('Apply', editPanel()).isDisabled(), true);
    };
    await startEdit();
    await editField('Incoming distance').fill('6');
    await preview().waitFor();
    await f.same(reopened);
    await f.snapshot('independent-incoming-preview');
    await editField('Incoming distance').fill('40');
    await preview().waitFor({ state: 'hidden' });
    assert.equal(await button('Apply', editPanel()).isDisabled(), true);
    await f.same(reopened);
    await f.snapshot('collapsed-carrier-refused');
    await button('Cancel', editPanel()).click();
    await f.same(reopened);

    await startEdit();
    await editField('Incoming distance').fill('6');
    await button('Apply', editPanel()).click();
    const incomingOnly = (await f.finishSketch('independent-incoming-applied')).doc;
    await verifyNative('independent-incoming-native', incomingOnly, 6, 4);
    await f.undo();
    await f.same(reopened);
    await f.redo();
    await f.same(incomingOnly);

    await editSketch();
    await f.worldClick([37, 2]);
    await button('Edit Chamfer', tools).click();
    assert.equal(await editField('Incoming distance').inputValue(), '6');
    assert.equal(await editField('Outgoing distance').inputValue(), '4');
    await editField('Outgoing distance').fill('8');
    await button('Apply', editPanel()).click();
    const revised = (await f.finishSketch('independent-outgoing-applied')).doc;
    await verifyNative('independent-outgoing-native', revised, 6, 8);
    await f.undo();
    await f.same(incomingOnly);
    await f.redo();
    await f.same(revised);
    const savedEdit = await f.save('independent-two-distance-edit');
    const reopenedEdit = (await f.freshOpen(savedEdit.file, revised, 'independent-edit-reopened')).doc;
    await verifyNative('independent-edit-native-reopened', reopenedEdit, 6, 8);
    return;
  }

  f.phase = 'Edit the persisted bevel length while keeping the angle and original carriers';
  await editSketch();
  await f.sketchPanel().getByLabel('Edge 2 length', { exact: true }).fill('10');
  const revised = (await f.finishSketch('two-setback-length-edited')).doc;
  await verifyNative('edited-two-setback-native', revised, 6, 8);
});
