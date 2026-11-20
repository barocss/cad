import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, evaluatePreview } from '../src/engine/evaluate';
import { sheetCornerReliefCommand as corner, sheetFlangeCommand as flange } from '../src/app/sheetCommands';
import type { Ctx } from '../src/app/commands';

const sketch = withNode(emptyDoc(), {kind:'sketch', profile:'loop', segments:[
  {kind:'line',start:[10,5]}, {kind:'arc',start:[45,5],center:[45,15],direction:'ccw'},
  {kind:'line',start:[45,25]}, {kind:'arc',start:[10,25],center:[10,15],direction:'ccw'},
]});
const base=withNode(sketch,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
const arc='n1.side1|n1.top', line='n1.side2|n1.top';
const initial=evaluateDoc(base,1);
assert.ok(initial.ok);
if(!initial.ok)throw Error('synthetic obround base');
const initialBodies = initial.bodies;
function ctx(name: string): Ctx {
  const edge=initialBodies[0].mesh.edges.findIndex(e=>e.names.includes(name));
  assert.ok(edge>=0);
  return { doc:base, bodies:initialBodies, selection:{faces:[],edges:[{body:0,edge}],bodies:[]} };
}
test('obround native arc reports straight-edge recovery before generating a draft', ()=>{
  const c=ctx(arc), e=c.bodies[0].mesh.edges[c.selection.edges[0].edge];
  assert.ok(e.nativeCircle);assert.equal(e.straight,false);
  const eligibility=flange.available(c);
  assert.equal(eligibility.ok,false);
  if(eligibility.ok)assert.fail('native arc accepted');
  assert.match(eligibility.reason,/curved edge.*straight edge/);
  assert.deepEqual(flange.steps?.(c,{}),[{label:'Edge',text:eligibility.reason,done:false}]);
  const before=structuredClone(base);
  assert.throws(()=>flange.build!(c,flange.defaults!(c)),/curved edge.*straight edge/);
  assert.deepEqual(base,before);
  assert.equal(corner.available(c).ok,true,'do not change Corner relief selection policy');
});
test('uncertain curved display data is not promoted to early rejection',()=>{
  const c=ctx(arc), source=c.bodies[0], i=c.selection.edges[0].edge;
  const edges=source.mesh.edges.map((e,k)=>k===i?{...e,nativeCircle:undefined}:e);
  assert.equal(flange.available({...c,bodies:[{...source,mesh:{...source.mesh,edges}}]}).ok,true);
});
test('same obround straight edge and partial rectangular relief can still build without a flat',()=>{
  const c=ctx(line);
  assert.equal(flange.available(c).ok,true);
  assert.deepEqual(flange.steps?.(c,{}),[{label:'Edge',text:line,done:true}]);
  const draft=flange.build!(c,{...flange.defaults!(c),o0:5,o1:5});
  assert.deepEqual(draft.nodes[2].kind==='sheet-flange' && draft.nodes[2].relief,{kind:'rectangular',width:1.5,depth:1.5});
  assert.equal(evaluatePreview(draft,2).ok,true);
  const accepted=evaluateDoc(draft,3);assert.ok(accepted.ok);
  if(!accepted.ok)throw Error('valid constructive flange refused');
  assert.ok(Math.abs(accepted.bodies[0].volume!-2158.524838)<1e-5);
  assert.equal(accepted.bodies[0].flat,undefined);
  assert.match(accepted.bodies[0].flatRefused!,/^\[NON_NORMAL_CUT\]/);
});
test('existing saved geometries still go through the native guard unchanged',()=>{
  const c=ctx(line), valid=flange.build!(c,flange.defaults!(c)), last=valid.nodes[2];
  if(last.kind!=='sheet-flange')throw Error('fixture');
  const existing: StudioDoc={...valid,nodes:[...valid.nodes.slice(0,2),{...last,edges:[arc]}]};
  const native=evaluatePreview(existing,4);
  assert.ok(!native.ok);
  if(native.ok)assert.fail('native accepted a curved edge');
  assert.match(native.error.detail,/straight edge/i);
});
