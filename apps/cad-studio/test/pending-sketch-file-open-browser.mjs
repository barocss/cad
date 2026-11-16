import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';
// Exact documents from the original 1173–1174 run, not fabricated replacements.
const source = {"format":"barocss-cad-model","schema":3,"units":"mm","parameters":{},"nodes":[{"kind":"sketch","profile":"loop","segments":[{"kind":"line","start":[0,0]},{"kind":"arc","start":[20,0],"center":[15,5],"direction":"ccw"},{"kind":"line","start":[20,10]},{"kind":"line","start":[0,10]}],"outline":{"points":[[0,0],[20,0],[20,10],[0,10]],"bulges":[0,0.41421356237309503,0,0],"hv":{"h":[],"v":[]}},"sideTags":{"outer":["e1","e2","e3","e4"]},"id":"n0"},{"kind":"extrude","sketch":0,"height":6,"id":"n1"}],"outputs":{"b1":{"node":1,"side":"solid"}},"nextId":2};
const replacement = {"format":"barocss-cad-model","schema":3,"units":"mm","parameters":{},"nodes":[{"kind":"sketch","profile":"loop","segments":[{"kind":"line","start":[12,12]},{"kind":"line","start":[52.92929430298809,12]},{"kind":"arc","start":[52.92929430296942,37.97122499790852],"center":[47.07070562140266,36.67625833401245],"direction":"ccw"},{"kind":"line","start":[47.07070561939157,42.67625833404447]},{"kind":"line","start":[12,42.67625833403285]}],"outline":{"points":[[12,12],[52.92929430298809,12],[52.92929430296942,37.97122499790852],[47.07070561939157,42.67625833404447],[12,42.67625833403285]],"bulges":[0,0,0.35184126817306993,0,0],"radii":{"2":6},"tangents":[3],"hv":{"h":[0,3],"v":[1,4]}},"sideTags":{"outer":["e1","e2","e3","e4","e5"]},"id":"n0"},{"kind":"extrude","sketch":0,"height":4,"id":"n1"}],"outputs":{"b1":{"node":1,"side":"solid"}},"nextId":2};
const provenance = {"sourceFile": "/tmp/barocss-sketch-dimensions.A2LhgMMS/results/desktop-e62d2be1d-legacy-perpendicular-recovery-ux-verified/line-arc-perpendicular-clean.bcad", "sourceSHA256": "8837a1c7b5bcf627914b374b113f97b6b129f511a5c8ac886fadf27b871a4f5d", "replacementFile": "/tmp/barocss-sketch-dimensions.A2LhgMMS/results/desktop-e62d2be1d-rounded-tangent-ux/one-tangent-removed.bcad", "replacementSHA256": "db85f3901c7e47f1ab465d46411a9bcde462a7002fe439781f6ae2e8ba7137c9"};
const own = 'apps/cad-studio/test/pending-sketch-file-open-browser.mjs';
const f = await createFlow({ name: 'pending-sketch-file-open', output: process.argv[2], envFrozen: 'PENDING_SKETCH_FILE_OPEN_FROZEN',
 qualification: 'Original R8 sketch draft: external File Open Keep/Escape/explicit Discard, then Undo restores the original detached Save name and bytes.',
 limits: ['The original two historical documents; explicit Discard does not promise draft restoration by document Undo.', 'No folder/project binding or invalid-file admission retest.'],
 initialFiles: [own], requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/useWorkspaceModeExit.tsx'],
 snapshotExtra: () => ({ filename: document.querySelector('.doc-tab input')?.value, dirty: !!document.querySelector('[aria-label="Unsaved changes"]') }) });
const A = 'line-arc-perpendicular-clean', B = 'one-tangent-removed';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const title = () => f.page.locator('.doc-tab input');
const radius = () => f.sketchPanel().getByLabel('Arc 2 radius', { exact: true });
const prompt = () => f.page.getByRole('dialog', { name: 'Discard sketch changes?', exact: true });
async function requestB() {
 const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
 await chooser.setFiles({ name: B + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
 await prompt().waitFor();
}
async function preserved(label, before) {
 await prompt().waitFor({ state: 'hidden' });
 await f.same(source); assert.equal(Number(await radius().inputValue()), 8); assert.equal(await title().inputValue(), A);
 const after = await f.snapshot(label);
 for (const key of ['doc', 'bodies', 'selection', 'history', 'filename', 'dirty']) assert.deepEqual(after[key], before[key], key);
}
await f.run(async () => {
 f.report.observations.push({ provenance });
 await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 900 });
 await f.openFile({ name: A + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }, 2);
 await f.same(source); assert.equal(await title().inputValue(), A);
 await f.openFeatureEditor(1); await button('Edit sketch', f.editor()).click(); await f.sketchPanel().waitFor();
 const originalRadius = Number(await radius().inputValue()); assert.ok(Math.abs(originalRadius - Math.sqrt(50)) < .001);
 await radius().fill('8'); await f.page.locator('.topbar button.finish').focus();
 assert.equal(await f.sketchAlert(), null); assert.equal(Number(await radius().inputValue()), 8);
 await f.same(source); const before = await f.snapshot('01-pending-R8');
 await requestB(); await f.snapshot('02-explicit-discard-prompt');
 await button('Keep editing', prompt()).click(); await preserved('03-keep-R8', before);
 await requestB(); await f.page.keyboard.press('Escape'); await preserved('04-escape-R8', before);
 await requestB(); await button('Discard changes', prompt()).click();
 await f.same(replacement); await f.sketchPanel().waitFor({ state: 'hidden' }); assert.equal(await title().inputValue(), B);
 await f.snapshot('05-explicit-discard-open-B');
 await f.undo(); await f.same(source); assert.equal(await title().inputValue(), A); await f.snapshot('06-undo-restores-A');
 const downloadEvent = f.page.waitForEvent('download'); await button('Save').click(); const download = await downloadEvent;
 assert.equal(download.suggestedFilename(), A + '.bcad');
 const saved = process.argv[2] + '/original-after-open-undo.bcad'; await download.saveAs(saved); const bytes = await readFile(saved);
 assert.deepEqual(JSON.parse(bytes), source); f.report.files.push({ file: saved, hash: sha256(bytes), suggestedFilename: download.suggestedFilename() });
 await f.redo(); await f.same(replacement); assert.equal(await title().inputValue(), B); await f.snapshot('07-redo-restores-B');
 f.report.observations.push({ originalRadius, pendingRadius: 8, keepAndEscapePreserveDraft: true, discardedExplicitly: true, undoFilename: A, savedFilename: download.suggestedFilename(), savedJSONMatchesOriginal: true });
});
