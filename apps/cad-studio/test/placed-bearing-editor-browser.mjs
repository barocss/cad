import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

const fixturePath = 'apps/cad-studio/test/fixtures/bearing-housing-identity.bcad';
const peerView = process.argv.includes('--peer-view');
const reference = JSON.parse(await readFile(fixturePath, 'utf8'));
const [housing, bearing] = reference.instances;
const child = structuredClone(bearing.doc);
delete child.nodes[1].housingRef;
delete child.nodes[1].housingClass;
const doc = { ...reference, instances: [
  { ...housing, position: [12, 3, 4] },
  { ...bearing, doc: child, position: [12, 3, 4] },
  { ...bearing, id: 'inst3', name: 'inst3', doc: child, position: [95, 3, 4] },
] };
const inputs = [
  'apps/cad-studio/test/placed-bearing-editor-browser.mjs',
  fixturePath,
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/bearingEdit.ts',
  'apps/cad-studio/src/app/usePlacedBearingEditor.ts',
  'apps/cad-studio/src/ui/InstanceInspector.tsx',
  'apps/cad-studio/src/viewport/gpuRenderer.ts',
];
const flow = await createFlow({
  name: 'placed-bearing-editor', output: process.argv[2], envFrozen: 'D1868_SOURCE_FROZEN',
  initialFiles: inputs, requiredFrozen: inputs,
  qualification: 'Edit the housing of one placed bearing. An obsolete validation cannot transfer the edit to another selected occurrence.',
  limits: ['Two displaced occurrences of the same authored shaft and bearing. One externally matched native cylindrical housing.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { resolveShopTree } from '@barocss/cad-model/engine/shopRows';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(doc.instances.slice(1).map(instance => {
  const result = evaluatePart(resolveShopTree(instance.doc, doc, instance.id), 1);
  if (!result.ok) throw new Error(instance.id + ': ' + result.error.detail);
  const bearing = result.bodies.find(b => b.element?.kind === 'bearing');
  return { id: instance.id, position: instance.position, volume: bearing.volume,
    report: bearing.element.report, topology: bearing.topology };
})));
`,
});
const row = id => flow.page.locator(`[data-browser-instance-path="${id}"]`);
const editor = () => flow.page.getByRole('complementary', { name: 'Part bearing properties', exact: true });
const bounds = () => flow.page.evaluate(() => window.__studioInstanceBounds());

async function readPeerBearing(label) {
  const views = flow.page.locator('.views');
  await views.getByRole('button', { name: 'Top', exact: true }).click();
  await flow.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'TOP');
  const hits = await flow.page.evaluate(points => points.map(point => window.__studioInstanceAt(point)),
    [[115, 3, 34], [75, 3, 34], [95, 23, 34], [95, -17, 34]]);
  flow.report.observations.push({ label, hits });
  await views.getByRole('button', { name: 'Iso', exact: true }).click();
  return hits;
}

async function edit(id) {
  await row(id).click();
  await flow.page.getByRole('button', { name: new RegExp(`^Edit ${id}: Bearing`) }).click();
  await editor().waitFor();
}

async function chooseHousing() {
  const control = editor().getByLabel('Housing', { exact: true });
  const option = control.getByRole('option', { name: /^inst1 \/ b1:/ });
  const value = await option.getAttribute('value');
  assert.ok(value);
  await control.selectOption(value);
}

function holdBearingValidation() {
  const proto = Worker.prototype, post = proto.postMessage;
  const handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target, held;
  proto.postMessage = function (request, ...rest) {
    if (armed && request?.type === 'part' && request.slot === 'part') {
      armed = false;
      target = { worker: this, id: request.id, revision: request.revision };
    }
    return post.call(this, request, ...rest);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true, get: handler.get,
    set(callback) {
      handler.set.call(this, typeof callback === 'function' ? function (event) {
        if (target?.worker === this && event.data?.id === target.id && event.data.result) {
          held = { result: event.data.result, revision: target.revision, release: () => callback.call(this, event) };
          target = undefined;
          return;
        }
        return callback.call(this, event);
      } : callback);
    },
  });
  window.__bearingValidation = {
    arm() { if (armed || target || held) throw Error('Validation is already pending'); armed = true; },
    read() { return held && { ok: held.result.ok, revision: held.revision, resultRevision: held.result.revision }; },
    release() { if (!held) throw Error('Expected a real bearing validation reply'); held.release(); held = undefined; },
  };
}

await flow.run(async () => {
  const originalContext = flow.browser.newContext.bind(flow.browser);
  flow.browser.newContext = async options => {
    const context = await originalContext(options);
    await context.addInitScript(holdBearingValidation);
    return context;
  };
  await flow.newPage();
  await flow.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'placed-bearing-editor.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await flow.same(doc);
  await flow.page.waitForFunction(() => window.__studioInstanceBounds?.().filter(item => item.min && item.max).length === 3);
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  const geometry = await bounds(), original = await flow.inspect('original-native', doc);
  const peerHits = peerView ? await readPeerBearing('peer bearing before Apply') : null;
  if (peerHits) assert.equal(peerHits.filter(hit => hit?.id === 'inst3' && hit.body === 1).length, 3);
  assert.ok(original.every(item => !item.report.housing && item.topology.kind === 'solid'));
  assert.equal(original[0].volume, original[1].volume);

  flow.phase = 'Hold a valid worker result, then select another occurrence';
  await edit('inst2');
  await chooseHousing();
  await flow.page.evaluate(() => window.__bearingValidation.arm());
  await editor().getByRole('button', { name: 'Apply', exact: true }).click();
  const held = await (await flow.page.waitForFunction(() => window.__bearingValidation.read())).jsonValue();
  assert.equal(held.ok, true);
  assert.equal(held.resultRevision, held.revision);
  await flow.snapshot('01-housing-edit-pending');
  await row('inst3').click();
  await flow.page.getByRole('complementary', { name: 'Instance', exact: true }).waitFor();
  await flow.page.evaluate(() => window.__bearingValidation.release());
  await flow.same(doc);
  assert.match(await row('inst3').getAttribute('class'), /\bsel\b/);
  assert.deepEqual(await bounds(), geometry);
  await flow.snapshot('02-different-occurrence-keeps-selection');

  flow.phase = 'Apply the same housing edit to the original occurrence';
  await edit('inst2');
  await chooseHousing();
  await editor().getByRole('button', { name: 'Apply', exact: true }).click();
  await flow.changed(doc);
  await editor().waitFor({ state: 'hidden' });
  await flow.page.waitForFunction(before => JSON.stringify(window.__studioInstanceBounds()) === before, JSON.stringify(geometry));
  const accepted = await flow.doc();
  assert.deepEqual(accepted.instances[0], doc.instances[0]);
  assert.deepEqual(accepted.instances[2], doc.instances[2]);
  const own = accepted.instances[1];
  assert.deepEqual(own.position, [12, 3, 4]);
  assert.deepEqual(own.rotation, doc.instances[1].rotation);
  assert.deepEqual(own.doc.nodes[1].housingRef, { part: 'inst1', body: 'b1' });
  assert.equal(Object.hasOwn(own.doc, 'bearings'), false);
  assert.equal(Object.hasOwn(own.doc, 'fits'), false);
  const after = await flow.inspect('accepted-native', accepted);
  assert.equal(after[0].report.housing.covered, true);
  assert.equal(after[0].volume, original[0].volume);
  assert.deepEqual(after[1], original[1]);
  if (peerHits) assert.deepEqual(await readPeerBearing('peer bearing after Apply'), peerHits);
  await flow.snapshot('03-selected-occurrence-applied');
  await flow.undo(); await flow.same(doc);
  await flow.redo(); await flow.same(accepted);
  const saved = await flow.save('placed-bearing-housing');
  flow.phase = 'Open the native assembly and wait for all placed geometry';
  await flow.newPage();
  await flow.openFile(saved.file, accepted.nodes.length);
  await flow.same(accepted);
  await flow.page.waitForFunction(before => JSON.stringify(window.__studioInstanceBounds()) === before, JSON.stringify(geometry));
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  assert.deepEqual(await flow.inspect('reopened-native', accepted), after);
  if (peerHits) assert.deepEqual(await readPeerBearing('peer bearing after fresh Open'), peerHits);
  await edit('inst2');
  const retained = editor().getByLabel('Housing', { exact: true });
  assert.match(await retained.locator('option:checked').innerText(), /^inst1 \/ b1:/);
  await flow.snapshot('04-native-reopened');
});
