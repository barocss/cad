import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, exportStudioStep, type BodyResult } from '../src/engine/evaluate';
import { evaluationKey } from '../src/engine/evalMemo';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { isRefusal } from '../src/engine/refusal';
import { datumFromFace, datumWorld, placeReference, readReferences, referenceDoc, referenceLocal, runReferenceTool, verifyDatums } from '../src/chat/references';
import type { Reference, ReferenceSet, ReferenceSource } from '../src/engine/schema/references';

const mesh = { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3] };
const reference = (id: string, name: string, source: ReferenceSource = { mesh: structuredClone(mesh) }): Reference => ({
  id, name, source, at: { position: [0, 0, 0], rotation: [0, 0, 0] },
});
// Match both display reads and References actions: all documents share the worker's existing read slot.
let revision = 0;
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, ++revision, 8, 'read');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
function ownedFaces(ref: Reference, local: BodyResult[]): void {
  assert.ok(local.length);
  assert.ok(local.every(body => body.key === ref.id || body.key.startsWith(ref.id + '_part')));
  for (const body of local) for (const face of body.mesh.faces) {
    assert.ok(face.name.split('+').every(name => name.startsWith(ref.id + '.')), `${ref.id}: ${face.name}`);
    assert.equal(face.kind, 'plane');
    for (const kind of ['plane', 'point'] as const) {
      const datum = datumFromFace(local, ref.id, face.name, kind, 'D', 'owned face');
      assert.deepEqual(datum.of, { reference: ref.id, face: face.name });
      datum.origin.forEach((coordinate, axis) => near(coordinate, face.centroid[axis]));
      if (kind === 'plane') {
        assert.ok(datum.residual! <= 1e-9);
        datum.normal!.forEach((coordinate, axis) => near(coordinate, face.normal[axis]));
      }
    }
    assert.throws(() => datumFromFace(local, ref.id, face.name, 'axis', 'D', 'not a cylinder'), error => isRefusal(error, 'DATUM_FIT'));
  }
}

for (const order of [[1, 2], [2, 1]]) {
  test(`identical OBJ references keep their own face candidates through read order ${order.join(' then ')}`, async () => {
    const refs = [reference('ref1', 'First tetrahedron'), reference('ref2', 'Different name, identical geometry')];
    const before = structuredClone(refs);
    assert.notEqual(evaluationKey(referenceDoc(refs[0])), evaluationKey(referenceDoc(refs[1])));
    const otherGeometry = reference('ref3', 'Larger tetrahedron', { mesh: { ...structuredClone(mesh), positions: mesh.positions.map(value => 2 * value) } });
    for (const index of [...order, ...order]) {
      const ref = refs[index - 1], local = await referenceLocal(ref, evaluate);
      ownedFaces(ref, local);
      assert.deepEqual(local[0].mesh.faces.map(face => face.name).sort(), Array.from({ length: 4 }, (_, face) => `${ref.id}.region${face}`));
      near(local[0].volume!, 1000 / 6);
      const foreign = `${refs[2 - index].id}.region0`;
      assert.throws(() => datumFromFace(local, ref.id, foreign, 'plane', 'D', 'foreign'), error => isRefusal(error, 'NO_REFERENCE'));
    }
    const larger = await referenceLocal(otherGeometry, evaluate);
    ownedFaces(otherGeometry, larger); near(larger[0].volume!, 8000 / 6);
    ownedFaces(refs[order[0] - 1], await referenceLocal(refs[order[0] - 1], evaluate));
    assert.deepEqual(refs, before);
  });
}

test('UI-equivalent Datum actions consume the same owned candidates across placement and codec reopen', async () => {
  const references = [reference('ref1', 'One'), reference('ref2', 'Two')];
  let doc: StudioDoc = { ...rectanglePart(20, 12, 4), references: { version: 1, references, datums: [], keepouts: [] } };
  const main = evaluatePart(doc, 1); assert.ok(main.ok);
  const originalNodes = doc.nodes, originalBodies = main.bodies;
  for (const ref of references) {
    const local = await referenceLocal(ref, evaluate);
    for (const face of local.flatMap(body => body.mesh.faces)) {
      const result = await runReferenceTool(doc, originalBodies, 'add_datum', { reference: ref.id, face: face.name, kind: 'plane' }, evaluate);
      assert.ok(!('error' in result), JSON.stringify(result)); if ('error' in result) continue;
      doc = result.doc;
      assert.deepEqual(doc.references!.datums.at(-1)!.of, { reference: ref.id, face: face.name });
    }
  }
  assert.equal(doc.references!.datums.length, 8);
  const source = doc.references!.references[1], local = await referenceLocal(source, evaluate);
  const positions = local[0].mesh.positions.slice(), datum = doc.references!.datums.find(d => d.of?.reference === source.id)!;
  const placed: Reference = { ...source, at: { position: [30, -5, 7], rotation: [0, 0, 90] } };
  doc = { ...doc, references: { ...doc.references!, references: doc.references!.references.map(ref => ref.id === source.id ? placed : ref) } };
  const world = datumWorld(doc.references!, datum);
  near(world.origin[0], 30 - datum.origin[1]); near(world.origin[1], -5 + datum.origin[0]); near(world.origin[2], 7 + datum.origin[2]);
  const moved = placeReference(local, placed.at)[0].mesh.positions;
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    near(moved[vertex], 30 - positions[vertex + 1]); near(moved[vertex + 1], -5 + positions[vertex]); near(moved[vertex + 2], 7 + positions[vertex + 2]);
  }
  assert.deepEqual(local[0].mesh.positions, positions, 'placing a reference does not mutate its cached local mesh');
  const opened = await readStudioFile(encodeStudioFile(doc)); assert.ok('doc' in opened); if (!('doc' in opened)) return;
  // The JSON file preserves numeric values and ownership; JSON normalizes signed zero in fitted normals.
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(doc)));
  for (const ref of opened.doc.references!.references) ownedFaces(ref, await referenceLocal(ref, evaluate));
  assert.deepEqual(await verifyDatums(readReferences(opened.doc.references), evaluate), []);
  assert.equal(doc.nodes, originalNodes);
  const after = evaluatePart(doc, 1); assert.ok(after.ok);
  assert.deepEqual(after.bodies.map(body => [body.key, body.volume, body.mesh.bounds]), originalBodies.map(body => [body.key, body.volume, body.mesh.bounds]));
  const bad = await runReferenceTool(doc, after.bodies, 'add_datum', { reference: 'ref2', face: 'ref1.region0', kind: 'plane' }, evaluate);
  assert.ok('error' in bad && bad.error.startsWith('[NO_REFERENCE]'));
  assert.equal(doc.references!.datums.length, 8);
});

function stepBlock(multiple: boolean): StudioDoc {
  let doc = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [2, 3] }), { kind: 'extrude', sketch: 0, height: 4 });
  if (multiple) doc = withNode(withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [10, 0], max: [13, 2] }), { kind: 'extrude', sketch: 2, height: 2 });
  return doc;
}
for (const multiple of [false, true]) for (const [unit, factor] of [['MILLI', 1], ['CENTI', 10]] as const) {
  test(`identical ${multiple ? 'two-solid' : 'single-solid'} ${unit} STEP references keep face ownership and physical scale`, async () => {
    const original = exportStudioStep(stepBlock(multiple), { name: 'owned STEP fixture' }).text;
    const step = original.replace('SI_UNIT(.MILLI.,.METRE.)', `SI_UNIT(.${unit}.,.METRE.)`);
    const refs = ['ref4', 'ref5'].map(id => ({ ...reference(id, `STEP ${id}`, { step }), ...(multiple ? { solids: 2 } : {}) }));
    const before = structuredClone(refs);
    const allDatums: ReferenceSet['datums'] = [];
    for (const index of [0, 1, 1, 0]) {
      const ref = refs[index], local = await referenceLocal(ref, evaluate);
      assert.equal(local.length, multiple ? 2 : 1);
      ownedFaces(ref, local);
      const volumes = local.map(body => body.volume! / factor ** 3).sort((a, b) => a - b), expected = multiple ? [12, 24] : [24];
      volumes.forEach((volume, index) => near(volume, expected[index]));
      for (const face of local.flatMap(body => body.mesh.faces)) allDatums.push(datumFromFace(local, ref.id, face.name, 'plane', `D${allDatums.length}`, 'STEP plane'));
      const foreign = (await referenceLocal(refs[1 - index], evaluate))[0].mesh.faces[0].name;
      assert.throws(() => datumFromFace(local, ref.id, foreign, 'plane', 'bad', 'foreign STEP face'), error => isRefusal(error, 'NO_REFERENCE'));
    }
    assert.deepEqual(await verifyDatums({ version: 1, references: refs, datums: allDatums, keepouts: [] }, evaluate), []);
    assert.deepEqual(refs, before);
  });
}
