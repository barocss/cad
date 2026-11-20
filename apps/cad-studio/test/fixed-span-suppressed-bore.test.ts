import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { dropStaleMade, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { editFields } from '@barocss/cad-model/app/editFields';
import { prepareLinearPatternHoleEdit } from '../src/app/patternHoleSpacing';

const ref = (node: number) => ({ node, side: 'solid' as const });
const source: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [50, 10], max: [54, 16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'linear-span-pattern', parent: ref(1), axis: 'x', span: 32, count: 3 },
    { id: 'n3', kind: 'hole', parent: ref(2), radius: 1, center: [84, 13], face: 'n1.top@2' },
  ], outputs: { b3: ref(3) }, nextId: 4,
};
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} versus ${expected}`);
function verify(doc: StudioDoc, x?: number, count = 3, span = 32) {
  const [body] = evaluateCadPart(toPartDocument(doc)).outputs;
  assert.ok(checkOutput(body).valid);
  const xs = body.brep.vertices.map(v => v.point[0]);
  near(Math.min(...xs),50); near(Math.max(...xs),54+span);
  const tops = body.brep.faces.filter(f => /^n1\.top(?:@\d+)?$/.test(f.name ?? ''));
  assert.deepEqual(tops.map(f => [f.name, f.loops.length]).sort(), Array.from({length:count}, (_, i) => [
    i ? 'n1.top@'+i : 'n1.top', x !== undefined && i === count-1 ? 2 : 1,
  ]));
  const walls = body.brep.faces.filter(f => f.name?.startsWith('n3.')).map(faceGeometry);
  assert.equal(walls.length, x === undefined ? 0 : 2);
  for (const wall of walls) {
    assert.equal(wall.kind, 'cylinder');
    if (wall.kind !== 'cylinder' || x === undefined) throw new Error('Expected bore cylinder');
    near(wall.c[0], x); near(wall.c[1], 13); near(wall.r, 1);
  }
  near(massPropertiesOf(body).volume, count*4*6*8 - (x === undefined ? 0 : 8*Math.PI));
}
function toggle(doc: StudioDoc): StudioDoc {
  return {...doc, nodes: doc.nodes.map((x,i) => i !== 3 ? x : x.suppressed
    ? (({suppressed: _s, ...rest}) => rest as ModelNode)(x) : {...x, suppressed:true as const})};
}
function draft(doc: StudioDoc, key: 'span' | 'count', value: number): ModelNode[] {
  const field = editFields(doc.nodes, 2, doc.parameters).find(f => f.kind === 'number' && f.key === key);
  assert.ok(field?.kind === 'number');
  const result = field.set(doc.nodes, value);
  assert.ok(result);
  return result;
}
function apply(doc: StudioDoc, next: ModelNode[]): StudioDoc {
  const prepared = prepareLinearPatternHoleEdit(doc,next,2);
  if ('error' in prepared) throw Error(JSON.stringify(prepared.error));
  return {...doc, nodes: dropStaleMade(doc.nodes,prepared.nodes)};
}
test('Fixed span changes preserve the end-copy bore through a suppressed interval', () => {
  const immutable = JSON.stringify(source);
  verify(source,84);
  const dormant = toggle(source);
  verify(dormant);
  const next = apply(dormant,draft(dormant,'span',32.5));
  assert.deepEqual(next.outputs,source.outputs);
  assert.equal(next.nodes[3].suppressed,true);
  verify(next,undefined,3,32.5);
  const revived = toggle(next);
  assert.equal(Object.hasOwn(revived.nodes[3],'suppressed'),false);
  const expected = (50+54)/2 + 32.5;
  verify(revived,expected,3,32.5);
  assert.equal(JSON.stringify(source),immutable);
  assert.equal(dormant.nodes[3].kind === 'hole' && dormant.nodes[3].center[0],84);
});
test('an active bore still follows span; Count-only can retire a suppressed copy', () => {
  verify(apply(source,draft(source,'span',32.5)),84.5,3,32.5);
  const dormant = toggle(source);
  const retired = apply(dormant,draft(dormant,'count',2));
  assert.deepEqual(retired.nodes[3],dormant.nodes[3]);
  verify(retired,undefined,2);
  assert.throws(() => evaluateCadPart(toPartDocument(toggle(retired))));
});
test('an unprovable dormant bore refuses atomically, held Hole is not remapped', () => {
  const hole = source.nodes[3];
  assert.ok(hole.kind === 'hole');
  const dormant = toggle({...source,nodes: [...source.nodes.slice(0,3),{...hole,center:[83,13]}]});
  const original = JSON.stringify(dormant);
  const failed = prepareLinearPatternHoleEdit(dormant,draft(dormant,'span',32.5),2);
  assert.ok('error' in failed);
  assert.match(failed.error.hint, /crosses or touches/);
  assert.equal(JSON.stringify(dormant),original);
  const certain = toggle(source);
  const combined = draft({...certain,nodes:draft(certain,'span',32.5)},'count',2);
  assert.ok('error' in prepareLinearPatternHoleEdit(certain,combined,2));
  const held = {...dormant,nodes:[...dormant.nodes.slice(0,3),{...dormant.nodes[3],held:'missing'}]};
  const heldDraft = draft(held,'span',32.5);
  assert.deepEqual(prepareLinearPatternHoleEdit(held,heldDraft,2),{nodes:heldDraft});
});
