import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/files/StepExportPanel.tsx', 'apps/cad-studio/src/ui/EdgeContinuity.tsx', 'apps/cad-studio/src/ui/continuityRecovery.ts'];
const f = await createFlow({ name: 'step-continuity-help', output: process.argv[2], envFrozen: 'STEP_CONTINUITY_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Actual Circular and G2 STEP download/Open retains geometry but explains native continuity inspection limits.', limits: ['Desktop Studio exporter/importer only; no external STEP reader, other models or assistive devices.'],
 inspectorSource: `import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { readEdgeContinuity } from '@barocss/cad-model/engine/edgeContinuity';
import { checkBrep, brepMassProperties } from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{key,brep}]=partBreps(doc);
const list=readEdgeContinuity(doc,key,{kind:'list'});
if (!('edges' in list)) throw Error('missing edges');
const rows=list.edges.filter(row=>{const edge=brep.edges.find(e=>e.id===row.id)!;return edge.vertices.map(id=>brep.vertices.find(v=>v.id===id)!.point).every(p=>Math.abs(p[1]-2)<1e-7&&Math.abs(p[2]-20)<1e-7);}).map(row=>({...row,read:readEdgeContinuity(doc,key,{kind:'measure',edgeId:row.id,curvature:true})}));
console.log(JSON.stringify({valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,rows}));` });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
async function selectBody() {
 await button('Top', f.page.locator('.views')).click();
 if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
 const filter=button('Selection filter'); for(let i=0;i<6 && !(await filter.innerText()).includes('Bodies');i++) await filter.click();
 await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const point=await f.page.evaluate(()=>window.__studioScreenOf([15,6,20])); await f.page.mouse.click(...point);
 await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===1);
 await button('Inspect native joints').click();
}
await f.run(async()=>{
 for(const width of [1024,1440]) for(const kind of ['circular','g2']) {
  await f.newPage(); await f.page.setViewportSize({width,height:900});
  const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
   {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]}, {id:'n1',kind:'extrude',sketch:0,height:20},
   {id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:2,...(kind==='g2'?{section:{kind:'g2',tension:.5}}:{})}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
  const label=kind+'-'+width;
  await f.openFile({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},3);
  const native=await f.inspect('native-'+label,doc); assert.ok(native.valid); assert.equal(native.rows.length,kind==='g2'?3:1);
  assert.ok(native.rows.every(r=>r.read.measurement.status==='measured'));
  const saved=await f.save('original-'+label);
  if (!(await button('Export STEP').count())) await button('More tools').click();
  await button('Export STEP').or(f.page.getByRole('menuitem', {name:'Export STEP',exact:true})).click(); const panel=f.page.getByRole('region',{name:'STEP export',exact:true});
  await panel.getByLabel('STEP continuity inspection').waitFor(); assert.match(await panel.innerText(),/original .bcad/);
  assert.equal(((await panel.innerText()).match(/history/gi)??[]).length,1); await f.same(doc); await f.snapshot('export-'+label);
  const downloadPromise=f.page.waitForEvent('download'); await button('Export',panel).click(); const download=await downloadPromise;
  const file=join(process.argv[2],label+'.step'); await download.saveAs(file); await f.openFile(file,1); const imported=await f.doc();
  const read=await f.inspect('import-'+label,imported); assert.ok(read.valid); assert.equal(read.rows.length,native.rows.length); assert.ok(Math.abs(read.volume-native.volume)<1e-5);
  assert.ok(read.rows.every(r=>r.read.measurement.status==='unsupported'&&r.read.measurement.reason==='missing-pcurve'));
  await selectBody(); const region=f.page.getByRole('region',{name:'Edge continuity',exact:true});
  for(const row of read.rows) {
   await region.getByLabel('Native shared edge').selectOption(row.id); await button('Measure continuity',region).click();
   await region.getByText(/If this model came from STEP/).waitFor(); assert.equal(await region.getByText(/If this model came from STEP/).count(),1);
   assert.equal(await button('Measure continuity',region).isDisabled(),true); await f.same(imported);
  }
  await f.snapshot('import-refusal-'+label);
  await f.openFile(saved.file,3); await f.same(doc); await selectBody();
  const recovery=f.page.getByRole('region',{name:'Edge continuity',exact:true}); await recovery.getByLabel('Native shared edge').selectOption(native.rows[0].id); await button('Measure continuity',recovery).click();
  await recovery.locator('[data-continuity-angle]').waitFor(); assert.equal(await recovery.getByText(/If this model came from STEP/).count(),0); await f.same(doc);
  f.report.observations.push({label,volume:native.volume,topInterfaces:read.rows.length});
 }
});
