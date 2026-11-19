import assert from 'node:assert/strict';
import {statfs} from 'node:fs/promises';
import {resolve,isAbsolute,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
assert.ok(process.env.CAD_REPO && isAbsolute(process.env.CAD_REPO), 'absolute CAD_REPO required');
const {createFlow}=await import(pathToFileURL(resolve(process.env.CAD_REPO,'apps/cad-studio/test/flow-helper.mjs')).href);
import {randomUUID} from 'node:crypto';
const repo=process.env.CAD_REPO,output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'),'external absolute artifact directory required');
const expected='e4359b68450ca1a93775c629641295974c393acf';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),expected);
const pins=['apps/cad-studio/src/storage/useProject.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/app/pinnedMass.ts','apps/cad-studio/src/state/usePinnedMass.ts','apps/cad-studio/src/ui/PinnedMassControls.tsx','apps/cad-studio/test/pinned-mass-member-recovery-browser.mjs'];
const f=await createFlow({name:'pinned-com-project-close',output,envFrozen:'PINNED_MASS_RECOVERY_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'#231 synthetic public project Close clears pinned COM without changing accepted document, selection, dirty or editing history.',
 limits:['Only synthetic two-cube project Close/reopen and explicit repin; no Save/download/user files.','No delayed mass, Worker restart, pan/zoom, export, project document Open or overall issue closure claim.'],
 snapshotExtra:()=>({massPanel:document.querySelector('[aria-label="Pinned centre of mass"]')?.textContent,marker:document.querySelector('[aria-label="Pinned centre of mass marker"]')?.getAttribute('data-position'),dirty:!!document.querySelector('[aria-label="Unsaved changes"]')})});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,10]},{kind:'extrude',id:'n1',sketch:0,height:10},{kind:'sketch',id:'n2',profile:'rectangle',min:[30,0],max:[40,10]},{kind:'extrude',id:'n3',sketch:2,height:10}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4,bodies:{b1:{name:'Cube A',material:'al6061'},b3:{name:'Cube B',material:'steel'}}};
// Ordinary feature Undo restores geometry, not the file-level dirty checkpoint (App restoreHistoryEntry).
const suppressed=structuredClone(doc);suppressed.nodes[3].suppressed=true;
const other=structuredClone(doc);other.nodes[2].min=[60,0];other.nodes[2].max=[70,10];
// Independent closed-form arithmetic: 1000 mm3 = 1 cm3; g/cm3 densities.
const analytic={volumes:[1000,1000],densities:[2.7,7.85],masses:[2.7,7.85],mass:10.55,centroid:[(2.7*5+7.85*35)/10.55,5,5]};
assert.ok(Math.abs(analytic.centroid[0]-5765/211)<1e-12);
const button=name=>f.page.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Pinned centre of mass',exact:true});
const marker=()=>f.page.locator('[aria-label="Pinned centre of mass marker"]');
async function reserve(label){const s=await statfs(output),available=s.bavail*s.bsize;f.report.observations.push({label,availableBytes:available});await f.persist();assert.ok(available>=2*1024**3,'2 GiB reserve reached');}
async function invariant(){return f.page.evaluate(()=>({doc:JSON.parse(JSON.stringify(window.__studioDoc)),selection:JSON.parse(JSON.stringify(window.__studioSelection)),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(e=>e.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return {disabled:b?.disabled,tip:b?.getAttribute('data-tip')};})}));}
async function accepted(expected,dirty){await f.same(expected);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),dirty?1:0);}
async function open(source){await f.openFile({name:'two-cube-com.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))},4);await accepted(source,false);}
async function selectBoth(){await f.page.keyboard.press('Escape');await f.page.locator('[data-browser-body-key="b1"]').click();await f.page.locator('[data-browser-body-key="b3"]').click({modifiers:['Shift']});await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===2);}
async function com(){await f.page.waitForFunction(x=>{const p=document.querySelector('[aria-label="Pinned centre of mass marker"]')?.getAttribute('data-position')?.split(',').map(Number);return p?.length===3&&p.every((v,i)=>Math.abs(v-x[i])<1e-9);},analytic.centroid);assert.ok(Math.abs(Number.parseFloat(await panel().locator('.kv b').first().innerText())-analytic.mass)<1e-9);assert.equal(await panel().getByRole('status').count(),0);}
async function pin(){await selectBoth();const before=await invariant();await button('Pin selected bodies’ COM').click();await com();assert.deepEqual(await invariant(),before,'Pin does not edit document/history/dirty');}
async function unavailable(){await panel().getByRole('status').filter({hasText:'COM unavailable: Pinned body b3 is missing or ambiguous.'}).waitFor();assert.equal(await panel().getByRole('status').innerText(),'COM unavailable: Pinned body b3 is missing or ambiguous.');assert.equal(await marker().count(),0);assert.equal(await panel().locator('.kv').count(),0,'No partial single-member mass or coordinates');assert.equal(await button('Clear COM marker').count(),1);const b=await f.bodies();assert.equal(b.fresh,true);assert.equal(b.bodies.some(x=>x.key==='b3'),false);assert.equal(b.bodies.filter(x=>x.key==='b1').length,1);}
async function cleared(){assert.equal(await marker().count(),0);assert.equal(await button('Clear COM marker').count(),0);assert.equal(await panel().locator('.kv').count(),0);assert.equal(await panel().getByRole('status').count(),0);}

const versions=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});
const projectName='COM close synthetic '+randomUUID();
async function openProject(){
 if(!(await versions().isVisible()))await button('Project and versions').click();
 await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(projectName);
 await versions().getByRole('button',{name:'Project in this browser',exact:true}).click();
 await versions().getByLabel('Project',{exact:true}).waitFor();
}
await f.run(async()=>{
 await reserve('before-browser');await f.newPage();f.phase='Open synthetic fixture and project';await open(doc);await openProject();await f.same(doc);
 await pin();const before=await invariant();const native=await f.bodies();assert.equal(native.fresh,true);assert.equal(native.bodies.length,2);for(const key of ['b1','b3'])assert.ok(Math.abs(native.bodies.find(b=>b.key===key).volume-1000)<1e-8);
 await f.snapshot('01-project-pinned');
 f.phase='Close project';await versions().getByRole('button',{name:'Close project',exact:true}).click();
 await versions().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});await versions().getByRole('textbox',{name:'Browser project name',exact:true}).waitFor();
 await button('Clear COM marker').waitFor({state:'detached'});await cleared();assert.deepEqual(await invariant(),before);await f.snapshot('02-closed-cleared');
 f.phase='Reopen empty project';await openProject();await cleared();assert.deepEqual(await invariant(),before);await f.snapshot('03-no-resurrection');
 f.phase='Explicit repin';await button('Pin selected bodies’ COM').click();await com();assert.deepEqual(await invariant(),before);await f.snapshot('04-repin');
 f.report.observations.push({analytic,native,projectName,noSave:true,noDocumentReplacementAfterClose:true});assert.deepEqual(f.report.downloads,[]);await reserve('finished');
});
