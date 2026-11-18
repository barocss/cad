import test from 'node:test';
import assert from 'node:assert/strict';
import {commands,type Ctx} from '@barocss/cad-model/app/commands';
import {emptyDoc,type StudioDoc} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {drawingRevisionPrint} from '../src/ui/drawing/revisionPrint';
function fixture():StudioDoc {
 const blank:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}},c=commands.find(c=>c.id==='cylinder')!;
 const doc={...c.build!(blank,{...c.defaults!(blank),r:15.5,h:20,x:0,y:0,z:0}),orings:{version:1 as const,rows:[{id:'214',insideDiameter:24.99,crossSection:3.53,source:'Synthetic test row'}]}};
 const r=evaluateDoc(doc,1);assert.ok(r.ok);const body=r.bodies.findIndex(b=>b.mesh.faces.some(f=>f.name==='n1.side0'));
 const ctx:Ctx={doc,bodies:r.bodies,selection:{faces:[{body,face:r.bodies[body].mesh.faces.findIndex(f=>f.name==='n1.side0')}],edges:[],bodies:[]}},g=commands.find(c=>c.id==='oring-gland')!;
 return g.build!(ctx,{...g.defaults!(ctx),seal:31.1,dg:25.5,w:4.7,at:6});
}
test('an actual ring changes geometry when its catalogue cross-section changes',()=>{
 const a=fixture(),b=structuredClone(a),before=structuredClone(a);b.orings!.rows[0]={...b.orings!.rows[0],crossSection:3.7};
 const ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.deepEqual(a.nodes,b.nodes);assert.deepEqual(a,before);const va=ea.bodies.map(b=>b.volume),vb=eb.bodies.map(b=>b.volume);console.log(JSON.stringify({va,vb,stamps:[drawingRevisionPrint(a),drawingRevisionPrint(b)]}));assert.notDeepEqual(va,vb);assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
});
test('a gland without its ring keeps the same geometry for a valid row change',()=>{
 const a=fixture();a.nodes=a.nodes.filter(n=>n.kind!=='oring');const b=structuredClone(a);b.orings!.rows[0]={...b.orings!.rows[0],crossSection:3.7};const ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.deepEqual(ea.bodies.map(b=>b.volume),eb.bodies.map(b=>b.volume));assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('suppressed rings and glands do not add row geometry dependencies',()=>{
 for(const kind of ['oring','oring-gland']){const a=fixture();a.nodes=a.nodes.map(n=>n.kind===kind?{...n,suppressed:true}:n);const b=structuredClone(a);b.orings!.rows[0]={...b.orings!.rows[0],crossSection:3.7};assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));}
});
test('unused rows, source and dash labels are not ring geometry',()=>{
 const a=fixture(),b=structuredClone(a);b.orings!.rows=[{...b.orings!.rows[0],dash:'Renamed',source:'Other synthetic source'},{id:'unused',insideDiameter:99,crossSection:4,estimate:true}];assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));const c=structuredClone(a);c.orings!.rows[0]={...c.orings!.rows[0],insideDiameter:25};assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(c));
});
test('catalogue lookup uses the last duplicate and does not depend on row order',()=>{
 const a=fixture(),b=structuredClone(a);b.orings!.rows.unshift({...b.orings!.rows[0],crossSection:3.7});assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));b.orings!.rows.reverse();assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));const c=structuredClone(a);c.orings!.rows.push({id:'unused',insideDiameter:99,crossSection:4,estimate:true});const d=structuredClone(c);d.orings!.rows.reverse();assert.equal(drawingRevisionPrint(c),drawingRevisionPrint(d));
});
test('old ring issues preserve saved stamps until explicit reissue; gland-only legacy remains exact',async()=>{
 const {modelPrint,defaultDrawing}=await import('@barocss/cad-model/drawing/types');const {encodeStudioFile,readStudioFile}=await import('@barocss/cad-model/engine/container');const a=fixture(),legacy=modelPrint(a.nodes),doc={...a,drawing:{...defaultDrawing(),revision:'A',revisedModel:legacy}},before=structuredClone(doc);assert.notEqual(drawingRevisionPrint(doc),legacy);assert.deepEqual(doc,before);const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.equal(opened.doc.drawing!.revisedModel,legacy);assert.equal(drawingRevisionPrint(opened.doc),drawingRevisionPrint(doc));const gland=fixture();gland.nodes=gland.nodes.filter(n=>n.kind!=='oring');assert.equal(drawingRevisionPrint(gland),modelPrint(gland.nodes));
});
test('missing rows and invalid gland references do not crash a revision read',()=>{
 const missing=fixture();missing.orings!.rows=[];assert.equal(drawingRevisionPrint(missing),drawingRevisionPrint({...missing,orings:undefined}));
 for(const gland of [-1,1.5,99]){const doc=fixture();doc.nodes=doc.nodes.map(n=>n.kind==='oring'?{...n,gland}:n);assert.doesNotThrow(()=>drawingRevisionPrint(doc));}
});
