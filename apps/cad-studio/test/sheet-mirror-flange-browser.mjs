import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const fixture = 'packages/barocss-cad-model/test/fixtures/sheet-l-bracket.calls.json';
const canonical = 'packages/barocss-cad/conformance/r12/accept-l-bracket.json';
const repo = new URL('../../../', import.meta.url);
const pins = [
  'apps/cad-studio/test/sheet-mirror-flange-browser.mjs',
  'packages/barocss-cad/src/part/part-transform.ts',
  'packages/barocss-cad-model/src/engine/mirrorReplacement.ts',
  'apps/cad-studio/src/ui/FlatPatternDialog.tsx',
  fixture,
  canonical,
];

const f = await createFlow({
  name: 'sheet-mirror-flange',
  output: process.argv[2],
  envFrozen: 'D2027_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Verify subsequent flange, upstream thickness edit, Undo/Redo and Save/Open on a reflected sheet and a disjoint duplicate copy.',
  limits: [
    'Asymmetric D546 L-bracket (hole n1 at [25, 18]), single YZ reflection at X = 0 (keep: false), 20 mm flange on n0.end|n0.leg1.a, thickness edit 1.5 -> 2.0 mm.',
    'Disjoint Duplicate (offset X = 60 mm) with copy-only 20 mm flange on n7.end|n7.leg1.a while keeping original 1-bend sheet invariant.',
  ],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dispatchTool } from '@barocss/cad-model/chat/tools';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, flatPatternOf, massPropertiesOf } from '@barocss/cad';
const args = JSON.parse(process.argv[3]);
if (args.fixture) {
  const { calls } = JSON.parse(readFileSync(args.fixture, 'utf8'));
  const canonical = JSON.parse(readFileSync(args.canonical, 'utf8'));
  let state = { doc: emptyDoc(), bodies: [], turnBase: emptyDoc() };
  for (const [index, call] of calls.entries()) {
    const result = await dispatchTool(state, call.tool, call.args, async doc => evaluatePart(doc, index + 1));
    assert.equal(result.isError, false, result.content);
    state = result.state;
  }
  assert.deepEqual(toPartDocument(state.doc), canonical.input.partDocument);
  const asymmetric = {
    ...state.doc,
    nodes: state.doc.nodes.map(node => node.id === 'n1' ? { ...node, center: [25, 18] } : node),
  };
  console.log(JSON.stringify(asymmetric));
} else {
  const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const outputs = evaluateCadPart(toPartDocument(doc)).outputs;
  const read = output => {
    let flat = null, flatError = null;
    try { flat = flatPatternOf(output); } catch (error) { flatError = { code: error.code, message: error.message }; }
    return {
      id: output.id,
      valid: checkOutput(output).valid,
      bodyCount: output.bodyCount,
      edges: output.brep.edges.map(e => e.name),
      sheet: output.sheet ?? null,
      mass: massPropertiesOf(output),
      flat,
      flatError,
    };
  };
  console.log(JSON.stringify(args.multiple ? outputs.map(read) : read(outputs[0])));
}
`,
});

const radius = 1.5, width = 30, k = 0.44, bore = 2.75;
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const flatDialog = () => f.page.getByRole('dialog', { name: 'Flat pattern', exact: true });
const flatButton = () => button(f.page, 'Show the flat pattern');
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

function flangedTruth(thickness) {
  const s = radius + thickness;
  const volume = width * (thickness * (90 - 4 * s) + Math.PI / 2 * (s ** 2 - radius ** 2)) - 2 * Math.PI * bore ** 2 * thickness;
  const allowance = Math.PI / 2 * (radius + k * thickness);
  const deduction = 2 * s - allowance;
  const length = 90 - 2 * deduction;
  const area = width * length - 2 * Math.PI * bore ** 2;
  return { s, volume, allowance, deduction, length, area };
}

function baseTruth() {
  const t = 1.5, s = radius + t;
  const volume = width * (t * (70 - 2 * s) + Math.PI / 4 * (s ** 2 - radius ** 2)) - 2 * Math.PI * bore ** 2 * t;
  const allowance = Math.PI / 2 * (radius + k * t);
  const length = 70 - 2 * s + allowance;
  const area = width * length - 2 * Math.PI * bore ** 2;
  return { volume, allowance, length, area };
}

async function openSeed(seed, name) {
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
}

async function selectBodyIndex(index = 0) {
  const rows = f.page.locator('.outliner .ol-row > button.ol');
  await rows.nth(index).click();
  await f.page.waitForFunction(i => window.__studioSelection.selection.bodies[0] === i, index);
}

async function showFlat(label) {
  await flatButton().click();
  await flatDialog().waitFor();
  await flatDialog().locator('svg[aria-label]').waitFor();
  await f.snapshot(label);
  await button(flatDialog(), 'Close the flat pattern').click();
  await flatDialog().waitFor({ state: 'hidden' });
}

async function projectRoundTrip(project, name, expected) {
  async function openProject() {
    if (!(await versions().isVisible())) await button(f.page, 'Project and versions').click();
    if (await versions().getByLabel('Project', { exact: true }).isVisible()) return;
    await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await button(versions(), 'Project in this browser').click();
    await versions().getByLabel('Project', { exact: true }).waitFor();
  }
  await openProject();
  await button(f.page, 'Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const saved = Buffer.from(await f.page.evaluate(async ([p, n]) => {
    const projects = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
    const directory = await projects.getDirectoryHandle(p);
    return Array.from(new Uint8Array(await (await (await directory.getFileHandle(n)).getFile()).arrayBuffer()));
  }, [project, name]));
  assert.deepEqual(JSON.parse(saved), expected);
  await button(versions(), 'Close project').click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');
  await f.ready();
  await openProject();
  await button(versions(), 'Open ' + name).click();
  await f.same(expected);
  return saved;
}

async function pickEdgeAt(worldPoint, viewName = 'Bottom right') {
  await button(f.page, 'View cube directions').click();
  await f.page.getByRole('menuitem', { name: viewName, exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button(f.page, 'Selection filter');
  for (let attempt = 0; attempt < 4 && !(await filter.innerText()).includes('Edges'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.waitForTimeout(450);
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), worldPoint);
  assert.ok(pixel?.length === 2 && pixel.every(Number.isFinite), JSON.stringify(pixel));
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel), JSON.stringify(pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1, null, { timeout: 8000 });
}

function checkReflectedFlanged(native, thickness) {
  const expected = flangedTruth(thickness);
  assert.equal(native.valid, true);
  assert.equal(native.bodyCount, 1);
  assert.ok(native.sheet && native.flat, JSON.stringify(native.flatError));
  near(native.mass.volume, expected.volume, expected.volume * 1e-9);
  assert.ok(native.mass.centroid[0] < 0);
  assert.equal(native.sheet.thickness, thickness);
  assert.deepEqual(native.sheet.bends.map(b => b.name), ['n0.bend1', 'n8.bend']);
  const tol = 1e-11 * expected.length;
  near(native.flat.box.max[0], width, tol);
  near(native.flat.box.max[1], expected.length, tol);
  near(native.flat.area, expected.area, 1e-11 * expected.area);
  assert.deepEqual(native.flat.bends.map(b => [b.name, b.direction]), [['n0.bend1', 'down'], ['n8.bend', 'up']]);
  const holes = native.flat.loops.filter(l => !l.outer).map(l => l.segments[0].center).sort((a, b) => a[1] - b[1]);
  assert.equal(holes.length, 2);
  near(holes[0][0], 18, tol);
  near(holes[1][0], 15, tol);
}

await f.run(async () => {
  f.phase = 'materialize asymmetric L-bracket seed';
  const seed = await f.inspect('materialize-asymmetric-sheet', {}, {
    fixture: fileURLToPath(new URL(fixture, repo)),
    canonical: fileURLToPath(new URL(canonical, repo)),
  });

  // Flow A: Reflected sheet -> subsequent Flange -> Undo/Redo -> OPFS Save/Open -> upstream thickness edit.
  const reflectProject = 'D2027 reflected flange ' + randomUUID();
  const reflectFile = 'D2027-reflected-flange.bcad';
  await openSeed(seed, reflectFile);
  await selectBodyIndex(0);

  f.phase = 'apply single YZ reflection (keep: false) via Mirror HUD';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('m');
  const mirrorHud = f.page.getByRole('dialog', { name: 'Mirror', exact: true });
  await mirrorHud.waitFor();
  await mirrorHud.getByLabel('Result', { exact: true }).selectOption('reflected');
  await mirrorHud.getByLabel('Plane', { exact: true }).selectOption('yz');
  await mirrorHud.getByLabel('Plane at', { exact: true }).fill('0');
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview');
  await button(mirrorHud, 'Apply').click();
  await mirrorHud.waitFor({ state: 'hidden' });
  await f.changed(seed);
  const reflectedDoc = await f.doc();
  assert.deepEqual(reflectedDoc.nodes.at(-1), { kind: 'mirror', parent: { node: 6, side: 'solid' }, plane: 'yz', keep: false, id: 'n7' });

  f.phase = 'pick reflected edge n0.end|n0.leg1.a in viewport and apply 20 mm Flange';
  await pickEdgeAt([-40, 15, 0], 'Bottom left');
  await clickModelCommand(f.page, 'Modify', 'Flange');
  const flangeHud = f.page.getByRole('dialog', { name: 'Flange', exact: true });
  await flangeHud.waitFor();
  await flangeHud.getByText('n0.end|n0.leg1.a', { exact: true }).waitFor({ timeout: 8000 });
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview');
  await button(flangeHud, 'Apply').click();
  await flangeHud.waitFor({ state: 'hidden' });
  await f.changed(reflectedDoc);
  const flangedDoc = await f.doc();
  assert.deepEqual(flangedDoc.nodes.at(-1).kind, 'sheet-flange');
  assert.deepEqual(flangedDoc.nodes.at(-1).edges, ['n0.end|n0.leg1.a']);

  const reflectedFlanged = await f.inspect('reflected-flanged-1.5', flangedDoc, {});
  checkReflectedFlanged(reflectedFlanged, 1.5);
  await selectBodyIndex(0);
  await showFlat('01-reflected-flange-flat');

  f.phase = 'undo, redo and OPFS project round-trip for reflected flanged sheet';
  await f.undo();
  await f.same(reflectedDoc);
  await f.redo();
  await f.same(flangedDoc);
  const savedReflect = await projectRoundTrip(reflectProject, reflectFile, flangedDoc);
  const reopenedReflected = await f.inspect('reflected-flanged-reopened', flangedDoc, {});
  checkReflectedFlanged(reopenedReflected, 1.5);

  f.phase = 'edit upstream sheet thickness (1.5 -> 2.0 mm) on reopened reflected flanged sheet';
  await f.openFeatureEditor(0, 'upstream reflected sheet thickness');
  const thicknessInput = f.editor().getByLabel('Thickness', { exact: true });
  assert.equal(await thicknessInput.inputValue(), '1.5');
  await thicknessInput.fill('2');
  await f.applyEditor(flangedDoc, 'reflected-thickness-2');
  const editedDoc = await f.doc();
  assert.equal(editedDoc.nodes[0].thickness, 2);
  const reflectedThickness2 = await f.inspect('reflected-flanged-2.0', editedDoc, {});
  checkReflectedFlanged(reflectedThickness2, 2.0);
  await selectBodyIndex(0);
  await showFlat('02-reflected-flange-thickness2-flat');
  f.report.observations.push({
    label: 'reflected-flange-flow',
    bytes: savedReflect.length,
    sha256: sha256(savedReflect),
    flat15: reflectedFlanged.flat.box.max,
    flat20: reflectedThickness2.flat.box.max,
  });

  // Flow B: Disjoint Duplicate -> copy-only 20 mm Flange -> original invariant -> Undo/Redo -> Save/Open.
  const copyProject = 'D2027 copy flange ' + randomUUID();
  const copyFile = 'D2027-copy-flange.bcad';
  await openSeed(seed, copyFile);
  await selectBodyIndex(0);

  f.phase = 'duplicate sheet by 60 mm in X and apply copy-only 20 mm Flange';
  await clickModelCommand(f.page, 'Pattern', 'Duplicate');
  const dupHud = f.page.getByRole('dialog', { name: 'Duplicate', exact: true });
  await dupHud.waitFor();
  await dupHud.getByLabel('Offset X', { exact: true }).fill('60');
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview');
  await button(dupHud, 'Apply').click();
  await dupHud.waitFor({ state: 'hidden' });
  await f.changed(seed);
  const dupDoc = await f.doc();

  await pickEdgeAt([100, 15, 0], 'Bottom right');
  await clickModelCommand(f.page, 'Modify', 'Flange');
  const copyFlangeHud = f.page.getByRole('dialog', { name: 'Flange', exact: true });
  await copyFlangeHud.waitFor();
  await copyFlangeHud.getByText('n7.end|n7.leg1.a', { exact: true }).waitFor({ timeout: 8000 });
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview');
  await button(copyFlangeHud, 'Apply').click();
  await copyFlangeHud.waitFor({ state: 'hidden' });
  await f.changed(dupDoc);
  const copyFlangedDoc = await f.doc();

  const pair = await f.inspect('copy-flanged-pair', copyFlangedDoc, { multiple: true });
  assert.equal(pair.length, 2);
  const [origBody, copyBody] = pair;
  const origExpected = baseTruth();
  const copyExpected = flangedTruth(1.5);
  assert.deepEqual(origBody.sheet.bends.map(b => b.name), ['n0.bend1']);
  near(origBody.mass.volume, origExpected.volume, origExpected.volume * 1e-9);
  near(origBody.flat.area, origExpected.area, 1e-11 * origExpected.area);
  assert.deepEqual(copyBody.sheet.bends.map(b => b.name), ['n7.bend1', 'n15.bend']);
  near(copyBody.mass.volume, copyExpected.volume, copyExpected.volume * 1e-9);
  near(copyBody.flat.area, copyExpected.area, 1e-11 * copyExpected.area);
  assert.deepEqual(copyBody.flat.bends.map(b => [b.name, b.direction]), [['n7.bend1', 'down'], ['n15.bend', 'up']]);

  await selectBodyIndex(0);
  await showFlat('03-copy-flange-original-flat');
  await selectBodyIndex(1);
  await showFlat('04-copy-flange-copy-flat');

  await f.undo();
  await f.same(dupDoc);
  await f.redo();
  await f.same(copyFlangedDoc);
  const savedCopy = await projectRoundTrip(copyProject, copyFile, copyFlangedDoc);
  const reopenedPair = await f.inspect('copy-flanged-reopened', copyFlangedDoc, { multiple: true });
  assert.deepEqual(reopenedPair.map(b => b.sheet.bends.map(x => x.name)), [['n0.bend1'], ['n7.bend1', 'n15.bend']]);
  f.report.observations.push({
    label: 'copy-flange-flow',
    bytes: savedCopy.length,
    sha256: sha256(savedCopy),
    origFlat: origBody.flat.box.max,
    copyFlat: copyBody.flat.box.max,
  });
  assert.deepEqual(f.report.downloads, []);
});
