import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const f = await createFlow({
  name: 'drawing-dimension-group-move', output: process.argv[2], envFrozen: 'D1907_SOURCE_FROZEN',
  initialFiles: ['apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'packages/barocss-cad-model/src/io/svg.ts'],
  qualification: 'Move two ordinary horizontal placements together in one drawing view.',
  inspectorSource: `
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing, readDrawing } from '@barocss/cad-model/drawing/types';
const doc = rectanglePart(64, 30, 10), input = brepsFor(doc);
assert.ok('breps' in input);
const projected = projectViews(input.breps, input.prefixes);
assert.ok(projected.ok);
const point = (view, x, y) => {
  const snap = snapPoints(projected.views[view]).find(p => Math.abs(p.at[0] - x) < 1e-9 && Math.abs(p.at[1] - y) < 1e-9);
  assert.ok(snap, [view, x, y].join(','));
  return snap.ref;
};
const horizontal = (id, y, place) => ({
  id, kind: 'linear', view: 'front', orient: 'horizontal',
  a: point('front', 0, y), b: point('front', 64, y), place,
});
const right = snapPoints(projected.views.right).filter(p => Math.abs(p.at[1]) < 1e-9).sort((a, b) => a.at[0] - b.at[0]);
assert.ok(right.length >= 2);
console.log(JSON.stringify({ ...doc, drawing: readDrawing({ ...defaultDrawing(), scope: { kind: 'part' }, scale: 1,
  dimensions: [horizontal('first', 0, [32, -15]), horizontal('second', 10, [32, -28]),
    { id: 'control', kind: 'linear', view: 'front', orient: 'vertical', a: point('front', 64, 0), b: point('front', 64, 10), place: [84, 5] },
    { id: 'other-sheet', kind: 'linear', view: 'right', orient: 'horizontal', a: right[0].ref, b: right.at(-1).ref, place: [15, -15] }],
  sheets: [{ id: 'S2', name: 'Continuation', views: ['right'] }],
}) }));
`,
  oracleSource: String.raw`import json,sys,xml.etree.ElementTree as ET
data=json.load(sys.stdin)
def groups(path):
 out={}
 for group in ET.parse(path).getroot().iter('{http://www.w3.org/2000/svg}g'):
  ident=group.get('data-dim')
  if group.get('class')=='dimension' and ident:
   assert ident not in out
   fields=[(elem.text,float(elem.get('x')),float(elem.get('y'))) for elem in group.findall('{http://www.w3.org/2000/svg}text')]
   assert fields, ident
   out[ident]=fields
 return out
def close(a,b): assert abs(a-b)<1e-6, (a,b)
before,after=groups(data['before']),groups(data['after'])
assert set(before)==set(after)=={'first','second','control'}
assert before['control']==after['control']
for ident in ('first','second'):
 assert len(before[ident])==len(after[ident])==1
 t0,x0,y0=before[ident][0]; t1,x1,y1=after[ident][0]
 assert t0==t1=='64'
 close(x0,x1); close(y1-y0,10)
assert groups(data['reopen'])==after
assert groups(data['otherBefore'])==groups(data['otherAfter'])
assert set(groups(data['otherAfter']))=={'other-sheet'}
print(json.dumps({'status':'PASS','deltaPaperMM':10,'unchanged':['control','other-sheet'],'nativeReopenEqual':True}))
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const sheet = () => f.page.locator('svg[aria-label="Drawing sheet"]');
const dim = id => sheet().locator(`g.dimension[data-dim="${id}"]`);
const label = id => dim(id).locator('text').first();
const selected = id => dim(id).evaluate(group => group.classList.contains('sel'));
const groupSelect = async () => {
  await label('first').click();
  await label('second').click({ modifiers: ['Shift'] });
};
async function drawing() {
  if (!await sheet().count()) await button('Drawing').click();
  await label('first').waitFor();
  await label('second').waitFor();
  await label('control').waitFor();
}
async function drag(id, paper, release = true) {
  const witness = await label(id).evaluate((text, [x, y]) => {
    const { left, width, top, height } = text.getBoundingClientRect();
    const matrix = text.getScreenCTM();
    return { start: [left + width / 2, top + height / 2], delta: [x * matrix.a + y * matrix.c, x * matrix.b + y * matrix.d] };
  }, paper);
  const end = witness.start.map((value, i) => value + witness.delta[i]);
  await f.page.mouse.move(...witness.start);
  await f.page.mouse.down();
  await f.page.mouse.move(...end, { steps: 10 });
  if (release) await f.page.mouse.up();
}
async function svgDownload(name) {
  const pending = f.page.waitForEvent('download');
  await button('Export SVG').click();
  const file = join(f.output, name + '.svg'), download = await pending;
  await download.saveAs(file);
  assert.equal(await download.failure(), null);
  assert.ok((await readFile(file)).length > 0);
  return file;
}
async function selectSheet(name, checkLabel) {
  await f.page.getByRole('tab', { name, exact: true }).click();
  await label(checkLabel).waitFor();
}
await f.run(async () => {
  const seed = await f.inspect('prepare', {});
  await f.newPage();
  await f.openFile({ name: 'dimension-placements.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2);
  await f.same(seed);
  await drawing();
  f.phase = 'choose two horizontal dimensions in the same view';
  await groupSelect();
  await f.same(seed);
  await f.snapshot('01-shift-selection');
  if (baseline) {
    assert.equal(await selected('first'), false);
    assert.equal(await selected('second'), true);
    await drag('second', [0, 10]);
    await f.changed(seed);
    const previous = (await f.snapshot('02-only-second-moved')).doc;
    assert.deepEqual(previous.drawing.dimensions[0], seed.drawing.dimensions[0]);
    assert.notDeepEqual(previous.drawing.dimensions[1].place, seed.drawing.dimensions[1].place);
    assert.deepEqual(previous.drawing.dimensions.slice(2), seed.drawing.dimensions.slice(2));
    return;
  }
  assert.equal(await selected('first'), true);
  assert.equal(await selected('second'), true);
  await label('second').click();
  await f.same(seed);
  const before = await svgDownload('before');
  f.phase = 'cancel a group preview without changing the drawing';
  const beforeY = Number(await label('first').getAttribute('y'));
  await drag('second', [0, 10], false);
  await f.page.waitForFunction(y => Math.abs(Number(document.querySelector('g.dimension[data-dim="first"] text')?.getAttribute('y')) - y - 10) < 1e-6, beforeY);
  await f.same(seed);
  await f.snapshot('02-group-preview');
  await f.page.keyboard.press('Escape');
  await f.page.mouse.up();
  await f.same(seed);
  assert.equal(Number(await label('first').getAttribute('y')), beforeY);
  assert.equal(await selected('first'), false);
  await f.snapshot('03-cancelled-group');

  f.phase = 'refuse a mixed orientation and retire selection across sheets';
  await label('first').click();
  await label('control').click({ modifiers: ['Shift'] });
  assert.equal(await selected('first'), true);
  assert.equal(await selected('control'), false);
  await groupSelect();
  await selectSheet('Continuation', 'other-sheet');
  const otherBefore = await svgDownload('continuation-before');
  await selectSheet('Sheet 1', 'first');
  assert.equal(await selected('first'), false);
  assert.equal(await selected('second'), false);
  await f.same(seed);
  await groupSelect();

  f.phase = 'move only the two selected placements by 10 paper mm';
  await drag('second', [0, 10]);
  await f.changed(seed);
  const moved = await f.snapshot('02-group-moved');
  const expected = { ...seed, drawing: { ...seed.drawing, dimensions: seed.drawing.dimensions.map((d, i) =>
    i < 2 ? { ...d, place: [d.place[0], d.place[1] - 10] } : d) } };
  assert.deepEqual(moved.doc, expected);
  const after = await svgDownload('after');
  await f.undo(); await f.same(seed);
  await f.redo(); await f.same(expected);
  const saved = await f.save('dimension-group');
  await f.freshOpen(saved.file, expected, '04-native-reopened');
  await drawing();
  const reopen = await svgDownload('reopened');
  await f.snapshot('05-reopened-dimensions');
  await selectSheet('Continuation', 'other-sheet');
  const otherAfter = await svgDownload('continuation-after');
  await f.runOracle({ before, after, reopen, otherBefore, otherAfter }, 'original-svg-geometry');

  f.phase = 'retain the existing single-dimension drag';
  await selectSheet('Sheet 1', 'first');
  await drag('first', [0, 5]);
  await f.changed(expected);
  const single = await f.doc();
  assert.notDeepEqual(single.drawing.dimensions[0].place, expected.drawing.dimensions[0].place);
  assert.deepEqual(single.drawing.dimensions.slice(1), expected.drawing.dimensions.slice(1));
  await f.undo();
  await f.same(expected);
});
