import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';
import { outputSchemaOf, validate } from '../src/chat/contract';

function stock(height = 8) {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] });
  return withNode(sketch, { kind: 'extrude', sketch: 0, height });
}

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const edit = (state: ChatState, input: Record<string, unknown>, read = evaluate) =>
  dispatchTool(state, 'features', { action: 'edit', index: 1, values: { h: 12 }, ...input }, read);

async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  return { doc, bodies: evaluated.bodies };
}

test('a revision pin guards both value edits and whole-node replacement before evaluating', async () => {
  const first = await stateOf(stock());
  const pin = revisionOf(first.doc);
  const updated = await edit(first, { expectedRevision: pin });
  assert.ok(updated.changed && !updated.isError, updated.content);
  const volume = updated.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - 9600) < 1e-7);
  const next = updated.state;
  const neverEvaluate = async (): Promise<never> => assert.fail('a rejected revision never evaluates the candidate');
  for (const input of [{ values: { from: 2 } }, { feature: { kind: 'extrude', sketch: 0, height: 10 } }]) {
    const result = await edit(next, { ...input, expectedRevision: pin }, neverEvaluate);
    assert.ok(result.isError && !result.changed);
    assert.equal(result.state, next);
    const { code, expectedRevision, revision } = JSON.parse(result.content);
    assert.deepEqual([code, expectedRevision, revision], ['EDIT_STALE', pin, revisionOf(next.doc)]);
  }
  for (const expectedRevision of [null, 0, 'bad-pin', 'FFFFFFFFFFFFFFFF']) {
    const invalid = await edit(next, { expectedRevision }, neverEvaluate);
    assert.ok(invalid.isError && !invalid.changed);
    assert.equal(JSON.parse(invalid.content).code, 'EDIT_INPUT');
  }
  const unpinned = await edit(first, {});
  assert.ok(unpinned.changed && !unpinned.isError, unpinned.content);
  assert.deepEqual(unpinned.state.doc, next.doc);
});

test('a placed-part edit compares to rebuild in the same part scope', async () => {
  const child = stock();
  const parent = await stateOf({
    ...stock(5),
    instances: [{ id: 'p1', name: 'Plate', doc: child, position: [50, 0, 0], rotation: [0, 0, 0] }],
  });
  const rebuild = await dispatchTool(parent, 'query', { action: 'rebuild', part: 'p1' }, evaluate);
  assert.ok(!rebuild.isError, rebuild.content);
  const { revision: partPin } = JSON.parse(rebuild.content);
  assert.notEqual(partPin, revisionOf(parent.doc));
  const wrongScope = await edit(parent, { part: 'p1', expectedRevision: revisionOf(parent.doc) });
  assert.equal(JSON.parse(wrongScope.content).code, 'EDIT_STALE');
  assert.equal(JSON.parse(wrongScope.content).revision, partPin);
  assert.equal(wrongScope.state, parent);
  const correctScope = await edit(parent, { part: 'p1', expectedRevision: partPin });
  assert.ok(correctScope.changed && !correctScope.isError, correctScope.content);
  const extrusion = correctScope.state.doc.instances?.[0].doc.nodes[1];
  assert.ok(extrusion?.kind === 'extrude');
  assert.equal(extrusion.height, 12);
  assert.deepEqual(correctScope.state.doc.nodes, parent.doc.nodes);
  assert.deepEqual(parent.doc.instances?.[0].doc, child);
});

test('a pin at a stale batch position leaves earlier staged edits unapplied', async () => {
  const before = await stateOf(stock());
  const pin = revisionOf(before.doc);
  const rejected = await dispatchTool(before, 'features', { action: 'batch', ops: [
    { tool: 'features', args: { action: 'edit', index: 1, values: { h: 12 }, expectedRevision: pin } },
    { tool: 'features', args: { action: 'edit', index: 1, values: { from: 2 }, expectedRevision: pin } },
  ] }, evaluate);
  assert.ok(rejected.isError && !rejected.changed, rejected.content);
  assert.equal(rejected.state, before);
  assert.equal(JSON.parse(rejected.content).failed_op, 1);
});

test('sketch chamfer discovers saved side IDs and makes an atomic revision-pinned edit', async () => {
  const original = stock();
  const base = original.nodes[0];
  assert.ok(base.kind === 'sketch' && base.profile === 'rectangle');
  const plane = { origin: [0, 0, 4], normal: [0, 0, 1], xAxis: [1, 0, 0] } as const;
  const doc: StudioDoc = { ...original, nodes: [
    { ...base, plane: { origin: [...plane.origin], normal: [...plane.normal], xAxis: [...plane.xAxis] },
      sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
      construction: [{ kind: 'circle', c: [12, 8], r: 2, construction: true, ids: ['e9'] }] },
    original.nodes[1],
  ] };
  const before = await stateOf(doc);
  const neverEvaluate = async (): Promise<never> => assert.fail('A read or refused chamfer must not evaluate.');
  const read = await dispatchTool(before, 'query', { action: 'edit_fields', index: 0, includeSketchCorners: true }, neverEvaluate);
  assert.ok(!read.isError && !read.changed, read.content);
  assert.equal(read.state, before);
  const result = JSON.parse(read.content);
  assert.deepEqual(validate(outputSchemaOf('list_feature_edit_fields')!, result), []);
  assert.equal(result.id, 'n0');
  assert.deepEqual(result.sketchCorners[1], { point: [40, 0], sides: ['e1', 'e2'] });
  const expectedRevision = revisionOf(doc);
  assert.equal(result.revision, expectedRevision);
  const sketchChamfer = { sketch: 'n0', sides: ['e2', 'e1'], distance: 6 };
  const args = { action: 'edit', index: 0, expectedRevision, sketchChamfer };
  for (const [patch, code] of [
    [{ expectedRevision: '0000000000000000' }, 'EDIT_STALE'],
    [{ expectedRevision: undefined }, 'EDIT_INPUT'],
    [{ values: {} }, 'EDIT_INPUT'],
    [{ sketchChamfer: { ...sketchChamfer, sketch: 'n1' } }, 'EDIT_SKETCH_CHAMFER_SOURCE'],
    [{ sketchChamfer: { ...sketchChamfer, sides: ['e1', 'e3'] } }, 'EDIT_SKETCH_CHAMFER_CORNER'],
    [{ sketchChamfer: { ...sketchChamfer, distance: 21 } }, 'EDIT_SKETCH_CHAMFER_GEOMETRY'],
  ] as const) {
    const denied = await dispatchTool(before, 'features', { ...args, ...patch }, neverEvaluate);
    assert.ok(denied.isError && !denied.changed, denied.content);
    assert.equal(denied.state, before);
    assert.equal(JSON.parse(denied.content).code, code, denied.content);
  }
  const changed = await dispatchTool(before, 'features', args, evaluate);
  assert.ok(changed.changed && !changed.isError, changed.content);
  const sketch = changed.state.doc.nodes[0];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  assert.deepEqual(sketch, {
    kind: 'sketch', profile: 'polygon', id: 'n0',
    points: [[0, 0], [34, 0], [40, 6], [40, 20], [0, 20]],
    outline: { points: [[0, 0], [34, 0], [40, 6], [40, 20], [0, 20]], hv: { h: [0, 3], v: [2, 4] },
      lengths: { 1: 6 * Math.SQRT2 }, rules: [{ kind: 'angle', a: 0, b: 1, value: 135 }] },
    sideTags: { outer: ['e1', 'e10', 'e2', 'e3', 'e4'] }, plane,
    construction: [{ kind: 'circle', c: [12, 8], r: 2, construction: true, ids: ['e9'] }],
  });
  assert.ok(Math.abs(changed.state.bodies[0].volume! - (40 * 20 - 18) * 8) < 1e-8);
  assert.deepEqual(changed.state.doc.nodes[1], doc.nodes[1]);

  const tagged = doc.nodes[0];
  assert.ok(tagged.kind === 'sketch' && tagged.profile === 'rectangle');
  const bound = await stateOf({ ...doc, parameters: { W: 40 }, nodes: [
    { ...tagged, max: [{ parameter: 'W' }, 20] }, doc.nodes[1],
  ] });
  const denied = await dispatchTool(bound, 'features', { ...args, expectedRevision: revisionOf(bound.doc) }, neverEvaluate);
  assert.ok(denied.isError && !denied.changed, denied.content);
  assert.equal(denied.state, bound);
  assert.equal(JSON.parse(denied.content).code, 'EDIT_SKETCH_CHAMFER_BINDING');
});

test('pinned sketch corner groups resolve distinct side pairs and refuse the entire invalid edit', async () => {
  const ordinary = stock();
  const base = ordinary.nodes[0];
  assert.ok(base.kind === 'sketch' && base.profile === 'rectangle');
  const before = await stateOf({ ...ordinary, nodes: [{
    ...base, sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
    construction: [{ kind: 'circle', c: [12, 8], r: 2, construction: true, ids: ['e9'] }],
  }, ordinary.nodes[1]] });
  const neverEvaluate = async (): Promise<never> => assert.fail('The refused group must not evaluate.');
  const expectedRevision = revisionOf(before.doc);
  const corners = [['e3', 'e2'], ['e2', 'e1']];

  for (const [key, field, prefix] of [
    ['sketchRound', 'radius', 'EDIT_SKETCH_ROUND'],
    ['sketchChamfer', 'distance', 'EDIT_SKETCH_CHAMFER'],
  ] as const) {
    const cornerEdit = { sketch: 'n0', corners, [field]: 6 };
    const args = { action: 'edit', index: 0, expectedRevision, [key]: cornerEdit };
    for (const [patch, code, message] of [
      [{ expectedRevision: '0000000000000000' }, 'EDIT_STALE', /changed since/],
      [{ [key]: { ...cornerEdit, sides: corners[0] } }, 'EDIT_INPUT', /use sides.*or corners/i],
      [{ [key]: { ...cornerEdit, corners: [corners[0]] } }, 'EDIT_INPUT', /at least two side pairs/],
      [{ [key]: { ...cornerEdit, corners: new Array(2) } }, 'EDIT_INPUT', /at least two side pairs/],
      [{ [key]: { ...cornerEdit, corners: [corners[0], [...corners[0]].reverse()] } }, `${prefix}_CORNER`, /each selected corner once/],
      [{ [key]: { ...cornerEdit, corners: [corners[0], ['e1', 'e3']] } }, `${prefix}_CORNER`, /straight sides of one corner/],
      [{ [key]: { ...cornerEdit, [field]: 10 } }, `${prefix}_GEOMETRY`, /shared edge/],
    ] as const) {
      const denied = await dispatchTool(before, 'features', { ...args, ...patch }, neverEvaluate);
      assert.ok(denied.isError && !denied.changed, denied.content);
      assert.equal(denied.state, before);
      const failure = JSON.parse(denied.content);
      assert.equal(failure.code, code);
      assert.match(failure.error, message);
    }
    const accepted = await dispatchTool(before, 'features', args, evaluate);
    assert.ok(accepted.changed && !accepted.isError, accepted.content);
    const sketch = accepted.state.doc.nodes[0];
    assert.ok(sketch.kind === 'sketch');
    assert.deepEqual(sketch.sideTags?.outer, ['e1', 'e10', 'e2', 'e11', 'e3', 'e4']);
    assert.deepEqual(sketch.construction, (before.doc.nodes[0] as typeof sketch).construction);
    assert.deepEqual(accepted.state.doc.nodes[1], before.doc.nodes[1]);
  }
});
