import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const [output, input] = process.argv.slice(2);
const originalBytes = await readFile(input), stock = JSON.parse(originalBytes);
const solid = node => ({ node, side: 'solid' });
const stockIndex = stock.nodes.length - 1, sketch = stockIndex + 1, tool = sketch + 1, cut = tool + 1, heal = cut + 1;
const donor = 'b3', cutName = 'n' + tool + '.side0';
assert.equal(stockIndex, 5);
const seed = {
  ...stock, nextId: cut,
  nodes: [...stock.nodes,
    { id: 'n' + sketch, kind: 'sketch', profile: 'circle', center: [0, 0], radius: 1.5,
      plane: { origin: [20, 25, 3], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { id: 'n' + tool, kind: 'extrude', sketch, height: 9 },
  ],
  outputs: { ...stock.outputs, ['b' + tool]: solid(tool) },
};
const pins = [
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/test/model-rail-helper.mjs',
  ...['app/deleteFaceCommand', 'chat/names', 'engine/doc', 'engine/mesh'].map(name => 'packages/barocss-cad-model/src/' + name + '.ts'),
  'packages/barocss-cad/src/part/part-delete-face.ts',
  'packages/barocss-cad/src/features/heal-exact-cylinder-bore.ts',
];
const f = await createFlow({
  name: 'delete-exact-semicylinder-radial-bore', output, envFrozen: 'D1664_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Restore the exact stock after a radial through bore and retain the inclined reference and signed wall Offset.',
  limits: ['One upright Exact semicylinder and a centered circular cutter through both radial skins. Desktop WebGPU and local stdio MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => ({
  key, brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  surfaces: Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face)])),
}))));
`,
});
const button = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
const item = (rows, key) => rows.find(row => row.key === key);
const volume = height => Math.PI / 2 * (12 ** 2 - 8 ** 2) * height - (12 ** 3 - 8 ** 3) / 3;

function removedVolume() {
  // Integrate the vertical chords through the two positive-Y cylinder roots.
  const intervals = 512, step = Math.PI / (2 * intervals), radius = 1.5;
  let sum = 0;
  for (let i = 0; i <= intervals; i++) {
    const angle = i * step, x = radius * Math.sin(angle);
    const depth = Math.sqrt(12 ** 2 - x * x) - Math.sqrt(8 ** 2 - x * x);
    const weight = i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2;
    sum += weight * 4 * (radius * Math.cos(angle)) ** 2 * depth;
  }
  return sum * step / 3;
}

async function check(label, doc, expected, targetIndex, height) {
  const native = await f.inspect(label, doc);
  assert.equal(native.length, 2);
  const key = 'b' + targetIndex, body = item(native, key), unchanged = item(expected, 'b' + stockIndex);
  assert.ok(body.report.valid, body.report.issues.join('\n'));
  const bored = targetIndex === cut;
  assert.equal(body.report.topology[0].genus, bored ? 1 : 0);
  assert.equal(body.report.counts.faces, bored ? 8 : 6);
  if (bored) {
    for (const suffix of ['#1', '#2']) {
      const bore = body.surfaces[cutName + suffix];
      assert.deepEqual([bore.kind, bore.a, bore.out], ['cylinder', [0, 1, 0], -1]);
      near(bore.r, 1.5);
    }
  } else {
    assert.deepEqual(body.brep, unchanged.brep);
  }
  assert.deepEqual(item(native, donor).brep, item(expected, donor).brep);
  const measure = volume(height) - (bored ? removedVolume() : 0);
  const studio = item((await f.bodies()).bodies, key);
  near(body.mass.volume, measure);
  near(studio.volume, measure);
  near(body.surfaces['n0.normal'].r, 12);
  near(body.surfaces['n0.reverse'].r, 8);
  const cap = body.surfaces['n0.v-max'];
  near(cap.n[1] / cap.n[2], .5);
  near(cap.o[2] + .5 * (cap.o[1] - 20), height);
  f.report.observations.push({ label, genus: body.report.topology[0].genus, volume: body.mass.volume,
    expectedVolume: measure, studioVolume: studio.volume, centroid: body.mass.centroid,
    maximumPcurveGap: body.report.maximumPcurveGap, key });
}

async function selectBore() {
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Back', exact: true }).click();
  await f.page.locator('.vc-label').getByText('BACK', { exact: true }).waitFor();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const label = f.page.getByLabel('Face property and colour target');
  const aim = [20, 30, 3], [x, y] = await f.screenOf(aim);
  // A short orbit makes the inside bore wall visible from the outer opening.
  await f.page.mouse.move(x, y);
  await f.page.mouse.down({ button: 'right' });
  await f.page.mouse.move(x + 30, y + 27, { steps: 5 });
  await f.page.mouse.up({ button: 'right' });
  const angles = [45, 135, 225, 315, 70, 110, 250, 290, 15, 165, 195, 345];
  for (const y of [30.7, 31.5, 29.5, 28.8]) {
    for (const angle of angles) {
      const a = angle * Math.PI / 180;
      await f.worldClick([20 + 1.5 * Math.cos(a), y, 3 + 1.5 * Math.sin(a)]);
      if ((await label.count()) && (await label.innerText()).includes(cutName)) return;
    }
  }
  assert.fail('The actual pointer did not select the radial bore wall');
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
  const file = join(output, 'radial-cutter-input.bcad');
  await writeFile(file, JSON.stringify(seed));
  const expected = await f.inspect('00-uncut-stock', stock);
  await f.freshOpen(file, seed, '01-cutter-opened');
  f.phase = 'Subtract the cutter from the edited semicylinder';
  const bodies = f.page.locator('.outliner [data-browser-body-key]');
  assert.equal(await bodies.count(), 3);
  await bodies.and(f.page.locator('[data-browser-body-key="b' + stockIndex + '"]')).click();
  await bodies.and(f.page.locator('[data-browser-body-key="b' + tool + '"]')).click({ modifiers: ['Shift'] });
  await clickModelCommand(f.page, 'Combine', 'Subtract');
  await f.changed(seed);
  const drilled = await f.doc();
  assert.deepEqual(drilled.nodes.at(-1), { id: 'n' + cut, kind: 'difference', parent: solid(stockIndex), tool: solid(tool) });
  await check('02-drilled-stock', drilled, expected, cut, 13);

  f.phase = 'Pick the radial bore and apply Delete face';
  await selectBore();
  await f.snapshot('02-bore-selected');
  await f.command('Delete face');
  const preview = f.page.getByRole('dialog', { name: 'Delete face', exact: true });
  const apply = button('Apply', preview);
  await apply.and(preview.locator('button:not([disabled])')).waitFor({ timeout: 15000 });
  await f.snapshot('03-exact-heal-preview');
  await apply.click();
  await f.changed(drilled);
  const repaired = await f.doc(), node = repaired.nodes.at(-1);
  assert.deepEqual(repaired.nodes.slice(0, heal), drilled.nodes);
  assert.deepEqual([node.kind, node.parent, node.faces], ['delete-face', solid(cut), [cutName + '#1']]);
  await check('04-healed-stock', repaired, expected, heal, 13);
  await f.snapshot('04-wall-healed');

  f.phase = 'Replay the same repair through revision-pinned local MCP';
  const agent = join(output, 'agent-radial-heal.bcad');
  await writeFile(agent, JSON.stringify(drilled));
  await withMcpSession({ app: f.app, output, clientName: f.name, autonomy: 3 }, agent, 'radial-heal', async call => {
    const revision = await currentPartRevision(call);
    const command = { action: 'command', command: 'delete-face', faces: [cutName + '#2'], expectedRevision: revision };
    const original = await readFile(agent);
    const wrong = await call('features', { ...command, faces: ['n0.reverse'] }, true);
    assert.match(JSON.stringify(wrong), /Select the cylindrical wall/i);
    assert.deepEqual(await readFile(agent), original);
    await call('features', command);
    const bytes = await readFile(agent);
    assert.deepEqual(JSON.parse(bytes), repaired);
    const stale = await call('features', command, true);
    assert.equal(stale.code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(agent), bytes);
    f.report.observations.push({ revision, stale: stale.code });
  });

  f.phase = 'Restore the bore by Undo and heal it again by Redo';
  await f.undo();
  await f.same(drilled);
  await check('05-undo-native', drilled, expected, cut, 13);
  await f.snapshot('05-undo-restores-bore');
  await f.redo();
  await f.same(repaired);
  await check('06-redo-native', repaired, expected, heal, 13);

  f.phase = 'Move the linked donor while the repair stays in History';
  await f.openFeatureEditor(3, 'inclined reference position');
  const z = f.editor().getByLabel('ΔZ', { exact: true });
  await z.fill('-2');
  await f.applyEditor(repaired, '07-donor-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes.slice(4), repaired.nodes.slice(4));
  const movedStock = { ...stock, nodes: moved.nodes.slice(0, stockIndex + 1) };
  const movedExpected = await f.inspect('07-current-uncut-stock', movedStock);
  await check('07-moved-healed-stock', moved, movedExpected, heal, 11);
  await f.undo();
  await f.same(repaired);
  await f.redo();
  await f.same(moved);

  const saved = await f.save('healed-radial-wall');
  await f.freshOpen(saved.file, moved, '08-healed-wall-reopened');
  await check('08-reopened-native', moved, movedExpected, heal, 11);
  const replacement = stock.nodes.findIndex(node => node.kind === 'replace-face');
  await f.openFeatureEditor(replacement, 'linked cap after healing');
  await button('Edit Replace face', f.editor()).click();
  const edit = f.page.getByRole('dialog', { name: 'Edit Replace face', exact: true });
  await edit.getByText(stock.nodes[replacement].target.face, { exact: false }).waitFor();
  await f.snapshot('09-reopened-cap-link');
  await button('Cancel', edit).click();
  await f.same(moved);
  assert.deepEqual(await readFile(input), originalBytes);
});
