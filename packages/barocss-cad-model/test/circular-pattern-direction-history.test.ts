import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture(axis:'x'|'y'|'z'='z'):StudioDoc {
 let doc=withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[10,20],max:[14,26]});
 doc=withNode(doc,{kind:'extrude',sketch:0,height:8,from:30});
 return withNode(doc,{kind:'circular-pattern',parent:{node:1,side:'solid'},axis,angle:90,count:4,...(axis==='z'?{span:360}:{})});
}
const fields=(doc:StudioDoc)=>editFields(doc.nodes,2,doc.parameters,undefined,{doc});
function field(doc:StudioDoc){const f=fields(doc).find(f=>f.key==='patternAxis');assert.ok(f?.kind==='choice');return f;}
const patch=(doc:StudioDoc,index:number,change:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...change} as ModelNode:n)});
test('all directed axis transitions preserve owner and distribution with exact span presence',()=>{
 for(const from of ['x','y','z'] as const)for(const to of ['x','y','z'] as const){
  const doc=fixture(from),before=structuredClone(doc),f=field(doc);assert.equal(f.label,'Axis');assert.equal(f.get(doc.nodes),from);
  const nodes=f.set(doc.nodes,to),n=nodes[2];assert.ok(n.kind==='circular-pattern');assert.equal(nodes[0],doc.nodes[0]);assert.equal(nodes[1],doc.nodes[1]);
  const expected={...doc.nodes[2],axis:to} as Extract<ModelNode,{kind:'circular-pattern'}>;if(to==='z')expected.span=360;else delete expected.span;
  assert.deepEqual(n,expected);assert.equal(Object.hasOwn(n,'span'),to==='z');if(from===to)assert.equal(n,doc.nodes[2]);
  assert.deepEqual(field({...doc,nodes}).set(nodes,from),doc.nodes);assert.deepEqual(doc,before);
 }
});
function rotated(point:number[],axis:'x'|'y'|'z',quarter:number):number[]{let [x,y,z]=point;for(let i=0;i<quarter;i++){if(axis==='x')[y,z]=[-z,y];else if(axis==='y')[x,z]=[z,-x];else [x,y]=[-y,x];}return [x,y,z];}
test('XYZ outputs match independent integer quarter-turn corner sets, volume and strict native checks',()=>{
 const source=fixture();
 for(const axis of ['x','y','z'] as const){
  const doc={...source,nodes:field(source).set(source.nodes,axis)},result=evaluateCadPart(toPartDocument(doc));assert.equal(result.outputs.length,1);
  const b=result.outputs[0];assert.ok(checkOutput(b).valid);assert.equal(b.bodyCount,4);assert.ok(Math.abs(massPropertiesOf(b).volume-768)<1e-7);
  const expected:number[][]=[];for(let q=0;q<4;q++)for(const x of [10,14])for(const y of [20,26])for(const z of [30,38])expected.push(rotated([x,y,z],axis,q));
  const actual=b.brep.vertices.map(v=>v.point);assert.equal(actual.length,32);const used=new Set<number>();
  for(const p of expected){const matches=actual.flatMap((v,i)=>v.every((n,k)=>Math.abs(n-p[k])<1e-8)?[i]:[]);assert.equal(matches.length,1);assert.equal(used.has(matches[0]),false);used.add(matches[0]);}
 }
});
const exclusions:[number,object][]=[
 [2,{pivot:[0,0,0]}],[2,{pivot:undefined}],[2,{count:3}],[2,{count:5}],[2,{angle:-90}],[2,{angle:NaN}],
 [2,{span:180}],[2,{span:undefined}],[2,{axis:'bad'}],[2,{parent:{node:0,side:'solid'}}],[2,{parent:{node:1,side:'solid',extra:true}}],
 [2,{made:{}}],[2,{held:{reason:'test'}}],[2,{suppressed:true}],[2,{rematched:{}}],[2,{unknown:true}],[2,{id:'n1'}],
 [1,{height:{parameter:'H'}}],[1,{height:NaN}],[1,{height:0}],[1,{from:Infinity}],[1,{draft:1}],[1,{sketch:1}],[1,{made:{}}],
 [0,{plane:{origin:[0,0,0],normal:[0,0,1],xAxis:[1,0,0]}}],[0,{min:[NaN,20]}],[0,{max:[10,26]}],[0,{holes:[]}],[0,{association:{}}],
];
test('captured setter and live fields reject unsupported recipes without mutation',()=>{
 const base=fixture(),f=field(base);
 for(const [index,change] of exclusions){const doc=patch(base,index,change),before=structuredClone(doc);assert.equal(fields(doc).some(f=>f.key==='patternAxis'),false,JSON.stringify(change));assert.deepEqual(f.set(doc.nodes,'x'),doc.nodes);assert.deepEqual(doc,before);}
 for(const axis of ['x','y'] as const){const doc=patch(fixture(axis),2,{span:360});assert.equal(fields(doc).some(f=>f.key==='patternAxis'),false);assert.deepEqual(f.set(doc.nodes,'z'),doc.nodes);}
 const nodes=[...base.nodes,base.nodes[0]];assert.equal(editFields(nodes,2).some(f=>f.key==='patternAxis'),false);assert.deepEqual(f.set(nodes,'x'),nodes);
 for(const value of ['bad','', 'X'])assert.deepEqual(f.set(base.nodes,value),base.nodes);
});
test('direct and instance contexts hide the part-only field and HUD cannot inject it',()=>{
 const doc=fixture();for(const extra of [{direct:{}},{instances:[{}]}])assert.equal(fields({...doc,...extra} as StudioDoc).some(f=>f.key==='patternAxis'),false);
 const cmd=editCommand(2,doc.nodes,doc);assert.ok(cmd?.fields&&cmd.defaults&&cmd.build);const ctx:Ctx={doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}};
 assert.equal(cmd.fields(ctx).some(f=>f.key==='patternAxis'),false);assert.deepEqual(cmd.build(ctx,{...cmd.defaults(ctx),patternAxis:'x'}).nodes,doc.nodes);
});
test('axis conversion survives file read with IDs and output ownership unchanged',async()=>{
 const doc=fixture(),nodes=field(doc).set(doc.nodes,'x'),changed={...doc,nodes};
 const read=await readStudioFile(encodeStudioFile(changed));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(changed)));assert.deepEqual(read.doc.outputs,doc.outputs);
 assert.deepEqual(field(read.doc).set(read.doc.nodes,'z'),doc.nodes);
});
test('original and copy native face/edge names survive direction changes without implying downstream support',()=>{
 const source=fixture();
 const names=(doc:StudioDoc)=>{const body=evaluateCadPart(toPartDocument(doc)).outputs[0];return {faces:body.brep.faces.map(f=>f.name).sort(),edges:body.brep.edges.map(e=>e.name).sort()};};
 const before=names(source);assert.equal(before.faces.length,24);assert.equal(before.edges.length,48);
 for(const list of [before.faces,before.edges]){assert.ok(list.every(n=>typeof n==='string'&&n.length>0));assert.equal(new Set(list).size,list.length);}
 for(const axis of ['x','y','z'] as const)assert.deepEqual(names({...source,nodes:field(source).set(source.nodes,axis)}),before);
});

test('each persistent face name retains its copy and seed-face meaning under the intended quarter-turn',()=>{
 const doc=fixture();
 const bounds:Record<string,[number[],number[]]>={
  'n1.side0':[[10,20,30],[14,20,38]],'n1.side1':[[14,20,30],[14,26,38]],
  'n1.side2':[[10,26,30],[14,26,38]],'n1.side3':[[10,20,30],[10,26,38]],
  'n1.bottom':[[10,20,30],[14,26,30]],'n1.top':[[10,20,38],[14,26,38]],
 };
 for(const axis of ['x','y','z'] as const){
  const b=evaluateCadPart(toPartDocument({...doc,nodes:field(doc).set(doc.nodes,axis)})).outputs[0].brep;
  for(const face of b.faces){
   assert.ok(typeof face.name==='string'&&face.name.length>0);const match=face.name.match(/^(n1\.(?:side[0-3]|bottom|top))(?:@([1-3]))?$/);assert.ok(match);
   const [low,high]=bounds[match[1]],q=Number(match[2]??0),expected:number[][]=[];
   for(const x of [...new Set([low[0],high[0]])])for(const y of [...new Set([low[1],high[1]])])for(const z of [...new Set([low[2],high[2]])])expected.push(rotated([x,y,z],axis,q));
   const ids=new Set(b.coedges.filter(c=>face.loops.includes(c.loop)).flatMap(c=>b.edges.find(e=>e.id===c.edge)!.vertices));
   const actual=[...ids].map(id=>b.vertices.find(v=>v.id===id)!.point);assert.equal(actual.length,4);
   for(const p of expected)assert.equal(actual.filter(v=>v.every((n,k)=>Math.abs(n-p[k])<1e-8)).length,1,face.name);
  }
 }
});
