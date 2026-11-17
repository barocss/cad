import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const points = [[10,10],[30,12],[24,25],[8,22]];
const pins = ['apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/outlineRotationCommit.ts','apps/cad-studio/src/ui/SketchOutlineRotation.tsx','apps/cad-studio/src/ui/SketchPanel.tsx',
  'apps/cad-studio/src/sketch/rotateOutline.ts','packages/barocss-cad-model/src/sketch/settle.ts'];
const f = await createFlow({name:'sketch-outline-rotation',output:process.argv[2],envFrozen:'OUTLINE_ROTATION_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Explicit in-plane rotation of one independent unconstrained straight outline, existing history and native project persistence.',
  limits:['One asymmetric four-point profile and its constrained refusal counterpart. Chrome desktop. No constraint removal or solver widening.'],
  inspectorSource:`
import { readFileSync } from 'node:fs';
import { emptyDoc,withNode } from '@barocss/cad-model/engine/doc';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { evaluateCadPart,massPropertiesOf,checkOutput } from '@barocss/cad';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(input.points){
 const shape={kind:'polygon',closed:true,points:input.points,hv:{h:[],v:[]}};
 const make=s=>withNode(withNode(emptyDoc(),profileOf([s]).node),{kind:'extrude',sketch:0,height:5});
 console.log(JSON.stringify({free:make(shape),locked:make({...shape,lengths:{0:Math.hypot(20,2)}})}));
}else{
 const output=evaluateCadPart(toPartDocument(input)).outputs[0];
 console.log(JSON.stringify({valid:checkOutput(output).valid,volume:massPropertiesOf(output).volume,vertices:output.brep.vertices.map(v=>v.point)}));
}`});
const button=(scope,name)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.sketchPanel();
const form=()=>panel().getByRole('group',{name:'Rotate outline',exact:true});
const coord=(i,axis)=>panel().getByRole('spinbutton',{name:`Point ${i} ${axis}`,exact:true});
const angle=()=>form().getByRole('spinbutton',{name:'Outline rotation angle',exact:true});
async function open(name,doc){const editing=await panel().isVisible();const [fc]=await Promise.all([f.page.waitForEvent('filechooser'),button(f.page,'Open').click()]);await fc.setFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});if(editing)await button(f.page,'Discard changes').click();await f.same(doc);}
async function edit(){await f.openFeatureEditor(1);await button(f.editor(),'Edit sketch').click();await panel().waitFor();await f.tool('Select','s');}
async function begin(){await button(panel(),'Rotate outline…').click();await form().waitFor();}
async function expectPoints(expected){for(let i=0;i<expected.length;i++)for(const [axis,k]of[['X',0],['Y',1]])await f.page.waitForFunction(({name,value})=>Math.abs(Number(document.querySelector(`[aria-label="${name}"]`)?.value)-value)<1e-4,{name:`Point ${i+1} ${axis}`,value:expected[i][k]});}
const first=points.map(([x,y])=>[20-y,x]);
const custom=points.map(([x,y])=>[12-y,x+2]); // +90 degrees about (5,7), independent exact oracle.
const area=Math.abs(points.reduce((sum,[x,y],i)=>{const [u,v]=points[(i+1)%points.length];return sum+x*v-y*u;},0))/2;
await f.run(async()=>{
 const docs=await f.inspect('fixtures',{points});await f.newPage();await open('outline-rotation.bcad',docs.free);await edit();
 f.phase='draft input, invalid refusal and Escape leave accepted document and sketch points unchanged';
 await begin();await angle().fill('');assert.equal(await button(form(),'Apply rotation').isEnabled(),false);await angle().press('Enter');await panel().waitFor();await expectPoints(points);await f.same(docs.free);
 await angle().fill('-90');await angle().press('Escape');await form().waitFor({state:'hidden'});await expectPoints(points);
 await begin();await button(form(),'Cancel rotation').click();await expectPoints(points);
 f.phase='first point pivot applies once and sketch Undo/Redo restores original coordinates';
 await begin();await button(form(),'Apply rotation').click();await expectPoints(first);await f.same(docs.free);await f.snapshot('01-first-point-rotation');
 await f.page.evaluate(()=>document.activeElement.blur());await f.page.keyboard.press('Meta+z');await expectPoints(points);await f.page.keyboard.press('Meta+Shift+z');await expectPoints(first);await f.page.keyboard.press('Meta+z');await expectPoints(points);
 f.phase='custom local pivot, finite validation and explicit apply';
 await begin();await form().getByRole('combobox',{name:'Outline rotation pivot'}).selectOption('custom');
 await form().getByRole('spinbutton',{name:'Outline rotation pivot X'}).fill('5');await form().getByRole('spinbutton',{name:'Outline rotation pivot Y'}).fill('7');await expectPoints(points);
 await f.snapshot('02-custom-pivot-before-apply');await button(form(),'Apply rotation').click();await expectPoints(custom);
 await f.page.evaluate(()=>document.activeElement.blur());await f.page.keyboard.press('Meta+z');await expectPoints(points);await f.page.keyboard.press('Meta+Shift+z');await expectPoints(custom);
 const accepted=(await f.finishSketch('03-finished')).doc;
 assert.deepEqual(accepted.nodes[0].sideTags,docs.free.nodes[0].sideTags);assert.deepEqual(accepted.nodes[1],docs.free.nodes[1]);
 const native=await f.inspect('native-rotated',accepted);assert.equal(native.valid,true);assert.ok(Math.abs(native.volume-area*5)<1e-8);
 for(const [x,y]of custom)for(const z of[0,5])assert.ok(native.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-8));
 await f.undo();await f.same(docs.free);await f.redo();await f.same(accepted);
 const file=await f.save('rotated-outline');await f.freshOpen(file.file,accepted,'04-fresh-open');await edit();await expectPoints(custom);
 f.phase='pending draft is retired on explicit document replacement, constrained shape refuses without clearing constraints';
 await begin();await angle().fill('17');await open('locked-outline.bcad',docs.locked);await edit();await begin();await form().getByRole('alert').waitFor();assert.equal(await button(form(),'Apply rotation').isEnabled(),false);assert.equal(await angle().inputValue(),'90');await expectPoints(points);await f.same(docs.locked);await f.snapshot('05-constrained-refusal');
 await button(form(),'Cancel rotation').click();const unchanged=(await f.finishSketch('06-refusal-finished')).doc;assert.deepEqual(unchanged,docs.locked);
});
