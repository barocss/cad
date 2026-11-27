import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const openTop = process.argv.includes('--open-top');
const opening = openTop ? ['n1.top'] : [];
const legacyDigest = openTop ? 'ee4925e7874fb86a1f87f661211c35a1a8c2f0a141e8efade990fd2ef3de74f1'
  : '24096dc2d7d70b12de98b95847e79052dc930f5bcbff0c1e796fc2c8b522ba9c';
const pins = [
  'packages/barocss-cad/src/part/part-shell.ts',
  'packages/barocss-cad/src/blend/general-shell.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'shell-corner', output: process.argv[2], envFrozen: 'SHELL_CORNER_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Choose the L-prism Shell inner corner, edit it in History and reopen the native document.',
  limits: [`Uniform Shell on one original six-edge orthogonal L-prism, ${openTop ? 'with one open top cap' : 'without an opening'}.`],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc), output = outputs[0];
const { brep } = output;
console.log(JSON.stringify({
  bodies: outputs.length, report: checkBrep(brep, { strict: true }), mass: massPropertiesOf(output),
  faces: brep.faces.map(face => ({
    name: face.name, geometry: faceGeometry(face),
    loops: face.loops.map(id => brep.loops.find(loop => loop.id === id)?.kind),
  })),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex'),
}));
`,
});
const points = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]];
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { exact: true, name });
const hud = () => f.page.getByRole('dialog', { exact: true, name: 'Shell' });
const corner = scope => scope.getByLabel('Inner corner', { exact: true });
const wall = scope => scope.getByLabel('Wall', { exact: true });
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

async function verify(label, doc, t, rounded) {
  const read = await f.inspect(label, doc);
  assert.equal(read.bodies, 1);
  assert.ok(read.report.valid, read.report.issues.join('\n'));
  const innerArea = (40 - 2 * t) * (10 - 2 * t) + (10 - 2 * t) * (30 - 2 * t) - (10 - 2 * t) ** 2;
  const cornerArea = rounded ? t ** 2 * (1 - Math.PI / 4) : 0;
  const volume = 12000 - (innerArea + cornerArea) * (20 - (openTop ? 1 : 2) * t);
  assert.equal(read.report.counts.shells, openTop ? 1 : 2);
  if (openTop) {
    const at = z => read.faces.filter(({ geometry: g }) => g.kind === 'plane' && Math.abs(g.n[2]) === 1 && Math.abs(g.o[2] - z) < 1e-9);
    const rim = at(20);
    assert.equal(rim.length, 1);
    assert.deepEqual(rim[0].loops.slice().sort(), ['inner', 'outer']);
    assert.equal(at(t).length, 1, 'cavity floor retains the wall thickness above the original bottom');
    assert.equal(at(0).length, 1, 'outer bottom stays on the original support');
  }
  near(read.mass.volume, volume);
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  near(worker[0].volume, volume);
  f.report.observations.push({ label, volume, nativeVolume: read.mass.volume, counts: read.report.counts, digest: read.digest });
  return read;
}

async function startShell() {
  if (openTop) {
    const filter = button('Selection filter');
    for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
    assert.match(await filter.innerText(), /Faces/);
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await button('Top', f.page.locator('.views')).click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const pixel = await f.page.evaluate(() => window.__studioScreenOf([5, 5, 20]));
    await f.page.mouse.click(...pixel);
    await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  } else {
    await button('Extrude 20', f.page.getByRole('complementary', { name: 'Browser', exact: true })).click();
  }
  await clickModelCommand(f.page, 'Modify', 'Shell');
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
}

async function section(label, doc) {
  await button('Section view').click();
  await button('Section across Z').click();
  await button('Flip the section').click();
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const state = window.__studioSection();
    return state?.mode === 'plane' && state.planes[0]?.axis === 'z' && Math.abs(state.planes[0].offset + 10) < 1e-6;
  });
  await f.same(doc);
  await f.snapshot(label, () => ({ section: window.__studioSection() }));
  await button('Section view').click();
}

await f.run(async () => {
  const seed = join(f.output, 'closed-l-stock.bcad');
  await writeFile(seed, JSON.stringify(stock));
  if (!baseline) {
    const legacyFile = process.argv[3];
    assert.ok(legacyFile, 'Supply the legacy document captured by the baseline run.');
    const legacy = JSON.parse(await readFile(legacyFile, 'utf8'));
    const reopened = (await f.freshOpen(legacyFile, legacy, 'legacy-reopened')).doc;
    assert.equal(Object.hasOwn(reopened.nodes[2], 'join'), false);
    assert.equal((await verify('legacy-reopened-native', reopened, 2, true)).digest, legacyDigest);
  }
  await f.freshOpen(seed, stock, 'original-l-prism');
  await startShell();
  if (baseline) {
    f.phase = 'Verify the old Shell has no corner choice and writes the existing round result';
    assert.equal(await corner(hud()).count(), 0);
    await f.same(stock);
    await f.snapshot('legacy-no-corner-choice');
    await button('Apply', hud()).click();
    await f.changed(stock);
    const legacy = await f.doc();
    assert.equal(legacy.nodes[2].kind, 'shell');
    assert.deepEqual(legacy.nodes[2].open, opening);
    assert.equal(Object.hasOwn(legacy.nodes[2], 'join'), false);
    await verify('legacy-round-native', legacy, 2, true);
    await f.snapshot('legacy-round-applied');
    return;
  }

  f.phase = 'Verify the default and cancel the explicit Sharp preview';
  assert.equal(await corner(hud()).inputValue(), 'default');
  const undoWasEnabled = await button('Undo').isEnabled();
  await corner(hud()).selectOption('sharp');
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.same(stock);
  await f.snapshot('sharp-preview');
  await button('Cancel', hud()).click();
  await hud().waitFor({ state: 'hidden' });
  await f.same(stock);
  assert.equal(await button('Undo').isEnabled(), undoWasEnabled);
  await startShell();
  assert.equal(await corner(hud()).inputValue(), 'default');
  await corner(hud()).selectOption('sharp');
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await button('Apply', hud()).click();
  await f.changed(stock);
  const sharp = await f.doc();
  assert.deepEqual(sharp.nodes[2], {
    id: 'n2', kind: 'shell', parent: { node: 1, side: 'solid' }, thickness: 2, open: opening, join: 'sharp',
    ...(openTop ? { sigs: { 'n1.top': { d: [0, 0, 1], k: 'plane', p: [15, 10, 20], s: 600 } } } : {}),
  });
  const sharpRead = await verify('sharp-native', sharp, 2, false);
  assert.equal(sharpRead.faces.filter(face => face.geometry.kind === 'cylinder').length, 0);
  await section('sharp-cavity', sharp);

  await f.openFeatureEditor(2, 'Shell corner');
  const editor = f.editor();
  assert.equal(await corner(editor).inputValue(), 'sharp');
  await wall(editor).fill('5');
  await button('Apply', editor).click();
  await editor.getByText('The wall is too thick', { exact: true }).waitFor();
  await editor.getByText('Enter Wall less than 5 mm to keep the cavity open inside the L shape.', { exact: true }).waitFor();
  await f.same(sharp);
  await f.snapshot('thickness-limit-refused');
  await button('Reset', editor).click();
  assert.equal(await wall(editor).inputValue(), '2');
  await corner(editor).selectOption('arc');
  const round = (await f.applyEditor(sharp, 'round-history-applied')).doc;
  assert.deepEqual(round.nodes[2], { ...sharp.nodes[2], join: 'arc' });
  const roundRead = await verify('round-native', round, 2, true);
  assert.equal(roundRead.faces.filter(face => face.geometry.kind === 'cylinder').length, 1);
  assert.notEqual(roundRead.digest, sharpRead.digest);
  await f.undo();
  await f.same(sharp);
  await f.redo();
  await f.same(round);
  const saved = await f.save(openTop ? 'open-top-l-round-shell' : 'closed-l-round-shell');
  const reopened = (await f.freshOpen(saved.file, round, 'round-reopened')).doc;
  assert.equal((await verify('round-reopened-native', reopened, 2, true)).digest, roundRead.digest);
  await f.openFeatureEditor(2, 'reopened Round Shell corner');
  assert.equal(await corner(f.editor()).inputValue(), 'arc');
  await f.closeEditor();
  await section('round-reopened-cavity', reopened);
});
