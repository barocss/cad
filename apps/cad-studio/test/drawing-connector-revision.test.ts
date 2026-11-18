import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueFixture} from '../../../packages/barocss-cad-model/test/fixtures/inherited-catalogue';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {drawingRevisionPrint} from '../src/ui/drawing/revisionPrint';
const fixture=()=>{const root=catalogueFixture('connectors');return {...root.instances![0].doc,connectors:root.connectors};};
test('used connector opening dimensions alter the manufactured panel and invalidates its issued stamp',()=>{
 const a=fixture(),before=structuredClone(a),b=structuredClone(a),row=b.connectors!.rows[0];b.connectors!.rows[0]={...row,opening:{...row.opening,width:10.34}};
 const ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.deepEqual(a.nodes,b.nodes);assert.deepEqual(a,before);const va=ea.bodies.map(b=>b.volume),vb=eb.bodies.map(b=>b.volume);assert.ok(Math.abs(va[0]!-vb[0]!-31.744)<1e-6);console.log(JSON.stringify({va,vb,stamps:[drawingRevisionPrint(a),drawingRevisionPrint(b)]}));assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('only a present connector body consumes its envelope dimensions',()=>{
 const a=fixture(),b=structuredClone(a),row=b.connectors!.rows[0];assert.ok(row.body);b.connectors!.rows[0]={...row,body:{...row.body,length:7}};const ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.equal(ea.bodies[0].volume,eb.bodies[0].volume);assert.notEqual(ea.bodies[1].volume,eb.bodies[1].volume);assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
 for(const doc of [a,b])doc.nodes=doc.nodes.filter(n=>n.kind!=='connector-body');assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('keep-out, metadata and unused rows are not model geometry',()=>{
 const a=fixture(),b=structuredClone(a);b.connectors!.rows=[{...b.connectors!.rows[0],name:'Renamed',source:'Other synthetic source',keepOut:{margin:3,depth:25}},{...b.connectors!.rows[0],id:'unused'}];const ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.deepEqual(ea.bodies.map(b=>b.volume),eb.bodies.map(b=>b.volume));assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
});
test('suppressed bodies exclude envelope dimensions; suppressed openings add no row inputs',()=>{
 const a=fixture();a.nodes=a.nodes.map(n=>n.kind==='connector-body'?{...n,suppressed:true}:n);const b=structuredClone(a),row=b.connectors!.rows[0];assert.ok(row.body);b.connectors!.rows[0]={...row,body:{...row.body,length:7}};assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
 for(const doc of [a,b])doc.nodes=doc.nodes.map(n=>n.kind==='connector-opening'?{...n,suppressed:true}:n);b.connectors!.rows[0]={...row,opening:{...row.opening,width:10.34}};assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
});
test('last row lookup and absent rectangle radius preserve equivalent geometry',()=>{
 const a=fixture(),b=structuredClone(a);b.connectors!.rows.unshift({...b.connectors!.rows[0],opening:{...b.connectors!.rows[0].opening,width:10.34}});assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));b.connectors!.rows.reverse();assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
 const rect=fixture();rect.connectors!.rows[0]={...rect.connectors!.rows[0],opening:{shape:'rect',width:10,height:5,depth:6}};const zero=structuredClone(rect);zero.connectors!.rows[0]={...zero.connectors!.rows[0],opening:{...zero.connectors!.rows[0].opening,cornerRadius:0}};assert.equal(drawingRevisionPrint(rect),drawingRevisionPrint(zero));
});
test('old connector stamps are preserved in Native files; ordinary legacy is unchanged',async()=>{
 const {modelPrint,defaultDrawing}=await import('@barocss/cad-model/drawing/types');const {encodeStudioFile,readStudioFile}=await import('@barocss/cad-model/engine/container');const a=fixture(),legacy=modelPrint(a.nodes),doc={...a,drawing:{...defaultDrawing(),revision:'A',revisedModel:legacy}},before=structuredClone(doc);assert.notEqual(drawingRevisionPrint(doc),legacy);assert.deepEqual(doc,before);const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.equal(opened.doc.drawing!.revisedModel,legacy);assert.equal(drawingRevisionPrint(opened.doc),drawingRevisionPrint(doc));const plain=fixture();plain.nodes=plain.nodes.filter(n=>n.kind!=='connector-opening'&&n.kind!=='connector-body');assert.equal(drawingRevisionPrint(plain),modelPrint(plain.nodes));
});
