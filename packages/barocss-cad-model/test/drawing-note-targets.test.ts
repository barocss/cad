import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { captureNoteTarget, resolveNoteTarget, resolveNoteLeader, type NoteTarget } from '../src/drawing/noteTargets';
import { checkSavedNoteTargets } from '../src/drawing/savedNoteTargets';
import { defaultDrawing, readDrawing, type DrawingViews, type DrawingNote, type DrawingSettings } from '../src/drawing/types';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { emptyDoc, starterDoc } from '../src/engine/doc';
import { brepsFor, type BodyResult } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { referencesOf, captureSignatures, refreshSignatures, verifyReferences, confirmReference, candidatesFor } from '../src/engine/references';
import { assertSavedDrawingDocument } from '../src/engine/savedDrawing';
import { changeDrawingScope } from '../src/drawing/scope';
import { layoutSheet, toSheet } from '../src/drawing/views';
import { buildSheet, noteMarks } from '../src/drawing/sheet';
import { drawingIssues, issueContext } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';

const edge: BrepProjection['edges'][number]={name:'n1.edge',kind:'line',ends:[[0,0,0],[40,0,0]],circle:null,pieces:[{curve:{kind:'line',a:[0,0],b:[40,0]},visible:true}]};
const projection:BrepProjection={right:[1,0,0],up:[0,0,1],toward:[0,-1,0],min:[0,0],max:[40,10],edges:[edge]};
const views:DrawingViews={front:projection,top:projection,right:projection,iso:projection};
function fixture() {
 const target=captureNoteTarget(projection,edge.name,[0,0,0]);assert.ok(target);
 const note:DrawingNote={id:'note1',text:'Keep this note',at:[30,60],leader:{view:'front',at:[99,99],target}};
 const settings:DrawingSettings={...defaultDrawing(),scope:{kind:'part'},notes:[note]};
 return {target,note,settings,doc:{...emptyDoc(),drawing:settings}};
}
function body(length:number):BodyResult {
 return {key:'b1',family:'planar',volume:null,mass:null,mesh:{positions:new Float32Array(),normals:new Float32Array(),faceOfVertex:new Float32Array(),indices:new Uint32Array(),edgeLines:new Float32Array(),edgeOfSegment:new Float32Array(),faces:[],edges:[{index:0,names:[edge.name],a:[0,0,0],b:[length,0,0],faces:[0,0],straight:true,axis:null}],bounds:{min:[0,0,0],max:[length,0,0]}}};
}
test('bound Note chooses explicit lexicographic endpoint despite reversed endpoint order and midpoint near hint',()=>{
 const {target}=fixture(), before=structuredClone(target);
 const reverse:BrepProjection={...projection,edges:[{...edge,ends:[edge.ends![1],edge.ends![0]]}]};
 assert.deepEqual(resolveNoteTarget(reverse,{...target,near:[20,0,0]}),{ok:true,at:[0,0,0],edge:edge.name});
 const max=captureNoteTarget(projection,edge.name,[40,0,0]);assert.ok(max);assert.equal(max.endpoint,'max');
 assert.deepEqual(resolveNoteTarget(reverse,max),{ok:true,at:[40,0,0],edge:edge.name});
 assert.equal(captureNoteTarget(projection,edge.name,[20,0,0]),null);
 assert.deepEqual(target,before);
});
test('changed, absent, duplicate, curved, rematched or unsigned source never falls back to a stale arrow',()=>{
 const {target,note,settings}=fixture(), layout=layoutSheet(views,settings);
 const variants:BrepProjection[]=[{...projection,edges:[]},{...projection,edges:[edge,edge]},
  {...projection,edges:[{...edge,ends:[[0,0,0],[60,0,0]]}]},
  {...projection,edges:[{...edge,ends:[[10,0,0],[50,0,0]]}]},
  {...projection,edges:[{...edge,kind:'circle'}]}];
 for(const pr of variants){assert.equal(resolveNoteTarget(pr,target).ok,false);const v={...views,front:pr};
  const marks=noteMarks(layout,note,undefined,v,settings);assert.ok(marks.length);assert.ok(marks.every(m=>m.kind==='text'));
  const context=issueContext({views:v,settings,callout:()=>null,meta:{title:'Fixture',date:'2026-11-18'}});
  assert.ok(drawingIssues(context).some(i=>i.code.startsWith('NOTE_TARGET_')&&i.notes?.includes(note.id)));
 }
 assert.equal(resolveNoteTarget(projection,{...target,was:target.edge}).ok,false);
 assert.equal(resolveNoteTarget(projection,{...target,sig:undefined} as unknown as NoteTarget).ok,false);
 assert.ok(noteMarks(layout,note).every(m=>m.kind==='text'),'no projection/context means no bound arrow');
 assert.equal(resolveNoteLeader(views,note).ok,false);
});
test('hidden source refuses capture and suppresses only the bound arrow until visibility returns',()=>{
 const {target,note,settings}=fixture(), before=structuredClone(settings), layout=layoutSheet(views,settings);
 const hidden:BrepProjection={...projection,edges:[{...edge,pieces:edge.pieces.map(piece=>({...piece,visible:false}))}]};
 const result=resolveNoteTarget(hidden,target);assert.equal(result.ok,false);
 if(!result.ok){assert.equal(result.code,'NOTE_TARGET_UNSUPPORTED');assert.match(result.reason,/not visible/);}
 assert.equal(captureNoteTarget(hidden,edge.name,[0,0,0]),null);
 assert.ok(noteMarks(layout,note,undefined,{...views,front:hidden},settings).every(m=>m.kind==='text'));
 assert.equal(resolveNoteTarget(projection,target).ok,true);
 assert.ok(noteMarks(layout,note,undefined,views,settings).some(m=>m.kind==='fill'));
 assert.deepEqual(settings,before);
});
test('shared sheet marks use verified native tip; legacy free leaders and text remain unchanged',()=>{
 const {note,settings}=fixture(), layout=layoutSheet(views,settings), before=structuredClone(settings);
 const sheet=buildSheet(views,layout,settings,{title:'Fixture',date:'2026-11-18'});
 const group=sheet.groups.find(g=>g.role==='note'&&g.id===note.id)!;
 const arrow=group.marks.find(m=>m.kind==='fill'&&m.head);
 assert.ok(arrow?.kind==='fill'&&arrow.head);assert.deepEqual(arrow.head.tip,toSheet(layout.views.front,[0,0]));
 const free:DrawingNote={...note,leader:{view:'front',at:[99,99]}};
 assert.deepEqual(noteMarks(layout,free),noteMarks(layout,free,undefined,views,settings));
 assert.deepEqual(settings,before);
});
test('raw new targets are preserved or refused before reader downgrade; old notes are unchanged and scope changes refuse',()=>{
 const {note,settings,doc}=fixture(), before=structuredClone(doc);
 assert.deepEqual(checkSavedNoteTargets(settings),[]);assertSavedDrawingDocument(doc);
 assert.deepEqual(readDrawing(settings),settings);
 for(const patch of [{target:undefined},{target:{}},{target:{...note.leader!.target,sig:undefined}},{target:{...note.leader!.target,endpoint:'near'}},{view:'iso'},{at:[NaN,0]}]){
  const raw={...settings,notes:[{...note,leader:{...note.leader!,...patch}}]};
  assert.ok(checkSavedNoteTargets(raw).length);assert.throws(()=>assertSavedDrawingDocument({...doc,drawing:raw}));
 }
 for(const scope of [{kind:'assembly'},{kind:'part',part:'other'},{kind:'part',body:{key:'b1',node:'n1',kind:'extrude'}}]) {
  assert.ok(checkSavedNoteTargets({...settings,scope}).length);
  assert.equal(resolveNoteLeader(views,note,{...settings,scope} as DrawingSettings).ok,false);
 }
 assert.throws(()=>changeDrawingScope(settings,{kind:'assembly'}));
 const broken={...settings,breaks:[{axis:'x' as const,from:10,to:20}]};assert.equal(resolveNoteLeader(views,note,broken).ok,false);
 const legacy={...defaultDrawing(),notes:[{id:'free',text:'Free',at:[1,2],leader:{view:'front',at:[3,4]}}]};assert.deepEqual(readDrawing(legacy),legacy);
 assert.deepEqual(doc,before);
});
test('reference COW isolates target and generic capture/refresh/rematch/confirm never rebinds a Note',async()=>{
 const {doc,target}=fixture(), before=structuredClone(doc), copied=referencesOf(doc);
 const index=copied.refs.findIndex(r=>r.noteTarget);assert.ok(index>=0);
 copied.refs[index].rename('different',true);copied.refs[index].setSig({...target.sig,p:[8,0,0]});
 copied.doc.drawing!.notes![0].leader!.target!.near[0]=999;
 assert.deepEqual(doc,before);
 assert.equal(captureSignatures(doc,[body(60)]),doc);
 const refreshed=await refreshSignatures(doc,[body(60)],async()=>null);assert.deepEqual(refreshed,doc);
 const verified=await verifyReferences(doc,[body(60)],async()=>null);assert.equal(verified.changes.length,0);assert.ok(verified.problems.some(p=>p.where==='note note1'));
 assert.deepEqual(verified.doc.drawing!.notes,doc.drawing!.notes);
 assert.equal(await confirmReference(doc,index,[body(60)],async()=>null,'different'),doc);
 assert.deepEqual(await candidatesFor(doc,index,[body(60)],async()=>null),[]);
 assert.deepEqual(doc,before);
});
test('native view reorientation preserves the signed endpoint and only reprojects it, without re-signing',()=>{
 const doc=starterDoc(), breps=brepsFor(doc);assert.ok('breps' in breps);
 const from=projectViews(breps.breps,breps.prefixes), to=projectViews(breps.breps,breps.prefixes,{orientation:'x+'});assert.ok(from.ok&&to.ok);
 // viewsFor preserves top toward +Z, while old front -Y maps to new right +Y.
 // Select from actual native projection visibility, not an arbitrary first edge.
 const ids=['front','top','right'] as const;
 const visible=(e:BrepProjection['edges'][number])=>e.pieces.some(piece=>piece.visible);
 assert.deepEqual(from.views.top.toward,to.views.top.toward);
 for(const [origin,expectedVisible] of [['top',true],['front',false]] as const){
  const axis=from.views[origin].toward;
  const destination: typeof ids[number] | undefined=ids.find(id=>Math.abs(Math.abs(to.views[id].toward.reduce((sum,x,k)=>sum+x*axis[k],0))-1)<1e-9);assert.ok(destination);
  const candidates: BrepProjection['edges'][number][]=from.views[origin].edges.filter(e=>e.kind==='line'&&e.ends?.length===2&&visible(e)&&from.views[origin].edges.filter(x=>x.name===e.name).length===1);
  const e: BrepProjection['edges'][number] | undefined=candidates.find((candidate): boolean=>{const matches: BrepProjection['edges'][number][]=to.views[destination].edges.filter(x=>x.name===candidate.name);return matches.length===1&&visible(matches[0])===expectedVisible;});
  assert.ok(e,expectedVisible?'native top edge remains visible':'native front edge becomes hidden from reverse side');
  const target=captureNoteTarget(from.views[origin],e.name,e.ends![0]);assert.ok(target);
  const note:DrawingNote={id:'native',text:'Native',at:[30,50],leader:{view:origin,at:[0,0],target}};
  const settings:DrawingSettings={...defaultDrawing(),scope:{kind:'part'},notes:[note]}, before=structuredClone(settings);
  const turned=reorient(from.views,to.views,settings,'x+');assert.ok(turned.ok);
  const changed=turned.settings.notes![0];assert.equal(changed.leader!.view,destination);assert.deepEqual(changed.leader!.target,target);
  const result=resolveNoteLeader(to.views,changed,turned.settings);
  if(expectedVisible){assert.ok(result.ok);assert.deepEqual(result.point,e.ends![0]);}
  else{assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'NOTE_TARGET_UNSUPPORTED');
   const layout=layoutSheet(to.views,turned.settings);assert.ok(noteMarks(layout,changed,undefined,to.views,turned.settings).every(m=>m.kind==='text'));}
  assert.deepEqual(settings,before);
 }

});

test('native JSON and project container retain bound and legacy notes without new schema or implicit signatures',async()=>{
 const {doc,note}=fixture();doc.drawing.notes!.push({id:'legacy',text:'Free',at:[2,4],leader:{view:'top',at:[5,6]}});
 const before=structuredClone(doc),json=readStudioDoc(JSON.stringify(doc));assert.ok('doc' in json);assert.deepEqual(json.doc.drawing,doc.drawing);assert.equal(json.doc.schema,3);
 const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.deepEqual(opened.doc.drawing,doc.drawing);
 const invalid={...doc,drawing:{...doc.drawing,notes:[{...note,leader:{...note.leader,target:{...note.leader!.target,sig:undefined}}}]}};
 assert.ok('error' in readStudioDoc(JSON.stringify(invalid)));
 assert.deepEqual(doc,before);
});
