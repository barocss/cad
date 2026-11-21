import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const combined = process.argv.includes('--combined');
const expectRefused = process.argv.includes('--expect-refused');
assert.ok(!expectRefused || combined);
const pins = [
  'apps/cad-studio/test/fixed-span-hole-spacing-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/app/patternHoleSpacing.ts',
  'apps/cad-studio/src/state/historyFeatureApply.ts',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'fixed-span-hole-spacing', output: process.argv[2],
  envFrozen: 'FIXED_SPAN_HOLE_SPACING_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: combined ? 'Apply Count and Total span together with the exact terminal Hole, or observe the original refusal.' : 'Measure legacy terminal Hole ownership through Total span edits and invalid spacing controls.',
  limits: ['Schema 3 legacy simple Hole without signatures, opened through the real file UI. Modern signature-bearing creation is NOT_RUN.',
    'Independent fresh contexts: span 32 to 32.5 (original bore still fits), and 32 to 40 (original bore outside all copies). No product changes.'],
  snapshotExtra: () => ({ undoRedo: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`)?.disabled) }),
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {evaluateCadPart,checkOutput,checkBrep,faceGeometry,massPropertiesOf} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,valid:checkOutput(o).valid,strict:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),walls:o.brep.faces.filter(f=>f.name?.startsWith('n3.')).map(faceGeometry),tops:o.brep.faces.filter(f=>/^n1\\.top(?:@\\d+)?$/.test(f.name??'')).map(f=>[f.name,f.loops.length]).sort(([a],[b])=>a.localeCompare(b))}))));
`,
});
const ref = node => ({ node, side: 'solid' });
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [50, 10], max: [54, 16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'linear-span-pattern', parent: ref(1), axis: 'x', span: 32, count: 3 },
    { id: 'n3', kind: 'hole', parent: ref(2), radius: 1, center: [84, 13], face: 'n1.top@2' },
  ], outputs: { b3: ref(3) }, nextId: 4,
};
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-7, `${a} versus ${b}`);
async function native(label, doc) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const n = rows[0], pattern = doc.nodes[2];
  const span = pattern.kind === 'linear-span-pattern' ? pattern.span : pattern.spacing * (pattern.count - 1);
  const x = doc.nodes[3].center[0];
  assert.equal(n.id, 'n3'); assert.equal(n.count, pattern.count); assert.equal(n.valid, true);
  assert.equal(n.strict.valid, true, JSON.stringify(n.strict));
  // These two bounded outcomes have independently known geometry. Do not infer a passing oracle from arbitrary native output.
  const hasBore = x >= 51 + span && x <= 53 + span;
  if (!hasBore) assert.ok(span === 40 && x === 84, 'Only the explicit large-span stale-centre control may have no bore');
  const tops = Array.from({length:pattern.count}, (_, index) =>
    [index ? `n1.top@${index}` : 'n1.top', hasBore && index === pattern.count - 1 ? 2 : 1]);
  assert.deepEqual(n.tops, tops);
  assert.equal(n.walls.length, hasBore ? 2 : 0);
  for (const wall of n.walls) {
    assert.equal(wall.kind, 'cylinder'); near(wall.r, 1);
    near(wall.c[0], x); near(wall.c[1], 13);
    near(wall.a[0], 0); near(wall.a[1], 0); near(Math.abs(wall.a[2]), 1);
  }
  const stockVolume = 192 * pattern.count;
  const removed = hasBore ? 8 * Math.PI : 0, volume = stockVolume - removed;
  near(n.mass.volume, volume);
  near(n.mass.centroid[0], (stockVolume * (52 + span / 2) - removed * x) / volume);
  near(n.mass.centroid[1], 13); near(n.mass.centroid[2], 4);
  f.report.observations.push({ label, span, holeX: x, intendedHoleX: 52 + span, hasBore, native: n });
  await f.persist();
}
async function combinedRun(){
  f.phase='open the fixed-span pattern with its terminal Hole';
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name:'combined-span-history.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);await native('combined-original',source);
  await f.openFeatureEditor(2,'Fixed span Linear pattern');
  const field=name=>f.editor().getByRole('spinbutton',{name,exact:true});
  const edit=async(count,span)=>{
    await field('Count').fill(String(count));await field('Total span').fill(String(span));
  };
  const expected={...source,nodes:source.nodes.map((node,i)=>i===2?{...node,count:4,span:42}:
    i===3?{...node,center:[94,13],face:'n1.top@3'}:node)};
  if(expectRefused){
    await f.dismissToasts();const before=await f.snapshot('combined-before-original-refusal');
    await edit(4,42);
    await f.editor().getByRole('button',{name:'Apply',exact:true}).click();
    await f.editor().locator('.hud-error').waitFor();
    const refused=await f.snapshot('combined-original-refused');
    for(const key of ['doc','bodies','selection','history','undoRedo'])assert.deepEqual(refused[key],before[key],key);
    await f.same(source);return;
  }
  f.phase='apply both numeric edits in one History step';
  await edit(4,42);await f.same(source);
  await f.applyEditor(source,'combined-applied');await f.same(expected);
  await native('combined-applied-native',expected);
  await f.undo();await f.same(source);await native('combined-undo-native',source);
  await f.redo();await f.same(expected);await native('combined-redo-native',expected);
  const saved=await f.save('fixed-span-count-and-length');
  await f.freshOpen(saved.file,saved.doc,'combined-reopened');await f.same(expected);
  await native('combined-reopened-native',expected);
  await f.openFeatureEditor(2,'Fixed span Linear pattern');
  assert.equal(await field('Count').inputValue(),'4');
  assert.equal(await field('Total span').inputValue(),'42');
  await edit(3,32);
  await f.applyEditor(expected,'combined-reversed');await f.same(source);
  await native('combined-restored-native',source);
  const restored=await f.save('fixed-span-original-restored');
  await f.freshOpen(restored.file,restored.doc,'combined-original-reopened');
  await f.same(source);
}
await f.run(async () => {
  if(combined){await combinedRun();return;}
  for (const requested of [32.5, 40]) {
    const tag = requested === 32.5 ? 'small' : 'large';
    f.phase = `${tag}: fresh legacy file Open`;
    await f.newPage();
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: `${tag}-legacy-span.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    await f.same(source); await native(`${tag}-01-original-native`, source);
    await f.openFeatureEditor(2, 'Fixed span Linear pattern');
    const field = f.editor().getByRole('spinbutton', { name: 'Total span', exact: true });
    assert.equal(Number(await field.inputValue()), 32);
    await f.dismissToasts();
    const before = await f.snapshot(`${tag}-02-before`);
    await field.fill(String(requested)); await f.same(source);
    await f.snapshot(`${tag}-03-draft`);
    f.phase = `${tag}: observe Apply, without assuming acceptance`;
    await f.editor().getByRole('button', { name: 'Apply', exact: true }).click();
    await f.page.waitForFunction(original => JSON.stringify(window.__studioDoc) !== original ||
      !!document.querySelector('.node-editor .hud-error')?.textContent?.trim() || document.querySelectorAll('.toast').length > 0,
    JSON.stringify(source), { timeout: 60000 });
    await f.ready();
    const outcome = await f.snapshot(`${tag}-04-outcome`), current = await f.doc();
    const accepted = JSON.stringify(current) !== JSON.stringify(source);
    let classification = 'safe-refusal';
    if (accepted) {
      const x = current.nodes[3].center[0];
      assert.ok(x === 84 || x === 52 + requested, 'Unplanned centre: stop, do not weaken oracle');
      const expected = { ...source, nodes: source.nodes.map((node, i) => i === 2 ? { ...node, span: requested } : i === 3 ? { ...node, center: [x, 13] } : node) };
      assert.deepEqual(current, expected, 'Only span and optional copy-relative centre may change; IDs, face, outputs and source are exact');
      classification = x === 52 + requested ? 'accepted-copy-relative' : 'accepted-stale-world-centre';
    } else {
      assert.deepEqual(current, source); assert.deepEqual(outcome.history, before.history);
      assert.deepEqual(outcome.undoRedo, before.undoRedo);
      assert.ok(outcome.notices.length || await f.editor().locator('.hud-error').count(), 'Observable refusal required');
    }
    f.report.observations.push({ label: `${tag}-classification`, accepted, classification, requestedSpan: requested,
      expectedCopyRelativeCentre: [52 + requested, 13], storedSpan: current.nodes[2].span, storedCentre: current.nodes[3].center,
      notices: outcome.notices, editorError: await f.editor().locator('.hud-error').allTextContents(),
      intendedMotion: classification === 'accepted-copy-relative' ? 'PASS' : accepted ? 'FAIL' : 'NOT_APPLIED' });
    await f.persist();
    if (!baseline) {
      assert.equal(classification, 'accepted-copy-relative', 'Fixed mode requires successful copy-relative motion, not merely a safe refusal');
      assert.deepEqual(current.nodes[3].center, [52 + requested, 13]);
    }
    await f.closeEditor(); await f.same(current);
    await native(`${tag}-05-observed-native`, current);
    if (accepted) {
      await f.undo(); await f.same(source); await native(`${tag}-06-undo-native`, source);
      await f.redo(); await f.same(current); await native(`${tag}-07-redo-native`, current);
    }
    const saved = await f.save(`${tag}-fixed-span-observed`);
    await f.freshOpen(saved.file, saved.doc, `${tag}-08-reopened`); await f.same(current);
    await native(`${tag}-09-reopened-native`, current);
    await f.openFeatureEditor(2, 'Fixed span Linear pattern');
    assert.equal(Number(await f.editor().getByRole('spinbutton', { name: 'Total span', exact: true }).inputValue()), current.nodes[2].span);
    await f.snapshot(`${tag}-10-reopened-history`); await f.closeEditor();
  }
  if (!baseline) {
    f.phase = 'distance mode round trip from a fresh original';
    await f.newPage();
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'mode-original.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    await f.same(source); await native('mode-01-original-native', source);
    const { span: originalSpan, ...pattern } = source.nodes[2];
    assert.equal(originalSpan, 32);
    const spacingDoc = { ...source, nodes: source.nodes.map((node, i) => i === 2
      ? { ...pattern, kind: 'linear-pattern', spacing: 16 } : node) };
    let previous = source;
    for (const [mode, expected] of [['spacing', spacingDoc], ['span', source]]) {
      await f.openFeatureEditor(2, 'Linear pattern distance mode');
      await f.editor().getByLabel('Distance mode', { exact: true }).selectOption(mode);
      const label = mode === 'spacing' ? 'Spacing' : 'Total span';
      assert.equal(Number(await f.editor().getByRole('spinbutton', { name: label, exact: true }).inputValue()), mode === 'spacing' ? 16 : 32);
      assert.equal(Number(await f.editor().getByRole('spinbutton', { name: 'Count', exact: true }).inputValue()), 3);
      await f.same(previous);
      const applied = await f.applyEditor(previous, `mode-${mode}-applied`);
      assert.deepEqual(applied.doc, expected, 'Distance representation only; original Hole and all source nodes remain exact');
      const accepted = applied.doc;
      await native(`mode-${mode}-native`, accepted);
      await f.undo(); await f.same(previous); await native(`mode-${mode}-undo-native`, previous);
      await f.redo(); await f.same(accepted); await native(`mode-${mode}-redo-native`, accepted);
      const saved = await f.save(`mode-${mode}`);
      await f.freshOpen(saved.file, saved.doc, `mode-${mode}-reopened`);
      await f.same(accepted); await native(`mode-${mode}-reopened-native`, accepted);
      await f.openFeatureEditor(2, 'Saved distance mode');
      assert.equal(await f.editor().getByLabel('Distance mode', { exact: true }).inputValue(), mode);
      assert.equal(Number(await f.editor().getByRole('spinbutton', { name: label, exact: true }).inputValue()), mode === 'spacing' ? 16 : 32);
      await f.snapshot(`mode-${mode}-saved-history`); await f.closeEditor();
      previous = accepted;
    }
    for (const control of [{ tag: 'overlap', span: 4 }, { tag: 'mixed-overlap', span: 12, count: 4 }]) {
      f.phase = `${control.tag}: fresh original and atomic refusal`;
      await f.newPage();
      await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: `${control.tag}-original.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
      await f.same(source); await native(`${control.tag}-01-original-native`, source);
      await f.openFeatureEditor(2, 'Fixed span Linear pattern'); await f.dismissToasts();
      const before = await f.snapshot(`${control.tag}-02-before`);
      await f.editor().getByRole('spinbutton', { name: 'Total span', exact: true }).fill(String(control.span));
      if (control.count !== undefined) await f.editor().getByRole('spinbutton', { name: 'Count', exact: true }).fill(String(control.count));
      await f.same(source); await f.snapshot(`${control.tag}-03-draft`);
      await f.editor().getByRole('button', { name: 'Apply', exact: true }).click();
      await f.page.waitForFunction(original => JSON.stringify(window.__studioDoc) !== original ||
        !!document.querySelector('.node-editor .hud-error')?.textContent?.trim() || document.querySelectorAll('.toast').length > 0,
      JSON.stringify(source), { timeout: 60000 });
      await f.ready();
      const refused = await f.snapshot(`${control.tag}-04-refused`);
      assert.deepEqual(await f.doc(), source, 'Invalid draft must not commit any node, source, output or ID change');
      assert.deepEqual(refused.history, before.history);
      assert.deepEqual(refused.undoRedo, before.undoRedo);
      const errors = await f.editor().locator('.hud-error').allTextContents();
      assert.ok(errors.some(text => text.trim()) || refused.notices.length, 'Refusal must have visible evidence');
      f.report.observations.push({ label: `${control.tag}-atomic-refusal`, requested: control, errors, notices: refused.notices });
      await f.persist(); await f.closeEditor(); await f.same(source);
      await native(`${control.tag}-05-cancel-native`, source);
      const saved = await f.save(`${control.tag}-preserved`);
      await f.freshOpen(saved.file, saved.doc, `${control.tag}-06-reopened`);
      await f.same(source); await native(`${control.tag}-07-reopened-native`, source);
    }
  }
});
