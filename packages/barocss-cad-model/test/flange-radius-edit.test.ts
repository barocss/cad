import test from 'node:test';
import assert from 'node:assert/strict';
import { flangeRadiusEdit } from '../src/app/flangeRadiusEdit';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { toPartDocument } from '../src/engine/part';
import { evaluateCadPart, flatPatternOf, massPropertiesOf, checkBrep } from '@barocss/cad';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture(): StudioDoc {
 const sk=withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]});
 const base=withNode(sk,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 return withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],length:20,bendRadius:2});
}
function native(doc: StudioDoc,r:number) {
 const [out]=evaluateCadPart(toPartDocument(doc)).outputs, flat=flatPatternOf(out), volume=50*1.5*(100-2*(r+1.5)+Math.PI/2*(r+.75));
 assert.ok(checkBrep(out.brep,{strict:true}).valid); assert.equal(out.bodyCount,1); assert.ok(Math.abs(massPropertiesOf(out).volume-volume)<1e-7);
 assert.equal(out.sheet!.bendRadius,1.5); assert.equal(out.sheet!.bends.length,1); assert.equal(out.sheet!.bends[0].radius,r);
 assert.equal(flat.bends.length,1); assert.ok(Math.abs(flat.bends[0].radius-r)<1e-8); assert.ok(Math.abs(flat.bends[0].allowance-Math.PI/2*(r+.44*1.5))<1e-8);
 assert.ok(Math.abs(flat.area-50*(100-2*(r+1.5)+Math.PI/2*(r+.44*1.5)))<1e-7);
 return out;
}
test('own flange radius changes alone with native volume, developed geometry and file preservation',async()=>{
 const doc=fixture(), snapshot=structuredClone(doc), field=flangeRadiusEdit(doc,doc.nodes,2)!; assert.ok(field?.kind==='number'); assert.equal(field.get(doc.nodes),2);
 native(doc,2);
 const nodes=field.set(doc.nodes,3), next={...doc,nodes}; assert.equal(nodes[0],doc.nodes[0]); assert.equal(nodes[1],doc.nodes[1]);
 assert.deepEqual(nodes[2],{...doc.nodes[2],bendRadius:3}); native(next,3);
 const opened=await readStudioFile(encodeStudioFile(next));assert.ok('doc'in opened);if('doc'in opened){assert.deepEqual(opened.doc,next);native(opened.doc,3);}
 assert.deepEqual(doc,snapshot);
});
test('History scope exposes a numeric-only radius, HUD cannot inject it',()=>{
 const doc=fixture(), fields=editFields(doc.nodes,2,{R:3},undefined,{doc}), field=fields.find(f=>f.key==='ownBendRadius')!;
 assert.ok(field?.kind==='number');assert.equal('bind'in field,false);assert.equal('param'in field,false);
 assert.equal(editFields(doc.nodes,2,doc.parameters).some(f=>f.key==='ownBendRadius'),false);
 const command=editCommand(2,doc.nodes,doc)!;assert.ok(command);const evaluation=evaluateDoc(doc,1);assert.ok(evaluation.ok);if(!evaluation.ok)return;
 const ctx={doc,bodies:evaluation.bodies,selection:{faces:[],edges:[],bodies:[]}};
 assert.equal(command.fields?.(ctx).some(f=>f.key==='ownBendRadius'),false);
 const built=command.build!(ctx,{...command.defaults?.(ctx),ownBendRadius:7});assert.deepEqual(built.nodes,doc.nodes);
});
test('unsupported inherited, bound, compound or altered metadata does not gain the field',()=>{
 const doc=fixture();
 const patch=(i:number,extra:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,k)=>k===i?{...n,...extra} as typeof n:n)});
 const bad=[patch(2,{bendRadius:undefined}),patch(2,{bendRadius:{parameter:'R'}}),patch(2,{bendRadius:0}),patch(2,{bendRadius:NaN}),patch(2,{offsets:[0,0]}),patch(2,{relief:{kind:'none'}}),patch(2,{angle:45}),patch(2,{measure:'inner'}),patch(2,{position:'bend-outside'}),patch(2,{held:'held'}),patch(2,{made:{}}),patch(1,{bendTable:{}}),patch(1,{thickness:{parameter:'T'}}),patch(1,{kFactor:NaN}),patch(0,{plane:{}}),patch(0,{max:[80,0]}),patch(0,{min:[0,NaN]}),patch(2,{id:'n1'}),
  {...doc,outputs:{}},{...doc,outputs:{...doc.outputs,extra:{node:1,side:'solid' as const}}},{...doc,direct:{sources:{},objects:[]}}, {...doc,instances:[]}, {...doc,nodes:[...doc.nodes,doc.nodes[0]]}];
 for(const d of bad)assert.equal(flangeRadiusEdit(d,d.nodes,2),null);
 assert.equal(flangeRadiusEdit(undefined,doc.nodes,2),null);assert.equal(flangeRadiusEdit({},doc.nodes,2),null);
 for(const extra of [{angle:90},{measure:'outer'},{position:'material-inside'}]) {const d=patch(2,extra);assert.ok(flangeRadiusEdit(d,d.nodes,2));}
});
test('captured setters reject foreign arrays, source mutations and invalid numeric inputs',()=>{
 const doc=fixture(), field=flangeRadiusEdit(doc,doc.nodes,2)!;assert.ok(field.kind==='number');
 assert.throws(()=>field.set([...doc.nodes],3),/BAD_REFERENCE/);
 for(const value of [0,-1,NaN,Infinity]) assert.throws(()=>field.set(doc.nodes,value),/VALUE/);
 const snapshot=structuredClone(doc);assert.deepEqual(field.set(doc.nodes,2),doc.nodes);assert.deepEqual(doc,snapshot);
 doc.parameters.changed=1;assert.throws(()=>field.set(doc.nodes,3),/BAD_REFERENCE/);
 const other=fixture(), old=flangeRadiusEdit(other,other.nodes,2)!;assert.ok(old.kind==='number');const flange=other.nodes[2];assert.ok(flange.kind==='sheet-flange');flange.length=21;assert.throws(()=>old.set(other.nodes,3),/BAD_REFERENCE/);
});
test('a fresh radius-only draft remains editable, while a changed source or owner does not',()=>{
 const doc=fixture(), field=flangeRadiusEdit(doc,doc.nodes,2)!;assert.ok(field.kind==='number');
 const draft=field.set(doc.nodes,3), fresh=flangeRadiusEdit(doc,draft,2)!;assert.ok(fresh?.kind==='number');assert.equal(fresh.get(draft),3);assert.deepEqual(fresh.set(draft,4)[2],{...doc.nodes[2],bendRadius:4});
 assert.equal(flangeRadiusEdit(doc,structuredClone(draft),2),null);
 const changed=draft.map((n,i)=>i===2?{...n,length:25} as typeof n:n);assert.equal(flangeRadiusEdit(doc,changed,2),null);
});
test('oversized explicit radius is refused by native evaluation and leaves the accepted source intact',()=>{
 const doc=fixture(), snapshot=structuredClone(doc), accepted=partBreps(doc), field=flangeRadiusEdit(doc,doc.nodes,2)!;assert.ok(field.kind==='number');
 const next={...doc,nodes:field.set(doc.nodes,20)}, result=evaluateDoc(next,2);assert.equal(result.ok,false);if(!result.ok)assert.match(result.error.detail,/BEND_DOES_NOT_FIT/);
 assert.deepEqual(doc,snapshot);assert.deepEqual(partBreps(doc),accepted);native(doc,2);
});
