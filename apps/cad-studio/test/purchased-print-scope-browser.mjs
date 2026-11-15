import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const pins=['apps/cad-studio/src/viewport/printSettings.ts','apps/cad-studio/src/viewport/useWorkspacePreviews.ts','apps/cad-studio/src/viewport/PrintPanel.tsx','apps/cad-studio/src/files/useModelExports.ts','apps/cad-studio/src/App.tsx'];
const f=await createFlow({name:'purchased-print-scope',output:process.argv[2],envFrozen:'D1334_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Purchased root scope differs explicitly across Print layers, selectable canvas and downloaded3MF; BOM history retained.',limits:['Native fixture box+shaft; no geometry mutation through page evaluate. Placed assemblies, external slicer and AT NOT_RUN.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const tool=async(name)=>{if(await button(name).count())await button(name).click();else{await button('More tools').click();await f.page.getByRole('menuitem',{name,exact:true}).click();}};
const fixture={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,10]},{kind:'extrude',id:'n1',sketch:0,height:6},{kind:'shaft',id:'n2',steps:[{diameter:10,length:20}],center:[30,5],generator:'shaft@0',bought:false}],outputs:{b1:{node:1,side:'solid'},b2:{node:2,side:'solid'}},nextId:3};
await f.run(async()=>{
 const file=join(process.argv[2],'box-shaft.bcad');await writeFile(file,JSON.stringify(fixture));
 for(const width of [1024,1440]){
  await f.newPage();await f.openFile(file,3);await f.page.setViewportSize({width,height:900});
  const print=()=>f.page.getByLabel('Print layers',{exact:true});
  const preview=async(layers,bought)=>{if(!await print().isVisible())await f.page.getByRole('radio',{name:'Preview: Print',exact:true}).click();await print().waitFor();if(layers){await f.page.waitForFunction(n=>{const p=window.__studioPrint();return p.stage==='ready'&&p.display?.summary.count===n;},layers);assert.match(await print().getByRole('status').innerText(),new RegExp(`of ${layers} `));}else{await f.page.waitForFunction(()=>window.__studioPrint().reason?.includes('purchased'));assert.match(await print().getByRole('status').innerText(),/Inspect → BOM/);}assert.equal(await print().getByLabel('Print source scope').count(),bought?1:0);if(bought){assert.match(await print().getByLabel('Print source scope').innerText(),/Shaft.*\(b2\)/i);assert.match(await print().getByLabel('Print source scope').innerText(),/not layer results/);}await f.snapshot(`${width}-${layers}-${bought?'bought':'made'}-print`);};
  const buy=async(value)=>{await clickModelCommand(f.page,'Inspect','BOM');const bom=f.page.getByRole('complementary',{name:'BOM panel',exact:true});await bom.getByLabel(/^Bought or made: shaft /).selectOption(value);await f.ready();await button('Close BOM').click();};
  const three=async(count,bought)=>{const before=await f.doc(),pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.3mf')});await tool('Export 3MF');const dl=await pending,xml=execFileSync('unzip',['-p',await dl.path(),'3D/3dmodel.model'],{encoding:'utf8'});assert.equal((xml.match(/<object\s/g)||[]).length,count);if(bought)await f.page.getByText(/3MF includes visible purchased root bodies:/).waitFor();await f.same(before);};
  await preview(100,false);await print().getByLabel('Printed up to layer').uncheck();await buy('bought');await preview(30,true);await three(2,true);
  await button('View cube directions').click();await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();const pos=await f.page.evaluate(()=>window.__studioScreenOf([30,5,20]));assert.ok(pos);await f.page.mouse.click(pos[0],pos[1]);await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.some(face=>face.body===1));await f.snapshot(`${width}-bought-selectable-canvas`);
  await f.page.locator('.ol-row').filter({has:button('Hide body')}).first().getByRole('button',{name:'Hide body',exact:true}).click();await f.ready();await preview(0,true);await three(1,true);
  await button('Undo').click();await f.ready();await preview(30,true);await button('Undo').click();await f.ready();await preview(100,false);await button('Redo').click();await f.ready();await preview(30,true);
  await buy('made');await preview(100,false);await three(2,false);const doc=await f.doc(),saved=await f.save(`${width}-made-restored`);await f.freshOpen(saved.file,doc,`${width}-reopened`);f.report.observations??=[];f.report.observations.push({width,printLayers:[100,30,0,30,100,30,100],threeMfObjects:[2,1,2]});
 }
});
