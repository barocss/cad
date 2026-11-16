import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { editFields } from '../src/app/editFields';
const doc = withNode(rectanglePart(30, 12, 20), { kind: 'full-round', parent: { node: 1, side: 'solid' }, faces: ['n1.top'] });
test('Full round history preserves face ownership and changes evaluated rounding axis', () => {
 const field = editFields(doc.nodes, 2).find(f => f.key === 'along'); assert.ok(field?.kind === 'choice');
 assert.equal(field.get(doc.nodes), 'auto');
 for (const [along, length, width] of [['x',30,12],['y',12,30]] as const) {
  const nodes=field.set(doc.nodes,along), result=evaluateDoc({...doc,nodes},1); assert.ok(result.ok, result.ok?'':result.error.detail);
  const expected=30*12*20-length*width*width*(4-Math.PI)/8;
  assert.ok(Math.abs(result.bodies[0].volume!-expected)<1e-6);
  assert.deepEqual(nodes.slice(0,2),doc.nodes.slice(0,2));
  assert.deepEqual(field.set(nodes,'auto'),doc.nodes);
 }
 assert.deepEqual(field.set(doc.nodes,'z'),doc.nodes);
});
