import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/viewport/curvatureCombSegments.ts','apps/cad-studio/src/viewport/CurvatureComb.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/camera.ts','apps/cad-studio/src/app/useEdgeCurvature.ts'];
const f=await createFlow({name:'curvature-zoom-visibility',envFrozen:'D1380_SOURCE_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
 qualification:'Keep visible G2 curvature strokes during the original orthographic zoom, without changing measurement or document.',
 limits:['One native G2 edge, both desktop widths; perspective is an ordinary framed control, not near-eye clipping qualification.'],
 inspectorSource:`import {readFileSync} from 'node:fs';import {readEdgeContinuity} from '@barocss/cad-model/engine/edgeContinuity';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(readEdgeContinuity(doc,'b2',{kind:'curve',edgeId:'n2_e13'})));`});
const g2={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[30,12]},
 {kind:'extrude',id:'n1',sketch:0,height:20},
 {kind:'fillet',id:'n2',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:2,section:{kind:'g2',tension:.5}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('region',{name:'Edge curvature',exact:true});
const comb=()=>f.page.locator('.curvature-comb');
async function settle(){await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function record(label,measurement,required=true){
 const state=await f.page.evaluate(samples=>{
  const canvas=document.querySelector('.vp-canvas'),rect=canvas.getBoundingClientRect(),group=document.querySelector('.curvature-comb'),c=window.__studioViewer?.camera;
  const segments=[...group.querySelectorAll('line')].map(el=>['x1','y1','x2','y2'].map(k=>Number(el.getAttribute(k))));
  const points=samples.map(s=>({world:s.point,page:window.__studioScreenOf(s.point),project:window.__studioProject(s.point)}));
  const tips=[...group.querySelectorAll('polyline')].map(el=>el.getAttribute('points'));
  return {segments,tips,points,width:rect.width,height:rect.height,left:rect.left,top:rect.top,edge:group.dataset.edge,eye:window.__studioEye(),viewer:c?{position:[...c.position],target:[...c.target],projection:c.projection,near:c.near,far:Number.isFinite(c.far)?c.far:'Infinity',autoClip:c.autoClip}:null};
 },measurement.spans.flat());
 assert.equal(state.edge,'n2_e13');assert.ok(state.segments.every(s=>s.every(Number.isFinite)));
 const visibleSamples=state.points.filter(p=>p.page[0]>=state.left&&p.page[0]<=state.left+state.width&&p.page[1]>=state.top&&p.page[1]<=state.top+state.height).length;
 // Independent 2-D slab test, not the product clipper; detects a stroke with a viewport-visible portion.
 function intersects(s){let lo=0,hi=1;for(let axis=0;axis<2;axis++){const a=s[axis],d=s[axis+2]-a,max=axis?state.height:state.width;if(d===0){if(a<0||a>max)return false;}else{const x=-a/d,y=(max-a)/d;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));}}return hi>=lo;}
 const visibleStrokes=state.segments.filter(intersects).length;
 const text=await panel().getByRole('status').locator('b').innerText();assert.equal(text,'0.09090197 – 0.9918771 mm⁻¹');
 f.report.observations.push({label,...state,visibleSamples,visibleStrokes,text,measurementSamples:measurement.spans.flat().length});
 await f.same(g2);assert.equal(measurement.spans.flat().length,8);
 if(required){assert.ok(visibleSamples>0,label+': selected sampled edge must remain onscreen');assert.ok(visibleStrokes>0,label+': visible edge lost every comb stroke');}
 await f.snapshot(label);return state;
}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'g2-zoom.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(g2))});await f.same(g2);
 await button('Right',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await settle();
 const selectedPoint=[30,.375,19.625];for(let i=0;i<2;i++){const p=await f.page.evaluate(p=>window.__studioScreenOf(p),selectedPoint);await f.page.mouse.move(...p);await f.page.mouse.wheel(0,-350);await f.page.waitForTimeout(150);}
 const pixel=await f.page.evaluate(p=>window.__studioScreenOf(p),selectedPoint);await f.page.mouse.click(...pixel);await button('Show curvature comb',panel()).click();await panel().getByRole('status').locator('b').waitFor();
 const native=await f.inspect(`${width}-native`,g2);assert.ok(native.curve);const measurement=native.curve;assert.equal(measurement.spans.flat().length,8);
 await record(`${width}-initial`,measurement);await panel().getByLabel('Comb scale (mm²)').selectOption('64');await settle();await record(`${width}-scale64`,measurement);
 const anchor=measurement.spans.flat()[4].point;
 for(let i=0;i<5;i++){f.phase=`${width}-zoom-${i+1}`;const p=await f.page.evaluate(p=>window.__studioScreenOf(p),anchor);assert.ok(p.every(Number.isFinite));await f.page.mouse.move(...p);await f.page.mouse.wheel(0,-280);await f.page.waitForTimeout(180);await record(`${width}-zoom-${i+1}`,measurement);}
 const full=await record(`${width}-zoom-density8`,measurement);
 await panel().getByLabel('Comb density').selectOption('2');await settle();
 const reduced=await record(`${width}-zoom-density2`,measurement,false);
 assert.deepEqual(reduced.tips,full.tips);
 assert.ok(reduced.segments.length<=2);
 assert.ok(reduced.segments.every(line=>full.segments.some(segment=>segment.every((value,i)=>value===line[i]))));
 await panel().getByLabel('Comb density').selectOption('8');await settle();
 await panel().getByLabel('Comb scale (mm²)').selectOption('4');await settle();await record(`${width}-scale4-after-zoom`,measurement);
 await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();await record(`${width}-framed`,measurement);
 await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();await record(`${width}-perspective-control`,measurement,true);
 assert.deepEqual((await f.inspect(`${width}-native-after`,g2)).curve,measurement);
}});
