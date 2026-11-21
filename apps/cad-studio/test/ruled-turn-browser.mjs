import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/ruled-turn-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/HistoryFeatureEditor.tsx',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/ruledTurnCommand.ts', 'packages/barocss-cad/src/features/loft.ts',
];
const f = await createFlow({
  name: 'ruled-turn-command',
  output: process.argv[2],
  envFrozen: 'RULED_TURN_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Generate a signed ruled turn from one actual profile, then edit and reopen the native Loft.',
  limits: ['A standalone rectangular profile, four or five 90° spans and an independent base section edit.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep, key }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const edges = brep.edges.map(edge => {
  const [start, end] = curveDomain(edge.curve);
  return [start, (start + end) / 2, end].map(t => evaluateCurve(edge.curve, t));
});
console.log(JSON.stringify({ key, digest: digestOf(brep), volume: brepMassProperties(brep, 1).volume,
  count: brep.bodies.length, kind: brep.bodies[0].kind, valid: checkBrep(brep, { strict: true }).valid,
  closed: brep.shells.length === 1 && brep.shells[0].closed, faces: brep.faces.length, edges }));
`,
});

const origin = [11, -17, 3];
const min = [1, 2], max = [13, 10];
const scaled = process.argv.includes('--scaled-frame');
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min, max,
    plane: { origin, normal: [0, 0, scaled ? 2 : 1], xAxis: [scaled ? 3 : 1, 0, 0] } }],
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Ruled Turn', exact: true });
const angleField = () => hud().getByLabel('Turn angle', { exact: true });
const heightField = () => hud().getByLabel('Height', { exact: true });
const status = (value) => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const near = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis])) < 1e-8;

function cornerAt([x, y], index, sign, resize) {
  const [u, v] = [[x, y], [-y, x], [-x, -y], [y, -x]][(index * sign % 4 + 4) % 4];
  return [origin[0] + 7 + u + (index === 0 && x === 6 ? resize : 0), origin[1] + 6 + v, origin[2] + index * 10];
}

async function frame() {
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}

async function draft() {
  await button('Sketch 1').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Ruled Turn');
  await hud().waitFor();
}

async function apply(angle, height) {
  await heightField().fill(String(height));
  await angleField().fill(String(angle));
  await status('preview').waitFor();
  await f.same(source);
  await button('Apply', hud()).click();
  await f.changed(source);
  return f.doc();
}

async function verify(doc, label, angle, resize = 0) {
  const feature = doc.nodes.at(-1);
  assert.equal(feature.kind, 'loft');
  assert.deepEqual(doc.nodes[0], source.nodes[0]);
  assert.deepEqual(feature.from, [0]);
  assert.equal(doc.direct, undefined);
  const count = Math.abs(angle / 90), sign = Math.sign(angle);
  assert.deepEqual(feature.sections.map(({ z }) => z), Array.from({ length: count + 1 }, (_, index) => index * 10));
  assert.equal(feature.guide.kind, 'nurbs');
  assert.equal(feature.guide.degree, 1);
  assert.equal(feature.guide.controlPoints.length, count + 1);
  for (let index = 0; index <= count; index++) {
    assert.ok(near(feature.guide.controlPoints[index], cornerAt([-6, -4], index, sign, 0)));
  }
  const native = await f.inspect(label, doc);
  const expected = 96 * 10 * count * 2 / 3 + 8 * resize * 10 / 3;
  assert.deepEqual([native.count, native.kind, native.valid, native.closed, native.faces], [1, 'solid', true, true, count * 4 + 2]);
  assert.ok(Math.abs(native.volume - expected) < 1e-7);
  const [body] = (await f.bodies()).bodies;
  assert.equal(body.key, native.key);
  assert.ok(Math.abs(body.volume - native.volume) < 1e-7);
  const rulings = native.edges.filter(([a, , b]) => Math.abs(a[2] - b[2]) > 1e-8);
  assert.equal(rulings.length, count * 4);
  for (const corner of [[-6, -4], [6, -4], [6, 4], [-6, 4]]) {
    for (let index = 0; index < count; index++) {
      const a = cornerAt(corner, index, sign, resize), b = cornerAt(corner, index + 1, sign, resize);
      const midpoint = a.map((value, axis) => (value + b[axis]) / 2);
      assert.ok(rulings.some(([first, middle, last]) =>
        near(middle, midpoint) && ((near(first, a) && near(last, b)) || (near(first, b) && near(last, a)))));
    }
  }
  f.report.observations.push({ label, angle, resize, digest: native.digest, volume: native.volume, rulings: rulings.length });
  return native;
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
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'single-rectangle.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);

  f.phase = 'refuse values outside the authoring range and cancel';
  await draft();
  await heightField().fill('0');
  await status('refused').waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  await heightField().fill('40');
  await status('preview').waitFor();
  await angleField().fill('451');
  await status('refused').waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  await f.same(source);
  await button('Cancel', hud()).click();
  await f.same(source);

  for (const [label, angle] of [['positive-turn', 360], ['negative-turn', -360]]) {
    f.phase = 'create ' + label;
    await draft();
    const doc = await apply(angle, 40);
    await verify(doc, label + '-native', angle);
    await frame();
    await f.snapshot(label);
    await f.undo();
    await f.same(source);
  }

  f.phase = 'create and reopen a 450-degree ruled turn';
  await draft();
  const original = await apply(450, 50);
  const native = await verify(original, 'turn-450-native', 450);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(original);
  const saved = await f.save('ruled-turn-450');
  await f.freshOpen(saved.file, original, 'ruled-turn-450-opened');
  assert.equal((await verify(original, 'reopened-450-native', 450)).digest, native.digest);
  await frame();
  await f.snapshot('ruled-turn-450-reopened-framed');

  f.phase = 'edit the base rectangle on the reopened Loft';
  await f.openFeatureEditor(original.nodes.length - 1, 'Ruled Turn Loft');
  const width = f.editor().getByLabel('Section 1 · Width', { exact: true });
  assert.equal(await width.inputValue(), '12');
  await width.fill('14');
  const edited = (await f.applyEditor(original, 'ruled-turn-base-width')).doc;
  const updated = await verify(edited, 'edited-450-native', 450, 2);
  assert.notEqual(updated.digest, native.digest);
  assert.equal(updated.key, native.key);
  assert.deepEqual(edited.nodes.at(-1).guide, original.nodes.at(-1).guide);
  assert.deepEqual(edited.nodes.slice(2), original.nodes.slice(2));
  const editedFile = await f.save('ruled-turn-450-wide-base');
  await f.freshOpen(editedFile.file, edited, 'ruled-turn-edited-reopened');
  assert.equal((await verify(edited, 'ruled-turn-edited-reopened-native', 450, 2)).digest, updated.digest);
});
