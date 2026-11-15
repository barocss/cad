import { emptyBodyExportHint } from '../src/engine/emptyBodyExportHint';
import test from 'node:test';
import assert from 'node:assert/strict';
import { write3mf, type ThreeMfObject } from '../src/print/threemf';
import { threeMfModelOf } from '../src/print/export3mf';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import type { BodyResult } from '../src/engine/evaluate';
import { hasStlTriangles } from '../src/engine/exportMeshAdmission';
const open: ThreeMfObject = { name: 'Open sheet', positions: [0,0,0,1,0,0,0,1,0], indices: [0,1,2], color: '', material: '' };
const empty: ThreeMfObject = { ...open, name: 'Empty', positions: [], indices: [] };
const model = (objects: ThreeMfObject[]) => ({ title: 'test', objects, items: objects.map((_, object) => ({ object })) });
test('3MF refuses each empty input and post-weld-empty object, atomically', async () => {
  for (const objects of [[empty], [open, empty], [{ ...open, positions: [0,0,0,0,0,0,0,0,0] }], [open, { ...empty, positions: [0,0,0,0,0,0,0,0,0], indices: [0,1,2] }]]) {
    const before = JSON.stringify(objects), result = await write3mf(model(objects));
    assert.ok('error' in result); assert.match(result.error, /no triangles/); assert.equal(JSON.stringify(objects), before);
  }
  const result = await write3mf(model([open])); assert.ok(!('error' in result)); assert.equal(result.stats.triangles, 1); assert.equal(result.stats.openEdges, 3);
});
test('3MF builder rejects visible empty body but retains hidden filter; no false Scale hint', () => {
  const b = { key: 'empty', mesh: { positions: new Float32Array(), indices: new Uint32Array() } } as BodyResult;
  const doc = emptyDoc();
  assert.match(String(threeMfModelOf(doc, [{doc,bodies:[b]}], 'x')), /empty.*no triangles/);
  const hidden = {...doc,bodies:{empty:{hidden:true}}};
  assert.equal(threeMfModelOf(hidden,[{doc:hidden,bodies:[b]}],'x'), 'there is no visible body to write');
  assert.doesNotMatch(emptyBodyExportHint(doc,b), /Scale|Factor/);
  const scaled: StudioDoc = {...doc, nodes:[{id:'n0',kind:'scale',parent:{node:0,side:'solid'},factor:0.005}]};
  assert.match(emptyBodyExportHint(scaled,{...b,ref:{node:0,side:'solid'}}), /History → Scale.*Factor/);
  assert.doesNotMatch(emptyBodyExportHint(scaled,b), /History|Factor/);
});
test('binary STL guard checks actual count and full payload, open triangle remains eligible', () => {
  assert.equal(hasStlTriangles(new Uint8Array(84)), false);
  const bytes = new Uint8Array(134); new DataView(bytes.buffer).setUint32(80,1,true);
  assert.equal(hasStlTriangles(bytes),true); const offset = new Uint8Array(150); offset.set(bytes,8); assert.equal(hasStlTriangles(offset.subarray(8,142)),true); assert.equal(hasStlTriangles(bytes.subarray(0,133)),false);
});
