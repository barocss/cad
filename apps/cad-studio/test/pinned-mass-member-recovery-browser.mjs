import assert from 'node:assert/strict';
import {statfs} from 'node:fs/promises';
import {resolve,isAbsolute,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createFlow} from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'),'external absolute artifact directory required');
const expected=process.env.PINNED_MASS_RECOVERY_HEAD??'dd40abe23a824c9d5263983291218ff7234af95b';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),expected);
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/app/pinnedMass.ts','apps/cad-studio/src/state/usePinnedMass.ts','apps/cad-studio/src/ui/PinnedMassControls.tsx','apps/cad-studio/test/pinned-mass-member-recovery-browser.mjs'];
const f=await createFlow({name:'pinned-mass-member-recovery',output,envFrozen:'PINNED_MASS_RECOVERY_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'#231 synthetic native two-member session COM: missing member refusal, public History recovery, explicit Clear and same-filename Open reset.',
 limits:['No Worker patch or delayed delivery, saved-file provenance, independent native evaluator, dynamics or safety approval.','Only synthetic ordinary cubes; no export, project switching, manufacturing preview or assembly coverage. Same-filename Open is an existing regression, strengthened here with different geometry and unchanged body keys.'],
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
async function invariant(){return f.page.evaluate(()=>({doc:JSON.parse(JSON.stringify(window.__studioDoc)),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(e=>e.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return {disabled:b?.disabled,tip:b?.getAttribute('data-tip')};})}));}
async function accepted(expected,dirty){await f.same(expected);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),dirty?1:0);}
async function open(source){await f.openFile({name:'two-cube-com.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))},4);await accepted(source,false);}
async function selectBoth(){await f.page.keyboard.press('Escape');await f.page.locator('[data-browser-body-key="b1"]').click();await f.page.locator('[data-browser-body-key="b3"]').click({modifiers:['Shift']});await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===2);}
async function com(){await f.page.waitForFunction(x=>{const p=document.querySelector('[aria-label="Pinned centre of mass marker"]')?.getAttribute('data-position')?.split(',').map(Number);return p?.length===3&&p.every((v,i)=>Math.abs(v-x[i])<1e-9);},analytic.centroid);assert.ok(Math.abs(Number.parseFloat(await panel().locator('.kv b').first().innerText())-analytic.mass)<1e-9);assert.equal(await panel().getByRole('status').count(),0);}
async function pin(){await selectBoth();const before=await invariant();await button('Pin selected bodies’ COM').click();await com();assert.deepEqual(await invariant(),before,'Pin does not edit document/history/dirty');}
async function unavailable(){await panel().getByRole('status').filter({hasText:'COM unavailable: Pinned body b3 is missing or ambiguous.'}).waitFor();assert.equal(await panel().getByRole('status').innerText(),'COM unavailable: Pinned body b3 is missing or ambiguous.');assert.equal(await marker().count(),0);assert.equal(await panel().locator('.kv').count(),0,'No partial single-member mass or coordinates');assert.equal(await button('Clear COM marker').count(),1);const b=await f.bodies();assert.equal(b.fresh,true);assert.equal(b.bodies.some(x=>x.key==='b3'),false);assert.equal(b.bodies.filter(x=>x.key==='b1').length,1);}
async function cleared(){assert.equal(await marker().count(),0);assert.equal(await button('Clear COM marker').count(),0);assert.equal(await panel().locator('.kv').count(),0);assert.equal(await panel().getByRole('status').count(),0);}
await f.run(async()=>{
 f.phase='public Open and explicit two-member Pin';await reserve('before-browser');await f.newPage();await open(doc);const initial=await invariant();await pin();await f.snapshot('01-pinned-native-pair');
 const native=await f.bodies();assert.equal(native.bodies.length,2);for(const b of native.bodies)assert.ok(Math.abs(b.volume-1000)<1e-8);
 f.phase='public History n3 Suppress';await reserve('before-suppress');await f.page.locator('.history .hs[data-node-index="3"]').click({button:'right'});await f.page.getByRole('menuitem',{name:'Suppress',exact:true}).click();await accepted(suppressed,true);await unavailable();const suppressedState=await invariant();assert.equal(suppressedState.undo[0].disabled,false);await f.snapshot('02-member-suppressed-unavailable');
 f.phase='Undo restores both members and COM';await button('Undo').click();await accepted(doc,true);await com();assert.equal((await invariant()).undo[1].disabled,false);await f.snapshot('03-undo-restores-whole-com');
 f.phase='Redo removes member and refuses partial COM';await button('Redo').click();await accepted(suppressed,true);await unavailable();assert.deepEqual(await invariant(),suppressedState);await f.snapshot('04-redo-unavailable');
 f.phase='Clear unavailable pin without document change';const beforeClear=await invariant();await button('Clear COM marker').click();await cleared();assert.deepEqual(await invariant(),beforeClear,'Clear while unavailable does not edit document/history/dirty');
 f.phase='Undo after Clear must not resurrect pin';await button('Undo').click();await accepted(doc,true);await cleared();assert.deepEqual((await invariant()).history,initial.history);await f.snapshot('05-clear-survives-undo');
 f.phase='Explicit repin then same-filename different document Open';await pin();await com();await f.snapshot('06-explicit-repin');await reserve('before-same-name-open');await open(other);await cleared();assert.equal((await invariant()).undo[0].disabled,false,'Open preserves the prior document as a boundary Undo entry');await f.snapshot('07-same-filename-other-document-clears');
 f.report.observations.push({analytic,native,sourceFilename:'two-cube-com.bcad',replacementFilename:'two-cube-com.bcad',replacementDifference:'Cube B translated +30 mm in source sketch; unchanged IDs/materials',scope:'Actual public Pin/History Suppress/Undo/Redo/Clear/Open; no injected state or asynchronous delivery claim.'});await reserve('finished');
});
