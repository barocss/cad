import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
const pins = ['apps/cad-studio/test/photo-draft-step-browser.mjs', 'apps/cad-studio/src/files/useModelExports.ts', 'apps/cad-studio/src/files/stepExportPreparation.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts', 'packages/barocss-cad/src/io/step.ts', 'packages/barocss-cad/src/io/step-import.ts'];
const f = await createFlow({
  name:'photo-draft-step', output:process.argv[2], envFrozen:'PHOTO_DRAFT_STEP_FROZEN', initialFiles:pins, requiredFrozen:pins,
  qualification:'Export four accepted placed parts through the actual Studio UI and read their world geometry from STEP bytes.',
  limits:['Exact AP214, the edited synthetic assembly, and the existing native STEP reader.'],
  inspectorSource:`
import { readFileSync } from 'node:fs';
import { splitBodies } from '../../packages/barocss-cad/src/part/part-model.ts';
import { brepBounds } from '../../packages/barocss-cad/src/brep/brep-bounds.ts';
import { importStep, checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
const {step} = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const root = importStep(step);
console.log(JSON.stringify(splitBodies(root).map(brep => ({ valid:checkBrep(brep,{strict:true}).valid,
  closed:brep.shells.every(x=>x.closed), volume:brepMassProperties(brep,1).volume, bounds:brepBounds(brep),
  rings:brep.faces.map(faceGeometry).filter(g=>g.kind==='cylinder').map(g=>({radius:g.r, axis:g.a, outward:g.out})) })).sort((a,b)=>b.volume-a.volume)));
`,
});
await f.run(async()=>{
  const file=process.argv[3], doc=JSON.parse(await readFile(file,'utf8'));
  await f.freshOpen(file,doc,'01-source');
  const btn=(name,within=f.page)=>within.getByRole('button',{name,exact:true});
  const frame=()=>f.page.getByTitle('Frame all (F)',{exact:true}).click();
  const view=async name=>{await btn(name,f.page.locator('.views')).click(); await frame();};
  await btn('Ortho').click();
  await f.page.waitForFunction(()=>window.__studioCamera().ortho===true);
  await view('Front'); await f.snapshot('02-front-ortho');
  await view('Right'); await f.snapshot('03-right-ortho');
  await view('Iso');
  const direct=btn('Export STEP');
  if(await direct.isVisible()) await direct.click();
  else { await btn('More tools').click(); await f.page.getByRole('menuitem',{name:'Export STEP',exact:true}).click(); }
  const panel=f.page.getByRole('region',{name:'STEP export',exact:true});
  const included=panel.getByLabel('STEP included bodies',{exact:true});
  await included.waitFor();
  assert.match(await included.innerText(),/4 output bodies/);
  assert.match(await panel.getByLabel('STEP loss report',{exact:true}).innerText(),/Native feature history is not included/);
  await f.snapshot('04-export-scope');
  const [download]=await Promise.all([f.page.waitForEvent('download'),btn('Export',panel).click()]);
  const exported=join(f.output,'photo-draft.step');
  await download.saveAs(exported);
  const step=await readFile(exported,'utf8');
  const statements = new Map([...step.matchAll(/^#(\d+)=(.*);$/gm)].map(([, id, statement]) => [id, statement]));
  const representations = [...statements.values()].filter(statement => statement.startsWith('ADVANCED_BREP_SHAPE_REPRESENTATION('));
  assert.equal(representations.length, 1);
  const contextId = /,#(\d+)\)$/.exec(representations[0])?.[1];
  assert.ok(contextId);
  const units = /GLOBAL_UNIT_ASSIGNED_CONTEXT\(\(([^)]+)\)\)/.exec(statements.get(contextId) ?? '')?.[1];
  assert.ok(units);
  const lengthUnits = units.split(',').map(ref => statements.get(ref.trim().slice(1))).filter(statement => statement?.startsWith('(LENGTH_UNIT()'));
  assert.equal(lengthUnits.length, 1);
  assert.match(lengthUnits[0], /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
  const actual=await f.inspect('05-step-native-read',{step});
  const expected=doc.instances.map((inst,i)=>{
    const [sketch,extrude]=inst.doc.nodes,[x,y,z]=inst.position;
    if(i===0){
      const r=sketch.radius,inner=sketch.holes[0][0].start[0],depth=extrude.height;
      return {volume:Math.PI*(r*r-inner*inner)*depth,min:[x-r,y-depth,z-r],max:[x+r,y,z+r],inner,r};
    }
    const [x0,y0]=sketch.min,[x1,y1]=sketch.max,h=extrude.height;
    return {volume:(x1-x0)*(y1-y0)*h,min:[x+x0,y+y0,z],max:[x+x1,y+y1,z+h]};
  }).sort((a,b)=>b.volume-a.volume);
  assert.equal(actual.length,4);
  const close=(a,b,tol)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
  for(const [i,body] of actual.entries()){
    const want=expected[i];
    assert.deepEqual([body.valid,body.closed],[true,true]);
    close(body.volume,want.volume,1e-5);
    body.bounds.min.forEach((v,k)=>close(v,want.min[k],1e-6));
    body.bounds.max.forEach((v,k)=>close(v,want.max[k],1e-6));
    if(i===0){
      assert.ok(body.rings.some(g=>Math.abs(g.radius-want.r)<1e-8&&g.outward===1));
      assert.ok(body.rings.some(g=>Math.abs(g.radius-want.inner)<1e-8&&g.outward===-1));
      for(const ring of body.rings){close(Math.abs(ring.axis[1]),1,1e-9);}
    }
  }
  const [head, handle, cap, button] = actual.map(body => body.bounds);
  const separation = (a, b, axis) => Math.max(a.min[axis], b.min[axis]) - Math.min(a.max[axis], b.max[axis]);
  const buttonEngagement = -separation(handle, button, 1), buttonProtrusion = button.max[1] - handle.max[1];
  assert.ok(buttonEngagement > 0 && buttonProtrusion > 0);
  assert.ok(separation(handle, button, 0) < 0 && separation(handle, button, 2) < 0);
  const handleSample = [(handle.min[0] + handle.max[0]) / 2, (handle.min[1] + handle.max[1]) / 2, head.min[2] + 2];
  assert.ok(handleSample.every((value, axis) => value > handle.min[axis] && value < handle.max[axis]));
  assert.ok(handleSample[1] > head.min[1] && handleSample[1] < head.max[1]);
  const station = (head.min[2] + head.max[2]) / 2, radius = Math.hypot(handleSample[0], handleSample[2] - station);
  assert.ok(radius > expected[0].inner && radius < expected[0].r);
  const filterGap = separation(handle, cap, 2);
  assert.ok(filterGap > 0 && filterGap < .1);
  for (const [a, b] of [[head, cap], [head, button], [cap, button]]) assert.ok(separation(a, b, 2) > 0);
  await f.same(doc);
  f.report.observations.push({ imported: actual, hash: sha256(step), bytes: Buffer.byteLength(step), buttonEngagement, buttonProtrusion, filterGap });
});
