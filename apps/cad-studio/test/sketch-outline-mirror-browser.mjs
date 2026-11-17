import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const points = [[10,10],[30,12],[24,25],[8,22]];
const pins = ['apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/outlineRotationCommit.ts','apps/cad-studio/src/ui/SketchOutlineMirror.tsx','apps/cad-studio/src/ui/SketchPanel.tsx',
  'apps/cad-studio/src/sketch/rotateOutline.ts','apps/cad-studio/src/sketch/mirrorOutline.ts','packages/barocss-cad-model/src/sketch/settle.ts'];
const f = await createFlow({name:'sketch-outline-mirror',output:process.argv[2],envFrozen:'OUTLINE_MIRROR_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Explicit in-place reflection of one independent unconstrained straight outline, existing history and native project persistence.',
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
 console.log(JSON.stringify({free:make(shape),locked:make({...shape,rules:[{kind:'fix',point:1,at:input.points[1]}]})}));
}else{
 const output=evaluateCadPart(toPartDocument(input)).outputs[0];
 const b=output.brep, vertices=new Map(b.vertices.map(v=>[v.id,v.point])), edges=new Map(b.edges.map(e=>[e.id,e])), coedges=new Map(b.coedges.map(c=>[c.id,c])), loops=new Map(b.loops.map(l=>[l.id,l]));
 const faces=b.faces.map(face=>({name:face.name,points:face.loops.flatMap(id=>loops.get(id).coedges.flatMap(id=>edges.get(coedges.get(id).edge).vertices.map(id=>vertices.get(id))))}));
 console.log(JSON.stringify({valid:checkOutput(output).valid,volume:massPropertiesOf(output).volume,vertices:output.brep.vertices.map(v=>v.point),faces}));
}`});
const button=(scope,name)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.sketchPanel();
const form=()=>panel().getByRole('group',{name:'Mirror outline in place',exact:true});
const coordinate=()=>form().getByRole('spinbutton',{name:'Outline mirror coordinate',exact:true});
async function open(name,doc){const editing=await panel().isVisible();const [fc]=await Promise.all([f.page.waitForEvent('filechooser'),button(f.page,'Open').click()]);await fc.setFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});if(editing)await button(f.page,'Discard changes').click();await f.same(doc);}
async function edit(){await f.openFeatureEditor(1);await button(f.editor(),'Edit sketch').click();await panel().waitFor();await f.tool('Select','s');}
async function begin(){await button(panel(),'Mirror outline in place…').click();await form().waitFor();}
async function expectPoints(expected){for(let i=0;i<expected.length;i++)for(const [axis,k]of[['X',0],['Y',1]])await f.page.waitForFunction(({name,value})=>Math.abs(Number(document.querySelector(`[aria-label="${name}"]`)?.value)-value)<1e-4,{name:`Point ${i+1} ${axis}`,value:expected[i][k]});}
const first=points.map(([x,y])=>[-x,y]);
const custom=points.map(([x,y])=>[x,14-y]); // Reflection across local Y=7, independent exact oracle.
const area=Math.abs(points.reduce((sum,[x,y],i)=>{const [u,v]=points[(i+1)%points.length];return sum+x*v-y*u;},0))/2;
await f.run(async()=>{
 const docs=await f.inspect('fixtures',{points});await f.newPage();await open('outline-mirror.bcad',docs.free);await edit();
 f.phase='draft input, invalid refusal and Escape leave accepted document and sketch points unchanged';
 await begin();await coordinate().fill('');assert.equal(await button(form(),'Apply mirror').isEnabled(),false);await coordinate().press('Enter');await panel().waitFor();await expectPoints(points);await f.same(docs.free);
 await coordinate().fill('7');await coordinate().press('Escape');await form().waitFor({state:'hidden'});await expectPoints(points);
 await begin();await button(form(),'Cancel mirror').click();await expectPoints(points);
 f.phase='X=0 reflection applies once and sketch Undo/Redo restores original coordinates';
 await button(panel(),'Rotate outline…').click();await panel().getByRole('spinbutton',{name:'Outline rotation angle'}).fill('17');await begin();await button(form(),'Apply mirror').click();await expectPoints(first);assert.equal(await panel().getByRole('group',{name:'Rotate outline',exact:true}).count(),0);await f.same(docs.free);await f.snapshot('01-x-zero-mirror');
 await f.page.evaluate(()=>document.activeElement.blur());await f.page.keyboard.press('Meta+z');await expectPoints(points);await f.page.keyboard.press('Meta+Shift+z');await expectPoints(first);await f.page.keyboard.press('Meta+z');await expectPoints(points);
 f.phase='Y=7 mirror line, finite validation and explicit in-place apply';
 await begin();await form().getByRole('combobox',{name:'Outline mirror line'}).selectOption('y');
 await coordinate().fill('7');await expectPoints(points);
 await f.snapshot('02-custom-line-before-apply');await button(form(),'Apply mirror').click();await expectPoints(custom);
 await f.page.evaluate(()=>document.activeElement.blur());await f.page.keyboard.press('Meta+z');await expectPoints(points);await f.page.keyboard.press('Meta+Shift+z');await expectPoints(custom);
 const accepted=(await f.finishSketch('03-finished')).doc;
 assert.deepEqual(accepted.nodes[0].sideTags,docs.free.nodes[0].sideTags);assert.deepEqual(accepted.nodes[1],docs.free.nodes[1]);
 const native=await f.inspect('native-mirrored',accepted);assert.equal(native.valid,true);assert.ok(Math.abs(native.volume-area*5)<1e-8);
 for(const [x,y]of custom)for(const z of[0,5])assert.ok(native.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-8));
 for(let i=0;i<custom.length;i++){
  const tag=accepted.nodes[0].sideTags.outer[i],face=native.faces.find(face=>face.name===`n1.side[${tag}]`);assert.ok(face,`missing reflected side ${tag}`);
  for(const point of face.points){const a=custom[i],b=custom[(i+1)%custom.length];assert.ok(Math.min(Math.hypot(point[0]-a[0],point[1]-a[1]),Math.hypot(point[0]-b[0],point[1]-b[1]))<1e-8,`side ${tag} belongs to its reflected endpoints`);}
 }

 await f.undo();await f.same(docs.free);await f.redo();await f.same(accepted);
 const file=await f.save('mirrored-outline');await f.freshOpen(file.file,accepted,'04-fresh-open');await edit();await expectPoints(custom);
 f.phase='pending draft is retired on explicit document replacement, constrained shape refuses without clearing constraints';
 await begin();await coordinate().fill('17');await open('locked-outline.bcad',docs.locked);await edit();await begin();await form().getByRole('alert').waitFor();assert.equal(await button(form(),'Apply mirror').isEnabled(),false);assert.equal(await coordinate().inputValue(),'0');await expectPoints(points);await f.same(docs.locked);await f.snapshot('05-constrained-refusal');
 await button(form(),'Cancel mirror').click();const unchanged=(await f.finishSketch('06-refusal-finished')).doc;assert.deepEqual(unchanged,docs.locked);
});
