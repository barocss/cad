import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type SketchNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

function stock(height: number) {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  return withNode(sketch, { kind: 'extrude', sketch: 0, height });
}

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  return { doc, bodies: evaluated.bodies };
}

const hole = { action: 'command', command: 'hole', faces: ['n1.top'], values: { type: 'through', x: 11, y: 9, d: 6 } };

test('a stale command pin refuses even when the selected face name is present in both revisions', async () => {
  const current = await stateOf(stock(10));
  const stale = revisionOf(stock(8));
  for (const faces of [hole.faces, ['unknown']]) {
    const refused = await dispatchTool(current, 'features', { ...hole, faces, expectedRevision: stale }, () => {
      assert.fail('a stale command must refuse before candidate evaluation');
    });
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state, current);
    const { code, expectedRevision, revision } = JSON.parse(refused.content);
    assert.deepEqual([code, expectedRevision, revision], ['COMMAND_STALE', stale, revisionOf(current.doc)]);
  }
  for (const expectedRevision of [null, 0, 'bad-pin', 'FFFFFFFFFFFFFFFF']) {
    const malformed = await dispatchTool(current, 'features', { ...hole, expectedRevision }, evaluate);
    assert.ok(malformed.isError && !malformed.changed, malformed.content);
    assert.equal(JSON.parse(malformed.content).code, 'COMMAND_INPUT');
    assert.equal(malformed.state, current);
  }
  const accepted = await dispatchTool(current, 'features', { ...hole, expectedRevision: revisionOf(current.doc) }, evaluate);
  const unpinned = await dispatchTool(current, 'features', hole, evaluate);
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(accepted.state.doc, unpinned.state.doc);
  const node = accepted.state.doc.nodes[2];
  assert.ok(node?.kind === 'hole' && node.radius === 3);
  assert.deepEqual(node.center, [11, 9]);
  const volume = accepted.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - (12000 - 90 * Math.PI)) < 1e-7);
});

test('a command pin is checked against the addressed part and the current batch position', async () => {
  const child = stock(10);
  const parent = await stateOf({
    ...stock(5),
    instances: [{ id: 'p1', name: 'Plate', doc: child, position: [50, 0, 0], rotation: [0, 0, 0] }],
  });
  const wrongScope = await dispatchTool(parent, 'features', { ...hole, part: 'p1', expectedRevision: revisionOf(parent.doc) }, evaluate);
  assert.equal(JSON.parse(wrongScope.content).code, 'COMMAND_STALE');
  assert.equal(wrongScope.state, parent);
  const correctScope = await dispatchTool(parent, 'features', { ...hole, part: 'p1', expectedRevision: revisionOf(child) }, evaluate);
  assert.ok(correctScope.changed && !correctScope.isError, correctScope.content);
  assert.equal(correctScope.state.doc.instances?.[0].doc.nodes[2].kind, 'hole');
  assert.deepEqual(correctScope.state.doc.nodes, parent.doc.nodes);

  const current = await stateOf(child);
  const rejected = await dispatchTool(current, 'features', { action: 'batch', ops: [
    { tool: 'features', args: { action: 'edit', index: 1, values: { h: 12 } } },
    { tool: 'features', args: { ...hole, expectedRevision: revisionOf(child) } },
  ] }, evaluate);
  assert.ok(rejected.isError && !rejected.changed, rejected.content);
  assert.equal(rejected.state, current);
  assert.equal(JSON.parse(rejected.content).failed_op, 1);
  assert.match(JSON.parse(rejected.content).error, /op 1 .*The part changed since the requested revision/);
});

for (const [command, expectedVolume] of [['ruled-turn', 3200], ['smooth-turn', 4800.280129856528]] as const) {
  test(`${command} requires one exact current sketch ID and document pin`, async () => {
    const rectangle = { kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10] } satisfies SketchNode;
    const doc = withNode(withNode(emptyDoc(), rectangle),
      { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [22, 4] });
    const current = await stateOf(doc);
    const values = { sketch: 'n0', height: 50, angle: -450 };
    const action = { action: 'command', command, values };
    const expectedRevision = revisionOf(doc);
    const stale = revisionOf({ ...doc, nodes: [{ ...rectangle, id: 'n0', min: [1, 2], max: [15, 10] }, doc.nodes[1]] });
    const cases = [
      [{ ...action }, 'COMMAND_INPUT'],
      [{ ...action, expectedRevision: stale }, 'COMMAND_STALE'],
      [{ ...action, expectedRevision, values: { ...values, sketch: 'n9' } }, 'COMMAND_INPUT'],
      [{ ...action, expectedRevision, values: { ...values, sketch: 0 } }, 'COMMAND_INPUT'],
      [{ ...action, expectedRevision, faces: ['unknown-face'] }, 'COMMAND_INPUT'],
    ] as const;
    for (const [args, code] of cases) {
      const result = await dispatchTool(current, 'features', args, () => {
        assert.fail('A refused Ruled Turn must stay outside candidate evaluation');
      });
      assert.ok(result.isError && !result.changed, result.content);
      assert.equal(JSON.parse(result.content).code, code);
      assert.equal(result.state, current);
    }
    const script = await dispatchTool(current, 'model', { source: `${command.replace('-', '_')}({sketch: "n0", height: 50, angle: -450})` }, () => {
      assert.fail('A script cannot evaluate a command without its revision pin');
    });
    assert.ok(script.isError && !script.changed, script.content);
    assert.match(JSON.parse(script.content).error, new RegExp(`unknown.*${command.replace('-', '_')}`, 'i'));
    assert.equal(script.state, current);
    const accepted = await dispatchTool(current, 'features', { ...action, expectedRevision }, evaluate);
    assert.ok(accepted.changed && !accepted.isError, accepted.content);
    const manual = commandById(command)!.build!({
      doc, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] },
    }, { height: 50, angle: -450 });
    assert.deepEqual(accepted.state.doc.nodes, manual.nodes);
    assert.deepEqual(accepted.state.doc.outputs, manual.outputs);
    const volume = accepted.state.bodies[0].volume;
    assert.ok(volume !== null && Math.abs(volume - expectedVolume) < 1e-7);
  });
}

const quarterDisk: SketchNode = {
  kind: 'sketch', profile: 'loop', segments: [
    { kind: 'line', start: [0, 0] },
    { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' },
    { kind: 'line', start: [0, 10] },
  ],
};
const draftFixture = withNode(withNode(emptyDoc(), quarterDisk),
  { kind: 'sketch', profile: 'rectangle', min: [16, 0], max: [34, 9] });
const draftValues = { sketch: 'n0', h: 10, draft: 10, depth: 'distance' };
const reviewedDraft = { action: 'command', command: 'extrude', expectedRevision: revisionOf(draftFixture), values: draftValues };

test('reviewed distance Draft runs the shared Extrude on the exact sketch, with either sign', async () => {
  const current = await stateOf(draftFixture);
  for (const draft of [10, -10]) {
    const result = await dispatchTool(current, 'features', { ...reviewedDraft, values: { ...draftValues, draft } }, evaluate);
    assert.ok(result.changed && !result.isError, result.content);
    const manual = commandById('extrude')!.build!({
      doc: current.doc, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] },
    }, { h: 10, draft });
    assert.deepEqual(result.state.doc, manual);
    assert.equal(JSON.parse(result.content).sketch, 'n0');
  }
  const implicit = await dispatchTool(current, 'features',
    { action: 'command', command: 'extrude', values: { h: 10, draft: 10 } }, evaluate);
  assert.ok(implicit.changed && !implicit.isError, implicit.content);
  assert.deepEqual(implicit.state.doc.nodes.at(-1), { id: 'n2', kind: 'extrude', sketch: 1, height: 10, draft: 10 });
});

test('reviewed distance Draft refuses ambiguous sources and values before evaluation', async () => {
  const original = await stateOf(draftFixture);
  const candidates = [
    { ...reviewedDraft, expectedRevision: undefined },
    { ...reviewedDraft, faces: [] },
    ...[
      { sketch: 0 }, { sketch: 'missing' }, { h: '10' }, { h: 0.01 }, { h: Infinity },
      { draft: 0 }, { draft: 61 }, { draft: NaN }, { depth: 'through' }, { op: 'join' },
    ].map(extra => ({ ...reviewedDraft, values: { ...draftValues, ...extra } })),
  ];
  const unexpectedEvaluation = () => assert.fail('Invalid reviewed Draft reached candidate evaluation');
  for (const args of candidates) {
    const result = await dispatchTool(original, 'features', args, unexpectedEvaluation);
    assert.equal(JSON.parse(result.content).code, 'COMMAND_INPUT');
    assert.equal(result.state, original);
  }
  const [source, other] = original.doc.nodes;
  assert.ok(source.kind === 'sketch' && other.kind === 'sketch');
  for (const nodes of [
    [source, { ...other, id: source.id }],
    [{ ...source, suppressed: true as const }, other],
    [{ ...source, on: { node: 1, side: 'solid' as const } }, other],
  ]) {
    const state = { ...original, doc: { ...original.doc, nodes } };
    const result = await dispatchTool(state, 'features',
      { ...reviewedDraft, expectedRevision: revisionOf(state.doc) }, unexpectedEvaluation);
    assert.equal(JSON.parse(result.content).code, 'COMMAND_INPUT');
    assert.equal(result.state, state);
  }
});
