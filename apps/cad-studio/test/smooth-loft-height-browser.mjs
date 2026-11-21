import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const file = resolve(process.argv[3]);
const original = JSON.parse(await readFile(file, 'utf8'));
const pins = [
  'apps/cad-studio/test/smooth-loft-height-browser.mjs', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/app/featureNumberInput.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/smoothLoftHeight.ts', 'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'smooth-loft-height-edit', output: process.argv[2], envFrozen: 'SMOOTH_LOFT_HEIGHT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Edit the overall height of an existing smooth Loft and verify its native corner paths after reopen.',
  limits: ['Desktop Studio. Reopen the approved 50 mm, −450° Smooth Turn from D1522.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurve } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep, key }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ key, sha: digestOf(brep), valid: checkBrep(brep, { strict: true }).valid,
  volume: brepMassProperties(brep, 1).volume,
  kind: brep.bodies[0].kind, closed: brep.shells.length === 1 && brep.shells[0].closed,
  faces: brep.faces.map(face => face.name), edges: brep.edges.map(edge => edge.name),
  rails: brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ id, curve }) => ({
    id, points: Array.from({ length: 31 }, (_, i) => evaluateCurve(curve, i / 30)),
  })),
}));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = () => f.editor().getByLabel('Total height', { exact: true });
const index = original.nodes.length - 1;
const originalHeight = 50, newHeight = 70;
const ratio = newHeight / originalHeight;

async function frame() {
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
}

async function native(label, doc) {
  const result = await f.inspect(label, doc);
  assert.deepEqual([result.valid, result.kind, result.closed, result.faces.length, result.edges.length, result.rails.length],
    [true, 'solid', true, 6, 12, 4]);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].key, result.key);
  assert.ok(Math.abs(bodies[0].volume - result.volume) < 1e-7);
  return result;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.freshOpen(file, original, 'original-smooth-turn');
  const before = await native('height-50-native', original);
  await frame();
  await f.snapshot('height-50-framed');

  f.phase = 'refuse zero height and retain the exact accepted document';
  await f.openFeatureEditor(index, 'saved Smooth Turn');
  assert.equal(Number(await field().inputValue()), originalHeight);
  await field().fill('0');
  assert.equal(await field().getAttribute('aria-invalid'), 'true');
  assert.equal(await button('Apply', f.editor()).isDisabled(), true);
  await f.same(original);
  await f.snapshot('zero-height-refused');

  f.phase = 'apply 70 millimetres in History with the current solid and station IDs';
  await field().fill(String(newHeight));
  const edited = (await f.applyEditor(original, 'height-70-applied')).doc;
  assert.deepEqual(edited.nodes.slice(0, -1), original.nodes.slice(0, -1));
  assert.equal(edited.nodes[index].id, original.nodes[index].id);
  assert.deepEqual(edited.nodes[index].sections.map(section => section.sketch), original.nodes[index].sections.map(section => section.sketch));
  assert.equal(edited.nodes[index].sections.at(-1).z, newHeight);
  for (const [station, { z }] of edited.nodes[index].sections.entries())
    assert.ok(Math.abs(z - original.nodes[index].sections[station].z * ratio) < 1e-12);
  const after = await native('height-70-native', edited);
  assert.deepEqual([after.key, after.faces, after.edges], [before.key, before.faces, before.edges]);
  assert.ok(Math.abs(after.volume - before.volume * ratio) < 1e-7);

  let maximumError = 0;
  const base = before.rails[0].points[0][2];
  for (const [index, rail] of before.rails.entries()) {
    const resized = after.rails[index];
    assert.equal(resized.id, rail.id);
    for (const [i, [x, y, z]] of rail.points.entries()) {
      const actual = resized.points[i];
      const expected = [x, y, base + (z - base) * ratio];
      maximumError = Math.max(maximumError, Math.hypot(...actual.map((value, axis) => value - expected[axis])));
    }
  }
  assert.ok(maximumError < 1e-8);
  f.report.observations.push({ maximumError, originalVolume: before.volume, resizedVolume: after.volume,
    beforeDigest: before.sha, afterDigest: after.sha });
  await frame();
  await f.snapshot('height-70-framed');

  await f.undo();
  await f.same(original);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('smooth-turn-height-70');
  await f.freshOpen(saved.file, edited, 'height-70-reopened');
  assert.equal((await native('height-70-reopened-native', edited)).sha, after.sha);
  await frame();
  await f.openFeatureEditor(index, 'reopened Smooth Turn dimensions');
  assert.equal(Number(await field().inputValue()), newHeight);
  await f.snapshot('height-70-reopened-editor');
});
