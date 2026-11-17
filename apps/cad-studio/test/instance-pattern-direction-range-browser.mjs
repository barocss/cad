import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'instance-pattern-direction-range',envFrozen:'PATTERN_RANGE_FROZEN',output:process.argv[2],qualification:'Finite extreme direction magnitudes keep the same unit spacing in the real Studio.',initialFiles:['apps/cad-studio/test/instance-pattern-direction-range-browser.mjs','packages/barocss-cad-model/src/assembly/patterns.ts'],limits:['Linear equal-components direction at MAX_VALUE and MIN_VALUE. Circular extreme directions are Model-tested separately. No new general geometry-accuracy or exchange-output claim.']});
const panel=()=>f.page.getByRole('complementary',{name:'Instance',exact:true});
const form=()=>panel().getByRole('group',{name:'Instance pattern',exact:true});
async function seed(){await f.page.locator('[data-browser-instance-path="cube"]').click();await panel().waitFor();}
async function direction(n){for(const a of ['X','Y','Z'])await form().getByLabel(`Pattern direction ${a}`).fill(String(n));}
async function check(n,label){const d=await f.doc(),p=d.instancePatterns[0];assert.deepEqual(p.dir,[n,n,n]);const c=d.instances.filter(i=>i.pattern);assert.equal(c.length,2);c.forEach((i,k)=>i.position.forEach(v=>assert.ok(Math.abs(v-10*(k+1))<1e-10)));f.report.observations.push({label,direction:p.dir,positions:c.map(i=>i.position)});return d;}
await f.run(async()=>{
 await f.newPage();await f.openFile(join(import.meta.dirname,'fixtures/instance-pattern.bcad'),2);await seed();const before=await f.doc();await panel().getByRole('button',{name:'Pattern…',exact:true}).click();await form().getByLabel('Pattern spacing').fill(String(10*Math.sqrt(3)));await form().getByLabel('Pattern axis').selectOption('Custom');await direction(Number.MAX_VALUE);await form().getByRole('button',{name:'Make pattern',exact:true}).click();await f.changed(before);const large=await check(Number.MAX_VALUE,'large');await f.snapshot('01-large-direction');
 await direction(Number.MIN_VALUE);await form().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(large);const small=await check(Number.MIN_VALUE,'small');await f.undo();await f.same(large);await f.redo();await f.same(small);
 const saved=await f.save('extreme-pattern-direction');await f.freshOpen(saved.file,saved.doc,'02-fresh-open');await check(Number.MIN_VALUE,'fresh-open');await seed();await f.snapshot('03-small-direction-reopened');assert.deepEqual((await f.doc()).nodes,before.nodes);
});
