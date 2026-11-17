import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/shell-wall-limit-browser.mjs', 'apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts'];
const f = await createFlow({
  name: 'shell-wall-limit', output: process.argv[2], envFrozen: 'SHELL_WALL_LIMIT_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Imported X0 opening states the strict 2.5 mm Shell limit, rejects it atomically, and retains an accepted 2.499 mm edit.',
  limits: ['One imported two-box fixture; Left orthographic X0 opening; no general shell or kernel scope expansion.'],
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {checkBrep,faceGeometry,massPropertiesOf} from '@barocss/cad';
import {partSnapshot} from '@barocss/cad-model/engine/part';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partSnapshot(doc).outputs.map(o=>({id:o.id,volume:massPropertiesOf(o).volume,solids:o.bodyCount,
 strict:checkBrep(o.brep,{strict:true}).valid,points:o.brep.vertices.map(v=>v.point),
 faces:o.brep.faces.map(face=>({name:face.name,geometry:faceGeometry(face),loops:face.loops.map(id=>o.brep.loops.find(l=>l.id===id).kind).sort()}))}))));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
async function native(label, doc, wall) {
  const bodies = await f.inspect(label, doc), target = bodies.find(b => b.id === (wall ? 'n1' : 'n0/0')), other = bodies.find(b => b.id === 'n0/1');
  assert.equal(bodies.length, 2); assert.ok(target && other && bodies.every(b => b.strict && b.solids === 1));
  // X0 is open: cavity X=[0,10-wall], Y=[wall,10-wall], Z=[wall,5-wall].
  const expected = wall ? 500 - (10 - wall) * (10 - 2 * wall) * (5 - 2 * wall) : 500;
  near(target.volume, expected); near(other.volume, 144);
  const opening = target.faces.find(face => face.geometry.kind === 'plane' && Math.abs(face.geometry.o[0]) < 1e-8 && face.geometry.n[0] < -.99);
  assert.ok(opening); assert.deepEqual(opening.loops, wall ? ['inner', 'outer'] : ['outer']);
  if (wall) for (const x of [0, 10 - wall]) for (const y of [wall, 10 - wall]) for (const z of [wall, 5 - wall])
    assert.ok(target.points.some(p => p.every((v, i) => Math.abs(v - [x, y, z][i]) < 1e-7)), `missing cavity corner ${[x,y,z]}`);
  f.report.observations.push({ label, wall, expected, volume: target.volume, opening: opening.loops });
}
async function noFailedHistory() {
  const labels = await f.page.locator('.history .hs').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label') ?? n.textContent));
  assert.ok(labels.every(label => !/failed/i.test(label ?? '')), JSON.stringify(labels));
  return labels;
}
async function wallPreview(hud, wall) {
  const field = hud.getByLabel('Wall', { exact: true }); await field.fill('');
  await hud.getByText('Enter a value', { exact: true }).waitFor(); await field.fill(String(wall));
  await hud.locator('.status.ok, .hud-error details').waitFor(); return hud.locator('.status').innerText();
}
async function visibleRefusal(panel) {
  const notice = panel.getByRole('status');
  await notice.locator('details').waitFor();
  assert.equal(await notice.locator('details').getAttribute('open'), null);
  // Only default expanded title/hint, never the collapsed diagnostic text.
  return (await notice.locator(':scope > div').evaluateAll(nodes => nodes.slice(0, 2).map(n => n.textContent))).join(' ');
}
await f.run(async () => {
  const defaultFixture = resolve('handover/notes/import-open-stage-ownership-2026-10-29/normal-first/two-boxes.step');
  const step = await readFile(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : defaultFixture);
  assert.equal(sha256(step), 'b425a5a94604bd94d4f0b55192368480c217792862552f8cd3a38eedd33c28b7');
  f.report.files.push({ name: 'two-boxes.step', sha256: sha256(step) });
  await f.newPage(); const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'two-boxes.step', mimeType: 'application/step', buffer: step });
  await f.waitToast(/STEP opened.*2 solids.*millimetres/); await f.ready(); const source = await f.doc();
  await native('stock-native', source, 0);
  f.phase = 'pick imported X0 face from Left Ortho';
  await button('View cube directions', f.page.getByRole('group', { name: 'View cube' })).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const pixel = await f.page.evaluate(() => window.__studioScreenOf([0, 5, 2.5])); assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel); await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickModelCommand(f.page, 'Modify', 'Shell'); const hud = f.page.getByRole('dialog', { name: 'Shell', exact: true });
  f.phase = 'refuse creation wall 2.5 and inspect default hint';
  assert.equal(await wallPreview(hud, 2.5), 'refused'); const copy = await visibleRefusal(hud);
  assert.equal(await button('Apply', hud).isEnabled(), false); await f.same(source); const labels = await noFailedHistory();
  assert.ok(labels.every(label => !/Shell 2\.5 mm/.test(label ?? ''))); await f.snapshot('creation-2_5-refused');
  f.report.observations.push({ baseline, defaultHint: copy, history: labels });
  if (baseline) { assert.doesNotMatch(copy, /less than 2\.5 mm/i); await button('Cancel', hud).click(); await f.same(source); return; }
  assert.equal(await hud.locator('.hud-error-feature').count(),0);
  assert.ok(copy.includes('Enter Wall less than 2.5 mm to keep the selected face open.'), copy);
  assert.equal(await wallPreview(hud, 2), 'preview'); await button('Apply', hud).click(); await f.changed(source);
  const good = (await f.snapshot('wall-2-applied')).doc; assert.equal(good.nodes[1].kind, 'shell'); assert.equal(good.nodes[1].thickness, 2);
  assert.deepEqual(good.nodes[1].parent, { node: 0, side: 'part0' }); await native('wall-2-native', good, 2);
  await f.openFeatureEditor(1, 'Shell wall limit History'); const editor = f.editor(), field = editor.getByLabel('Wall', { exact: true });
  await field.fill('2.5'); await button('Apply', editor).click(); await editor.locator('.hud-error-title').waitFor();
  assert.ok((await visibleRefusal(editor)).includes('Enter Wall less than 2.5 mm to keep the selected face open.')); await f.same(good); assert.equal(await editor.locator('.hud-error-feature').innerText(),'Failed feature · Shell 2 mm (n1)'); await noFailedHistory(); await f.snapshot('history-2_5-refused');
  await field.fill('2.499'); await button('Apply', editor).click(); await f.changed(good);
  const tight = (await f.snapshot('wall-2_499-applied')).doc; assert.deepEqual(tight.nodes[1], { ...good.nodes[1], thickness: 2.499 });
  assert.ok((await noFailedHistory()).some(label => /Shell 2\.499 mm/.test(label ?? ''))); await native('wall-2_499-native', tight, 2.499);
  await f.undo(); await f.same(good); await native('undo-native', good, 2);
  await f.redo(); await f.same(tight); await native('redo-native', tight, 2.499);
  f.phase = 'OPFS Save reload and Open';
  const project = `shell wall limit ${randomUUID()}`, versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  async function attach() { if (!await versions().isVisible()) await button('Project and versions').click(); await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project); await button('Project in this browser', versions()).click(); await versions().getByLabel('Project', { exact: true }).waitFor(); }
  await attach(); await button('Save').click(); await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const name = 'two-boxes.bcad', openName = 'Open ' + name; await versions().getByText(name,{exact:true}).waitFor();
  const bytes = Buffer.from(await f.page.evaluate(async ([project, name]) => { const root = await navigator.storage.getDirectory(); const projects = await root.getDirectoryHandle('projects'); const dir = await projects.getDirectoryHandle(project); const file = await (await dir.getFileHandle(name)).getFile(); return Array.from(new Uint8Array(await file.arrayBuffer())); }, [project, name]));
  assert.deepEqual(JSON.parse(bytes), tight); f.report.files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  await button('Close project', versions()).click(); await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload(); await f.page.waitForSelector('.viewport[data-renderer="webgpu"]'); await f.ready(); await attach(); await button(openName, versions()).click(); await f.same(tight);
  await native('reopened-native', tight, 2.499); assert.ok((await noFailedHistory()).some(label => label === 'Shell 2.499 mm')); await f.openFeatureEditor(1,'reopened exact wall'); assert.equal(await f.editor().getByLabel('Wall',{exact:true}).inputValue(),'2.499'); await f.closeEditor(); await f.snapshot('opfs-reopened');
});
