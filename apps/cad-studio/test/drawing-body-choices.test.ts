import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { readDrawing } from '@barocss/cad-model/drawing/types';
import { drawingBodyChoices } from '../src/ui/drawing/bodyScopeChoices';
import { commitDrawingSettings } from '../src/ui/drawing/commitSettings';
const doc: StudioDoc = { ...emptyDoc(), nodes: [{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[30,12]}, {kind:'extrude',id:'n1',sketch:0,height:6}], outputs:{b1:{node:1,side:'solid'}}, nextId:2 };
const body = {key:'b1',ref:{node:1,side:'solid'},topology:{kind:'solid',openShells:0,boundaryEdges:0}} as BodyResult;
test('drawing body choices preserve exact output/feature identity, independent of visibility',()=>{
  const before=structuredClone(doc);
  assert.deepEqual(drawingBodyChoices(doc,[body]),[{key:'b1',feature:'n1',kind:'extrude'}]);
  assert.deepEqual(doc,before);
});
test('drawing body choices refuse ambiguous, unknown, stale and unsupported output evidence',()=>{
  assert.deepEqual(drawingBodyChoices(doc,[body,body]),[]);
  assert.deepEqual(drawingBodyChoices(doc,[{...body,topology:undefined}]),[]);
  assert.deepEqual(drawingBodyChoices(doc,[{...body,topology:{kind:'sheet',openShells:1,boundaryEdges:4}}]),[]);
  assert.deepEqual(drawingBodyChoices(doc,[{...body,key:'b9'}]),[]);
  assert.deepEqual(drawingBodyChoices({...doc,nodes:doc.nodes.map((n,i)=>i===1?{...n,suppressed:true}:n)},[body]),[]);
  assert.deepEqual(drawingBodyChoices({...doc,nodes:[doc.nodes[0],{...doc.nodes[1],id:'n9'}]},[body]),[]);
});
test('body drawing whole-settings commit refuses unsupported section atomically',()=>{
  const scope={kind:'part' as const,body:{key:'b1',feature:'n1',kind:'extrude' as const}};
  const initial=readDrawing({scope});let commits=0;const errors:string[]=[];
  const ok=commitDrawingSettings({...initial,section:{y:1}},scope,()=>{commits++;return true;},why=>errors.push(why));
  assert.equal(ok,false);assert.equal(commits,0);assert.ok(errors.length===1);
  assert.equal(commitDrawingSettings(initial,scope,()=>{commits++;return true;},why=>errors.push(why)),true);assert.equal(commits,1);
});
