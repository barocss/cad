import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const f = await createFlow({
  name: 'pinned-face-save-file', output: process.argv[2], envFrozen: 'PINNED_FACE_FILE_FROZEN',
  initialFiles: ['apps/cad-studio/test/pinned-face-save-file-browser.mjs', 'apps/cad-studio/test/model-rail-helper.mjs'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/useStudioMeasurementReadouts.tsx'],
  qualification: 'Actual native download while a face measurement is pinned; independent JSON file read and fresh-context Open.',
  limits: ['Default-XY rectangular Extrude opposite caps only. No geometry accuracy, broader topology, native-folder or Worker race requalification.'],
  oracleSource: `import json,sys,hashlib
x=json.load(sys.stdin)
with open(x['file'],'rb') as f: raw=f.read()
doc=json.loads(raw)
assert doc==x['accepted'], 'file differs from accepted document'
print(json.dumps({'status':'PASS','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'exactAcceptedDocument':True,'extraSessionMetadata':False}))
`,
});
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 12], id: 'n0' },
  { kind: 'extrude', sketch: 0, height: 8, id: 'n1' },
], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const button = name => f.page.getByRole('button', { name, exact: true });
const pinned = () => f.page.getByRole('complementary', { name: 'Pinned measurement', exact: true });
const state = () => f.page.evaluate(() => ({
  doc: window.__studioDoc, dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
  controls: ['Undo', 'Redo'].map(name => {
    const b = document.querySelector('button[aria-label="' + name + '"]');
    if (!b) throw Error(name + ' missing');
    return { disabled: b.disabled, tip: b.getAttribute('data-tip') };
  }),
}));
async function cap(side) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: side, exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.locator('.view-cube .vc-label').getByText(side.toUpperCase(), { exact: true }).waitFor();
  await f.page.waitForFunction(side => { const e = window.__studioEye?.(); return e && (side === 'Top' ? e[2] > 8 : e[2] < 0); }, side);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), [10, 6, side === 'Top' ? 8 : 0]);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}
await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: 'session-cap-pair.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }, 2);
  await f.same(source);
  const accepted = await state();
  f.phase = 'public cap picks and Pin';
  await clickModelCommand(f.page, 'Inspect', 'Measure');
  await cap('Top'); await cap('Bottom');
  await button('Pin measurement').click();
  await pinned().getByText('8 mm', { exact: true }).waitFor();
  await f.page.waitForFunction(() => window.__studioOverlayTexts?.()['measure:label']?.includes('8 mm'));
  assert.deepEqual(await state(), accepted);
  await f.snapshot('01-pinned-before-real-save');
  const saved = await f.save('pinned-accepted');
  assert.deepEqual(saved.doc, accepted.doc);
  assert.deepEqual(await state(), accepted);
  assert.equal(f.report.downloads.length, 1);
  await f.runOracle({ file: saved.file, accepted: accepted.doc }, 'downloaded-file');
  await pinned().getByText('8 mm', { exact: true }).waitFor();
  await f.freshOpen(saved.file, accepted.doc, '02-fresh-open-no-pin');
  assert.equal(await pinned().count(), 0);
  assert.equal(await f.page.getByRole('complementary', { name: 'Measurement', exact: true }).count(), 0);
  assert.ok(await f.page.evaluate(() => !window.__studioOverlayTexts?.()['measure:label']));
  assert.deepEqual(await f.doc(), accepted.doc);
  f.report.observations.push({ pinPreservesDocumentDirtyAndHistoryControls: true, actualDownloadedFiles: 1,
    independentFileJsonExact: true, freshContextNoPin: true, geometryRequalification: false });
});
