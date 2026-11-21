import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/BodyBrowserRows.tsx',
  'apps/cad-studio/src/files/meshImportController.ts',
  'apps/cad-studio/test/body-browser-mesh-badges-browser.mjs',
  'apps/cad-studio/test/bench/mesh-fixtures.ts',
];
const f = await createFlow({
  name: 'body-browser-mesh-badges', output: process.argv[2], envFrozen: 'BODY_BROWSER_MESH_BADGES_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Exercise actual Browser repair and self-intersection badges, selection and mesh Save/Open.',
  limits: ['A sphere with a removed top cap and the existing two-shell intersection fixture. Desktop Chrome. No source-state injection.'],
  inspectorSource: `
import {encodeBinaryStl} from '@barocss/cad';
import {brokenVariants,organicTorus} from './test/bench/mesh-fixtures';
const kind=JSON.parse(process.argv[3]);
let positions,indices;
if(kind==='repair'){
  const n=24,m=12, p=[0,0,-10], i=[], at=(j,k)=>1+(j-1)*n+k%n;
  for(let j=1;j<m;j++){
    const phi=-Math.PI/2+Math.PI*j/m;
    for(let k=0;k<n;k++){
      const theta=2*Math.PI*k/n;
      p.push(10*Math.cos(phi)*Math.cos(theta),10*Math.cos(phi)*Math.sin(theta),10*Math.sin(phi));
    }
  }
  for(let k=0;k<n;k++)i.push(0,at(1,k+1),at(1,k));
  for(let j=1;j<m-1;j++)for(let k=0;k<n;k++)
    i.push(at(j,k),at(j,k+1),at(j+1,k+1),at(j,k),at(j+1,k+1),at(j+1,k));
  positions=p;indices=i;
}else{
  ({positions,indices}=brokenVariants(organicTorus(32,32)).find(f=>f.name==='broken-selfintersect'));
}
console.log(JSON.stringify(Buffer.from(encodeBinaryStl(positions,indices,kind)).toString('base64')));
`,
});
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const dialog = name => f.page.getByRole('dialog', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const selection = () => f.page.evaluate(() => window.__studioSelection.selection);
async function openMesh(kind) {
  const encoded = await f.inspect(`fixture-${kind}`, {}, kind);
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name: kind === 'repair' ? 'cup-with-open-top.stl' : 'intersecting-shells.stl',
    mimeType: 'model/stl', buffer: Buffer.from(encoded, 'base64'),
  });
  await button(dialog('Mesh units'), 'Open').click();
  const repair = dialog('Mesh repair');
  await repair.waitFor();
  return repair;
}
async function observeRepair(doc, label) {
  await button(browser(), 'Mesh repair').click();
  const repair = dialog('Mesh repair');
  await repair.waitFor();
  assert.ok(await repair.getByLabel('Coarser fill').isChecked());
  const picked = await selection();
  assert.ok(picked.faces.length > 0);
  assert.ok(picked.faces.every(face => face.body === 0));
  assert.deepEqual(picked.edges, []);
  await f.same(doc);
  await f.snapshot(label);
  await button(repair, 'Cancel').click();
  await f.same(doc);
  return picked;
}
async function observeCrossings(doc, label) {
  const badge = button(browser(), 'Mesh crossings');
  const count = await badge.count();
  assert.equal(count, doc.nodes[0].pieces ?? 1);
  const picks = [];
  for (let body = 0; body < count; body++) {
    await badge.nth(body).click();
    const picked = await selection();
    assert.deepEqual(picked, {
      faces: [], edges: [], bodies: [],
      vertices: doc.nodes[0].crossings.at.map(at => ({ body, at })),
    });
    picks.push(picked);
  }
  await f.same(doc);
  await f.snapshot(label);
  return picks;
}
await f.run(async () => {
  await f.newPage();
  f.phase = 'actual import, repair, fill badge and cancellation';
  const repair = await openMesh('repair');
  assert.match(await repair.innerText(), /1 hole/);
  assert.equal(await button(repair, 'Open as it is').count(), 0);
  await repair.getByLabel('Coarser fill').check();
  await button(repair, 'Check the repair').click();
  const report = repair.getByLabel('Repair report');
  await report.waitFor();
  assert.match(await report.innerText(), /1 hole filled[\s\S]*Closed/);
  await button(repair, 'Apply the repair').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes[0]?.repair?.report.holesFilled === 1);
  await f.ready();
  const repaired = await f.doc();
  const fill = await observeRepair(repaired, '01-repair-badge-and-fill');
  const [download] = await Promise.all([f.page.waitForEvent('download'), button(f.page, 'Save').click()]);
  const file = join(f.output, 'repaired-mesh.bcad');
  await download.saveAs(file);
  await f.newPage();
  await f.openFile(file, 1);
  await f.same(repaired);
  assert.deepEqual(await observeRepair(repaired, '02-reopened-repair-badge'), fill);

  f.phase = 'actual crossing diagnostics and per-row marker ownership';
  const warning = await openMesh('crossings');
  await button(warning, 'Open as it is').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes[0]?.crossings?.at?.length > 0);
  await f.ready();
  const intersecting = await f.doc();
  const picks = await observeCrossings(intersecting, '03-crossing-badge-and-markers');
  f.report.observations.push({ label: 'mesh-badge-records', repair: repaired.nodes[0].repair.report, fill, crossings: intersecting.nodes[0].crossings, picks });
  await f.persist();
});
