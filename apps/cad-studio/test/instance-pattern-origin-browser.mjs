import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({ name: 'instance-pattern-origin', envFrozen: 'PATTERN_ORIGIN_FROZEN', output: process.argv[2], qualification: 'Circular instance patterns created and edited around an explicit nonzero axis origin, preserving source geometry and pattern identity.', initialFiles: ['apps/cad-studio/test/instance-pattern-origin-browser.mjs','apps/cad-studio/src/ui/InstancePattern.tsx','apps/cad-studio/test/fixtures/instance-pattern.bcad'], limits: ['Z-axis quarter turns, one cube seed and three occurrences. No non-rotate mode, schema change, nested patterns, mates or exchange exports. Placement oracle uses literal coordinates, not product rotation functions.'] });
const panel = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const form = () => panel().getByRole('group', { name: 'Instance pattern', exact: true });
async function pickSeed() { await f.page.locator('[data-browser-instance-path="cube"]').click(); await panel().waitFor(); }
const coord = a => form().getByLabel(`Pattern origin ${a}`, {exact:true});
async function check(origin, positions, label) {
  const doc = await f.doc(), p = doc.instancePatterns[0], seed = doc.instances.find(i=>i.id==='cube');
  assert.deepEqual(p.origin, origin); assert.deepEqual(p.axis,[0,0,1]); assert.equal(p.count,4); assert.equal(p.angle,90);
  const copies = doc.instances.filter(i=>i.pattern);
  assert.equal(copies.length,3);
  copies.forEach((i,k)=>{assert.equal(i.id,`${p.id}-${k+1}`);assert.deepEqual(i.position,positions[k]);assert.deepEqual(i.doc,seed.doc);assert.deepEqual(i.part,seed.part);assert.equal(i.grounded,true);});
  f.report.observations.push({label,origin,positions:copies.map(i=>i.position),stableIds:copies.map(i=>i.id)});return doc;
}
await f.run(async()=>{
  await f.newPage();await f.openFile(join(import.meta.dirname,'fixtures/instance-pattern.bcad'),2);await pickSeed();
  const x=panel().getByLabel('Instance X').first();await x.fill('50');await x.press('Enter');await f.ready();
  const before=await f.doc();await panel().getByRole('button',{name:'Pattern…',exact:true}).click();
  await form().getByLabel('Pattern kind').selectOption('circular');await form().getByLabel('Pattern count').fill('4');await form().getByLabel('Pattern angle').fill('90');await form().getByLabel('Pattern axis').selectOption('Z');
  for(const [a,v] of [['X','10'],['Y','20'],['Z','30']])await coord(a).fill(v);
  await form().getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await f.doc(),before);
  await panel().getByRole('button',{name:'Pattern…',exact:true}).click();await coord('X').fill('');
  await form().getByRole('button',{name:'Make pattern',exact:true}).click();await form().getByLabel('Pattern refused').waitFor();assert.deepEqual(await f.doc(),before);
  await coord('X').fill('10');await form().getByRole('button',{name:'Make pattern',exact:true}).click();await f.changed(before);
  const created=await check([10,20,30],[[30,60,0],[-30,40,0],[-10,-20,0]],'created');await f.snapshot('01-created-nonzero-origin');
  await coord('Y').fill('');await form().getByRole('button',{name:'Apply',exact:true}).click();await form().getByLabel('Pattern refused').waitFor();assert.deepEqual(await f.doc(),created);
  await coord('Y').fill('20');await coord('X').fill('20');await form().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(created);
  const edited=await check([20,20,30],[[40,50,0],[-10,40,0],[0,-10,0]],'edited');assert.deepEqual(edited.nodes,before.nodes);assert.deepEqual(edited.instances.find(i=>i.id==='cube'),created.instances.find(i=>i.id==='cube'));
  await f.undo();await f.same(created);await f.redo();await f.same(edited);await f.snapshot('02-edited-after-redo');
  const saved=await f.save('circular-pattern-origin');await f.freshOpen(saved.file,saved.doc,'03-fresh-open');await pickSeed();
  for(const[a,v]of[['X','20'],['Y','20'],['Z','30']])assert.equal(await coord(a).inputValue(),v);
  await check([20,20,30],[[40,50,0],[-10,40,0],[0,-10,0]],'fresh-open');
  await coord('X').fill('10');await form().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(edited);await check([10,20,30],[[30,60,0],[-30,40,0],[-10,-20,0]],'post-open-edit');await f.snapshot('04-post-open-edit');
});
