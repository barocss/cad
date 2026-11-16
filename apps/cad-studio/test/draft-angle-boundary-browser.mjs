import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/app/featureNumberInput.ts', 'apps/cad-studio/src/ui/HUD.tsx', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/importedFile.ts',
  'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/draftEdit.ts', 'packages/barocss-cad-model/src/app/draftInputs.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts'];
const f = await createFlow({
  name: 'draft-angle-boundary', output: process.argv[2], envFrozen: 'DRAFT_ANGLE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Validate exclusive Draft angle bounds and field recovery in creation and History.',
  limits: ['One locally generated STEP box. One planar side picked in the desktop viewport.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, exportStep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
if (process.argv[3] === '"step"') {
  const { outputs: [{ brep }] } = evaluateCadPart({
    format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
      { id: 'sketch', kind: 'sketch', profile: 'rectangle', min: [4, -3], max: [24, 7] },
      { id: 'box', kind: 'extrude', sketch: 'sketch', from: 6, height: 5 },
    ],
  });
  console.log(JSON.stringify(exportStep(brep, { timestamp: '2026-11-14T00:00:00Z' })));
} else {
  const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const { outputs: [body], outputs } = partSnapshot(doc);
  console.log(JSON.stringify({ outputs: outputs.length, solids: body.bodyCount,
    valid: checkBrep(body.brep, { strict: true }).valid,
    faces: body.brep.faces.map(face => face.name),
    volume: massPropertiesOf(body).volume, points: body.brep.vertices.map(vertex => vertex.point) }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const status = (hud, meaning) => hud.locator('.status').filter({ hasText: new RegExp('^' + meaning + '$') }).waitFor();
const near = (actual, expected) => Math.abs(actual - expected) <= 1e-6;
async function editor(index) {
  await f.openFeatureEditor(index, 'selected Draft');
  await button('Edit draft', f.editor()).click();
  const hud = f.page.getByRole('dialog', { name: 'Edit Draft', exact: true });
  await status(hud, 'preview');
  return hud;
}

async function verify(label, doc, dir, neutral, angle) {
  const native = await f.inspect(label, doc);
  const tangent = Math.tan(angle * Math.PI / 180);
  const sideAt = x => -3 + dir * (x - neutral) * tangent;
  const expected = 20 * 5 * (7 - sideAt(14));
  assert.ok(native.outputs === 1 && native.solids === 1 && native.valid, JSON.stringify(native));
  assert.ok(near(native.volume, expected), JSON.stringify({ actual: native.volume, expected, label }));
  for (const x of [4, 24]) for (const y of [sideAt(x), 7]) for (const z of [6, 11]) {
    assert.ok(native.points.some(point => point.every((value, axis) => near(value, [x, y, z][axis]))),
      JSON.stringify({ expected: [x, y, z], points: native.points }));
  }
  f.report.observations.push({ label, dir, neutral, angle, cornersY: [sideAt(4), sideAt(24)], volume: native.volume, expected });
}

async function refused(hud, before) {
  const angle = hud.getByLabel('Angle', {exact: true});
  for (const value of ['0', '-45', '45', '-46', '46', '']) {
    await angle.fill(value); await status(hud, 'refused');
    assert.equal(await angle.getAttribute('aria-invalid'), 'true');
    assert.equal(await angle.evaluate(el => el.checkValidity()), false);
    const id = await angle.getAttribute('aria-describedby');
    assert.match(await f.page.locator('#' + id).innerText(), /excluding 0°/);
    assert.equal(await button('Apply', hud).isEnabled(), false);
    assert.doesNotMatch(await hud.innerText(), /Invalid input|DRAFT_ANGLE/);
    await f.same(before);
  }
}
async function valid(hud, value) {
  const angle = hud.getByLabel('Angle', {exact: true});
  await angle.fill(value); await status(hud, 'preview');
  assert.equal(await angle.evaluate(el => el.checkValidity()), true);
  assert.notEqual(await angle.getAttribute('aria-invalid'), 'true');
  assert.equal(await button('Apply', hud).isEnabled(), true);
}
await f.run(async () => {
 const step = await f.inspect('step-fixture', {}, 'step');
 for (const width of [1024, 1440]) {
  f.phase = `${width} creation angle validation`;
  await f.newPage(); await f.page.setViewportSize({width,height:900});
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({name:'draft-angle.step',mimeType:'application/step',buffer:Buffer.from(step)});
  await f.waitToast(/STEP opened.*1 solid.*millimetres/); await f.ready();
  const source = await f.doc();
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const p = await f.page.evaluate(()=>window.__studioScreenOf([14,-3,8.5]));
  await f.page.mouse.click(...p); await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.length===1);
  await f.page.evaluate(()=>document.activeElement?.blur()); await f.command('Draft');
  const creation=f.page.getByRole('dialog',{name:'Draft',exact:true});
  await creation.getByLabel('Pull',{exact:true}).selectOption('x'); await status(creation,'preview');
  await refused(creation,source); await valid(creation,'-44.5');
  await f.snapshot(`${width}-valid-fraction`);
  await button('Apply',creation).click(); await f.changed(source); const made=await f.doc();
  const index=made.nodes.length-1; await verify(`${width}-created`,made,1,4,-44.5);
  const hud=await editor(index); await refused(hud,made);
  await f.snapshot(`${width}-angle-refused`); await valid(hud,'-44.25');
  await button('Apply',hud).click(); await f.changed(made); const edited=await f.doc();
  await verify(`${width}-edited`,edited,1,4,-44.25);
  await f.undo(); await f.same(made); await f.redo(); await f.same(edited);
  const saved=await f.save(`${width}-draft-angle`); await f.freshOpen(saved.file,edited,`${width}-reopened`);
  await f.page.setViewportSize({width,height:900});
  const reopened=await editor(index); await refused(reopened,edited); await valid(reopened,'-44.5');
  await button('Cancel',reopened).click(); await f.same(edited);
  // A valid angle does not hide a separate geometry refusal.
  const geometry=await editor(index); await geometry.getByLabel('Pull',{exact:true}).selectOption('y');
  await status(geometry,'refused'); assert.match(await geometry.innerText(),/choose a pull axis parallel/i);
  assert.notEqual(await geometry.getByLabel('Angle',{exact:true}).getAttribute('aria-invalid'),'true');
  await button('Cancel',geometry).click(); await f.same(edited);
 }
});
