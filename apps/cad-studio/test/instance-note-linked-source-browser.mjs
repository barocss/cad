import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const old = { value: 'Synthetic linked intent A', basis: 'assumed', source: 'Test fixture only', why: 'Not a real approval' };
const part = () => ({ format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
  outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes: old, purpose: { value: 'Preserved purpose', basis: 'stated', source: 'fixture' } } });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Synthetic box', doc: part(), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'sharedA' : 'independentB', rev: 'A', ...(i < 2 ? {source:'./source.bcad'} : {}) } })) };
const sourceA = part();
const sourceB = {...sourceA,brief:{...sourceA.brief,notes:{value:'Synthetic linked intent B',basis:'stated',source:'Synthetic source file B'}}};
const project='Notes linked-source acceptance', sourcePath='source.bcad', assemblyPath='assembly.bcad';
const f=await createFlow({name:'instance-note-linked-source',output:process.argv[2],envFrozen:'NOTE_LINKED_SOURCE_FROZEN',
 initialFiles:['apps/cad-studio/test/instance-note-linked-source-browser.mjs','apps/cad-studio/src/storage/linked.ts','apps/cad-studio/src/storage/useProject.ts'],
 qualification:'Public OPFS Check placed parts, Keep/recheck/Accept note-only linked revision with BOM mapping and intact baseline',
 limits:['OPFS source file writes are synthetic fixture setup, not a source-note authoring UI claim.','No native folder picker, user approval, manufacturing certification, geometry or mass accuracy claim.'],
  inspectorSource: `import {readFileSync} from 'node:fs';
import {bomView,deriveBom} from '@barocss/cad-model/team/assembly';
import {draftBaseline,moveBaseline,verifyBaseline} from '@barocss/cad-model/team/baseline';
import {userToken} from '@barocss/cad-model/team/ecr';
import {evaluatePart} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),mode=JSON.parse(process.argv[3]);
if(mode==='fixture'){
 const view=await bomView(doc,async d=>evaluatePart(d,1));
 const draft=draftBaseline(doc,deriveBom(view),view);
 const review=await moveBaseline(draft.doc,draft.baseline.id,'review',userToken('2026-11-17T00:00:00Z'));
 const approved=await moveBaseline(review.doc,draft.baseline.id,'approved',userToken('2026-11-17T00:00:01Z'));
 console.log(JSON.stringify({doc:approved.doc,verification:verifyBaseline(approved.doc,draft.baseline.id)}));
}else console.log(JSON.stringify(verifyBaseline(doc,'BL1')));
`,
 oracleSource:String.raw`import json,csv,io,sys
x=json.load(sys.stdin);rows=list(csv.reader(io.StringIO(x['csv']),strict=True));assert len(rows)==2 and rows[1][2]=='3'
groups=json.loads(rows[1][4]);mapping={p:g['field'] for g in groups for p in g['parts']};assert sorted(mapping)==['p1','p2','p3']
assert mapping['p1']==mapping['p2']==x['expectedShared'];assert mapping['p3']==x['expectedIndependent']
assert x['doc']['baselines']==x['base']['baselines'];assert x['doc']['instances'][2]==x['base']['instances'][2]
for i in [0,1]:
 before=x['base']['instances'][i];after=x['doc']['instances'][i]
 for key in ['position','rotation','id','name']:assert before[key]==after[key]
 a=dict(before['doc']);b=dict(after['doc']);a['brief']=dict(a['brief']);b['brief']=dict(b['brief']);a['brief'].pop('notes');b['brief'].pop('notes');assert a==b
 assert after['part']['source']=='./source.bcad'
print(json.dumps({'status':'PASS','qty':3,'mappedIDs':sorted(mapping),'sharedValue':mapping['p1']['value'],'baselineExact':True,'geometryAndPlacementsExact':True}))
`});
const button=n=>f.page.getByRole('button',{name:n,exact:true});
const versions=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});
const instance=()=>f.page.getByRole('complementary',{name:'Instance',exact:true});
const waiting=()=>instance().getByRole('status',{name:'Revision waiting',exact:true});
const noteStatus=()=>f.page.getByRole('region',{name:'Saved approval record status'}).getByRole('status');
async function showVersions(){if(!await versions().isVisible())await button('Project and versions').click();await versions().waitFor();}
async function choose(id){const row=f.page.locator(`[data-browser-instance-path="${id}"]`);if(!(await row.getAttribute('class')).split(' ').includes('sel'))await row.click();await instance().waitFor();}
async function writeSetup(files){
 return f.page.evaluate(async({project,files})=>{const root=await navigator.storage.getDirectory();const projects=await root.getDirectoryHandle('projects',{create:true});const dir=await projects.getDirectoryHandle(project,{create:true});const result={};for(const [path,text]of Object.entries(files)){const file=await dir.getFileHandle(path,{create:true});const writable=await file.createWritable();await writable.write(text);await writable.close();result[path]=await(await file.getFile()).text();}return result;},{project,files});
}
async function verify(doc,current,label){
 assert.deepEqual(await f.inspect(label,doc,'verify'),{intact:true,mismatches:[],current,changed:current?[]:['part p1','part p2']});
 await choose('p1');const text=current?'BL1: Record intact; pinned part inputs and interfaces match.':'BL1: Record intact; pinned part inputs or interfaces changed. Explicit review is needed. part p1; part p2.';
 await noteStatus().filter({hasText:text}).waitFor();assert.equal(await noteStatus().innerText(),text);
 const notes=instance().getByRole('region',{name:'Definition design-brief notes',exact:true});
 await notes.getByText('Linked parts, patterns and pending revisions are not editable here.',{exact:true}).waitFor();
 assert.equal(await notes.getByRole('button',{name:'Edit notes',exact:true}).count(),0);await f.same(doc);
}
let defaultCsv;
async function bomRead(doc,base,expectedShared,label){
 await clickModelCommand(f.page,'Inspect','BOM');const panel=f.page.getByRole('complementary',{name:'BOM panel'});await panel.getByRole('row',{name:'BOM line 1',exact:true}).waitFor();
 await panel.getByLabel('Purchase list with made parts').check();await panel.getByRole('button',{name:'Export purchase list',exact:true}).click();
 let captures=await f.page.evaluate(()=>Promise.all(window.__linkedNoteCsv));const purchase=captures.at(-1);if(defaultCsv===undefined)defaultCsv=purchase;else assert.equal(purchase,defaultCsv);
 await panel.getByLabel('Include design-brief notes').check();await panel.getByRole('button',{name:'Export design-brief notes',exact:true}).click();captures=await f.page.evaluate(()=>Promise.all(window.__linkedNoteCsv));
 await f.runOracle({csv:captures.at(-1),doc,base,expectedShared,expectedIndependent:old},label);await f.snapshot(label);await panel.getByLabel('Close BOM').click();await f.same(doc);
}
await f.run(async()=>{
 const create=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const c=await create({...options,acceptDownloads:true});await c.addInitScript(()=>{const urls=new Map(),make=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;window.__linkedNoteCsv=[];URL.createObjectURL=function(b){const u=make.call(this,b);urls.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){const b=urls.get(this.href);if(!b||! /\.csv$/.test(this.download))return click.call(this);window.__linkedNoteCsv.push(b.text());};});return c;};
 await f.newPage();await f.openFile({name:'synthetic-linked-seed.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);await f.same(seed);
 const generated=await f.inspect('synthetic-approved-linked-fixture',await f.doc(),'fixture');assert.deepEqual(generated.verification,{intact:true,mismatches:[],current:true,changed:[]});const base=generated.doc;
 const initialFiles={[sourcePath]:JSON.stringify(sourceA),[assemblyPath]:JSON.stringify(base)};assert.deepEqual(await writeSetup(initialFiles),initialFiles);
 await showVersions();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await versions().getByRole('button',{name:'Project in this browser',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor();
 await versions().getByRole('button',{name:'Open '+assemblyPath,exact:true}).click();await f.same(base);await verify(base,true,'initial-current');await bomRead(base,base,old,'01-initial-A');
 assert.deepEqual(await writeSetup({[sourcePath]:JSON.stringify(sourceB)}),{[sourcePath]:JSON.stringify(sourceB)});
 await showVersions();await versions().getByRole('button',{name:'Check placed parts',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDoc?.pendingParts?.sharedA?.rev==='B');await f.ready();const pending=await f.doc();assert.deepEqual(pending.instances,base.instances);assert.deepEqual(pending.pendingParts.sharedA.doc,sourceB);await verify(pending,true,'pending-current');await waiting().waitFor();await f.snapshot('02-B-waiting-A-retained');await bomRead(pending,base,old,'03-pending-BOM-A');
 await choose('p1');await waiting().getByRole('button',{name:'Keep Rev A',exact:true}).click();await f.same(base);await verify(base,true,'kept-current');await f.snapshot('04-keep-A');
 await showVersions();await versions().getByRole('button',{name:'Check placed parts',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDoc?.pendingParts?.sharedA?.rev==='B');await f.ready();const pendingAgain=await f.doc();assert.deepEqual(pendingAgain,pending);await choose('p1');await waiting().getByRole('button',{name:'Accept Rev B',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDoc?.instances?.slice(0,2).every(i=>i.part.rev==='B'));await f.ready();const accepted=await f.doc();
 assert.deepEqual(accepted.instances[0].doc,sourceB);assert.deepEqual(accepted.instances[1].doc,sourceB);assert.deepEqual(accepted.instances[2],base.instances[2]);assert.deepEqual(accepted.baselines,base.baselines);await verify(accepted,false,'accepted-changed');await f.snapshot('05-accepted-B');await bomRead(accepted,base,sourceB.brief.notes,'06-accepted-BOM-B');
 await f.undo();await f.same(pendingAgain);await verify(pendingAgain,true,'undo-accept');await f.redo();await f.same(accepted);await verify(accepted,false,'redo-accept');
 await showVersions();await button('Save').click();await f.page.waitForFunction(async({project,assemblyPath,text})=>{const root=await navigator.storage.getDirectory();const dir=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(project);return await(await(await dir.getFileHandle(assemblyPath)).getFile()).text()===text;},{project,assemblyPath,text:JSON.stringify(accepted,null,2)}, {timeout:30000});
 const stored=await f.page.evaluate(async({project,assemblyPath})=>{const root=await navigator.storage.getDirectory();const dir=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(project);return await(await(await dir.getFileHandle(assemblyPath)).getFile()).text();},{project,assemblyPath});assert.deepEqual(JSON.parse(stored),accepted);
 await versions().getByRole('button',{name:'Close project',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});const saved=await f.save('linked-notes-B');await f.freshOpen(saved.file,accepted,'07-fresh-open');await verify(accepted,false,'reopened-changed');await bomRead(accepted,base,sourceB.brief.notes,'08-reopened-BOM-B');
 f.report.observations.push({syntheticSourceWriteOnly:true,publicLinkedCheckKeepRecheckAccept:true,baselineExact:true,pendingUsesAcceptedA:true,acceptedUsesB:true,defaultCsvExact:true,projectSavedJSONExact:true,nativeDownloadFreshOpen:true});
});
