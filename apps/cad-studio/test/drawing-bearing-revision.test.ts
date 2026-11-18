import test from 'node:test';
import assert from 'node:assert/strict';
import {commands,type Ctx} from '@barocss/cad-model/app/commands';
import {emptyDoc,withNode,type StudioDoc} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {drawingRevisionPrint} from '../src/ui/drawing/revisionPrint';
const fixture=(outside:number):StudioDoc=>{const c=commands.find(c=>c.id==='shaft')!,ctx:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};return {...withNode(c.build!(ctx,{...c.defaults!(ctx),ks:0,gs:0,r:0}),{kind:'bearing',row:'6204',shaft:0,step:1,against:'end'}),bearings:{version:1,rows:[{id:'6204',bore:20,outside,width:14,chamfer:1,daMin:25,daMax:26.5,raMax:1,source:'Synthetic test row'}]}};};
test('used bearing row geometry changes invalidate an issued standalone drawing',()=>{
 const a=fixture(47),b=fixture(57),before=structuredClone(a),ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.deepEqual(a.nodes,b.nodes);const va=ea.bodies.map(b=>b.volume),vb=eb.bodies.map(b=>b.volume);assert.notDeepEqual(va,vb);assert.deepEqual(a,before);console.log(JSON.stringify({va,vb,stamps:[drawingRevisionPrint(a),drawingRevisionPrint(b)]}));assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('metadata and unused rows do not invalidate bearing drawing geometry',()=>{
 const a=fixture(47),b=structuredClone(a);Object.assign(b.bearings!.rows[0],{designation:'Renamed',source:'New synthetic citation',daMin:24,daMax:27,DaMax:50,raMax:2,boreDeviation:[0,-0.01],outsideDeviation:[0,-0.02]});b.bearings!.rows.push({...b.bearings!.rows[0],id:'unused',outside:80});
 assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));const ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);assert.deepEqual(ea.bodies.map(b=>b.volume),eb.bodies.map(b=>b.volume));
});
test('all envelope fields are tracked; absent chamfer and explicit zero agree',()=>{
 const a=fixture(47);for(const field of ['bore','outside','width','chamfer'] as const){const b=structuredClone(a);b.bearings!.rows[0]={...b.bearings!.rows[0],[field]:a.bearings!.rows[0][field]!+1};assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b),field);}
 const absent=structuredClone(a),zero=structuredClone(a);absent.bearings!.rows[0]={id:'6204',bore:20,outside:47,width:14,source:'Synthetic test row'};zero.bearings!.rows[0]={...absent.bearings!.rows[0],chamfer:0};assert.equal(drawingRevisionPrint(absent),drawingRevisionPrint(zero));
});
test('legacy ordinary and suppressed sources remain compatible; bearing issues require explicit reissue',async()=>{
 const {modelPrint,defaultDrawing}=await import('@barocss/cad-model/drawing/types');const {encodeStudioFile,readStudioFile}=await import('@barocss/cad-model/engine/container');
 const a=fixture(47),legacy=modelPrint(a.nodes),doc={...a,drawing:{...defaultDrawing(),revision:'A',revisedModel:legacy}},before=structuredClone(doc);assert.notEqual(drawingRevisionPrint(doc),legacy);assert.deepEqual(doc,before);
 const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.equal(opened.doc.drawing!.revisedModel,legacy);assert.equal(drawingRevisionPrint(opened.doc),drawingRevisionPrint(doc));
 const plain=fixture(47);plain.nodes=plain.nodes.filter(n=>n.kind!=='bearing');assert.equal(drawingRevisionPrint(plain),modelPrint(plain.nodes));plain.parameters={length:20};assert.equal(drawingRevisionPrint(plain),modelPrint({nodes:plain.nodes,parameters:plain.parameters}));
 const suppressed=fixture(47);suppressed.nodes[1].suppressed=true;const changed=structuredClone(suppressed);changed.bearings!.rows[0]={...changed.bearings!.rows[0],outside:57};assert.equal(drawingRevisionPrint(suppressed),modelPrint(suppressed.nodes));assert.equal(drawingRevisionPrint(suppressed),drawingRevisionPrint(changed));
});
test('row order, duplicate lookup and missing referenced rows match source semantics',()=>{
 const a=fixture(47),b=structuredClone(a);b.bearings!.rows.unshift({...b.bearings!.rows[0],outside:90});assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
 b.bearings!.rows[1]={...b.bearings!.rows[1],outside:57};assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
 const two=structuredClone(a);two.nodes.push({kind:'bearing',row:'other',shaft:0,step:1,against:'end'});two.bearings!.rows.push({...two.bearings!.rows[0],id:'other',outside:57});const reversed=structuredClone(two);reversed.bearings!.rows.reverse();assert.equal(drawingRevisionPrint(two),drawingRevisionPrint(reversed));
 const missing=structuredClone(a);missing.bearings!.rows=[];assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(missing));assert.equal(drawingRevisionPrint(missing),drawingRevisionPrint({...missing,bearings:undefined}));
});
