import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const points = [[10,10],[30,10],[30,25],[10,25]];
const pins = ['apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/outlineRotationCommit.ts','apps/cad-studio/src/ui/SketchOutlineMirror.tsx','apps/cad-studio/src/ui/SketchPanel.tsx',
  'apps/cad-studio/src/sketch/rotateOutline.ts','apps/cad-studio/src/sketch/mirrorOutline.ts','packages/barocss-cad-model/src/sketch/settle.ts'];
const f = await createFlow({name:'sketch-mirror-constraints',output:process.argv[2],envFrozen:'MIRROR_CONSTRAINTS_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Axis-aligned sketch reflection preserves existing H/V and length constraints through native history and persistence.',
  limits:['One Rectangle-tool-equivalent profile with H/V and driving width, an H/V-only rectangle, and explicit-fix refusal. Chrome desktop; no general solver widening.'],
  inspectorSource:`
import { readFileSync } from 'node:fs';
import { emptyDoc,withNode } from '@barocss/cad-model/engine/doc';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { evaluateCadPart,massPropertiesOf,checkOutput } from '@barocss/cad';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(input.points){
 const shape={kind:'polygon',closed:true,points:input.points,fromRectangle:true,hv:{h:[0,2],v:[1,3]},lengths:{0:20}};
 const make=s=>withNode(withNode(emptyDoc(),profileOf([s]).node),{kind:'extrude',sketch:0,height:5});
 console.log(JSON.stringify({free:make(shape),hvOnly:make({...shape,lengths:undefined}),locked:make({...shape,rules:[{kind:'fix',point:1,at:input.points[1]}]})}));
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
 const docs=await f.inspect('fixtures',{points});await f.newPage();
 f.phase='ordinary automatic-H/V rectangle mirrors without removing constraints';
 await open('hv-only.bcad',docs.hvOnly);await edit();await begin();await button(form(),'Apply mirror').click();await expectPoints(first);const hvDoc=(await f.finishSketch('00-hv-only-finished')).doc;
 assert.equal(hvDoc.nodes[0].profile,'rectangle');assert.deepEqual(hvDoc.nodes[0].min,[-30,10]);assert.deepEqual(hvDoc.nodes[0].max,[-10,25]);await f.undo();await f.same(docs.hvOnly);
 await open('dimensioned-rectangle.bcad',docs.free);await edit();
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
 assert.deepEqual([...accepted.nodes[0].sideTags.outer].sort(),[...docs.free.nodes[0].sideTags.outer].sort());assert.deepEqual(accepted.nodes[0].outline.hv,docs.free.nodes[0].outline.hv);assert.deepEqual(accepted.nodes[0].outline.lengths,{0:20});assert.deepEqual(accepted.nodes[1],docs.free.nodes[1]);
 const native=await f.inspect('native-mirrored',accepted);assert.equal(native.valid,true);assert.ok(Math.abs(native.volume-area*5)<1e-8);
 for(const [x,y]of custom)for(const z of[0,5])assert.ok(native.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-8));
 for(let i=0;i<custom.length;i++){
  const tag=docs.free.nodes[0].sideTags.outer[i],face=native.faces.find(face=>face.name===`n1.side[${tag}]`);assert.ok(face,`missing reflected side ${tag}`);
  for(const point of face.points){const a=custom[i],b=custom[(i+1)%custom.length];assert.ok(Math.min(Math.hypot(point[0]-a[0],point[1]-a[1]),Math.hypot(point[0]-b[0],point[1]-b[1]))<1e-8,`side ${tag} belongs to its reflected endpoints`);}
 }

 await f.undo();await f.same(docs.free);await f.redo();await f.same(accepted);
 const file=await f.save('mirrored-outline');await f.freshOpen(file.file,accepted,'04-fresh-open');await edit();await expectPoints(custom);
 f.phase='reopened mirrored width remains a driving edge dimension';
 const edgeLength=panel().getByRole('spinbutton',{name:'Edge 1 length',exact:true});await edgeLength.fill('24');await edgeLength.press('Enter');
 await expectPoints([[10,4],[34,4],[34,-11],[10,-11]]);const resized=(await f.finishSketch('05-width-reedited')).doc;assert.deepEqual(resized.nodes[0].outline.lengths,{0:24});assert.deepEqual(resized.nodes[0].outline.hv,docs.free.nodes[0].outline.hv);const resizedNative=await f.inspect('native-width-reedited',resized);assert.equal(resizedNative.valid,true);assert.ok(Math.abs(resizedNative.volume-24*15*5)<1e-7);await f.undo();await f.same(accepted);await f.redo();await f.same(resized);await edit();

 f.phase='pending draft is retired on explicit document replacement, constrained shape refuses without clearing constraints';
 await begin();await coordinate().fill('17');await open('locked-outline.bcad',docs.locked);await edit();await begin();await form().getByRole('alert').waitFor();assert.equal(await button(form(),'Apply mirror').isEnabled(),false);assert.equal(await coordinate().inputValue(),'0');await expectPoints(points);await f.same(docs.locked);await f.snapshot('06-fixed-refusal');
 await button(form(),'Cancel mirror').click();const unchanged=(await f.finishSketch('07-refusal-finished')).doc;assert.deepEqual(unchanged,docs.locked);
});
