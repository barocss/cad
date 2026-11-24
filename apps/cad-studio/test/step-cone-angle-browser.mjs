import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { coneAngleFixture, nonConeAngleFixture, tetrahedronAngleFixture } from '../../../packages/barocss-cad/test/step-cone-angle-fixtures.mjs';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const retention = process.argv.includes('--non-cone-controls');
const inputs = [
  'apps/cad-studio/test/step-cone-angle-browser.mjs',
  'apps/cad-studio/src/files/importedFile.ts',
  'packages/barocss-cad/test/step-cone-angle-fixtures.mjs',
  'packages/barocss-cad/test/step-fixtures.mjs',
  'packages/barocss-cad/src/io/step-import.ts',
];
const flow = await createFlow({
  name: 'step-cone-angle',
  output: process.argv[2],
  envFrozen: retention ? 'D1879_SOURCE_FROZEN' : 'D1867_SOURCE_FROZEN',
  initialFiles: inputs,
  requiredFrozen: inputs,
  qualification: retention ? 'Open and retain planar and tessellated geometry and length units when no surface consumes the degree declaration.'
    : 'Read supported cone angles and refuse explicit unsupported units before replacing the current Studio document.',
  limits: retention ? ['One tetrahedron as pure AP214 planar and AP242 tessellated solids in millimetres and centimetres.']
    : ['Local synthetic AP214, desktop WebGPU and the existing zero-offset identity route.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const { volume, centroid } = brepMassProperties(brep, 1);
console.log(JSON.stringify({ volume, centroid, digest: digestOf(brep), strict: checkBrep(brep, { strict: true }).valid,
  faces: brep.faces.map(face => face.name).sort(), kinds: [...new Set(brep.faces.map(face => face.surface.kind))] }));
`,
});
const input = () => flow.page.getByLabel('Model file', { exact: true });
const frame = async () => {
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  await flow.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);
const volume = (angle) => {
  const r = 10 - 6 * Math.tan(angle * Math.PI / 180);
  return 2 * Math.PI * (100 + 10*r + r*r);
};
const file = async (label, text) => {
  const path = join(flow.output, label + '.step');
  await writeFile(path, text);
  return path;
};
const show = async (label, path, angle) => {
  flow.phase = `Open ${label}`;
  await flow.openFile(path, 1);
  await flow.waitToast(/STEP opened/);
  await frame();
  const doc = await flow.doc();
  const native = await flow.inspect(label, doc);
  assert.ok(native.strict);
  near(native.volume, volume(angle), 1e-7);
  near((await flow.bodies()).bodies[0].volume, volume(angle), 1e-7);
  await flow.snapshot(label);
  return doc;
};
const capture = () => flow.page.evaluate(() => ({
  selection: window.__studioSelection,
  camera: window.__studioCamera(),
  history: [...document.querySelectorAll('.history .hs')].map(button => button.getAttribute('aria-label')),
  undoRedo: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`)?.disabled),
  dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
}));

function holdStepFailure() {
  const proto = Worker.prototype, post = proto.postMessage;
  const handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target, held;
  proto.postMessage = function (request, ...rest) {
    if (armed && request?.type === 'part' && request.slot === 'read') {
      armed = false;
      target = { worker: this, id: request.id };
    }
    return post.call(this, request, ...rest);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true, get: handler.get,
    set(callback) {
      handler.set.call(this, typeof callback === 'function' ? function (event) {
        if (target?.worker === this && event.data?.id === target.id && event.data.result) {
          held = { result: event.data.result, release: () => callback.call(this, event) };
          target = undefined;
          return;
        }
        return callback.call(this, event);
      } : callback);
    },
  });
  window.__stepAngleReply = {
    arm() { if (armed || target || held) throw Error('An old STEP reply is still active'); armed = true; },
    read() { return held?.result; },
    release() { if (!held) throw Error('Expected a STEP read reply'); held.release(); held = undefined; },
  };
}

async function verifyTetrahedron(label, doc, tessellated) {
  const result = await flow.inspect(label, doc);
  assert.ok(result.strict);
  assert.deepEqual(result.faces.map(name => name.replace(/^n\d+\./, '')).sort(), ['bottom', 'front', 'left', 'slope']);
  assert.deepEqual(result.kinds, [tessellated ? 'facets' : 'surface']);
  near(result.volume, 32, 1e-7);
  result.centroid.forEach((coordinate, i) => near(coordinate, [1, 1.5, 2][i], 1e-7));
  const { bodies } = await flow.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, 32, 1e-7);
  flow.report.observations.push({ label, ...result });
  return result.digest;
}

async function retainNonConeSources() {
  await flow.newPage();
  for (const tessellated of [false, true]) for (const cm of [false, true]) {
    const label = `${tessellated ? 'tessellated' : 'planar'}-degree-${cm ? 'cm' : 'mm'}`;
    flow.phase = `Open ${label}`;
    const step = tetrahedronAngleFixture('degree', { tessellated, cm });
    await flow.dismissToasts();
    await flow.openFile(await file(label, step), cm ? 2 : 1);
    if (cm) await flow.waitToast(/STEP opened.*in centimetres, scaled ×10 to millimetres/is);
    else await flow.waitToast(/STEP opened.*in millimetres/is);
    assert.equal(await flow.page.getByRole('dialog', { name: 'Mesh repair', exact: true }).count(), 0);
    const doc = await flow.doc();
    assert.equal(doc.nodes[0].kind, 'import');
    assert.equal(doc.nodes[0].step, step);
    assert.deepEqual(doc.nodes.slice(1), cm ? [{ id: 'n1', kind: 'scale', parent: { node: 0, side: 'solid' }, factor: 10, pivot: [0, 0, 0] }] : []);
    await frame();
    const expected = await verifyTetrahedron(label, doc, tessellated);
    await flow.snapshot(label);
    if (cm) {
      const saved = await flow.save(label);
      await flow.freshOpen(saved.file, doc, `${label}-reopened`);
      assert.equal(await verifyTetrahedron(`${label}-reopened`, doc, tessellated), expected);
    }
  }
}

await flow.run(async () => {
  if (retention) return retainNonConeSources();
  const radian = await file('radian-one-degree', coneAngleFixture('radian'));
  const degree = await file('degree-one-degree', coneAngleFixture('degree'));
  const offset = await file('degree-zero-offset', coneAngleFixture('degree', 1, true));
  if (!baseline) {
    const newContext = flow.browser.newContext.bind(flow.browser);
    flow.browser.newContext = async options => {
      const context = await newContext(options);
      await context.addInitScript(holdStepFailure);
      return context;
    };
  }
  await flow.newPage();
  const accepted = await show('01-radian-open', radian, 1);
  if (baseline) {
    flow.phase = 'Open the equivalent degree-declared cone on the unchanged build';
    await input().setInputFiles(degree);
    await flow.changed(accepted);
    await flow.waitToast(/STEP opened/);
    await frame();
    const incorrect = await flow.doc(), native = await flow.inspect('02-degree-accepted', incorrect);
    assert.equal(native.strict, false);
    assert.ok(Math.abs(native.volume - volume(1)) > .01);
    flow.report.observations.push({ label: 'degree input was silently accepted', native, expectedVolume: volume(1) });
    await flow.snapshot('02-degree-accepted');
    return;
  }
  await flow.page.getByRole('complementary', { name: 'Browser', exact: true })
    .getByRole('button', { name: 'Import radian-one-degree', exact: true }).click();
  await flow.page.waitForFunction(() => window.__studioSelection?.selection?.bodies?.length === 1);
  const before = await capture();
  for (const [label, path] of [['02-degree-refused', degree], ['03-zero-offset-degree-refused', offset]]) {
    flow.phase = label;
    await input().setInputFiles(path);
    await flow.waitToast(/Could not open this file.*plane.angle unit/is);
    await flow.same(accepted);
    assert.deepEqual(await capture(), before);
    await flow.snapshot(label);
    await flow.dismissToasts();
  }
  const saved = await flow.save('radian-retained');
  await flow.freshOpen(saved.file, accepted, '04-native-reopen');
  near((await flow.bodies()).bodies[0].volume, volume(1), 1e-7);
  const untargeted = await file('degree-without-cone', nonConeAngleFixture());
  await input().setInputFiles(untargeted);
  await flow.changed(accepted);
  await flow.waitToast(/STEP opened/);
  near((await flow.bodies()).bodies[0].volume, 12000 - 160 * Math.PI, 1e-7);
  await frame();
  await flow.snapshot('05-degree-non-cone-open');

  flow.phase = 'Replace the part while the actual degree refusal is pending';
  await flow.dismissToasts();
  const previous = await flow.doc();
  await flow.page.evaluate(() => window.__stepAngleReply.arm());
  await input().setInputFiles(degree);
  const reply = await (await flow.page.waitForFunction(() => window.__stepAngleReply.read())).jsonValue();
  assert.equal(reply.ok, false);
  assert.match(reply.error.detail, /plane-angle unit is not supported/);
  await flow.same(previous);
  await flow.page.getByRole('button', { name: 'New part', exact: true }).click();
  await flow.page.waitForFunction(() => window.__studioDoc?.nodes.length === 0 ||
    [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Discard changes'));
  const discard = flow.page.getByRole('button', { name: 'Discard changes', exact: true });
  if (await discard.count()) await discard.click();
  await flow.changed(previous);
  const replacement = await flow.doc();
  assert.equal(replacement.nodes.length, 0);
  await flow.page.evaluate(() => window.__stepAngleReply.release());
  await flow.same(replacement);
  assert.ok(!(await flow.toasts()).some(text => /plane-angle unit|Could not open/.test(text)));
  await flow.snapshot('06-stale-degree-refusal-ignored');
});
