import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/engine/evaluate.ts','apps/cad-studio/src/files/stepExportPreparation.ts','apps/cad-studio/src/files/StepExportPanel.tsx','apps/cad-studio/test/fixtures/d1339-open-subd.bcad','apps/cad-studio/test/fixtures/d1339-closed-subd.bcad'];
const f=await createFlow({name:'empty-step',output:process.argv[2],envFrozen:'D1339_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Failed legacy mixed Scale cannot download STEP; repaired two-body model exports both native solids.',limits:['Actual empty evaluated native output admission is tested by controlled Model helper fixtures, not injected browser state. External STEP reader and manufacturing acceptance NOT_RUN.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const tool=async name=>{if(await button(name).count())await button(name).click();else{await button('More tools').click();await f.page.getByRole('menuitem',{name,exact:true}).click();}};
await f.run(async()=>{
 const base=JSON.parse(await readFile(resolve(f.app,'test/fixtures/bracket.bcad'),'utf8'));base.nodes[0].min=[10,20];base.nodes[0].max=[22,28];base.nodes[1].from=30;
 const bad={...base,nodes:[...base.nodes,{id:'n2',kind:'scale',parent:{node:1,side:'solid'},factor:5e-9,pivot:[4,-6,10]},{id:'n3',kind:'sketch',profile:'rectangle',min:[50,0],max:[60,10]},{id:'n4',kind:'extrude',sketch:3,height:10}],outputs:{b2:{node:2,side:'solid'},b4:{node:4,side:'solid'}},nextId:5};
 const file=join(process.argv[2],'legacy-mixed.bcad');await writeFile(file,JSON.stringify(bad));
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});await f.page.setInputFiles('input[aria-label="Model file"]',file);await f.page.getByText('Scale would lose usable geometry',{exact:true}).waitFor();assert.deepEqual(await f.doc(),bad);
  const downloads=[];const listen=d=>downloads.push(d);f.page.on('download',listen);await tool('Export STEP');await f.page.getByText('Wait for the current design and its placed parts to finish evaluating.',{exact:true}).waitFor();await f.page.waitForTimeout(300);assert.equal(downloads.length,0);f.page.off('download',listen);await f.snapshot(`${width}-mixed-refused`);
  await f.page.locator('.history .hs[data-node-index="2"]').click();await f.editor().waitFor();await f.editor().getByLabel('Factor',{exact:true}).fill('0.005');await f.applyEditor(bad,`${width}-repaired`);const good=await f.doc();
  await tool('Export STEP');const panel=f.page.getByRole('region',{name:'STEP export',exact:true});await panel.getByLabel('STEP included bodies').waitFor();assert.match(await panel.getByLabel('STEP included bodies').innerText(),/2 output bodies: 2 root bodies/);await f.snapshot(`${width}-two-included`);
  const pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.step')});await button('Export',panel).click();const text=await readFile(await(await pending).path(),'utf8');assert.equal((text.match(/=MANIFOLD_SOLID_BREP\(/g)||[]).length,2);assert.equal((text.match(/=ADVANCED_FACE\(/g)||[]).length,12);await f.same(good);
  if(await panel.isVisible())await button('Close STEP export',panel).click();
  const opened=JSON.parse(await readFile(resolve(f.app,'test/fixtures/d1339-open-subd.bcad'),'utf8')),closed=JSON.parse(await readFile(resolve(f.app,'test/fixtures/d1339-closed-subd.bcad'),'utf8'));
  const other=structuredClone(closed.nodes[0]);other.id='n1';other.cage.positions=other.cage.positions.map((x,i)=>i%3===0?x+45:x);
  const mixed={...opened,nodes:[opened.nodes[0],other],outputs:{b0:{node:0,side:'solid'},b1:{node:1,side:'solid'}},nextId:2,bodies:{b0:{name:'Open SubD'},b1:{name:'Closed SubD'}}};
  const mixedFile=join(process.argv[2],`${width}-open-mixed.bcad`);await writeFile(mixedFile,JSON.stringify(mixed));await f.openFile(mixedFile,2);await f.same(mixed);
  const beforeDownloads=f.report.downloads.length;await tool('Export STEP');await panel.getByRole('alert').waitFor();assert.match(await panel.getByRole('alert').innerText(),/Open SubD/);assert.equal(await button('Export',panel).isEnabled(),false);assert.equal(f.report.downloads.length,beforeDownloads);await f.snapshot(`${width}-open-subd-mixed-refused`);await f.same(mixed);await button('Close STEP export',panel).click();
  const restored={...mixed,nodes:[closed.nodes[0],other]};const restoredFile=join(process.argv[2],`${width}-closed-mixed.bcad`);await writeFile(restoredFile,JSON.stringify(restored));await f.openFile(restoredFile,2);await f.same(restored);await tool('Export STEP');await panel.getByLabel('STEP included bodies').waitFor();
  const fixedDownload=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.step')});await button('Export',panel).click();const fixed=await readFile(await(await fixedDownload).path(),'utf8');assert.equal((fixed.match(/=MANIFOLD_SOLID_BREP\(/g)||[]).length,2);await f.same(restored);await f.snapshot(`${width}-closed-subd-restored`);
  f.report.observations??=[];f.report.observations.push({width,failedDownloads:0,includedRoots:2,downloadSolids:2,downloadFaces:12,documentUnchangedByExport:true,openSubdMixedRefused:true,restoredSubdSolids:2});
 }
});
