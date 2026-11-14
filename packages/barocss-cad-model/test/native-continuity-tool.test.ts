import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationsOf } from '../src/chat/contract';
import { v2Result } from '../src/chat/groups';
import { BATCHABLE_TOOLS, runTool } from '../src/chat/tools';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { readEdgeContinuity } from '../src/engine/edgeContinuity';
import { partBreps } from '../src/engine/evaluate';

const body = 'b2';
const fillet = () => withNode(rectanglePart(30, 12, 20), {
  kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius: 2,
});
async function query(doc: StudioDoc, action: string, args: Record<string, unknown>) {
  const before = JSON.stringify(doc);
  const out = await runTool({ doc, bodies: [], approvalRequired: true }, 'query', { action, ...args }, async () => {
    throw new Error('A native joint read must not request a model commit.');
  });
  assert.equal(out.changed, false);
  assert.equal(out.state.doc, doc);
  assert.equal(JSON.stringify(doc), before);
  return { isError: out.isError, content: JSON.parse(out.content) };
}

test('discovery and measurement retain the native fillet edge and full eight-sample trace', async () => {
  const doc = fillet();
  const discovered = await query(doc, 'native_joints', { body });
  assert.equal(discovered.isError, false);
  const { revision, edges } = discovered.content;
  assert.match(revision, /^[a-f0-9]{64}$/);
  const expected = readEdgeContinuity(doc, body, { kind: 'list' });
  assert.ok('edges' in expected);
  assert.deepEqual(edges, expected.edges);
  const blend = expected.edges.filter(edge => edge.faces.includes('n2.face'));
  const tangent = blend.filter(edge => edge.faces.includes('n1.side0') || edge.faces.includes('n1.top'));
  assert.equal(tangent.length, 2);
  for (const edge of tangent) {
    const measured = await query(doc, 'edge_continuity', { body, expectedRevision: revision, edgeId: edge.id });
    const direct = readEdgeContinuity(doc, body, { kind: 'measure', edgeId: edge.id });
    assert.ok('measurement' in direct && direct.measurement.status === 'measured');
    assert.equal(measured.isError, false);
    assert.deepEqual(measured.content, { body, revision, unit: 'degrees', ...direct.measurement });
    assert.equal(measured.content.sampleCount, 8);
    assert.ok(measured.content.maximumAngleDegrees < 1e-7);
  }
  for (const edge of blend.filter(edge => !tangent.includes(edge))) {
    const refused = await query(doc, 'edge_continuity', { body, expectedRevision: revision, edgeId: edge.id });
    assert.equal(refused.isError, true);
    assert.equal(refused.content.status, 'unsupported');
    assert.equal(refused.content.reason, 'missing-pcurve');
    assert.equal(refused.content.samples, undefined);
  }
});

test('a revision binds the exact session document and base body', async () => {
  const first = withNode(rectanglePart(30, 12, 20), { kind: 'sketch', profile: 'rectangle', min: [40, 0], max: [70, 12] });
  const doc = withNode(first, { kind: 'extrude', sketch: 2, height: 20 });
  const [a, b] = partBreps(doc);
  assert.ok(a && b);
  const left = await query(doc, 'native_joints', { body: a.key });
  const right = await query(doc, 'native_joints', { body: b.key });
  assert.equal(left.isError, false);
  assert.equal(right.isError, false);
  assert.notEqual(left.content.revision, right.content.revision);
  const args = { body: b.key, edgeId: right.content.edges[0].id, expectedRevision: right.content.revision };
  assert.equal((await query(doc, 'edge_continuity', args)).isError, false);
  for (const [changed, expectedRevision] of [[doc, left.content.revision], [{ ...doc, parameters: { changed: 1 } }, right.content.revision]] as const) {
    const refused = await query(changed, 'edge_continuity', { ...args, expectedRevision });
    assert.equal(refused.isError, true);
    assert.match(refused.content.error, /changed/);
    assert.equal(refused.content.maximumAngleDegrees, undefined);
  }
});

test('unknown geometry and invalid arguments refuse without measurements', async () => {
  const doc = fillet();
  for (const args of [{ body: [] }, { body: 'missing' }, { body, part: 'base' }]) {
    assert.equal((await query(doc, 'native_joints', args)).isError, true);
  }
  const { content: { revision } } = await query(doc, 'native_joints', { body });
  const args = { body, edgeId: 'set_material', expectedRevision: revision };
  const unknown = await query(doc, 'edge_continuity', args);
  assert.equal(unknown.isError, true);
  assert.equal(unknown.content.reason, 'edge-not-found');
  assert.equal(unknown.content.edgeId, 'set_material');
  for (const changed of [{ ...args, expectedRevision: '' }, { ...args, edgeId: 1 }, { body, expectedRevision: revision }]) {
    const refused = await query(doc, 'edge_continuity', changed);
    assert.equal(refused.isError, true);
    assert.equal(refused.content.samples, undefined);
  }
});

test('read contracts keep literal native labels and cannot run in an edit batch', () => {
  const label = 'get_part_summary';
  for (const name of ['list_native_joints', 'measure_edge_continuity']) {
    assert.equal(annotationsOf(name).readOnlyHint, true);
    assert.equal(BATCHABLE_TOOLS.has(name), false);
    const payload = JSON.stringify({ body: 'set_material', edges: [{ id: label, name: label, faces: [label, 'n1.top'] }], edgeId: label });
    assert.equal(v2Result(payload, name), payload);
  }
});

test('a model evaluation failure is a tool refusal without native measurements', async () => {
  const doc = fillet();
  const extrude = doc.nodes[1];
  assert.equal(extrude.kind, 'extrude');
  extrude.height = { parameter: 'missing_joint_height' };
  const refused = await query(doc, 'native_joints', { body });
  assert.equal(refused.isError, true);
  assert.match(refused.content.error, /missing_joint_height/);
  assert.equal(refused.content.edges, undefined);
});
