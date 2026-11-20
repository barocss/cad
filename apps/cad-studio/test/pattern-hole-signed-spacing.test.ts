import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { editFields } from '@barocss/cad-model/app/editFields';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { dropStaleMade, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { prepareLinearPatternHoleEdit } from '../src/app/patternHoleSpacing';

const ref = (node: number) => ({ node, side: 'solid' as const });
const original: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [50, 10], max: [54, 16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'linear-pattern', parent: ref(1), axis: 'x', spacing: 16, count: 3 },
    { id: 'n3', kind: 'hole', parent: ref(2), radius: 1, center: [84, 13], face: 'n1.top@2' },
  ], outputs: { b3: ref(3) }, nextId: 4,
};

function prepare(doc: StudioDoc, spacing: number) {
  const field = editFields(doc.nodes, 2, doc.parameters).find(f => f.kind === 'number' && f.key === 'spacing');
  assert.ok(field?.kind === 'number');
  const nodes = field.set(doc.nodes, spacing);
  assert.ok(nodes?.[2].kind === 'linear-pattern');
  assert.equal(nodes[2].spacing, spacing);
  return prepareLinearPatternHoleEdit(doc, nodes, 2);
}
function apply(doc: StudioDoc, spacing: number): StudioDoc {
  const prepared = prepare(doc, spacing);
  if ('error' in prepared) throw Error(prepared.error.hint);
  return { ...doc, nodes: dropStaleMade(doc.nodes, prepared.nodes) };
}
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} versus ${expected}`);

function verify(doc: StudioDoc, centreX: number, expectedStockX: number[]) {
  const hole = doc.nodes[3];
  assert.ok(hole.kind === 'hole');
  assert.deepEqual(hole.center, [centreX, 13]);
  assert.equal(hole.face, 'n1.top@2');
  assert.deepEqual(doc.outputs, original.outputs);
  const { outputs } = evaluateCadPart(toPartDocument(doc));
  assert.equal(outputs.length, 1);
  const [body] = outputs;
  assert.ok(checkOutput(body).valid);
  const stockX = [...new Set(body.brep.vertices
    .filter(v => v.point[1] === 10 || v.point[1] === 16).map(v => v.point[0]))].sort((a,b) => a-b);
  assert.deepEqual(stockX, expectedStockX);
  const tops = body.brep.faces.filter(f => /^n1\.top(?:@\d+)?$/.test(f.name ?? ''))
    .map(f => [f.name, f.loops.length]).sort();
  assert.deepEqual(tops, [['n1.top',1],['n1.top@1',1],['n1.top@2',2]]);
  const walls = body.brep.faces.filter(f => f.name?.startsWith('n3.')).map(faceGeometry);
  assert.equal(walls.length, 2);
  for (const wall of walls) {
    assert.ok(wall.kind === 'cylinder');
    near(wall.c[0],centreX); near(wall.c[1],13); near(wall.r,1);
  }
  near(massPropertiesOf(body).volume, 576-8*Math.PI);
}

test('signed Linear Spacing keeps the active terminal bore on the same numbered copy after roundtrip', async () => {
  verify(original,84,[50,54,66,70,82,86]);
  const originalBytes = JSON.stringify(original);
  const rejected = prepare(original,0);
  assert.ok('error' in rejected);
  assert.match(rejected.error.hint,/Keep a gap between pattern copies/);
  assert.equal(JSON.stringify(original),originalBytes);

  const negative = apply(original,-16);
  verify(negative,20,[18,22,34,38,50,54]);
  const restored = await readStudioFile(encodeStudioFile(negative));
  assert.ok(!('error' in restored));
  assert.deepEqual(restored.doc,negative);
  verify(restored.doc,20,[18,22,34,38,50,54]);

  const reversed = apply(restored.doc,16);
  assert.deepEqual(reversed,original);
  verify(reversed,84,[50,54,66,70,82,86]);
});
