import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { nativeImports, nativeInspectionSource, oracleSource } from './open-circular-variable-fillet-oracle.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/api-quarter-rim-fillet-browser.mjs',
  'apps/cad-studio/test/open-circular-variable-fillet-oracle.mjs',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad/package.json',
  'packages/barocss-cad/src/api/spec.ts',
  'packages/barocss-cad/src/api/part.ts',
  'packages/barocss-cad/src/api/kernel.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts',
  'packages/barocss-cad-model/src/api/studio.ts',
];
const f = await createFlow({
  name: 'api-quarter-rim-fillet', output, envFrozen: 'D1274_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Author an open quarter-rim fillet in both public TypeScript backends and edit the Model file in Studio.',
  limits: ['One radius-8 mm quarter-disk extruded 10 mm with circular sections and distinct endpoint radii.'],
  inspectorSource: `
${nativeImports}
import { part as kernelPart, sketch } from '@barocss/cad/api';
import { part as studioPart } from '@barocss/cad-model/api';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { evaluateCadPart, outputOf } from '@barocss/cad';
const request = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { producer, endRadius } = request;
const pickRim = body => body.edges().curved().where(e => e.a[2] === 10 && e.b[2] === 10);
const profile = sketch().moveTo([0, 0]).lineTo([8, 0]).arcTo([0, 8], { center: [0, 0] }).close();
const make = factory => factory('Quarter rim').extrude(profile, { h: 10 }).fillet(pickRim, { radius: .6, endRadius });
let key, brep, feature, result = {};
if (producer === 'kernel') {
  const made = make(kernelPart), doc = made.doc;
  feature = doc.features.at(-1);
  key = feature.id;
  brep = outputOf(evaluateCadPart(doc), key).brep;
  result = { facadeVolume: made.mass({ density: 1 }).volume, feature };
} else {
  const made = producer === 'model' ? make(studioPart) : null, doc = made?.doc ?? request;
  [{ brep, key }] = partBreps(doc);
  feature = doc.nodes.at(-1);
  if (made) result = { doc, file: Buffer.from(encodeStudioFile(doc)).toString('base64'), facadeVolume: made.mass({ density: 1 }).volume };
}
${nativeInspectionSource}
console.log(JSON.stringify({ native, ...result }));
`,
  oracleSource,
});

async function measure(native, endRadius, volume, label) {
  const accepted = await f.runOracle({ native, radii: [.6, endRadius], height: 10, workerVolume: volume }, label);
  f.report.observations.push({ label, nativeHash: native.sha, ...accepted });
}
function assertRadii(feature, endRadius) {
  assert.equal(feature.kind, 'fillet');
  assert.equal(feature.edges.length, 1);
  assert.deepEqual(feature.radii.map(p => [p.radius, p.atEnd]), [[.6, true], [endRadius, true]]);
  assert.ok(Math.hypot(feature.radii[0].at[0] - 8, feature.radii[0].at[1], feature.radii[0].at[2] - 10) < 1e-10);
  assert.ok(Math.hypot(feature.radii[1].at[0], feature.radii[1].at[1] - 8, feature.radii[1].at[2] - 10) < 1e-10);
}
async function measureStudio(expected, endRadius, label) {
  const { native } = await f.inspect(label, await f.doc());
  const [worker] = (await f.bodies()).bodies;
  assert.equal(native.key, worker.key);
  assert.equal(native.sha, expected);
  await measure(native, endRadius, worker.volume, label);
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
  f.phase = 'Author the same variable radius through both TypeScript backends';
  const kernel = await f.inspect('kernel-facade', { producer: 'kernel', endRadius: 1.2 });
  assertRadii(kernel.feature, 1.2);
  await measure(kernel.native, 1.2, kernel.facadeVolume, 'kernel-facade');
  const model = await f.inspect('model-facade', { producer: 'model', endRadius: 1.2 });
  const { doc } = model, feature = doc.nodes.at(-1);
  assertRadii(feature, 1.2);
  await measure(model.native, 1.2, model.facadeVolume, 'model-facade');
  const replacement = await f.inspect('model-facade-edited', { producer: 'model', endRadius: 1.5 });
  await measure(replacement.native, 1.5, replacement.facadeVolume, 'model-facade-edited');

  f.phase = 'Open the Model facade native file in Studio';
  await f.newPage();
  const [open] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await open.setFiles({ name: 'api-quarter-rim.bcad', mimeType: 'application/octet-stream', buffer: Buffer.from(model.file, 'base64') });
  await f.same(doc);
  await measureStudio(model.native.sha, 1.2, 'studio-opened');
  await f.snapshot('studio-opened');

  f.phase = 'Edit the far radius through Studio History';
  await f.openFeatureEditor(2, 'quarter rim from TypeScript');
  await f.editor().getByLabel('End radius', { exact: true }).fill('1.5');
  await f.applyEditor(doc, 'studio-edited');
  const edited = await f.doc();
  assert.deepEqual(edited.nodes[2].radii, [feature.radii[0], { ...feature.radii[1], radius: 1.5 }]);
  await measureStudio(replacement.native.sha, 1.5, 'studio-edited');
  await f.undo();
  await f.same(doc);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('api-quarter-rim');
  await f.freshOpen(saved.file, edited, 'studio-reopened');
  await measureStudio(replacement.native.sha, 1.5, 'studio-reopened');
});
