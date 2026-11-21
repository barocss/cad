import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const file = resolve(process.argv[3]);
const original = JSON.parse(await readFile(file, 'utf8'));
const terminal = original.nodes.length - 1;
const pins = [
  'apps/cad-studio/test/smooth-screw-winding-browser.mjs',
  'apps/cad-studio/src/ui/NodeEditor.tsx', 'apps/cad-studio/src/app/featureNumberInput.ts',
  'apps/cad-studio/src/state/historyFeatureApply.ts', 'apps/cad-studio/src/engine/client.ts',
  'apps/cad-studio/src/engine/engine.worker.ts', 'packages/barocss-cad-model/src/app/smoothLoftTurn.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts', 'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
];
const f = await createFlow({
  name: 'smooth-screw-winding-edit', output: process.argv[2], envFrozen: 'SCREW_WINDING_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Edit signed winding at constant pitch on one saved external-axis Screw in Studio History.',
  limits: ['Desktop Studio, D1556 fixture with 16 stations, pitch 56, and initial angle −450°.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, evaluateCurveD1 } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep, key }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ key, sha: digestOf(brep), valid: checkBrep(brep, { strict: true }).valid,
  volume: brepMassProperties(brep, 1).volume,
  solid: brep.bodies.length === 1 && brep.bodies[0].kind === 'solid' && brep.shells.length === 1 && brep.shells[0].closed,
  ids: [brep.faces, brep.loops, brep.coedges, brep.edges, brep.vertices, brep.shells, brep.bodies].map(items => items.map(item => item.id)),
  rails: brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ id, curve }) => ({
    id, samples: Array.from({ length: 241 }, (_, i) => evaluateCurveD1(curve, i / 240)),
  })),
}));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const winding = () => f.editor().getByLabel('Turn angle', { exact: true });
const pitch = () => f.editor().getByLabel('Pitch per revolution', { exact: true });
const axis = [10, -16, 3];
const localCorners = [[2, 1], [14, 1], [14, 9], [2, 9]];

async function frame() {
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
}

async function prove(label, doc, angle, expectedPitch, previous = original) {
  const oldLoft = previous.nodes[terminal], loft = doc.nodes[terminal];
  assert.equal(loft.id, oldLoft.id);
  assert.deepEqual(loft.sections.map(section => section.sketch), oldLoft.sections.map(section => section.sketch));
  assert.deepEqual(doc.nodes.map(node => node.id), original.nodes.map(node => node.id));
  assert.deepEqual(doc.nodes.slice(0, loft.sections[0].sketch + 1), original.nodes.slice(0, loft.sections[0].sketch + 1));
  const height = Math.abs(angle) / 360 * expectedPitch;
  const result = await f.inspect(label, doc);
  assert.ok(result.valid && result.solid);
  assert.equal(result.rails.length, 4);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].key, result.key);
  assert.ok(Math.abs(bodies[0].volume - result.volume) < 1e-7);
  let maximumError = 0, minimumSignedDerivative = Infinity;
  for (const [railIndex, rail] of result.rails.entries()) {
    const [u, v] = localCorners[railIndex];
    let total = 0, prior = [u, v];
    for (const [i, { point, derivative }] of rail.samples.entries()) {
      const fraction = i / 240, x = point[0] - axis[0], y = point[1] - axis[1];
      const signed = Math.sign(angle) * (x * derivative[1] - y * derivative[0]);
      minimumSignedDerivative = Math.min(minimumSignedDerivative, signed);
      total += Math.atan2(prior[0] * y - prior[1] * x, prior[0] * x + prior[1] * y);
      prior = [x, y];
      if (i % 16 === 0) {
        const theta = angle * fraction * Math.PI / 180;
        const expected = [
          axis[0] + Math.cos(theta) * u - Math.sin(theta) * v,
          axis[1] + Math.sin(theta) * u + Math.cos(theta) * v,
          axis[2] + height * fraction,
        ];
        maximumError = Math.max(maximumError, Math.hypot(...point.map((p, k) => p - expected[k])));
      }
    }
    assert.ok(Math.abs(total * 180 / Math.PI - angle) < 1e-8);
  }
  assert.ok(maximumError < 1e-8);
  assert.ok(minimumSignedDerivative > 0);
  f.report.observations.push({ label, angle, pitch: expectedPitch, height, maximumError, minimumSignedDerivative,
    volume: result.volume, digest: result.sha });
  return result;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.freshOpen(file, original, 'initial-negative450');
  const before = await prove('native-negative450', original, -450, 56);
  await frame();
  await f.openFeatureEditor(terminal, 'original Smooth Screw');
  assert.equal(Number(await winding().inputValue()), -450);
  assert.equal(Number(await pitch().inputValue()), 56);
  await f.snapshot('editor-negative450');

  await winding().fill('360');
  for (const value of ['0', '451', '0.00000001', '']) {
    await winding().fill(value);
    assert.equal(await winding().getAttribute('aria-invalid'), 'true', value);
    assert.equal(await button('Apply', f.editor()).isDisabled(), true, value);
    await f.same(original);
  }
  await winding().fill('0');
  await f.snapshot('zero-angle-refused');
  await winding().fill('360');
  const positive = (await f.applyEditor(original, 'positive360-applied')).doc;
  const pos = await prove('native-positive360', positive, 360, 56);
  assert.deepEqual(pos.ids, before.ids);
  assert.equal(pos.key, before.key);
  await frame();
  await f.openFeatureEditor(terminal, 'turn from positive to negative');
  await f.snapshot('editor-positive360');

  await winding().fill('-360');
  const negative = (await f.applyEditor(positive, 'negative360-applied')).doc;
  assert.deepEqual(negative.nodes[terminal], positive.nodes[terminal], 'reversal keeps axial stations exactly');
  const neg = await prove('native-negative360', negative, -360, 56, positive);
  assert.deepEqual(neg.ids, pos.ids);
  assert.equal(neg.key, pos.key);
  assert.ok(Math.abs(neg.volume - pos.volume) < 1e-7);
  await f.undo();
  await f.same(positive);
  await f.redo();
  await f.same(negative);
  const saved = await f.save('smooth-screw-negative360');
  await f.freshOpen(saved.file, negative, 'negative360-reopened');
  assert.equal((await prove('native-negative360-reopened', negative, -360, 56)).sha, neg.sha);
  await frame();
  await f.openFeatureEditor(terminal, 'reopened winding');
  assert.equal(Number(await winding().inputValue()), -360);
  assert.equal(Number(await pitch().inputValue()), 56);
  await f.snapshot('editor-negative360-reopened');

  await pitch().fill('64');
  await winding().fill('270');
  const combined = (await f.applyEditor(negative, 'pitch64-positive270')).doc;
  const final = await prove('native-combined', combined, 270, 64);
  assert.deepEqual(final.ids, before.ids);
  assert.ok(Math.abs(final.volume - 4608) < 1);
});
