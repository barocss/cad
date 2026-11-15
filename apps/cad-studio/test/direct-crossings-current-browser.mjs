import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/DirectPanel.tsx','apps/cad-studio/src/ui/DirectInspector.tsx','packages/barocss-cad-model/src/engine/direct.ts'];
const f=await createFlow({name:'direct-crossings-current',envFrozen:'D1381_SOURCE_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
 qualification:'Invalidate old Direct crossing and no-crossing results after Move, Undo, Redo and same-ID pole edits while retaining plane inputs.',
 limits:['One authored degree1 straight curve; exact affine crossing oracle, desktop Chrome1024x800/1440x900. No other curve-kind qualification.'],
 inspectorSource:`import {readFileSync} from 'node:fs';import {geometryOf} from '@barocss/cad-model/engine/direct';const d=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(geometryOf(d.direct,d.direct.objects[0])));`});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0,direct:{sources:{line:'@model test { version: 0; length-unit: mm; @curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[0,-7,0],[14,-7,0]]; weights: [1,1]; } }'},objects:[{id:'line1',name:'Straight crossing control',source:'line',geometry:'line'}]}};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry'});
const rows=()=>panel().getByLabel('Crossing',{exact:true});
const none=()=>panel().getByText(/The curve does not cross/);
async function retained(at){assert.equal(await panel().getByLabel('Crossing plane').inputValue(),'x');assert.equal(await panel().getByLabel('At',{exact:true}).inputValue(),String(at));}
async function cleared(at,label){await retained(at);assert.equal(await rows().count(),0,label+': stale crossing row');assert.equal(await none().count(),0,label+': stale no-crossing result');}
async function compute(at,ends,label){
 const before=await f.doc();await retained(at);await button('Find crossings',panel()).click();
 const t=(at-ends[0][0])/(ends[1][0]-ends[0][0]);
 if(t<0||t>1){await none().waitFor();assert.equal(await rows().count(),0);assert.match(await none().innerText(),new RegExp('X = '+at));}
 else{await rows().waitFor();assert.equal(await rows().count(),1);const expected=ends[0].map((v,k)=>v+t*(ends[1][k]-v));const shown=(await rows().locator('b').innerText()).split(',').map(Number);shown.forEach((v,k)=>assert.ok(Math.abs(v-expected[k])<=.00051,`${label}: ${shown} versus ${expected}`));const shownT=Number((await rows().innerText()).match(/^t\s+([\d.e+-]+)/)[1]);assert.ok(Math.abs(shownT-t)<.000011);assert.equal(await none().count(),0);}
 const curve=await f.inspect(label,before);assert.equal(curve.degree,1);assert.deepEqual(curve.controlPoints,ends);await f.same(before);
 await button('Find crossings',panel()).scrollIntoViewIfNeeded();await f.snapshot(label);f.report.observations.push({label,at,ends,parameter:t,expectedCrossing:t>=0&&t<=1});return before;
}
async function move(x,z){for(const [label,value] of [['ΔX',x],['ΔY',0],['ΔZ',z]]){const input=panel().getByLabel(label,{exact:true});await input.fill(String(value));await input.press('Tab');}const before=await f.doc();await button('Move',panel()).click();await f.changed(before);return f.doc();}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'crossings.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
 await f.page.locator('.outliner .ol.direct').filter({hasText:'Straight crossing control'}).click();
 await panel().getByLabel('Crossing plane').selectOption('x');await panel().getByLabel('At',{exact:true}).fill('7');await panel().getByLabel('At',{exact:true}).press('Tab');
 const original=await compute(7,[[0,-7,0],[14,-7,0]],`${width}-original`);
 const moved=await move(0,10);await cleared(7,'MoveZ');await compute(7,[[0,-7,10],[14,-7,10]],`${width}-moved`);
 await f.undo();await f.same(original);await cleared(7,'UndoZ');await compute(7,[[0,-7,0],[14,-7,0]],`${width}-undo`);
 await f.redo();await f.same(moved);await cleared(7,'RedoZ');await compute(7,[[0,-7,10],[14,-7,10]],`${width}-redo`);
 await panel().getByLabel('At',{exact:true}).fill('20');await panel().getByLabel('At',{exact:true}).press('Tab');await compute(20,[[0,-7,10],[14,-7,10]],`${width}-no-crossing`);
 const movedX=await move(10,0);await cleared(20,'MoveX');await compute(20,[[10,-7,10],[24,-7,10]],`${width}-new-crossing`);
 await f.undo();await f.same(moved);await cleared(20,'UndoX');await compute(20,[[0,-7,10],[14,-7,10]],`${width}-undo-no-crossing`);
 await f.redo();await f.same(movedX);await cleared(20,'RedoX');await compute(20,[[10,-7,10],[24,-7,10]],`${width}-redo-crossing`);
 await panel().getByLabel('Control point',{exact:true}).selectOption('1');const z=panel().getByLabel('Z',{exact:true});await z.fill('22');await z.press('Enter');await f.changed(movedX);const edited=await f.doc();assert.equal(edited.direct.objects[0].id,movedX.direct.objects[0].id);
 await cleared(20,'same-ID pole edit');await compute(20,[[10,-7,10],[24,-7,22]],`${width}-pole-edit`);
 await f.undo();await f.same(movedX);await cleared(20,'Undo pole');await compute(20,[[10,-7,10],[24,-7,10]],`${width}-undo-pole`);
 await f.redo();await f.same(edited);await cleared(20,'Redo pole');await compute(20,[[10,-7,10],[24,-7,22]],`${width}-redo-pole`);
}});
