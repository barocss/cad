import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'polygon',points:[[0,0],[40,0],[20,20]]},{id:'n1',kind:'extrude',sketch:0,height:6}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const f=await createFlow({name:'drawing-angle-preview-fill',envFrozen:'ANGLE_PREVIEW_FROZEN',output:process.argv[2],qualification:'45 and 135 degree preview unfilled arc and retained arrows/text',initialFiles:[import.meta.filename,'apps/cad-studio/src/drawing/drawing.css'],requiredFrozen:['apps/cad-studio/src/ui/DrawingWorkspace.tsx'],limits:['Triangle Top drawing, desktop Chrome; no PDF or alternate renderer qualification.'],snapshotExtra:()=>({drawing:window.__studioDrawing?.()})});
await f.run(async()=>{
 for(const width of [1440,1024]) for(const [angle,at] of [[45,[14,4]],[135,[0,14]]]){
  await f.newPage();await f.page.setViewportSize({width,height:900});
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'triangle.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
  await f.page.getByRole('button',{name:'Drawing',exact:true}).click();await f.page.waitForFunction(()=>!!window.__studioDrawingAt?.('top',0,0));
  await f.page.getByRole('button',{name:'Angle',exact:true}).click();
  const point=async p=>f.page.evaluate(([u,v])=>window.__studioDrawingAt('top',u,v),p);
  const click=async p=>{const q=await point(p);await f.page.mouse.click(q.x,q.y);};
  await click([20,0]);await click([10,10]);const q=await point(at);await f.page.mouse.move(q.x,q.y);
  const group=f.page.locator('.dw-preview').filter({has:f.page.locator('text')});await group.waitFor();
  const info=await group.evaluate(el=>({text:el.querySelector('text')?.textContent,paths:[...el.querySelectorAll('path')].map(p=>({d:p.getAttribute('d'),fill:getComputedStyle(p).fill,attr:p.getAttribute('fill')})),textFill:getComputedStyle(el.querySelector('text')).fill}));
  f.report.observations.push({width,angle,...info});await f.snapshot(`${width}-preview-${angle}`);
  assert.equal(parseFloat(info.text),angle);assert.ok(info.paths.some(p=>p.attr==='#000'&&p.fill!=='none'),'arrowheads remain filled');
  const arcs=info.paths.filter(p=>p.d.includes('A'));assert.ok(arcs.length);for(const arc of arcs)assert.equal(arc.fill,'none');assert.notEqual(info.textFill,'none');
  await f.page.mouse.click(q.x,q.y);await f.page.waitForFunction(n=>window.__studioDrawing?.().dimensions.some(d=>d.value===n),angle);
  const applied=await f.page.locator('g.dimension').last().evaluate(el=>({text:el.querySelector('text')?.textContent,arcs:[...el.querySelectorAll('path')].filter(p=>p.getAttribute('d').includes('A')).map(p=>({d:p.getAttribute('d'),fill:getComputedStyle(p).fill}))}));
  assert.equal(parseFloat(applied.text),angle);assert.deepEqual(applied.arcs.map(p=>p.d),arcs.map(p=>p.d));assert.ok(applied.arcs.every(p=>p.fill==='none'));await f.snapshot(`${width}-applied-${angle}`);
 }
});
