// #202 opt-in structured targets, public grouped query on accepted native document copies.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/test/drawing-issue-targets-browser.mjs', 'packages/barocss-cad-model/src/chat/drawing.ts', 'packages/barocss-cad-model/src/chat/tools.ts', 'packages/barocss-cad-model/src/chat/groups.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts', 'packages/barocss-cad-model/src/drawing/issues.ts', 'packages/barocss-cad-model/src/drawing/types.ts', 'apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'apps/cad-studio/src/ui/drawing/IssuesList.tsx', 'apps/cad-studio/src/ui/drawing/DimensionsList.tsx'];
const f = await createFlow({ name: 'drawing-issue-targets', output: process.argv[2], envFrozen: 'DRAWING_ISSUE_TARGETS_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Actual native Open and drawing issue selection, compared with public runTool drawing action issues and direct drawing_issues on a copy of the Studio-accepted document. Opt-in targets preserve the default response.',
 limits: ['Synthetic one-sheet and two-sheet profiles with retained manual linear dimensions.', 'Public runTool is invoked in the local inspector runtime, not through chat UI or external MCP transport.', 'Engine projection and issue generation provide the contract comparison, not an independent geometric oracle.', 'History checks cover visible rows and Undo/Redo availability; selection is session state. No issue fixing, delayed callback or unsupported scope qualification.', 'Native Save and fresh Open are checked separately from read-only query invariants.'],
 inspectorSource: `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {readDrawing} from '@barocss/cad-model/drawing/types';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {drawingIssues,issueContext} from '@barocss/cad-model/drawing/issues';
import {sheetsIssues} from '@barocss/cad-model/drawing/sheetSet';
import {runTool,dispatchTool} from '@barocss/cad-model/chat/tools';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
const sentinel='SYNTHETIC_PRIVATE_NOTE_SENTINEL';
if(!input.nodes){
 const dim=(id,view)=>({id,kind:'linear',view,orient:'horizontal',a:{edge:'missing-feature.a',at:'end',near:[0,0,0]},b:{edge:'missing-feature.b',at:'end',near:[40,0,0]},place:[20,-12]});
 const make=multi=>({...rectanglePart(40,30,5),drawing:readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:multi?['front','top','right']:['front'],notes:[{id:'private-note',text:sentinel,at:[20,40]}],dimensions:multi?[dim('lostA','front'),dim('lostB','right')]:[dim('retained-lost-dimension','front')],...(multi?{sheets:[{id:'second',views:['right']}]}:{})})});
 const single=make(false),multi=make(true);
 for(const d of [single,multi])assert.equal(JSON.stringify(readDrawing(d.drawing)),JSON.stringify(d.drawing));
 assert.equal(multi.drawing.dimensions.length,2);assert.equal(multi.drawing.sheets.length,1);
 console.log(JSON.stringify({single,multi}));
}else{
 const doc=input,before=structuredClone(doc),inputs=drawingInputs(doc),evaluate=async d=>evaluateDoc(d,1);
 assert.notEqual(typeof inputs,'string',String(inputs));
 const multi=!!doc.drawing.sheets?.length;
 const core=multi?sheetsIssues(inputs).map(x=>({sheet:x.sheet,issue:x.issue})):drawingIssues(issueContext(inputs)).map(issue=>({issue}));
 async function call(args){const r=await runTool({doc,bodies:[]},'drawing',{action:'issues',...args},evaluate);assert.equal(r.isError,false,r.content);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,before);assert.deepEqual(doc,before);assert.ok(!r.content.includes(sentinel));return r;}
 const ordinary=await call({}),disabled=await call({include_targets:false}),enabled=await call({include_targets:true});assert.equal(disabled.content,ordinary.content);
 const base=JSON.parse(ordinary.content),data=JSON.parse(enabled.content);
 const stripped={...data,issues:data.issues.map(({dimension_ids,view,...rest})=>rest)};assert.deepEqual(stripped,base);
 assert.equal(data.issues.length,core.length);
 core.forEach(({sheet,issue},index)=>{const row=data.issues[index];assert.equal(row.code,issue.code);assert.equal(row.message,issue.message);if(multi)assert.equal(row.sheet,sheet);assert.deepEqual(row.dimension_ids,issue.dims);assert.equal(row.view,issue.view);});
 const lost=data.issues.filter(x=>x.code==='DIMENSION_LOST');
 assert.deepEqual(lost.map(x=>({ids:x.dimension_ids,view:x.view,...(multi?{sheet:x.sheet}:{})})),multi?[{ids:['lostA'],view:'front',sheet:1},{ids:['lostB'],view:'right',sheet:2}]:[{ids:['retained-lost-dimension'],view:'front'}]);
 for(const [args,expected] of [[{},ordinary],[{include_targets:false},disabled],[{include_targets:true},enabled]]){const direct=await dispatchTool({doc,bodies:[]},'drawing_issues',args,evaluate);assert.equal(direct.isError,false);assert.equal(direct.changed,false);assert.equal(direct.content,expected.content);assert.deepEqual(direct.state.doc,before);}
 const refusals=[];
 for(const value of [null,'true',0]){const state={doc,bodies:[]};const r=await runTool(state,'drawing',{action:'issues',include_targets:value},evaluate);assert.equal(r.isError,true);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,before);assert.deepEqual(doc,before);refusals.push({value,refused:true});}
 console.log(JSON.stringify({base,data,refusals,documentUnchanged:true,defaultFalseByteEqual:true,facadeEqualsDirect:true,sentinelOmitted:true}));
}` });
const history = async () => ({ dirty: await f.page.locator('[aria-label="Unsaved changes"]').count(), undo: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), redo: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), rows: await f.page.locator('.history .hs').evaluateAll(rows => rows.map(r => r.textContent)) });
async function observe(doc, id, label, initialHistory) {
 await f.page.waitForFunction(id => window.__studioDrawing?.()?.dimensions?.some(d => d.id === id && 'lost' in d), id);
 const issue=f.page.locator('[aria-label="Drawing issues"] .dw-issue[title="DIMENSION_LOST"]');assert.equal(await issue.count(),1);await issue.scrollIntoViewIfNeeded();
 const row=f.page.locator('.dw-dim').filter({has:f.page.getByRole('button',{name:`Remove dimension ${id}`,exact:true})});assert.equal(await row.count(),1);
 await issue.focus();await issue.press('Enter');
 await f.page.waitForFunction(id=>[...document.querySelectorAll('.dw-dim.sel')].some(r=>r.querySelector('button[aria-label="Remove dimension '+id+'"]')),id);
 assert.equal(await row.locator('.dw-annotation-select').getAttribute('aria-pressed'),'true');
 const result=await f.inspect(label,await f.doc());await f.same(doc);assert.deepEqual(await history(),initialHistory);
 // Evidence-only scroll: center the real issue and selected dimension together when the panel permits.
 await row.scrollIntoViewIfNeeded();
 const visibility=await issue.evaluate(issue=>{const row=document.querySelector('.dw-dim.sel');if(!row)return {bothVisible:false};let parent=issue.parentElement;while(parent&&!(parent.scrollHeight>parent.clientHeight&&/(auto|scroll)/.test(getComputedStyle(parent).overflowY)))parent=parent.parentElement;if(parent){const a=issue.getBoundingClientRect(),b=row.getBoundingClientRect(),p=parent.getBoundingClientRect();parent.scrollTop+=(Math.min(a.top,b.top)+Math.max(a.bottom,b.bottom))/2-(p.top+p.bottom)/2;}const a=issue.getBoundingClientRect(),b=row.getBoundingClientRect(),p=parent?.getBoundingClientRect()??{top:0,bottom:innerHeight};return {bothVisible:Math.min(a.top,b.top)>=Math.max(0,p.top)&&Math.max(a.bottom,b.bottom)<=Math.min(innerHeight,p.bottom)};});
 f.report.observations.push({evidence:label,issueAndSelectedRowVisible:visibility.bothVisible});
 await f.snapshot(label);return result;
}
async function profile(doc,multi,label){
 await f.newPage();await f.openFile({name:`synthetic-${label}.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},doc.nodes.length);await f.same(doc);
 const accepted=await f.doc(),before=await history();await f.page.getByRole('button',{name:'Drawing',exact:true}).click();
 const first=await observe(accepted,multi?'lostA':'retained-lost-dimension',`${label}-01-first-sheet`,before);
 if(multi){await f.page.getByRole('tab',{name:'Sheet 2',exact:true}).click();const second=await observe(accepted,'lostB',`${label}-02-second-sheet`,before);assert.deepEqual(second,first);}
 const saved=await f.save(`synthetic-${label}`);assert.deepEqual(saved.doc,accepted);await f.freshOpen(saved.file,saved.doc,`${label}-03-fresh-open`);
 const reopenedHistory=await history();await f.page.getByRole('button',{name:'Drawing',exact:true}).click();const reopened=await observe(saved.doc,multi?'lostA':'retained-lost-dimension',`${label}-04-reopened`,reopenedHistory);assert.deepEqual(reopened,first);
 f.report.observations.push({profile:label,localPublicRunToolOnly:true,defaultFalseByteEqual:true,optInOnlyAddsTargets:true,facadeEqualsDirect:true,malformedRefusals:3,privateNoteOmitted:true,activeSheetDoesNotFilterPublicResponse:multi,uiIssueSelectsExactRetainedDimension:true,queryAndSelectionDocumentDirtyHistoryUnchanged:true,nativeSaveFreshOpenPreservesReferences:true,externalMcp:'NOT_RUN'});
}
await f.run(async()=>{f.phase='prepare synthetic profiles';const prepared=await f.inspect('prepare',{});await profile(prepared.single,false,'single');await profile(prepared.multi,true,'multi');assert.equal(f.report.downloads.length,2);});
