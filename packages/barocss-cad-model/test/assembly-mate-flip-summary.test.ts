import assert from 'node:assert/strict';
import test from 'node:test';
import { starterDoc, cylinderPart } from '../src/engine/doc';
import { addPart } from '../src/assembly/edit';
import { dispatchTool } from '../src/chat/tools';
import { evaluateDoc } from '../src/engine/evaluate';
import { rotationMatrix } from '../src/engine/placement';
const evaluate = async (doc: Parameters<typeof evaluateDoc>[0]) => evaluateDoc(doc, 1);
for (const flip of [undefined, false, true]) test(`assembly summary preserves concentric flip ${flip}`, async () => {
  const source = addPart(starterDoc(), { name: 'Pin', doc: cylinderPart(4, 20), rotation: [180, 0, 0] }).doc;
  const added = await dispatchTool({ doc: source, bodies: [] }, 'add_mate', { kind: 'concentric', a: { part: 'base', face: 'n2.side0' }, b: { part: 'p1', face: 'n1.side0' }, ...(flip === undefined ? {} : { flip }) }, evaluate);
  assert.equal(added.isError, false, added.content);
  const doc = added.state.doc, before = structuredClone(doc);
  const queried = await dispatchTool({ doc, bodies: [] }, 'get_assembly', {}, evaluate);
  const reported = JSON.parse(queried.content).mates[0];
  console.log(JSON.stringify({ requested: flip ?? 'omitted', saved: doc.mates![0], reported, axisZ: rotationMatrix(doc.instances![0].rotation)[8] }));
  assert.equal(queried.isError, false); assert.equal(queried.changed, false); assert.deepEqual(doc, before);
  assert.equal(Object.hasOwn(reported, 'flip'), flip !== undefined);
  assert.equal(reported.flip, flip);
  assert.equal(rotationMatrix(doc.instances![0].rotation)[8], flip === false ? 1 : -1);
  const replayed = await dispatchTool({ doc: source, bodies: [] }, 'add_mate', { kind: reported.kind, a: reported.a, b: reported.b, ...(Object.hasOwn(reported, 'flip') ? { flip: reported.flip } : {}) }, evaluate);
  assert.equal(replayed.isError, false, replayed.content);
  assert.deepEqual(replayed.state.doc.instances, doc.instances);
  assert.deepEqual(replayed.state.doc.mates, doc.mates);
});

test('unrelated mate summaries retain their existing boolean output contract', async () => {
  const source = addPart(starterDoc(), { name: 'Pin', doc: cylinderPart(4, 20) }).doc;
  for (const kind of ['coincident', 'distance', 'angle', 'tangent'] as const) {
    for (const flip of [undefined, false, true]) {
      const doc = { ...source, mates: [{ id: 'm1', kind, a: { part: 'base', face: 'n1.top' }, b: { part: 'p1', face: 'n1.bottom' }, ...(kind === 'distance' ? { distance: 0 } : {}), ...(kind === 'angle' ? { angle: 0 } : {}), ...(flip === undefined ? {} : { flip }) }] };
      const before = structuredClone(doc);
      const reply = await dispatchTool({ doc, bodies: [] }, 'get_assembly', {}, evaluate);
      const reported = JSON.parse(reply.content).mates[0];
      assert.equal(Object.hasOwn(reported, 'flip'), flip === true);
      assert.deepEqual(doc, before);
      assert.equal(reported.kind, kind);
    }
  }
});
