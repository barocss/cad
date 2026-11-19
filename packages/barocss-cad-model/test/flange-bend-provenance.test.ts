import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, evaluateCadPart, flatPatternOf, type CadPartSnapshot, type SheetBendReport } from '@barocss/cad';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { evaluateDoc, placeBody } from '../src/engine/evaluate';
import { authoredFlangeOwners, sheetOf } from '../src/engine/bodyNotes';
import { MeshSender, MeshReceiver } from '../src/engine/meshWire';

type Output = CadPartSnapshot['outputs'][number];
function fixture(): StudioDoc {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [80, 50] });
  doc = withNode(doc, { kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: .44 });
  doc = withNode(doc, { kind: 'sheet-corner-relief', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.side1'], shape: 'square', size: 3 });
  doc = withNode(doc, { kind: 'sheet-flange', parent: { node: 2, side: 'solid' }, edges: ['n1.side0|n1.top'], length: 20 });
  return withNode(doc, { kind: 'sheet-flange', parent: { node: 3, side: 'solid' }, edges: ['n1.side1|n1.top'], length: 20 });
}
function output(doc = fixture()): Output {
  const result = evaluateCadPart(toPartDocument(doc));
  assert.equal(result.outputs.length, 1);
  const out = result.outputs[0];
  assert.ok(checkBrep(out.brep, { strict: true }).valid);
  assert.ok(out.sheet);
  return out;
}
function reports(out: Output, bends: readonly SheetBendReport[]): Output {
  assert.ok(out.sheet);
  return { ...out, sheet: { ...out.sheet, bends } };
}
const expected = [
  { featureId: 'n3', faces: ['n3.bend.inner'] },
  { featureId: 'n4', faces: ['n4.bend.inner'] },
];

test('D122 native authored reports reach the Model and mesh-token transport without changing the document', () => {
  const doc = fixture(), before = structuredClone(doc), out = output(doc);
  assert.deepEqual(out.sheet?.bends.map(b => b.authoredFlange), [{ featureId: 'n3' }, { featureId: 'n4' }]);
  assert.deepEqual(authoredFlangeOwners(out, flatPatternOf(out)), expected);
  const result = evaluateDoc(doc, 1); assert.ok(result.ok);
  assert.deepEqual(result.bodies[0].sheetBendOwners, expected);
  const sender = new MeshSender(), receiver = new MeshReceiver();
  for (let i = 0; i < 2; i++) {
    const wire: ReturnType<MeshSender['pack']>['result'] = sender.pack('test', result).result;
    if (i === 1 && wire.ok) assert.ok('meshRef' in wire.bodies[0]);
    const restored = receiver.unpack('test', wire); assert.ok(restored.ok);
    assert.deepEqual(restored.bodies[0].sheetBendOwners, expected);
  }
  assert.deepEqual(doc, before);
});

test('cached flat geometry never caches authored IDs; display names are not provenance', () => {
  const out = output(), first = sheetOf(out); assert.ok(first.flat); assert.ok(out.sheet);
  const changed = reports(out, out.sheet.bends.map((b, i) => ({ ...b, name: 'untrusted display ' + i, authoredFlange: { featureId: 'author-' + i } })));
  const second = sheetOf(changed);
  assert.equal(changed.brep, out.brep); assert.equal(second.flat, first.flat);
  assert.deepEqual(second.sheetBendOwners, expected.map((b, i) => ({ ...b, featureId: 'author-' + i })));
  const absent = reports(out, out.sheet.bends.map(b => { const copy = { ...b }; delete copy.authoredFlange; return copy; }));
  assert.equal(sheetOf(absent).sheetBendOwners, undefined);
  assert.deepEqual(sheetOf(out).sheetBendOwners, expected);
});

test('duplicate report ownership, mixed rows and duplicate rows fail closed', () => {
  const out = output(), flat = flatPatternOf(out); assert.ok(out.sheet);
  const [a, b] = out.sheet.bends;
  assert.deepEqual(authoredFlangeOwners(reports(out, [a, { ...b, authoredFlange: a.authoredFlange }]), flat), []);
  assert.deepEqual(authoredFlangeOwners(reports(out, [a, { ...b, inner: a.inner }]), flat), []);
  assert.deepEqual(authoredFlangeOwners(out, { ...flat, bends: [{ ...flat.bends[0], faces: [a.inner, b.inner] }] }), []);
  assert.deepEqual(authoredFlangeOwners(out, { ...flat, bends: [flat.bends[0], flat.bends[0]] }), []);
  assert.deepEqual(authoredFlangeOwners({ ...out, brep: { ...out.brep, bodies: [...out.brep.bodies, ...out.brep.bodies] } }, flat), []);
});

test('native split and pipe aliases cannot borrow a surviving exact face name', () => {
  const out = output(), flat = flatPatternOf(out); assert.ok(out.sheet);
  const name = out.sheet.bends[0].inner, face = out.brep.faces.find(f => f.name === name); assert.ok(face);
  for (const alias of [name + '#1', 'other|' + name, 'other|' + name + '#1', name + '#1|other']) {
    const altered: Output = { ...out, brep: { ...out.brep, faces: [...out.brep.faces, { ...face, id: 'alias-face', name: alias }] } };
    assert.deepEqual(authoredFlangeOwners(altered, flat), [expected[1]], alias);
  }
  const missing: Output = { ...out, brep: { ...out.brep, faces: out.brep.faces.filter(f => f.name !== name) } };
  assert.deepEqual(authoredFlangeOwners(missing, flat), [expected[1]]);
});

test('native transforms and Model placement drop editing ownership while preserving sheet reports', () => {
  const doc = fixture(), parent = { node: 4, side: 'solid' as const };
  const transforms: ModelNode[] = [
    { kind: 'translate', parent, offset: [2, 3, 4] },
    { kind: 'rotate', parent, axis: 'z', angle: 90 },
    { kind: 'mirror', parent, plane: 'yz', keep: false },
  ];
  for (const transform of transforms) {
    const transformed = withNode(doc, transform), out = output(transformed);
    assert.ok(out.sheet); assert.equal(out.sheet.bends.length, 2);
    assert.ok(out.sheet.bends.every(b => b.authoredFlange === undefined));
    const result = evaluateDoc(transformed, 2); assert.ok(result.ok);
    assert.equal(result.bodies[0].sheetBendOwners, undefined);
  }
  const result = evaluateDoc(doc, 3); assert.ok(result.ok);
  const body = result.bodies[0], placed = placeBody(body, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]);
  assert.equal(placed.sheetBendOwners, undefined);
  assert.deepEqual(body.sheetBendOwners, expected);
});
