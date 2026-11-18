// #202 observational pre-change baseline: public issue summaries omit engine target fields.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const id = 'retained-lost-dimension';
const pins = ['apps/cad-studio/test/drawing-issue-targets-baseline-browser.mjs', 'packages/barocss-cad-model/src/chat/drawing.ts', 'packages/barocss-cad-model/src/chat/tools.ts', 'packages/barocss-cad-model/src/chat/groups.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts', 'packages/barocss-cad-model/src/drawing/issues.ts', 'packages/barocss-cad-model/src/drawing/types.ts', 'apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'apps/cad-studio/src/ui/drawing/IssuesList.tsx', 'apps/cad-studio/src/ui/drawing/DimensionsList.tsx'];
const f = await createFlow({ name: 'drawing-issue-targets-baseline', output: process.argv[2], envFrozen: 'DRAWING_ISSUE_TARGETS_BASELINE_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Actual native Open and drawing issue selection, compared with public runTool drawing action issues and direct drawing_issues on a copy of the Studio-accepted document. Pre-change missing structured target fields are expected.',
 limits: ['One synthetic base-part sheet and one deliberately retained lost manual linear dimension only.', 'Public runTool is invoked in the local inspector runtime, not through chat UI or external MCP transport.', 'Engine projection and issue generation provide the contract comparison, not an independent geometric oracle.', 'History checks cover visible rows and Undo/Redo availability; selection is session state. No issue fixing, multi-sheet, delayed callback or unsupported scope qualification.', 'Native Save and fresh Open are checked separately from read-only query invariants.'],
 inspectorSource: `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {readDrawing} from '@barocss/cad-model/drawing/types';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {drawingIssues,issueContext} from '@barocss/cad-model/drawing/issues';
import {runTool,dispatchTool} from '@barocss/cad-model/chat/tools';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
const id='retained-lost-dimension';
if(!input.nodes){
 const dim={id,kind:'linear',view:'front',orient:'horizontal',a:{edge:'missing-feature.a',at:'end',near:[0,0,0]},b:{edge:'missing-feature.b',at:'end',near:[40,0,0]},place:[20,-12]};
 const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front'],dimensions:[dim]});
 assert.deepEqual(drawing.dimensions,[dim]);
 console.log(JSON.stringify({doc:{...rectanglePart(40,30,5),drawing}}));
}else{
 const doc=input,before=structuredClone(doc),inputs=drawingInputs(doc);
 assert.notEqual(typeof inputs,'string',String(inputs));
 const core=drawingIssues(issueContext(inputs));
 const target=core.find(x=>x.code==='DIMENSION_LOST'&&x.dims?.includes(id));assert.ok(target);
 assert.deepEqual(target.dims,[id]);assert.equal(target.view,'front');
 const result=await runTool({doc,bodies:[]},'drawing',{action:'issues'},async d=>evaluateDoc(d,1));
 assert.equal(result.isError,false,result.content);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,before);assert.deepEqual(doc,before);
 const direct=await dispatchTool({doc,bodies:[]},'drawing_issues',{},async d=>evaluateDoc(d,1));
 assert.equal(direct.isError,false);assert.equal(direct.changed,false);assert.equal(direct.content,result.content);assert.deepEqual(direct.state.doc,before);
 const state={doc,bodies:[]};const refused=await runTool(state,'drawing',{action:'issues',include_targets:true},async d=>evaluateDoc(d,1));
 assert.equal(refused.isError,true);assert.equal(refused.changed,false);assert.match(refused.content,/UNKNOWN_ARGUMENT/);assert.deepEqual(refused.state.doc,before);assert.deepEqual(doc,before);
 const data=JSON.parse(result.content),lost=data.issues.filter(x=>x.code==='DIMENSION_LOST');assert.equal(lost.length,1);
 assert.equal(lost[0].message,target.message);assert.equal(lost[0].severity,target.severity);assert.equal(lost[0].fix,target.fix.kind);
 for(const key of ['dims','view','dimension_ids','target'])assert.equal(Object.hasOwn(lost[0],key),false,'baseline should omit '+key);
 console.log(JSON.stringify({engine:{code:target.code,dims:target.dims,view:target.view},publicIssue:lost[0],publicKeys:Object.keys(lost[0]).sort(),documentUnchanged:true,changed:result.changed,facadeEqualsDirect:true,optInRefusal:'UNKNOWN_ARGUMENT'}));
}` });
const history = async () => ({ dirty: await f.page.locator('[aria-label="Unsaved changes"]').count(), undo: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), redo: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), rows: await f.page.locator('.history .hs').evaluateAll(rows => rows.map(r => r.textContent)) });
async function observe(doc, label) {
 const before = await history();
 await f.page.getByRole('button', { name: 'Drawing', exact: true }).click();
 await f.page.waitForFunction(id => window.__studioDrawing?.()?.dimensions?.some(d => d.id === id && 'lost' in d), id);
 const issue = f.page.locator('[aria-label="Drawing issues"] .dw-issue[title="DIMENSION_LOST"]');
 assert.equal(await issue.count(), 1); await issue.scrollIntoViewIfNeeded();
 const row = f.page.locator('.dw-dim').filter({ has: f.page.getByRole('button', { name: `Remove dimension ${id}`, exact: true }) });
 assert.equal(await row.count(), 1);assert.match(await row.getAttribute('class'), /lost/);
 await issue.focus(); await issue.press('Enter'); // Select the issue itself, never its nested Remove action.
 await f.page.waitForFunction(id => [...document.querySelectorAll('.dw-dim.sel')].some(r => r.querySelector('button[aria-label="Remove dimension '+id+'"]')), id);
 assert.equal(await row.locator('.dw-annotation-select').getAttribute('aria-pressed'), 'true');
 const result = await f.inspect(label, await f.doc());
 assert.deepEqual(result.engine.dims, [id]);assert.equal(result.engine.view, 'front');assert.equal(result.documentUnchanged, true);
 await f.same(doc); assert.deepEqual(await history(), before);
 await issue.scrollIntoViewIfNeeded(); await f.snapshot(label);
 return result;
}
await f.run(async () => {
 f.phase = 'prepare synthetic retained-reference document'; const prepared = await f.inspect('prepare', {});
 await f.newPage();await f.openFile({name:'synthetic-drawing-issue-targets.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prepared.doc))},prepared.doc.nodes.length);await f.same(prepared.doc);
 const accepted=await f.doc();f.phase='actual lost issue and local public query';const first=await observe(accepted,'01-issue-target-omitted');
 const saved=await f.save('synthetic-drawing-issue-targets');assert.deepEqual(saved.doc,accepted);
 await f.freshOpen(saved.file,saved.doc,'02-native-fresh-open');f.phase='reopened issue and query';const reopened=await observe(saved.doc,'03-reopened-issue-target-omitted');assert.deepEqual(reopened,first);
 assert.equal(f.report.downloads.length,1);
 f.report.observations.push({localPublicRunToolOnly:true,engineTargets:first.engine,publicIssueKeys:first.publicKeys,uiIssueSelectsRetainedDimension:true,queryAndSelectionDocumentDirtyHistoryUnchanged:true,nativeSaveFreshOpenPreservesReference:true,externalMcp:'NOT_RUN'});
});
