import assert from 'node:assert/strict';
import test from 'node:test';
import type { Curve } from '@barocss/cad';
import { annotationsOf, outputSchemaOf, validate } from '../src/chat/contract';
import { BATCHABLE_TOOLS, runTool } from '../src/chat/tools';
import { emptyDoc, withNode } from '../src/engine/doc';
import { readEdgeContinuity } from '../src/engine/edgeContinuity';
import { sampleEdgeCurvature } from '../src/engine/edgeCurvature';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import type { ChatState } from '../src/chat/toolKit';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} versus ${expected}`);
const arc: Curve = { id: 'test', kind: 'curve', degree: 2, knots: [-3, -3, -3, 2, 2, 2],
  controlPoints: [[4, 0, 6], [4, 4, 6], [0, 4, 6]], weights: [1, Math.SQRT1_2, 1] };

test('native curve samples preserve the knot domain and inward curvature under reversal', () => {
  const reversed = { ...arc, controlPoints: [...arc.controlPoints].reverse(), weights: [...arc.weights].reverse() };
  const [forward] = sampleEdgeCurvature(arc), [backward] = sampleEdgeCurvature(reversed);
  assert.equal(forward.length, 8);
  for (const [i, sample] of forward.entries()) {
    assert.ok(-3 < sample.parameter && sample.parameter < 2);
    near(sample.magnitude, 0.25);
    near(Math.hypot(sample.point[0], sample.point[1]), 4);
    near(sample.point[2], 6);
    sample.vector.forEach((value, axis) => {
      near(value, (axis === 2 ? 0 : -sample.point[axis]) / 16);
      near(value, backward[7 - i].vector[axis]);
    });
  }
});

const capsule = () => withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'loop', segments: [
  { kind: 'line', start: [0, -4] },
  { kind: 'arc', start: [20, -4], center: [20, 0], direction: 'ccw' },
  { kind: 'line', start: [20, 4] },
  { kind: 'arc', start: [0, 4], center: [0, 0], direction: 'ccw' },
] }), { kind: 'extrude', sketch: 0, height: 6 });

test('the worker and agent can read a two-span selected edge without recording it as a model edit', async () => {
  const doc = capsule(), before = JSON.stringify(doc), body = 'b1';
  const evaluated = evaluateDoc(doc, 0);
  assert.ok(evaluated.ok);
  const state: ChatState = { doc, bodies: evaluated.bodies, approvalRequired: true };
  const read = async (action: string, args: Record<string, unknown>) => {
    const out = await runTool(state, 'query', { action, ...args }, async () => { throw new Error('Curvature must be read-only.'); });
    assert.equal(out.changed, false);
    assert.equal(out.state.doc, doc);
    assert.equal(JSON.stringify(doc), before);
    return { error: out.isError, value: JSON.parse(out.content) };
  };

  const picked = (name: string) => {
    const edge = evaluated.bodies[0].mesh.edges.find(edge => edge.names.includes(name));
    assert.ok(edge?.nativeJoint, name);
    return edge.nativeJoint;
  };
  const line = picked('n1.side0|n1.top');
  const straight = readEdgeContinuity(doc, body, { kind: 'curve', edgeId: line.edgeId, picked: line });
  assert.ok('curve' in straight);
  assert.equal(straight.curve.maximum, 0);
  assert.ok(straight.curve.spans.flat().every(sample => sample.vector.every(value => value === 0)));
  const right = picked('n1.side1|n1.top');
  const wrong = readEdgeContinuity(doc, body, { kind: 'curve', edgeId: right.edgeId, picked: line });
  assert.ok('error' in wrong);

  const listed = await read('native_joints', { body });
  assert.equal(listed.error, false);
  const args = { body, edgeId: right.edgeId, expectedRevision: listed.value.revision };
  const remote = await read('edge_curvature', args);
  assert.equal(remote.error, false);
  assert.deepEqual(validate(outputSchemaOf('measure_edge_curvature')!, remote.value), []);
  const native = readEdgeContinuity(doc, body, { kind: 'curve', edgeId: right.edgeId, picked: right });
  assert.ok('curve' in native);
  assert.deepEqual(remote.value, { body, revision: args.expectedRevision, ...native.curve });
  assert.deepEqual(native.curve.spans.map(span => span.length), [8, 8]);
  for (const [i, span] of native.curve.spans.entries()) {
    for (const sample of span) {
      assert.ok(i / 2 < sample.parameter && sample.parameter < (i + 1) / 2);
      near(sample.magnitude, 0.25);
      near(sample.vector[0], (20 - sample.point[0]) / 16);
      near(sample.vector[1], -sample.point[1] / 16);
    }
  }
  assert.equal((await read('edge_curvature', { ...args, expectedRevision: '0'.repeat(64) })).error, true);
  assert.equal((await read('edge_curvature', { ...args, edgeId: 'missing' })).error, true);
  assert.equal(annotationsOf('measure_edge_curvature').readOnlyHint, true);
  assert.equal(BATCHABLE_TOOLS.has('measure_edge_curvature'), false);
});


test('a mixed facet Boolean does not certify curvature on retained exact-looking edges', () => {
  const doc = withNode(capsule(), { kind: 'mesh', name: 'Tetrahedron', unit: 'mm', representation: 'facets',
    positions: [50, 0, 0, 51, 0, 0, 50, 1, 0, 50, 0, 1], indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3] });
  const mixed = withNode(doc, { kind: 'union', left: { node: 2, side: 'solid' }, right: { node: 1, side: 'solid' } });
  const [{ key, brep }] = partBreps(mixed);
  assert.equal(brep.source.family, 'mesh');
  const listed = readEdgeContinuity(mixed, key, { kind: 'list' });
  assert.ok('edges' in listed && listed.edges.length > 0);
  const result = readEdgeContinuity(mixed, key, { kind: 'curve', edgeId: listed.edges[0].id });
  assert.ok('error' in result && /non-faceted/.test(result.error));
});
