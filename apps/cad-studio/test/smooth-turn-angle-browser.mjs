import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const file = resolve(process.argv[3]);
const original = JSON.parse(await readFile(file, 'utf8'));
const pins = [
  'apps/cad-studio/test/smooth-turn-angle-browser.mjs', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/app/featureNumberInput.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/smoothLoftTurn.ts', 'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'smooth-turn-angle-edit',
  output: process.argv[2],
  envFrozen: 'SMOOTH_TURN_ANGLE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Change the signed angle of a saved smooth turn while preserving its stations and height.',
  limits: ['Desktop Studio. A saved 16-station Smooth Turn with height 70 mm.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep, key }] = partBreps(doc), segments = doc.nodes.at(-1).sections.length - 1;
const strict = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ key, sha: digestOf(brep), valid: strict.valid, count: strict.counts.bodies,
  volume: brepMassProperties(brep, 1).volume,
  kind: brep.bodies[0].kind, closed: brep.shells.length === 1 && brep.shells[0].closed,
  faces: brep.faces.map(face => face.name), edges: brep.edges.map(edge => edge.name),
  rails: brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ id, curve }) => ({
    id, knots: curve.knots, poleCount: curve.controlPoints.length,
    stations: Array.from({ length: segments + 1 }, (_, index) => evaluateCurveD1(curve, index / segments)),
  })),
}));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const angleField = () => f.editor().getByLabel('Turn angle', { exact: true });
const heightField = () => f.editor().getByLabel('Total height', { exact: true });
const index = original.nodes.length - 1;
const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];

async function frame() {
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
}

async function native(label, doc, angle) {
  const result = await f.inspect(label, doc);
  assert.deepEqual([result.valid, result.count, result.kind, result.closed,
    result.faces.length, result.edges.length, result.rails.length], [true, 1, 'solid', true, 6, 12, 4]);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].key, result.key);
  assert.ok(Math.abs(bodies[0].volume - result.volume) < 1e-7);
  let maximumError = 0;
  for (const [railIndex, rail] of result.rails.entries()) {
    assert.equal(rail.poleCount, 16);
    const interior = rail.knots.slice(4, -4);
    assert.ok(interior.every((knot, i) => i === 0 || knot > interior[i - 1]));
    const [u, v] = corners[railIndex];
    for (const [i, { point, derivative }] of rail.stations.entries()) {
      const t = i / 15, rotation = angle * Math.PI / 180 * t;
      const c = Math.cos(rotation), s = Math.sin(rotation);
      const expected = [18 + c * u - s * v, -11 + s * u + c * v, 3 + 70 * t];
      maximumError = Math.max(maximumError, Math.hypot(...point.map((value, k) => value - expected[k])));
      const phase = (point[0] - 18) * derivative[1] - (point[1] + 11) * derivative[0];
      assert.ok(angle === 0 ? Math.abs(phase) < 1e-8 : phase * Math.sign(angle) > 0);
    }
  }
  assert.ok(maximumError < 1e-8);
  f.report.observations.push({ label, angle, volume: result.volume, maximumError, digest: result.sha });
  return result;
}

async function verifyEditor(angle) {
  assert.equal(Number(await angleField().inputValue()), angle);
  assert.equal(Number(await heightField().inputValue()), 70);
  assert.equal(await angleField().getAttribute('min'), '-450');
  assert.equal(await angleField().getAttribute('max'), '450');
  assert.equal(await f.editor().getByLabel(/Section \d+ · height/).count(), 0);
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

  await f.freshOpen(file, original, 'saved-smooth-turn');
  const before = await native('negative-450-native', original, -450);
  await frame();
  await f.snapshot('negative-450-before');
  await f.openFeatureEditor(index, 'saved Smooth Turn');
  await verifyEditor(-450);

  f.phase = 'refuse an out-of-range angle after a valid draft';
  await angleField().fill('330');
  await angleField().fill('451');
  assert.equal(await angleField().getAttribute('aria-invalid'), 'true');
  assert.equal(await button('Apply', f.editor()).isDisabled(), true);
  await f.same(original);
  await f.snapshot('angle-451-refused');

  f.phase = 'reverse the winding to +360 degrees with 16 existing stations at 70 mm';
  await angleField().fill('360');
  const edited = (await f.applyEditor(original, 'positive-360-applied')).doc;
  assert.deepEqual(edited.nodes.at(-1), original.nodes.at(-1));
  assert.deepEqual(edited.nodes.slice(0, 3), original.nodes.slice(0, 3));
  assert.deepEqual(edited.nodes.map(node => node.id), original.nodes.map(node => node.id));
  const after = await native('positive-360-native', edited, 360);
  assert.deepEqual([after.key, after.faces, after.edges], [before.key, before.faces, before.edges]);
  assert.notEqual(after.sha, before.sha);
  await f.undo();
  await f.same(original);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('smooth-turn-positive-360');
  await f.freshOpen(saved.file, edited, 'positive-360-reopened');
  assert.equal((await native('positive-360-reopened-native', edited, 360)).sha, after.sha);
  await frame();
  await f.openFeatureEditor(index, 'reopened angle and height');
  await verifyEditor(360);
  await f.snapshot('positive-360-reopened-editor');

  f.phase = 'verify that a zero turn gives the straight prism and Undo restores the same file';
  await angleField().fill('0');
  const straight = (await f.applyEditor(edited, 'zero-angle-applied')).doc;
  const prism = await native('straight-native', straight, 0);
  assert.ok(Math.abs(prism.volume - 6720) < 1e-7);
  assert.deepEqual([prism.key, prism.faces, prism.edges], [after.key, after.faces, after.edges]);
  await f.undo();
  await f.same(edited);
});
