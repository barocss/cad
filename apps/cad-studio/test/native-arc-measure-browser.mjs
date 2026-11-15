import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/measure.ts','apps/cad-studio/src/ui/SelectionInspector.tsx'];
const f=await createFlow({name:'native-arc-measure',output:process.argv[2],envFrozen:'D1373_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'#150 native arc classification and visible selected-edge scope.',limits:['Ellipse12x6 Extrude6, two selected arc intervals; no full ellipse length claim.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{for(const width of[1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await button('New part').click();await f.ready();
 await f.page.getByLabel('Mode',{exact:true}).getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.sketchPanel().getByLabel('Sketch plane',{exact:true}).selectOption('xy');
 await f.tool('Ellipse','i');await f.frame([[0,0,0],[12,0,0],[0,6,0]]);for(const p of[[0,0,0],[12,0,0],[0,6,0]])await f.worldClick(p);
 await f.finishSketch(`${width}-ellipse-sketch`);const sketch=await f.doc();await f.openExtrudeHud();const accepted=(await f.applyExtrude({distance:6,previous:sketch,label:`${width}-ellipse`})).doc;
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
 for(const [label,p,radius] of [['major',[11.998387,0.098366,6],3],['minor',[0.196242,5.999198,6],24]]){
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(let i=0;i<3;i++){const pos=await f.page.evaluate(p=>window.__studioScreenOf(p),p);await f.page.mouse.move(...pos);await f.page.mouse.wheel(0,-450);await f.page.waitForTimeout(150);}
  const pixel=await f.page.evaluate(p=>window.__studioScreenOf(p),p);await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===1);
  const props=f.page.getByRole('complementary',{name:'Selection',exact:true});await props.getByText('Arc',{exact:true}).waitFor();await props.getByText('Selected arc segment · values describe this edge, not the whole source curve.',{exact:true}).waitFor();const row=props.locator('.kv').filter({hasText:/^Radius/});assert.ok(Math.abs(Number((await row.locator('b').innerText()).replace(' mm',''))-radius)<.1);await f.same(accepted);await f.snapshot(`${width}-${label}-arc`);
 }
}});
