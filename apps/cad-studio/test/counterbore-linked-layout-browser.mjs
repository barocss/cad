import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const f = await createFlow({ name: 'counterbore-linked-layout', output: process.argv[2], envFrozen: 'COUNTERBORE_LAYOUT_FROZEN', initialFiles: ['apps/cad-studio/test/counterbore-linked-layout-browser.mjs'], qualification: 'Explicit two-feature counterbore layout editing preserves independent cuts.', inspectorSource: `import {readFileSync} from 'node:fs'; import {checkBrep,massPropertiesOf} from '@barocss/cad'; import {partSnapshot} from '@barocss/cad-model/engine/part'; const [b]=partSnapshot(JSON.parse(readFileSync(process.argv[2],'utf8'))).outputs; console.log(JSON.stringify({valid:checkBrep(b.brep,{strict:true}).valid,volume:massPropertiesOf(b).volume,solids:b.bodyCount}));`, limits: ['Numeric Z-axis circular and linear counterbore profiles; no provenance/schema migration or automatic linking.'] });
f.hud = () => f.page.locator('.hud');
const stock = pattern => ({ format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 40] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 12 },
  { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, center: 'about' in pattern ? [28, 20] : [8, 12], radius: 2, face: 'n1.top', pattern },
  { id: 'n3', kind: 'hole', parent: { node: 2, side: 'solid' }, center: 'about' in pattern ? [28, 20] : [8, 12], radius: 3, depth: 3, face: 'n1.top', pattern },
], outputs: { b3: { node: 3, side: 'solid' } }, nextId: 4 });
const field = name => f.editor().getByLabel(name, { exact: true });
await f.run(async () => {

  for (const [pattern, label, value] of [[{ count: 4, about: [20, 20] }, 'Copies', '2'], [{ count: 3, step: [10, 0] }, 'Step Y', '6']]) {
    await f.newPage();
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'counterbore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock(pattern))) });
    await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[3]?.kind === 'hole', null, { timeout: 30000 }); await f.ready();
    const original = await f.doc(); await f.openFeatureEditor(3);
    if (baseline) {
      await field(label).fill(value); const { doc: changed } = await f.applyEditor(original, label);
      assert.deepEqual(changed.nodes[2], original.nodes[2]); assert.notDeepEqual(changed.nodes[3].pattern, original.nodes[3].pattern);
      await f.undo(); await f.same(original); await f.redo(); await f.same(changed);
      f.report.observations.push({ label, baselineUnlinkedChange: true }); continue;
    }
    const shared = () => f.editor().getByRole('button', { name: 'Edit shared layout…', exact: true });
    const hudField = name => f.hud().getByLabel(name, { exact: true });
    const preview = () => f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview', null, { timeout: 30000 });
    const undoBefore=await f.page.getByRole('button',{name:'Undo',exact:true}).isEnabled();
    await shared().click(); await f.hud().waitFor(); await preview();
    await f.hud().getByRole('button',{name:'Apply',exact:true}).click();await f.hud().waitFor({state:'hidden'});await f.same(original);assert.equal(await f.page.getByRole('button',{name:'Undo',exact:true}).isEnabled(),undoBefore);
    await f.openFeatureEditor(3);await shared().click();await f.hud().waitFor();await preview();
    await hudField(label).fill(value); await preview(); await f.same(original);
    await f.snapshot(label + '-preview');
    await f.hud().getByRole('button', { name: 'Cancel', exact: true }).click(); await f.same(original);
    await f.openFeatureEditor(3); await shared().click(); await f.hud().waitFor(); await preview();
    await hudField(label).fill(value); await preview(); await f.page.keyboard.press('Escape'); await f.hud().waitFor({state:'hidden'}); await f.same(original);
    await f.openFeatureEditor(3); await shared().click(); await f.hud().waitFor(); await preview();
    if ('step' in pattern) {
      await hudField('Step X').fill('5'); await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'refused', null, { timeout: 30000 }); await f.same(original);
      await hudField('Step X').fill('10'); await preview();
    }
    await hudField(label).fill(value); await preview();
    if ('about' in pattern) { await hudField('Circle centre X').fill('17'); await preview(); await hudField('Circle centre Y').fill('17'); await preview(); }
    await f.hud().getByRole('button', { name: 'Apply', exact: true }).click(); await f.changed(original); await f.hud().waitFor({state:'hidden'});
    const revised=await f.doc(); const expectedPattern='about' in pattern ? {count:2,about:[17,17]} : {count:3,step:[10,6]};
    assert.deepEqual(revised,{...original,nodes:original.nodes.map((n,i)=>i===2||i===3?{...n,pattern:expectedPattern}:n)});
    const native=await f.inspect(label+'-paired',revised);assert.ok(native.valid&&native.solids===1);assert.ok(Math.abs(native.volume-(19200-expectedPattern.count*Math.PI*63))<1e-6);
    await f.snapshot(label+'-paired'); await f.undo();await f.same(original);await f.redo();await f.same(revised);
    await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'paired-reopen.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(revised))});
    await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.[3]?.kind==='hole',null,{timeout:30000});await f.ready();assert.deepEqual(await f.doc(),revised);
    await f.openFeatureEditor(3);await field('Diameter').fill('7');const independent=(await f.applyEditor(revised,label+'-independent')).doc;assert.deepEqual(independent.nodes[2],revised.nodes[2]);assert.equal(independent.nodes[3].radius,3.5);await f.undo();await f.same(revised);
    await f.openFeatureEditor(3);await shared().click();await f.hud().waitFor();await preview();await hudField('Centre X').fill('9');await preview();
    await f.page.getByRole('button',{name:'New part',exact:true}).click();
    await f.page.getByRole('dialog',{name:'Discard feature changes?',exact:true}).getByRole('button',{name:'Discard changes',exact:true}).click();
    await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.length===0,null,{timeout:30000});await f.ready();await f.hud().waitFor({state:'hidden'});await f.snapshot(label+'-replacement-retained');assert.equal((await f.doc()).nodes.length,0);
    f.report.observations.push({label,pairedPreviewCancelApply:true,undoRedoJsonReopen:true,independentEditingRetained:true,native});
  }
  assert.deepEqual(f.report.downloads, []);
});
