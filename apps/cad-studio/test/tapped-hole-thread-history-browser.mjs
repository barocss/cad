import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['packages/barocss-cad-model/src/app/editFields.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/ui/HoleHistoryInputs.tsx'];
const f = await createFlow({ name:'tapped-hole-thread-history',output:process.argv[2],envFrozen:'TAPPED_THREAD_HISTORY_FROZEN',initialFiles:[...pins,'apps/cad-studio/test/tapped-hole-thread-history-browser.mjs'],requiredFrozen:pins,qualification:'Existing tapped Hole History explicitly replaces a unique loaded Thread and its drill, preserving custom drill on same selection and refusing parameter unbinding.',limits:['Single through Hole actual UI; blind/pattern preservation and malformed rows covered by Model tests, not this browser run.','No modeled thread/manufacturing suitability or delayed Worker injection.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {checkBrep,massPropertiesOf} from '@barocss/cad';import {partSnapshot} from '@barocss/cad-model/engine/part';
const [body]=partSnapshot(JSON.parse(readFileSync(process.argv[2],'utf8'))).outputs;console.log(JSON.stringify({valid:checkBrep(body.brep,{strict:true}).valid,volume:massPropertiesOf(body).volume,solids:body.bodyCount}));
` });
const row={id:'M6',d:6,pitch:1,s:10,k:4,m:5.2,dk:10,ks:6,socket:5,wd1:6.4,wd2:12,wh:1.6,cdk:13.44,ck:3.72,csocket:4,tap:5,lengths:[12,16],capLengths:[10,12],cskLengths:[8,10],clearance:[6.4,6.6,7],estimate:true};
const rows=[row,{...row,id:'M8',d:8,pitch:1.25,tap:6.8}];
const base={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[64,32]},{id:'n1',kind:'extrude',sketch:0,height:12},{id:'n2',kind:'hole',parent:{node:1,side:'solid'},radius:2.75,center:[32,16],thread:'M6×1'}],outputs:{b2:{node:2,side:'solid'}},nextId:3,fastenerSizes:{version:1,rows}};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=name=>f.editor().getByLabel(name,{exact:true});
async function open(doc,name){await f.newPage();await f.page.setViewportSize({width:1440,height:900});await f.openFile({name:name+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},3);await f.same(doc);await f.openFeatureEditor(2);}
async function verify(doc,label){const native=await f.inspect(label,doc);assert.ok(native.valid&&native.solids===1);assert.ok(Math.abs(native.volume-(24576-Math.PI*3.4**2*12))<1e-6);}
await f.run(async()=>{
 await open(base,'thread-history');
 assert.equal(await field('Thread').inputValue(),'M6×1');assert.equal(Number(await field('Diameter').inputValue()),5.5);
 await field('Thread').selectOption('M6×1');assert.equal(Number(await field('Diameter').inputValue()),5.5);assert.ok(await button('Apply',f.editor()).isDisabled());await f.same(base);
 await field('Diameter').fill('4');await field('Thread').selectOption('M8×1.25');assert.equal(Number(await field('Diameter').inputValue()),6.8);await f.same(base);
 const readout=await f.editor().getByRole('group',{name:'Hole placement'}).innerText();assert.match(readout,/M8×1.25/);assert.match(readout,/Loaded row tap drill Ø6.8 mm/);assert.match(readout,/matches the actual drill/);
 await f.snapshot('01-thread-and-drill-draft');
 await button('Reset',f.editor()).click();assert.equal(await field('Thread').inputValue(),'M6×1');assert.equal(Number(await field('Diameter').inputValue()),5.5);await f.same(base);
 await field('Thread').selectOption('M8×1.25');await f.closeEditor();await f.same(base);
 await f.openFeatureEditor(2);assert.equal(await field('Thread').inputValue(),'M6×1');await field('Thread').selectOption('M8×1.25');
 const changed=(await f.applyEditor(base,'02-applied')).doc;
 assert.deepEqual(changed,{...base,nodes:[...base.nodes.slice(0,2),{...base.nodes[2],thread:'M8×1.25',radius:3.4}]});await verify(changed,'02-native');
 await f.undo();await f.same(base);await f.redo();await f.same(changed);
 const save=await f.save('thread-history');await f.freshOpen(save.file,changed,'03-fresh-open');await verify(changed,'03-native');
 await f.openFeatureEditor(2);assert.equal(await field('Thread').inputValue(),'M8×1.25');assert.equal(Number(await field('Diameter').inputValue()),6.8);await f.closeEditor();
 const bound={...base,parameters:{R:2.75},nodes:[...base.nodes.slice(0,2),{...base.nodes[2],radius:{parameter:'R'}}]};
 await open(bound,'thread-bound');await field('Thread').selectOption('M8×1.25');
 await f.page.getByText('Unbind the Diameter parameter before changing Thread.',{exact:true}).waitFor();
 assert.equal(await field('Thread').inputValue(),'M6×1');await f.same(bound);assert.ok(await button('Apply',f.editor()).isDisabled());await f.snapshot('04-bound-radius-refused');await f.closeEditor();
 const missing={...base,fastenerSizes:{version:1,rows:[rows[1]]}};
 await open(missing,'thread-missing-row');assert.equal(await field('Thread').inputValue(),'M6×1');assert.match(await field('Thread').locator('option:checked').textContent(),/Saved.*no unique loaded row/);assert.equal(Number(await field('Diameter').inputValue()),5.5);await f.same(missing);await f.snapshot('05-saved-thread-placeholder');
 f.report.observations.push({sameChoiceCustomDrill:true,typedDiameterCleared:true,resetClosePreserved:true,undoRedoSaveOpen:true,boundParameterPreserved:true,missingRowNoFallback:true});
});
