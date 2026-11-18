import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const f=await createFlow({name:'fillet-remove-seed-chain',output:process.argv[2],envFrozen:'FILLET_REMOVE_SEED_CHAIN_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/fillet-remove-seed-chain-browser.mjs','apps/cad-studio/src/ui/FilletPickedEdges.tsx','apps/cad-studio/src/App.tsx','packages/barocss-cad-model/src/app/edgeChain.ts','apps/cad-studio/src/state/useCommandPreview.ts','apps/cad-studio/src/ui/Hud.tsx'],qualification:'Remove the initially picked top seed while keeping the bottom tangent chain at unchanged R1.5; actual UI and independent native scope.',limits:['Stadium prism, Circular constant R1.5,1024x900. STEP seam and varying-radius support are not claimed.'],inspectorSource:`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf, revolutionOf } from '@barocss/cad';
import { emptyDoc, rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { bodyMesh } from '@barocss/cad-model/engine/mesh';
import { partSnapshot } from '@barocss/cad-model/engine/part';
if (process.argv[3] === '"seed"') {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'loop', sideTags: { outer: ['e1','e2','e3','e4'] },
    segments: [
      { kind: 'line', start: [0,-4] },
      { kind: 'arc', start: [20,-4], center: [20,0], direction: 'ccw' },
      { kind: 'line', start: [20,4] },
      { kind: 'arc', start: [0,4], center: [0,0], direction: 'ccw' },
    ],
  });
  console.log(JSON.stringify(withNode(sketch, { kind: 'extrude', sketch: 0, height: 6 })));
  process.exit(0);
}
if (process.argv[3] === '"box"') {
  console.log(JSON.stringify(rectanglePart(40, 30, 10)));
  process.exit(0);
}
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc);
assert.equal(outputs.length, 1);
const [output] = outputs, { brep } = output;
const check = checkBrep(brep, { strict: true });
assert.ok(check.valid, JSON.stringify(check.issues));
assert.deepEqual(brep.bodies.map(body => body.kind), ['solid']);
assert.equal(brep.shells.length, 1);
assert.ok(brep.shells[0].closed);
const mesh = bodyMesh(brep, 0);
console.log(JSON.stringify({
  mass: massPropertiesOf(output),
  nativeTargets: output.filletTargets,
  vertices: brep.vertices.map(vertex => vertex.point),
  faces: brep.faces.map(face => ({
    name: face.name, geometry: faceGeometry(face),
    ...(face.name?.startsWith('n2.face') && face.surface.kind === 'surface' ? { revolution: revolutionOf(face.surface, 100) } : {}),
  })),
  edges: brep.edges.map(edge => edge.name),
  displayEdges: mesh.edges.map(({ index, a, b, names, straight }) => ({ index, a, b, names, straight })),
}));
`});

const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b,t)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`);
const r=1.5,A=160+16*Math.PI,P=40+8*Math.PI;
const ca=1-Math.PI/4,fm=5/6-Math.PI/4,mm=19/24-Math.PI/4;
const removed=P*r*r*ca-2*Math.PI*r*r*r*fm;
const volume=6*A-removed,bottomMoment=P*r**3*fm-2*Math.PI*r**4*mm;
const cz=(18*A-bottomMoment)/volume;
async function scope(hud,picked,added){
 const expected=[['Picked native edges',[...picked].sort()],['Tangent edges added',[...added].sort()]];
 // A previous preview can still be displayed: wait for this request's exact scope.
 await f.page.waitForFunction(expected=>{
  const group=document.querySelector('[role="dialog"][aria-label="Fillet"] [role="group"][aria-label="Fillet scope"]');
  if(!group)return false;
  return expected.every(([label,names])=>{
   const row=[...group.querySelectorAll('.field')].find(row=>row.firstElementChild?.textContent===label);
   const value=row?.querySelector('span[title]');
   return value?.textContent===String(names.length)&&JSON.stringify(value.getAttribute('title').split('\n').filter(Boolean).sort())===JSON.stringify(names);
  });
 },expected,{timeout:15000,polling:50});
 const group=hud.getByRole('group',{name:'Fillet scope',exact:true});
 for(const [label,names] of expected){
  const field=group.locator('.field').filter({hasText:label}).locator('span[title]');
  assert.equal(await field.innerText(),String(names.length));
  assert.deepEqual((await field.getAttribute('title')).split('\n').filter(Boolean).sort(),names);
 }
}
await f.run(async()=>{
 const seed=await f.inspect('seed',{},'seed');await f.newPage();await f.page.setViewportSize({width:1024,height:900});await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'remove-original-top-seed.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
 const stock=await f.inspect('01-source-native',seed);
 const top=stock.displayEdges.filter(e=>e.a[2]===6&&e.b[2]===6&&e.names.some(n=>n.split('|').includes('n1.top'))),bottom=stock.displayEdges.filter(e=>e.a[2]===0&&e.b[2]===0&&e.names.some(n=>n.split('|').includes('n1.bottom')));assert.equal(top.length,4);assert.equal(bottom.length,4);
 const topSeed=top.find(e=>e.straight&&e.a[1]===-4&&e.b[1]===-4),bottomSeed=bottom.find(e=>e.straight&&e.a[1]===-4&&e.b[1]===-4);assert.ok(topSeed&&bottomSeed);assert.equal(topSeed.names.length,1);assert.equal(bottomSeed.names.length,1);
 await button('Iso',f.page.locator('.views')).click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([10,-4,6]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Fillet');const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});const radius=hud.getByLabel('Radius',{exact:true});await radius.fill(String(r));const ready=()=>hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await ready();
 await scope(hud,topSeed.names,top.flatMap(e=>e.names).filter(n=>!topSeed.names.includes(n)));
 const position=await f.screenOf([10,-4,0]);await f.page.keyboard.down('Shift');try{await f.page.mouse.click(...position);}finally{await f.page.keyboard.up('Shift');}await ready();const both=[...topSeed.names,...bottomSeed.names];await scope(hud,both,[...top,...bottom].flatMap(e=>e.names).filter(n=>!both.includes(n)));await f.same(seed);await f.snapshot('02-both-chains');
 await hud.getByText('Edit picked edges',{exact:true}).click();await button('Remove '+topSeed.names.join(', '),hud).click();await ready();assert.equal(Number(await radius.inputValue()),r);
 await scope(hud,bottomSeed.names,bottom.flatMap(e=>e.names).filter(n=>!bottomSeed.names.includes(n)));await f.same(seed);await f.snapshot('03-bottom-only-preview');await button('Apply',hud).click();await f.changed(seed);await f.ready();const applied=await f.doc();assert.deepEqual(applied.nodes.slice(0,2),seed.nodes);assert.deepEqual(applied.nodes[2].edges,bottomSeed.names);assert.equal(applied.nodes[2].radius,r);
 async function verify(label){const n=await f.inspect(label,applied);near(n.mass.volume,volume,1e-7);n.mass.centroid.forEach((v,i)=>near(v,[10,0,cz][i],1e-8));const topNames=top.flatMap(e=>e.names),bottomNames=bottom.flatMap(e=>e.names);assert.ok(topNames.every(name=>n.edges.includes(name)));assert.ok(bottomNames.every(name=>!n.edges.includes(name)));assert.ok(Array.isArray(n.nativeTargets)&&n.nativeTargets.every(name=>typeof name==='string'));assert.deepEqual([...new Set(n.nativeTargets)].sort(),bottomNames.sort());
  const cylinders=n.faces.filter(face=>face.name?.startsWith('n2.face')&&face.geometry.kind==='cylinder'&&Math.abs(face.geometry.a[0])>.999999);assert.equal(cylinders.length,2);for(const face of cylinders){near(face.geometry.r,r,1e-8);near(Math.abs(face.geometry.c[1]),4-r,1e-8);near(face.geometry.c[2],r,1e-8);}const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,volume,1e-7);f.report.observations.push({label,volume:n.mass.volume,centroid:n.mass.centroid,expectedVolume:volume,expectedCentroid:[10,0,cz],stored:applied.nodes[2].edges,nativeTargets:n.nativeTargets,untouchedTop:topNames});}
 await verify('04-bottom-only-native');await f.undo();await f.same(seed);await f.redo();await f.same(applied);await verify('05-redo-native');const saved=await f.save('bottom-chain-original-seed-removed');await f.freshOpen(saved.file,saved.doc,'06-reopened');await f.same(applied);await verify('07-reopened-native');await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('08-final');
});
