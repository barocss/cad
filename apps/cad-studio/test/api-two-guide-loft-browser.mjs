import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspectorWith, verifyTwoGuideLoft } from './loft-two-guides-oracle.mjs';

const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const pins = [
  'apps/cad-studio/test/api-two-guide-loft-browser.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs',
  'packages/barocss-cad-model/src/api/index.ts', 'packages/barocss-cad-model/src/api/part.ts',
  'packages/barocss-cad-model/src/chat/features.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/features/loft-two-guides.ts',
];
const f = await createFlow({
  name: 'api-two-guide-loft', envFrozen: 'D1278_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Open a Model TypeScript two-guide Loft in Studio, edit the first rail, and verify native Save/Open.',
  limits: ['Model facade; congruent axis-aligned XY rectangles and two quadratic Bézier rails.'],
  inspectorSource: twoGuideInspectorWith(`
import { part, sketch } from '@barocss/cad-model/api';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
if (doc.producer === 'model') {
  const rectangle = sketch().rectangle({ w: 10, d: 6, x: 0, y: 0 });
  const made = part('API-authored two-guide loft').loft([
    { sketch: rectangle, z: 0 }, { sketch: rectangle, z: 12 },
  ], { guides: [
    { kind: 'quadratic-bezier', controlPoints: [[0, 0, 0], [2, 0, 6], [0, 0, 12]] },
    { kind: 'quadratic-bezier', controlPoints: [[10, 0, 0], [14, 0, 6], [10, 0, 12]] },
  ] });
  doc = made.doc;
  extra = { doc, file: Buffer.from(encodeStudioFile(doc)).toString('base64'), facadeVolume: made.mass({ density: 1 }).volume };
}
`),
});

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Author a native file using the public Model API';
  const authored = await f.inspect('api-authored', { producer: 'model' });
  assert.ok(Math.abs(authored.facadeVolume - 819.84) < 1e-9);
  await f.newPage();
  const open = f.page.getByRole('button', { name: 'Open', exact: true });
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles({ name: 'api-authored-loft.bcad', mimeType: 'application/json', buffer: Buffer.from(authored.file, 'base64') });
  await f.same(authored.doc);
  const actual = await verifyTwoGuideLoft(f, await f.doc(), 2, 4, 'opened');
  assert.deepEqual(actual.edges, authored.edges);
  assert.deepEqual(actual.sides, authored.sides);
  await f.snapshot('opened');
  await f.openFeatureEditor(2, 'API-authored Loft');
  await f.editor().getByText('Two guides', { exact: true }).waitFor();
  const first = f.editor().getByLabel('Guide 1 middle X', { exact: true });
  assert.equal(await first.inputValue(), '2');
  await first.fill('3');
  const edited = (await f.applyEditor(authored.doc, 'edited')).doc;
  assert.deepEqual(edited.nodes.at(-1).guides[1], authored.doc.nodes.at(-1).guides[1]);
  const before = await verifyTwoGuideLoft(f, edited, 3, 4, 'edited');
  await f.undo();
  await f.same(authored.doc);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('api-loft-edited');
  await f.freshOpen(saved.file, edited, 'reopened');
  const after = await verifyTwoGuideLoft(f, await f.doc(), 3, 4, 'reopened');
  assert.deepEqual(after, before);
});
