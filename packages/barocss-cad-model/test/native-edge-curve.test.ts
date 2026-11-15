import test from 'node:test';
import assert from 'node:assert/strict';
import { curveDomain, evaluateCurve, evaluateCurveCurvature } from '@barocss/cad';
import { emptyDoc, withNode, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';
import { bodyMesh } from '../src/engine/mesh';
import { ellipseShape } from '../src/sketch/ellipse';
import { profileOf } from '../src/sketch/loops';
import { readNativeEdgeCurve } from '../src/engine/nativeEdgeCurve';
function verify(doc: StudioDoc, want: (degree: number) => boolean) {
  const before = JSON.stringify(doc), [{ key, brep }] = partBreps(doc), mesh = bodyMesh(brep, 1, 8);
  let count = 0;
  const eligible = mesh.edges.filter(edge => { const original = brep.edges.find(e => e.id === edge.nativeJoint?.edgeId); return original && want(original.curve.degree); });
  const selected = eligible.length > 8 ? [eligible[0], eligible[Math.floor(eligible.length / 4)], eligible[Math.floor(eligible.length / 2)], eligible.at(-1)!] : eligible;
  for (const edge of selected) {
    const original = brep.edges.find(e => e.id === edge.nativeJoint?.edgeId);
    if (!original || !want(original.curve.degree)) continue;
    const result = readNativeEdgeCurve(doc, key, edge.nativeJoint); assert.ok('curve' in result, JSON.stringify(result));
    const c = original.curve, copy = { ...c, controlPoints: result.curve.points, weights: result.curve.weights, knots: result.curve.knots, degree: result.curve.degree };
    assert.deepEqual(result.curve, { degree: c.degree, points: c.controlPoints, weights: c.weights, knots: c.knots });
    assert.notEqual(result.curve.points, c.controlPoints); assert.notEqual(result.curve.points[0], c.controlPoints[0]);
    const [lo, hi] = curveDomain(c);
    for (const f of [0, 0.2, 0.5, 0.8, 1]) assert.deepEqual(evaluateCurve(copy, lo + (hi-lo)*f), evaluateCurve(c, lo+(hi-lo)*f));
    assert.deepEqual(evaluateCurveCurvature(copy, lo+(hi-lo)*0.37), evaluateCurveCurvature(c, lo+(hi-lo)*0.37));
    assert.ok('error' in readNativeEdgeCurve(doc, 'missing', edge.nativeJoint));
    assert.ok('error' in readNativeEdgeCurve(doc, key, { ...edge.nativeJoint!, faces: ['wrong', edge.nativeJoint!.faces[1]] }));
    count++;
  }
  assert.ok(count > 0, JSON.stringify({ eligible: eligible.length, degrees: mesh.edges.map(e => brep.edges.find(n => n.id === e.nativeJoint?.edgeId)?.curve.degree) })); assert.equal(JSON.stringify(doc), before); return count;
}
test('tiny ellipse arcs retain every authored coefficient, endpoints and curvature', () => {
  const s = ellipseShape({ center: [0,0], rx: 12, ry: 6, angle: 0 });
  const p = profileOf([{ ...s, ids: s.points.map((_, i) => `e${i}`) }]); assert.ok('node' in p);
  const doc = withNode(withNode(emptyDoc(), p.node), { kind: 'extrude', sketch: 0, height: 6 });
  assert.ok(verify(doc, degree => degree === 2) === 4);
});
test('ordinary native lines, circular edges and G2 curves use the same faithful copy', () => {
  verify(rectanglePart(30,12,20), degree => degree === 1);
  verify(withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'loop', segments: [{ kind: 'line', start: [-4,0] }, { kind: 'arc', start: [4,0], center: [0,0], direction: 'ccw' }] }), { kind: 'extrude', sketch: 0, height: 6 }), degree => degree === 2);
  verify(withNode(rectanglePart(30,12,20), { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius: 2, section: { kind: 'g2', tension: 0.5 } }), degree => degree === 4);
});
test('missing/placed selection and failed source are explicit refusals, not approximations', () => {
  const doc = rectanglePart(10,10,10);
  assert.ok('error' in readNativeEdgeCurve(doc, 'b1', undefined));
  assert.ok('error' in readNativeEdgeCurve(doc, 'b1', { edgeId: 'missing', faces: ['a','b'] }));
  const invalid = { ...doc, nodes: doc.nodes.map(n => n.kind === 'extrude' ? { ...n, height: 0 } : n) };
  assert.ok('error' in readNativeEdgeCurve(invalid, 'b1', { edgeId: 'missing', faces: ['a','b'] }));
});
