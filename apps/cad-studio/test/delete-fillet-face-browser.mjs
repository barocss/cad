import assert from 'node:assert/strict';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [3, 0], [3, 27], [40, 27], [40, 30], [0, 30]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
    { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], radius: 2 },
  ],
  outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
};
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/documentFile.ts',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad/src/features/heal-prismatic-fillet.ts',
];
const f = await createFlow({
  name: 'delete-fillet-face', envFrozen: 'DELETE_FILLET_FACE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Heal the picked inside fillet of a straight L-section, then save and reopen the sharp solid.',
  limits: ['One constant R2 internal fillet spanning a 20 mm axis-aligned extrusion of the 40 × 30 mm L-section.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const solids = partBreps(doc), brep = solids[0].brep;
console.log(JSON.stringify({ solids: solids.length, report: checkBrep(brep, { strict: true }),
  mass: brepMassProperties(brep, 1), faces: brep.faces.map(({ id, name }) => ({ id, name })) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const sharpVolume = (40 * 3 + 30 * 3 - 3 * 3) * 20;
const filletVolume = sharpVolume + 20 * 4 * (1 - Math.PI / 4);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

async function measure(label, doc, original) {
  const native = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(native.solids, 1);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(worker.length, 1);
  const expected = original ? sharpVolume : filletVolume;
  near(native.mass.volume, expected);
  near(worker[0].volume, expected);
  if (original) {
    assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 });
    assert.deepEqual(native.faces.map(face => face.name).sort(),
      original.faces.filter(face => face.name !== 'n2.face').map(face => face.name).sort());
  }
  f.report.observations.push({ label, expected, nativeVolume: native.mass.volume, studioVolume: worker[0].volume,
    counts: native.report.counts, maximumEdgeSurfaceGap: native.report.maximumEdgeSurfaceGap });
  return native;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open and measure the R2 L-section';
  await f.newPage();
  const [file] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await file.setFiles({ name: 'l-section-r2.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  const original = await measure('rounded', source);
  await f.snapshot('fillet-original');

  f.phase = 'Select the native inside fillet and apply its heal';
  await button('Selection filter').click();
  const point = [5 - Math.SQRT2, 25 + Math.SQRT2, 10];
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await f.command('Delete face');
  const apply = button('Apply', f.page.getByRole('dialog', { name: 'Delete face', exact: true }));
  await apply.waitFor({ timeout: 10000 });
  await apply.click();
  await f.changed(source);
  const healed = await f.doc();
  assert.deepEqual(healed.nodes.slice(0, 3), source.nodes);
  assert.equal(healed.nodes[3].kind, 'delete-face');
  assert.deepEqual(healed.nodes[3].faces, ['n2.face']);
  await measure('sharp', healed, original);
  await f.snapshot('fillet-healed');
  await f.undo(); await f.same(source);
  await f.redo(); await f.same(healed);
  const saved = await f.save('l-section-sharp');
  await f.freshOpen(saved.file, healed, 'fillet-healed-reopened');
  await measure('reopened', healed, original);
});
