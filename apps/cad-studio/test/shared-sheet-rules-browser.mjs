import assert from 'node:assert/strict';
import {clickModelCommand} from './model-rail-helper.mjs';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/shared-sheet-rules-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/state/sharedSheetRules.ts','apps/cad-studio/src/ui/FlatPatternDialog.tsx','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/app/sheetCommands.ts'];
const f=await createFlow({name:'shared-sheet-rules',output:process.argv[2],envFrozen:'SHARED_SHEET_RULES_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Actual U creation and existing shared-rule History baseline.':'Direct terminal U shared-rule navigation.',limits:['Direct terminal sheet-contour only; no manufacturing qualification, downstream owner inference, individual bend edit or exports.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateCadPart,flatPatternOf,checkBrep} from '@barocss/cad';
import {toPartDocument} from '@barocss/cad-model/engine/part';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({check:checkBrep(o.brep,{strict:true}),sheet:o.sheet,flat:flatPatternOf(o)}))));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function geometry(label,doc,r){const [o]=await f.inspect(label,doc);assert.ok(o.check.valid);assert.equal(o.sheet.bends.length,2);assert.equal(o.flat.bends.length,2);for(const b of o.flat.bends){near(b.radius,r);near(b.kFactor,.44);near(b.angle,90);}near(o.flat.area,25*(100-2*(2*(r+1.5)-Math.PI/2*(r+.44*1.5))));f.report.observations.push({label,native:o});}
async function flat(){await f.closeEditor();await f.page.locator('.outliner .ol-row > button.ol').first().click();await button('Show the flat pattern').click();const d=f.page.getByRole('dialog',{name:'Flat pattern',exact:true});await d.waitFor();return d;}
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.ready();await clickModelCommand(f.page,'Create','Sheet profile');const hud=f.page.getByRole('dialog',{name:'Sheet profile',exact:true});await hud.waitFor();await hud.getByLabel('Shape',{exact:true}).selectOption('u');
 for(const [name,v] of [['Base (outside)',40],['Leg (outside)',30],['Width (along Y)',25],['Thickness',1.5],['Bend radius (inner)',2],['K-factor (0.5: estimate)',.44]])await hud.getByLabel(name,{exact:true}).fill(String(v));
 await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).click();await hud.waitFor({state:'hidden'});await f.ready();const a=await f.doc();assert.equal(a.nodes.length,1);assert.equal(a.nodes[0].kind,'sheet-contour');assert.deepEqual(a.nodes[0].path,[[0,30],[0,0],[40,0],[40,30]]);await geometry('01-created-U',a,2);
 let d=await flat();assert.equal(await button('Edit shared sheet rules',d).count(),baseline?0:1);await f.snapshot('02-flat-two-bends');await button('Close the flat pattern',d).click();
 await f.openFeatureEditor(0,'Sheet profile');for(const [name,v] of [['Thickness',1.5],['Bend radius',2],['K-factor',.44]])near(Number(await f.editor().getByLabel(name,{exact:true}).inputValue()),v);await f.snapshot('03-existing-history-rules');await f.closeEditor();await f.same(a);
 if(!baseline){
  d=await flat();await button('Edit shared sheet rules',d).click();await d.waitFor({state:'hidden'});await f.editor().waitFor();
  await f.editor().getByLabel('Bend radius',{exact:true}).fill('3');await button('Apply',f.editor()).click();await f.changed(a);await f.ready();const b=await f.doc();assert.equal(b.nodes[0].id,a.nodes[0].id);assert.deepEqual(b,{...a,nodes:[{...a.nodes[0],bendRadius:3}]});await f.closeEditor();await geometry('04-R3',b,3);
  d=await flat();await f.snapshot('05-R3-flat-shared-owner');await button('Close the flat pattern',d).click();await f.undo();await f.same(a);await geometry('06-undo-R2',a,2);await f.redo();await f.same(b);await geometry('07-redo-R3',b,3);
  const saved=await f.save('shared-U-R3');await f.freshOpen(saved.file,b,'08-reopened');await geometry('09-reopened-native',b,3);
  d=await flat();assert.equal(await button('Edit shared sheet rules',d).count(),1);
  // Open replaces a document with the same b0 output. The old modal must not silently adopt it.
  // Hold only the test file's transport read, not product code or the worker, to observe a pending Open intent.
  await f.page.evaluate(() => {
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(){
      if(this.name!=='same-key-U-R2.bcad')return original.call(this);
      window.__sheetRuleOpenWaiting=true;
      return new Promise((resolve,reject)=>{window.__releaseSheetRuleOpen=()=>{File.prototype.arrayBuffer=original;original.call(this).then(resolve,reject);};});
    };
  });
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'same-key-U-R2.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(a))});
  await f.page.waitForFunction(()=>window.__sheetRuleOpenWaiting===true);
  const stale=button('Edit shared sheet rules',d);if(await stale.isVisible())await stale.click();
  assert.equal(await f.editor().count(),0);await f.same(b);await f.snapshot('10-pending-open-refuses-old-action');
  await f.page.evaluate(()=>window.__releaseSheetRuleOpen());await f.same(a);await d.waitFor({state:'hidden'});await f.snapshot('11-same-key-open-clears-old-dialog');
  d=await flat();await button('Edit shared sheet rules',d).click();await f.editor().waitFor();near(Number(await f.editor().getByLabel('Bend radius',{exact:true}).inputValue()),2);await f.closeEditor();await f.same(a);
 }
});
