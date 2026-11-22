import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const round = process.argv[3] === 'round';
const operation = round ? 'Round' : 'Chamfer';
const field = round ? 'radius' : 'distance';
const editKey = round ? 'sketchRound' : 'sketchChamfer';
const removal = size => size ** 2 * (round ? 1 - Math.PI / 4 : 1 / 2) * 10;
const original = [[0, 0], [40, 0], [40, 30], [0, 30]];
const sides = ['e1', 'e2', 'e3', 'e4'];
const expected = [[0, 0], [34, 0], [40, 6], [40, 30], [0, 30]];
const expectedSides = ['e1', 'e5', 'e2', 'e3', 'e4'];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { kind: 'sketch', profile: 'polygon', points: original, outline: {
      points: original, lengths: round ? { 2: 40, 3: 30 } : { 2: 40 }, hv: { h: [0, 2], v: [1, 3] },
      rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
    }, sideTags: { outer: sides }, id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const pins = [
  'apps/cad-studio/test/sketch-chamfer-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx', 'apps/cad-studio/src/state/useProposalPreview.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
  'packages/barocss-cad-model/src/chat/contract.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
  'packages/barocss-cad-model/src/sketch/corner.ts', 'packages/barocss-cad-model/src/sketch/reopen.ts',
  'packages/barocss-cad-model/src/sketch/trim.ts',
];
const f = await createFlow({
  name: `sketch-${operation.toLowerCase()}-agent`, envFrozen: round ? 'D1693_SOURCE_FROZEN' : 'D1692_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Discover, stage, preview and approve a sketch ${operation}. Save and freshly open its editable native result.`,
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
  faces: b.faces.map(face => [face.name, faceGeometry(face)]), points: b.vertices.map(v => v.point) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const session = { app: f.app, output: f.output, clientName: f.name };
const propose = (call, args, denied = false) => call('proposals', {
  action: 'propose', title: `${operation} the (40, 0) sketch corner with ${field} 6 mm`, ops: [{ tool: 'features', args }],
}, denied);

function nativeRound(result, radius) {
  const curved = result.faces.filter(([, geometry]) => geometry.kind !== 'plane');
  assert.equal(curved.length, 1);
  const [[name, geometry]] = curved;
  assert.equal(name, 'n1.side[e5]');
  assert.equal(geometry.kind, 'cylinder');
  assert.ok(Math.abs(geometry.r - radius) < 1e-8);
  assert.ok(Math.hypot(geometry.c[0] - (40 - radius), geometry.c[1] - radius) < 1e-8);
  assert.ok(Math.hypot(geometry.a[0], geometry.a[1], Math.abs(geometry.a[2]) - 1) < 1e-8);
}

await f.run(async () => {
  const file = join(f.output, `agent-${operation.toLowerCase()}-source.bcad`);
  const sourceText = JSON.stringify(source);
  await writeFile(file, sourceText);
  await f.freshOpen(file, source, '01-original-extrusion');
  const before = await f.inspect('native-before', source);
  assert.ok(Math.abs(before.volume - 40 * 30 * 10) < 1e-8);

  f.phase = 'Discover the current corner, try refusals and stage one proposal';
  const args = await withMcpSession(session, file, `sketch-${operation.toLowerCase()}`, async call => {
    const schema = await call('describe', { tool: 'features', action: 'edit' });
    assert.deepEqual(schema.input.properties[editKey].required, ['sketch', field]);
    assert.deepEqual(schema.input.properties[editKey].oneOf, [
      { required: ['sides'] }, { required: ['corners'] }, { required: [round ? 'fillet' : 'bevel'] },
    ]);
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.deepEqual([fields.index, fields.id, fields.revision], [0, 'n0', await currentPartRevision(call)]);
    const corner = fields.sketchCorners.find(item => item.point[0] === 40 && item.point[1] === 0);
    assert.deepEqual(corner.sides, ['e1', 'e2']);
    const cornerEdit = { sketch: fields.id, sides: corner.sides, [field]: 6 };
    const op = { action: 'edit', index: fields.index, expectedRevision: fields.revision, [editKey]: cornerEdit };
    for (const [edit, problem] of [
      [{ expectedRevision: undefined }, /expectedRevision/i],
      [{ [editKey]: { ...cornerEdit, sketch: 'n1' } }, /ID of one independent saved outline/],
      [{ [editKey]: { ...cornerEdit, sides: ['e1', 'e3'] } }, /straight sides of one corner/],
      [{ [editKey]: { ...cornerEdit, [field]: 30 } }, round ? /does not fit/ : /shorter than both edges/],
      ...(round ? [
        [{ [editKey]: { ...cornerEdit, sides: ['e2', 'e3'] } }, /remove a constraint/],
        [{ sketchChamfer: { sketch: fields.id, sides: corner.sides, distance: 6 } }, /one sketch corner edit/],
      ] : []),
    ]) {
      assert.match((await propose(call, { ...op, ...edit }, true)).error, problem);
      assert.equal(await readFile(file, 'utf8'), sourceText);
    }
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [{ tool: 'features', args: op }] });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.change.volume, Number((-removal(6)).toFixed(3)));
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
  const delta = card.getByLabel('Volume change');
  await delta.getByText(round ? /^−77\.\d+ mm³/ : /^−180(?:\.0+)? mm³/).waitFor();
  assert.ok(Math.abs(Number.parseFloat((await delta.innerText()).slice(1)) - removal(6)) < 0.05);
  await f.same(pending);
  assert.deepEqual(await readFile(file), staged);
  await f.snapshot('03-preview-with-original-retained');
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot(`04-approved-${operation.toLowerCase()}`);
  assert.equal(doc.proposals[0].status, 'accepted');
  const approval = doc.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
  const [sketch, extrude] = doc.nodes;
  assert.deepEqual([sketch.id, sketch.outline.points, sketch.sideTags.outer], ['n0', expected, expectedSides]);
  assert.deepEqual(sketch.outline.lengths, round ? { 3: 40, 4: 30 } : { 1: 6 * Math.SQRT2, 3: 40 });
  const fixed = source.nodes[0].outline.rules;
  assert.deepEqual(sketch.outline.rules, round ? fixed : [...fixed, { kind: 'angle', a: 0, b: 1, value: 135 }]);
  assert.deepEqual([extrude, doc.outputs], [source.nodes[1], source.outputs]);
  const after = await f.inspect('native-after', doc);
  assert.ok(Math.abs(after.volume - (40 * 30 * 10 - removal(6))) < 1e-8);
  assert.equal(after.faces.length, 7);
  if (round) nativeRound(after, 6);
  else assert.ok(after.faces.every(([, geometry]) => geometry.kind === 'plane'));
  const names = after.faces.map(([name]) => name);
  assert.ok(expectedSides.every(id => names.includes(`n1.side[${id}]`)));
  assert.equal(after.points.length, 10);
  for (const [x, y] of expected) for (const z of [0, 10])
    assert.ok(after.points.some(p => Math.hypot(x - p[0], y - p[1], z - p[2]) < 1e-8));

  const saved = await f.save(`agent-${operation.toLowerCase()}-approved`);
  await f.freshOpen(saved.file, saved.doc, '05-fresh-open');
  assert.deepEqual(await f.inspect('native-reopened', await f.doc()), after);
  await withMcpSession(session, saved.file, `reopened-${operation.toLowerCase()}`, async call => {
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
  if (round) {
    const radius = outline.getByLabel('Arc 2 radius', { exact: true });
    assert.equal(await radius.inputValue(), '6');
    await radius.fill('5');
    await radius.press('Enter');
    assert.equal(await radius.inputValue(), '5');
    const revised = (await f.finishSketch('07-revised-radius-after-open')).doc;
    assert.deepEqual(revised.nodes[0].sideTags.outer, expectedSides);
    assert.equal(revised.nodes[0].outline.radii[1], 5);
    const result = await f.inspect('native-revised-radius', revised);
    nativeRound(result, 5);
    assert.ok(Math.abs(result.volume - (40 * 30 * 10 - removal(5))) < 1e-8);
  }
  assert.deepEqual(await readFile(file), staged);
});
