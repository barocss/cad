// D1343: scoped native Open guidance for a moved anonymous STEP reference.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/files/documentFile.ts','apps/cad-studio/src/App.tsx','packages/barocss-cad-model/src/engine/offsetPlane.ts'];
const f=await createFlow({name:'reference-open-recovery',output:process.argv[2],envFrozen:'D1343_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Changed anonymous STEP reference refuses native Open with actionable recovery and unchanged accepted document.',limits:['One generated native STEP prism; no external re-save or general reference-rematch acceptance.'],inspectorSource:`
import assert from 'node:assert/strict';
import {evaluateCadPart,exportStep} from '@barocss/cad';
import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {offsetFaceCommand} from '@barocss/cad-model/app/profileCommands';
const target=evaluateCadPart({format:'barocss-cad-part',version:1,units:'mm',parameters:{},features:[{id:'n2',kind:'sketch',profile:'polygon',points:[[20,1],[24,-2],[27,2],[23,5]]},{id:'n3',kind:'extrude',sketch:'n2',height:10,from:30}]}).outputs[0].brep;
const step=exportStep(target,{timestamp:'2026-11-15T00:00:00Z'});
function make(raw){let doc=withNode(emptyDoc(),{kind:'sketch',profile:'polygon',points:[[0,0],[18,0],[24,8],[18,16],[0,16],[-6,8]]});doc=withNode(doc,{kind:'extrude',sketch:0,height:10});doc=withNode(doc,{kind:'import',name:'reference.step',step:raw});const r=evaluateDoc(doc,0);assert.ok(r.ok);const source=r.bodies.findIndex(b=>b.key==='b1'),reference=r.bodies.findIndex(b=>b.key==='b2');const a=r.bodies[source].mesh.faces.find(f=>f.name==='n1.side1');const b=r.bodies[reference].mesh.faces.find(f=>Math.abs(4*f.centroid[0]-3*f.centroid[1]-77)<1e-8);assert.ok(a&&b);const ctx={doc,bodies:r.bodies,selection:{faces:[{body:source,face:a.index}],edges:[],bodies:[]}};const picked=offsetFaceCommand.onPick(ctx,{offsetMode:'to-plane'},{face:{body:reference,face:b.index},edge:null});assert.ok(picked&&!picked.error);return offsetFaceCommand.build(ctx,picked);}
const named=make(step),anonymous=make(step.replace("ADVANCED_FACE('n3.side3',","ADVANCED_FACE('',"));
function reorder(doc){const copy=structuredClone(doc);copy.nodes[2].step=copy.nodes[2].step.replace(/CLOSED_SHELL\\('([^']*)',\\(([^)]*)\\)\\)/,(_,name,refs)=>"CLOSED_SHELL('"+name+"',("+refs.split(',').reverse().join(',')+"))");assert.notEqual(copy.nodes[2].step,doc.nodes[2].step);return copy;}
const namedReordered=reorder(named),bad=reorder(anonymous);assert.ok(evaluateDoc(namedReordered,0).ok);const rejected=evaluateDoc(bad,0);assert.equal(rejected.ok,false);assert.match(rejected.error.detail,/original reference face changed/);
const valid=evaluateDoc(anonymous,0);assert.ok(valid.ok);console.log(JSON.stringify({named,namedReordered,anonymous,bad,error:rejected.error,volumes:valid.bodies.map(b=>b.volume)}));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 const fixture=await f.inspect('step-reference-fixtures',{});
 const polygon=[[0,0],[77/4,0],[(77+120)/8,(120-77)/6],[18,16],[0,16],[-6,8]];const expected=Math.abs(polygon.reduce((a,p,i)=>{const q=polygon[(i+1)%polygon.length];return a+p[0]*q[1]-p[1]*q[0];},0))*5;assert.ok(fixture.volumes.some(v=>Math.abs(v-expected)<1e-7));assert.ok(fixture.volumes.some(v=>Math.abs(v-250)<1e-7));
 const paths={};for(const key of ['named','namedReordered','anonymous','bad']){paths[key]=join(process.argv[2],key+'.bcad');await writeFile(paths[key],JSON.stringify(fixture[key]));}
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});await f.openFile(paths.anonymous,4);await f.same(fixture.anonymous);const accepted=await f.doc(),before=await f.bodies(),undo=await button('Undo').isEnabled(),redo=await button('Redo').isEnabled();
  await f.page.setInputFiles('input[aria-label="Model file"]',paths.bad);await f.waitToast(/saved reference plane has changed/);await f.same(accepted);assert.equal(await button('Undo').isEnabled(),undo);assert.equal(await button('Redo').isEnabled(),redo);assert.deepEqual((await f.bodies()).bodies.map(b=>b.volume),before.bodies.map(b=>b.volume));const notice=(await f.toasts()).join(' ');assert.doesNotMatch(notice,/Pick it again/);assert.match(notice,/previous|earlier/i);await f.snapshot(`${width}-anonymous-open-refused`);
  await f.dismissToasts();await f.openFile(paths.namedReordered,4);await f.same(fixture.namedReordered);await f.snapshot(`${width}-named-reordered-open`);
  f.report.observations.push({width,anonymousRefused:true,namedReorderedAccepted:true,documentHistoryGeometryPreserved:true,volumes:fixture.volumes});
 }
});
