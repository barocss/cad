import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { readStudioDoc } from '../src/engine/migrate';
function fixture(): StudioDoc {
  return withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [10, 10], max: [20, 30] }),
    { kind: 'revolve', sketch: 0, axis: 'y', angle: 360 });
}
const patch = (doc: StudioDoc, i: number, change: object): StudioDoc => ({ ...doc, nodes: doc.nodes.map((n, k) => k === i ? { ...n, ...change } as ModelNode : n) });
function axis(nodes: readonly ModelNode[]) { const f = editFields(nodes, 1).find(f => f.key === 'sketchAxis'); assert.ok(f?.kind === 'choice'); return f; }
test('plain terminal Revolve changes only its sketch-axis property and preserves the profile', () => {
  const doc = fixture(), before = structuredClone(doc), field = axis(doc.nodes);
  assert.equal(field.get(doc.nodes), 'y');
  assert.deepEqual(field.set(doc.nodes, 'y'), doc.nodes); assert.deepEqual(field.set(doc.nodes, 'z'), doc.nodes);
  const x = field.set(doc.nodes, 'x'); assert.equal(x[0], doc.nodes[0]); assert.deepEqual(x[1], { ...doc.nodes[1], axis: 'x' });
  assert.deepEqual(axis(x).set(x, 'y'), doc.nodes); assert.deepEqual(doc, before);
});
test('X/Y native volume, centroid and cylindrical wall axes agree with independent annular-solid formulas', () => {
  const source = fixture();
  for (const direction of ['x', 'y'] as const) {
    const doc = { ...source, nodes: axis(source.nodes).set(source.nodes, direction) }, before = structuredClone(doc);
    const [body] = evaluateCadPart(toPartDocument(doc)).outputs, mass = massPropertiesOf(body), k = direction === 'x' ? 0 : 1;
    assert.ok(checkOutput(body).valid); assert.equal(body.bodyCount, 1);
    assert.ok(Math.abs(mass.volume - (direction === 'x' ? 8000 : 6000) * Math.PI) < 1e-7);
    const centre = direction === 'x' ? [15, 0, 0] : [0, 20, 0];
    mass.centroid.forEach((v, i) => assert.ok(Math.abs(v - centre[i]) < 1e-7));
    const cylinders = body.brep.faces.map(face => faceGeometry(face)).filter(g => g.kind === 'cylinder'); assert.ok(cylinders.length > 0);
    for (const c of cylinders) assert.ok(Math.abs(Math.abs(c.a[k]) - 1) < 1e-8);
    assert.deepEqual(readStudioDoc(JSON.stringify(doc)), { doc, notes: [] }); assert.deepEqual(doc, before);
  }
});
const excluded: [string, number, object][] = [
  ['linked', 1, { axisRef: {} }], ['fixed direction', 1, { dir: [0, 1] }], ['explicit zero origin', 1, { origin: [0, 0] }],
  ['held', 1, { held: { reason: 'test' } }], ['suppressed', 1, { suppressed: true }], ['recipe', 1, { made: {} }],
  ['invalid axis', 1, { axis: 'z' }], ['self profile', 1, { sketch: 1 }], ['missing profile', 1, { sketch: -1 }],
  ['associated profile', 0, { association: {} }], ['pocket profile', 0, { pocketFloor: {} }],
  ['suppressed profile', 0, { suppressed: true }], ['held profile', 0, { held: { reason: 'test' } }],
];
test('special axes and subsequent features cannot be reinterpreted by a captured setter', () => {
  const source = fixture(), field = axis(source.nodes);
  for (const [label, index, value] of excluded) {
    const doc = patch(source, index, value), before = structuredClone(doc);
    assert.equal(editFields(doc.nodes, 1).some(f => f.key === 'sketchAxis'), false, label);
    assert.deepEqual(field.set(doc.nodes, 'x'), doc.nodes, label); assert.deepEqual(doc, before);
  }
  const followed = [...source.nodes, source.nodes[0]];
  assert.equal(editFields(followed, 1).some(f => f.key === 'sketchAxis'), false);
  assert.deepEqual(field.set(followed, 'x'), followed);
});
test('crossing the newly selected axis refuses without changing the accepted Y document', () => {
  const source = patch(fixture(), 0, { min: [10, -10], max: [20, 10] }), before = structuredClone(source);
  assert.ok(checkOutput(evaluateCadPart(toPartDocument(source)).outputs[0]).valid);
  const changed = { ...source, nodes: axis(source.nodes).set(source.nodes, 'x') };
  assert.throws(() => evaluateCadPart(toPartDocument(changed)), /profile crosses the axis/);
  assert.deepEqual(source, before);
});
test('drag HUD cannot inject the History-only axis while retaining numeric angle edits', () => {
  const doc = fixture(), command = editCommand(1, doc.nodes, doc);
  assert.ok(command?.fields && command.defaults && command.build);
  const ctx: Ctx = { doc, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  assert.equal(command.fields(ctx).some(f => f.key === 'sketchAxis'), false);
  const next = command.build(ctx, { ...command.defaults(ctx), sketchAxis: 'x', deg: 180 });
  assert.deepEqual(next.nodes[1], { ...doc.nodes[1], angle: 180 }); assert.equal(next.nodes[0], doc.nodes[0]);
});

test('axis choice is local to a rotated sketch plane rather than world X/Y', () => {
  const source = patch(fixture(), 0, { plane: { origin: [0, 0, 0], xAxis: [0, 1, 0], normal: [0, 0, 1] } });
  for (const direction of ['x', 'y'] as const) {
    const doc = { ...source, nodes: axis(source.nodes).set(source.nodes, direction) };
    const [body] = evaluateCadPart(toPartDocument(doc)).outputs, mass = massPropertiesOf(body);
    assert.ok(checkOutput(body).valid);
    const expected = direction === 'x' ? [0, 15, 0] : [-20, 0, 0];
    mass.centroid.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-7));
    assert.ok(Math.abs(mass.volume - (direction === 'x' ? 8000 : 6000) * Math.PI) < 1e-7);
    assert.equal(doc.nodes[0], source.nodes[0]);
  }
});
