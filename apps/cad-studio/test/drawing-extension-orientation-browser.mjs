import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const f = await createFlow({
  name: 'drawing-extension-orientation', output: process.argv[2], envFrozen: 'D1922_SOURCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/drawing-extension-orientation-reader.py'],
  qualification: 'Preserve the saved A/B extension roles through ordinary vertical and reversed aligned dimensions.',
  limits: ['One front view at 1:1. Stored model references come from native projected corners. Desktop only.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { defaultDrawing, readDrawing } from '@barocss/cad-model/drawing/types';
const doc = rectanglePart(64,30,10), source = brepsFor(doc);
assert.ok('breps' in source);
const projected = projectViews(source.breps,source.prefixes);
assert.ok(projected.ok);
const at = (x,y) => {
  const snap = snapPoints(projected.views.front).find(point => Math.hypot(point.at[0]-x,point.at[1]-y)<1e-8);
  assert.ok(snap, JSON.stringify([x,y]));
  return snap.ref;
};
const left = at(0,0), right = at(64,10);
const dims = [
  { id:'vertical', kind:'linear', view:'front', orient:'vertical', a:left, b:right, place:[0.5,5] },
  { id:'aligned', kind:'linear', view:'front', orient:'aligned', a:right, b:left, place:[32,25] },
];
console.log(JSON.stringify({...doc,drawing:readDrawing({...defaultDrawing(),scope:{kind:'part'},scale:1,dimensions:dims})}));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const group = id => f.page.locator(`svg[aria-label="Drawing sheet"] g.dimension[data-dim="${id}"]`);
const row = id => f.page.locator('.dw-dim .dw-annotation-select').filter({ hasText: `${id} · front` });
const hideName = side => side ? `Hide extension ${side.toUpperCase()}` : 'Show both extension lines';
const controls = id => f.page.getByRole('group', { name: `Extension lines ${id}`, exact: true });
const files = [];
const withSetting = (doc, id, side) => ({ ...doc, drawing: { ...doc.drawing, dimensions: doc.drawing.dimensions.map(dimension => {
  if (dimension.id !== id) return dimension;
  const { hideExtension: previous, ...other } = dimension;
  if (previous === side) return dimension;
  return side ? { ...other, hideExtension: side } : other;
}) } });

async function drawing() {
  if (!await f.page.locator('.dw[aria-label="Drawing"]').count()) await button('Drawing').click();
  await group('vertical').locator('text').first().waitFor();
  await group('aligned').locator('text').first().waitFor();
}

async function select(id) {
  if (await row(id).getAttribute('aria-pressed') !== 'true') await row(id).click();
  await controls(id).waitFor();
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Hide extension A"]')?.disabled === false);
}

async function setSide(id, side) {
  await select(id);
  const control = button(hideName(side), controls(id));
  if (side) {
    await control.hover();
    await f.page.waitForFunction(key => {
      const mark = value => document.querySelector(`[aria-label="Extension endpoint ${value}"] circle`)?.getAttribute('r');
      return mark(key) === '1.8' && mark(key === 'A' ? 'B' : 'A') === '1.1';
    }, side.toUpperCase());
  }
  await control.click();
  assert.equal(await control.getAttribute('aria-pressed'), 'true');
}

async function download(label, kind, name) {
  const pending = f.page.waitForEvent('download');
  await button(name).click();
  const value = await pending, file = join(f.output, label + '.' + kind);
  await value.saveAs(file);
  assert.equal(await value.failure(), null);
  const bytes = await readFile(file);
  assert.ok(bytes.length > 0);
  f.report.files.push({ label, kind, file, bytes: bytes.length, sha256: sha256(bytes), name: value.suggestedFilename() });
  return file;
}

async function capture(label, expected, vertical, aligned) {
  f.phase = label;
  await f.same(expected);
  const screen = await f.page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('svg[aria-label="Drawing sheet"] g.dimension[data-dim]')]
      .map(element => [element.dataset.dim, element.innerHTML])));
  assert.deepEqual(Object.keys(screen).sort(), ['aligned', 'vertical']);
  const svg = await download(label, 'svg', 'Export SVG');
  const formats = {};
  for (const version of ['AC1009', 'AC1015']) {
    await f.page.getByLabel('DXF version', { exact: true }).selectOption(version);
    formats[version] = await download(`${label}-${version}`, 'dxf', 'Export DXF');
  }
  files.push({ label, svg, screen, formats, roles: { vertical, aligned },
    hidden: Object.fromEntries(expected.drawing.dimensions.map(dimension => [dimension.id, dimension.hideExtension ?? null])) });
  await f.same(expected);
  await f.snapshot(label);
}

async function moveVertical() {
  const { start, end } = await group('vertical').locator('text').first().evaluate(element => {
    const box = element.getBoundingClientRect(), matrix = element.ownerSVGElement.getScreenCTM();
    const start = [box.x + box.width / 2, box.y + box.height / 2];
    return { start, end: [start[0] - 14 * matrix.a, start[1] - 14 * matrix.b] };
  });
  await f.page.mouse.move(...start);
  await f.page.mouse.down();
  await f.page.mouse.move(...end, { steps: 10 });
  await f.page.mouse.up();
}

await f.run(async () => {
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await f.openFile({ name: 'extension-orientations.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2);
  await drawing();
  await select('vertical');
  await capture('01-original-short-a', seed, ['b'], ['a', 'b']);

  const shortHidden = withSetting(seed, 'vertical', 'b');
  await setSide('vertical', 'b');
  await capture('02-short-a-hide-b', shortHidden, [], ['a', 'b']);
  await f.undo(); await f.same(seed);
  await f.redo(); await f.same(shortHidden);

  f.phase = 'move the vertical dimension until A can be drawn';
  await moveVertical();
  await f.changed(shortHidden);
  const moved = await f.doc(), placed = moved.drawing.dimensions[0];
  assert.ok(placed.place[0] < -10, JSON.stringify(placed.place));
  assert.deepEqual(moved, { ...shortHidden, drawing: { ...shortHidden.drawing, dimensions: [
    { ...shortHidden.drawing.dimensions[0], place: placed.place }, shortHidden.drawing.dimensions[1],
  ] } });
  await select('vertical');
  await capture('03-moved-a-reappears', moved, ['a'], ['a', 'b']);
  const both = withSetting(moved, 'vertical', undefined);
  await setSide('vertical', undefined);
  await capture('04-moved-both', both, ['a', 'b'], ['a', 'b']);
  const verticalA = withSetting(both, 'vertical', 'a');
  await setSide('vertical', 'a');
  await capture('05-vertical-hide-a', verticalA, ['b'], ['a', 'b']);

  const alignedA = withSetting(verticalA, 'aligned', 'a');
  await setSide('aligned', 'a');
  await capture('06-aligned-hide-a', alignedA, ['b'], ['b']);
  const alignedB = withSetting(verticalA, 'aligned', 'b');
  await setSide('aligned', 'b');
  await capture('07-aligned-hide-b', alignedB, ['b'], ['a']);
  await f.undo(); await f.same(alignedA);
  await f.redo(); await f.same(alignedB);
  const saved = await f.save('extension-orientations');
  await f.freshOpen(saved.file, alignedB, '08-native-reopen');
  await drawing(); await select('aligned');
  assert.equal(await button(hideName('b'), controls('aligned')).getAttribute('aria-pressed'), 'true');
  await capture('09-reopened-role-b', alignedB, ['b'], ['a']);
  await setSide('aligned', undefined);
  await capture('10-restore-both-after-open', verticalA, ['b'], ['a', 'b']);

  f.phase = 'compare actual SVG and native DXF with independent readback';
  const data = JSON.stringify({ files });
  await writeFile(join(f.output, 'reader-input.json'), data);
  const reader = join(import.meta.dirname, 'drawing-extension-orientation-reader.py');
  const result = spawnSync(process.env.CAD_DXF_PYTHON ?? '/Users/user/.cache/barocss-ezdxf/bin/python',
    ['-I', reader], { input: data, encoding: 'utf8' });
  await writeFile(join(f.output, 'reader-result.json'), result.stdout ?? '');
  await writeFile(join(f.output, 'reader-error.log'), result.stderr ?? '');
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  f.report.observations.push(JSON.parse(result.stdout));
});
