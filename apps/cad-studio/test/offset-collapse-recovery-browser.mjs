import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/app/offsetCollapseFeedback.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/state/useCommandPreview.ts','apps/cad-studio/src/app/commandState.ts','packages/barocss-cad-model/src/app/offsetFaceEdit.ts','packages/barocss-cad/src/features/drafted-cap-offset.ts'];
const f=await createFlow({name:'offset-collapse-recovery',output:process.argv[2],envFrozen:'D1375_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Owned field-local Offset History collapse recovery including a later dependent Offset.',
 limits:['Rectangular tapered upper caps at 1024 and 1440. No new admission or numerical bound inference.'],
 inspectorSource:`import {readFileSync} from 'node:fs';
import {checkBrep,massPropertiesOf,faceGeometry} from '@barocss/cad';
import {partSnapshot} from '@barocss/cad-model/engine/part';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partSnapshot(doc).outputs.map(o=>({check:checkBrep(o.brep,{strict:true}),volume:massPropertiesOf(o).volume,points:o.brep.vertices.map(v=>v.point),faces:o.brep.faces.map(f=>({name:f.name,geometry:faceGeometry(f)}))}))));`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const hud=name=>f.page.getByRole('dialog',{name,exact:true});
const field=panel=>panel.getByLabel('Offset',{exact:true});
const status=(panel,state)=>panel.locator('.status').filter({hasText:new RegExp('^'+state+'$')}).waitFor();
let width;
const seed=(w,d,h,angle)=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[w,d]},{kind:'extrude',id:'n1',sketch:0,height:h,draft:angle}],outputs:{b1:{node:1,side:'solid'}},nextId:2});
async function open(doc,label){
 await f.newPage();await f.page.setViewportSize({width,height:800});
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
 await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
}
async function pickTop(w,d,z){
 await button('Top',f.page.locator('.views')).click();
 if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
 await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter');for(let i=0;i<5&&!(await filter.innerText()).includes('Faces');i++)await filter.click();assert.match(await filter.innerText(),/Faces/);
 await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const p=await f.page.evaluate(p=>window.__studioScreenOf(p),[w/2,d/2,z]);
 assert.ok(await f.page.evaluate(p=>document.elementFromPoint(...p)?.matches('canvas.vp-canvas'),p));
 await f.page.mouse.click(...p);await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.length===1);
}
async function addOffset(doc,w,d,z,value){
 await pickTop(w,d,z);await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Offset face');
 const panel=hud('Offset face');await field(panel).fill(String(value));await status(panel,'preview');await f.same(doc);
 await button('Apply',panel).click();await f.changed(doc);return f.doc();
}
async function edit(index){await f.openFeatureEditor(index,'offset cap');await button('Edit offset',f.editor()).click();const panel=hud('Edit Offset face');await status(panel,'preview');return panel;}
async function refusal(panel,value,accepted,later,label){
 await field(panel).fill(String(value));await status(panel,'refused');assert.equal(await button('Apply',panel).isDisabled(),true);
 assert.equal(await field(panel).getAttribute('aria-invalid'),'true');assert.ok((await field(panel).getAttribute('aria-describedby')??'').split(/\s+/).includes('hud-offset-collapse'));
 const notice=panel.locator('#hud-offset-collapse');assert.equal(await notice.count(),1);const text=await notice.innerText();
 assert.match(text,/close|cross|limit/i);assert.match(text,/n1.*top|n1\.top/);assert.match(text,/original|source/i);assert.match(text,/Cancel|saved/i);
 if(later){assert.match(text,/later|subsequent|following/i);assert.match(text,/n3/);}
 assert.equal(await panel.locator('.hud-error').count(),1);assert.equal(await panel.locator('.hud-step').filter({hasText:'Move'}).evaluate(e=>e.classList.contains('done')),false);await f.same(accepted);await f.snapshot(label);
}
async function native(label,doc,w,d,h,angle,z){
 const read=await f.inspect(label,doc);assert.equal(read.length,1);const r=read[0];assert.ok(r.check.valid,JSON.stringify(r.check));
 const slope=Math.tan(angle*Math.PI/180),volume=w*d*z-(w+d)*slope*z*z+4/3*slope*slope*z*z*z;
 assert.ok(Math.abs(r.volume-volume)<1e-7,JSON.stringify({label,expected:volume,actual:r.volume}));
 assert.equal(r.faces.length,6);assert.ok(r.faces.every(f=>f.geometry.kind==='plane'));
 for(const level of [0,z])for(const x of [slope*level,w-slope*level])for(const y of [slope*level,d-slope*level])assert.ok(r.points.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-level)<1e-8));
 const studio=(await f.bodies()).bodies;assert.equal(studio.length,1);assert.ok(Math.abs(studio[0].volume-volume)<1e-7);
 f.report.observations.push({label,width,originalHeight:h,finalHeight:z,expectedVolume:volume,nativeVolume:r.volume,strictBrep:true});
}
async function recovery(panel,value,before,index,label){
 await field(panel).fill(String(value));await status(panel,'preview');assert.notEqual(await field(panel).getAttribute('aria-invalid'),'true');assert.equal(await panel.locator('#hud-offset-collapse').count(),0);
 await button('Apply',panel).click();await f.changed(before);const after=await f.doc();assert.deepEqual(after.nodes[index],{...before.nodes[index],distance:value});assert.deepEqual(after.nodes.filter((_,i)=>i!==index),before.nodes.filter((_,i)=>i!==index));
 await f.undo();await f.same(before);await f.redo();await f.same(after);
 const file=await f.save(label);await f.freshOpen(file.file,after,label+'-reopened');await f.page.setViewportSize({width,height:800});return after;
}
await f.run(async()=>{for(width of [1024,1440]){
 f.phase=`${width}: original cap collapse and recovery`;const source=seed(40,30,10,10);await open(source,`source-${width}`);
 const applied=await addOffset(source,40,30,10,3);assert.equal(applied.nodes[2].distance,3);await native(`cap-applied-${width}`,applied,40,30,10,10,13);
 const panel=await edit(2);await refusal(panel,-10,applied,false,`cap-refused-${width}`);
 await button('Cancel',panel).click();await f.same(applied);const reopened=await edit(2);await refusal(reopened,-10,applied,false,`cap-repeat-refused-${width}`);
 const fixed=await recovery(reopened,-2,applied,2,`cap-fixed-${width}`);await native(`cap-fixed-native-${width}`,fixed,40,30,10,10,8);
 f.phase=`${width}: dependent later Offset collapse and recovery`;const chainSource=seed(20,10,12,15);await open(chainSource,`chain-${width}`);
 const first=await addOffset(chainSource,20,10,12,2),both=await addOffset(first,20,10,14,2);assert.equal(both.nodes[3].distance,2);await native(`chain-applied-${width}`,both,20,10,12,15,16);
 const chainPanel=await edit(2);await refusal(chainPanel,5,both,true,`chain-refused-${width}`);
 const repaired=await recovery(chainPanel,3,both,2,`chain-fixed-${width}`);assert.deepEqual(repaired.nodes[3],both.nodes[3]);await native(`chain-fixed-native-${width}`,repaired,20,10,12,15,17);
}});
