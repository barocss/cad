import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const {input:{document:plate}}=JSON.parse(await readFile(new URL('../../../packages/barocss-cad/conformance/r14/starter-plate/case.json',import.meta.url),'utf8'));
const fixture=JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad',import.meta.url),'utf8'));
const drawing={sheet:'A3',projection:'third',scale:1,hidden:false,dimensions:[],revision:'D'};
const part={...plate,drawing};
const base={...fixture,instances:[{id:'first',name:'Mount plate left',doc:part,part:{id:'mount',rev:'D'},position:[0,0,0],rotation:[0,0,0]},{id:'second',name:'Mount plate right',doc:part,part:{id:'mount',rev:'D'},position:[80,0,0],rotation:[0,0,90]},{id:'independent',name:'Spare plate',doc:part,part:{id:'spare',rev:'D'},position:[0,60,0],rotation:[0,0,0]}]};delete base.assemblySteps;
const incoming=structuredClone(part);incoming.drawing.revision='E';incoming.nodes.find(n=>n.kind==='extrude').height=12;
const f=await createFlow({name:'assembly-revision-owner',envFrozen:'ASSEMBLY_REVISION_OWNER_FROZEN',output:process.argv[2],qualification:'Late real revision-file reads cannot replace newer assembly edits, another document, another selected owner, or a newer file offer.',initialFiles:['apps/cad-studio/test/assembly-revision-owner-browser.mjs','apps/cad-studio/src/ui/InstanceInspector.tsx'],limits:['Real File.arrayBuffer resolution is delayed; bytes and product parsing are not fabricated. Three synthetic drilled plates, no external project watcher or nested/mated assembly.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
async function select(id='first'){await f.page.locator(`[data-browser-instance-path="${id}"]`).click();await f.page.getByRole('complementary',{name:'Instance',exact:true}).waitFor();}
function delayFile(){
 const original=File.prototype.arrayBuffer;let serial=0;const pending=new Map();
 window.__revisionFiles={held:[],released:[],release(name){const entry=pending.get(name);if(!entry)throw new Error('missing delayed file '+name);pending.delete(name);entry();}};
 File.prototype.arrayBuffer=async function(){const data=await original.call(this);if(!this.name.startsWith('held-'))return data;const name=this.name,id=++serial;window.__revisionFiles.held.push({name,id});await new Promise(resolve=>pending.set(name,resolve));window.__revisionFiles.released.push({name,id});return data;};
}
async function upload(file,name){await f.page.getByLabel('New revision file',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof file==='string'?file:JSON.stringify(file))});if(name.startsWith('held-'))await f.page.waitForFunction(name=>window.__revisionFiles.held.some(x=>x.name===name),name);}
async function release(name){await f.page.evaluate(name=>window.__revisionFiles.release(name),name);await f.page.waitForFunction(name=>window.__revisionFiles.released.some(x=>x.name===name),name);await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await f.ready();}
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'mounting-plates.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(expected=>window.__studioDoc?.instances?.[0]?.name===expected,doc.instances[0].name);await f.ready();}
await f.run(async()=>{
 await f.newPage();await f.page.addInitScript(delayFile);await f.page.reload();await f.ready();await open(base);await select();const before=await f.doc();
 await upload(incoming,'held-move.bcad');const x=f.page.getByRole('complementary',{name:'Instance',exact:true}).getByLabel('Instance X',{exact:true}).first();await x.fill('17');await x.press('Enter');await f.changed(before);const moved=await f.doc();assert.equal(moved.instances[0].position[0],17);await release('held-move.bcad');await f.snapshot('01-after-late-move');const after=await f.doc();f.report.observations.push({newX:17,afterLateReadX:after.instances[0].position[0],pending:!!after.pendingParts});assert.deepEqual(after,moved,'late file must not overwrite accepted placement');
 // A later invalid file selection supersedes the previous request too: failure must not resurrect old geometry offers.
 await upload(incoming,'held-superseded.bcad');await upload('{invalid','newest-invalid.bcad');await f.page.getByText('Could not read that part',{exact:true}).waitFor();await release('held-superseded.bcad');await f.snapshot('superseded-file');assert.deepEqual(await f.doc(),moved,'failed newer file must not revive an older pending offer');await button('Dismiss').click();
 // Selection away and back invalidates an earlier request even when the document did not change.
 await upload(incoming,'held-selection.bcad');await select('independent');await select();await release('held-selection.bcad');assert.deepEqual(await f.doc(),moved);
 // A newer offer wins over an earlier slow read on the same owner.
 await upload(incoming,'held-first.bcad');const newer=structuredClone(incoming);newer.drawing.revision='F';newer.nodes.find(n=>n.kind==='extrude').height=14;await upload(newer,'newer-f.bcad');await f.page.getByRole('button',{name:'Accept Rev F',exact:true}).waitFor();const offered=await f.doc();await release('held-first.bcad');assert.deepEqual(await f.doc(),offered);await button('Keep Rev D').click();await f.page.waitForFunction(()=>!window.__studioDoc.pendingParts);
 // A valid late file cannot restore an old document with the same instance IDs.
 await upload(incoming,'held-open.bcad');const opened=structuredClone(base);opened.instances[0].name='New document plate';opened.instances[0].position=[21,0,0];await open(opened);await select();const openedDoc=await f.doc();await release('held-open.bcad');assert.deepEqual(await f.doc(),openedDoc);
 // Even an invalid delayed file cannot put its error into a replacement document.
 await upload('{invalid','held-invalid.bcad');const other=structuredClone(base);other.instances[0].name='Replacement document plate';other.instances[0].position=[25,0,0];await open(other);await select();const replacement=await f.doc();await release('held-invalid.bcad');assert.deepEqual(await f.doc(),replacement);assert.equal(await f.page.getByText('Could not read that part',{exact:true}).count(),0);
 // A current successful read still offers/accepts once, followed by one-step Undo and Redo.
 await upload(incoming,'current-e.bcad');await button('Accept Rev E').waitFor();const pending=await f.doc();await button('Accept Rev E').click();await f.changed(pending);const accepted=await f.doc();assert.deepEqual(accepted.instances.map(i=>i.part.rev),['E','E','D']);assert.equal(accepted.instances[0].position[0],25);await f.undo();await f.same(pending);await f.redo();await f.same(accepted);
 const saved=await f.save('revision-owner-safe');await f.freshOpen(saved.file,saved.doc,'02-native-open');await select();await f.snapshot('03-reopened');f.report.observations.push({selectionRoundtrip:true,staleValidOpenIgnored:true,newestOfferWins:'F',staleInvalidSilent:true,currentOfferAccept:true,undoRedoNativeOpen:true});
});
