import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-edge-condition-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['edgeCondition', 'types', 'sheets', 'sheet', 'issues', 'reorient', 'savedAnnotationRefs'].map(
    s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts',
  ),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'edge-condition',
  output: process.argv[2],
  envFrozen: 'D2024_SOURCE_FROZEN',
  qualification: 'Drawing Edge-Condition Symbols (#212) on an asymmetric 60x35x10 plate: verifies Escape cancel without mutating Doc, places two distinct symbols ec1 (−0.5/−0.1 horizontal all-around) and ec2 (+0.3 vertical) on two distinct edges of Top view, flips sign & moves ec1, checks Undo/Redo, SVG & DXF export readback, and .bcad Save/Open round-trip with invariant part geometry.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Single base-part unbroken orthographic views; inch conservative truncation, lost-target diagnosis, and malformed saved-file admission verified in model unit tests.'],
  inspectorSource: `
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = {
  ...emptyDoc(),
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [60, 35] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 10 },
    { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [15, 12], radius: 3, axis: 'z' },
  ],
  outputs: { b1: { node: 2, side: 'solid' } },
  nextId: 3,
  drawing: { ...defaultDrawing(), scale: 1, dimensions: [] },
};
console.log(JSON.stringify({ doc }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = (predicate, arg) => f.page.waitForFunction(predicate, arg);

async function topPx(u, v) {
  const pt = await f.page.evaluate(([uu, vv]) => window.__studioDrawingAt?.('top', uu, vv), [u, v]);
  assert.ok(pt, `missing top point (${u}, ${v})`);
  return pt;
}

async function download(name, filename, encoding = 'utf8') {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, encoding);
}

await f.run(async () => {
  f.phase = 'open asymmetric 60x35x10 plate in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'edge-condition-plate.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 30, 35)));
  const baseline = await f.doc();
  const baselineNodes = JSON.stringify(baseline.nodes);

  f.phase = 'verify Escape cancels pending edge-condition pick cleanly without mutating Doc';
  await button('Edge condition').click();
  const topEdge = await topPx(30, 35);
  await f.page.mouse.click(topEdge.x, topEdge.y);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'place ec1 (-0.5 / -0.1 horizontal all-around) on top edge and ec2 (+0.3 vertical) on left edge';
  await button('Edge condition').click();
  await field('Edge condition sign').selectOption('-');
  await field('Edge condition direction').selectOption('horizontal');
  await field('Edge condition upper mm').fill('0.5');
  await field('Edge condition lower mm').fill('0.1');
  await field('Edge condition all around').check();
  await f.page.mouse.click(topEdge.x, topEdge.y);
  const place1 = await topPx(42, 46);
  await f.page.mouse.click(place1.x, place1.y);
  await wait(() => window.__studioDoc?.drawing?.edgeConditions?.length === 1);

  await field('Edge condition sign').selectOption('+');
  await field('Edge condition direction').selectOption('vertical');
  await field('Edge condition upper mm').fill('0.3');
  await field('Edge condition lower mm').fill('');
  await field('Edge condition all around').uncheck();
  const leftEdge = await topPx(0, 17.5);
  await f.page.mouse.click(leftEdge.x, leftEdge.y);
  const place2 = await topPx(-18, 20);
  await f.page.mouse.click(place2.x, place2.y);
  await wait(() => window.__studioDoc?.drawing?.edgeConditions?.length === 2);
  await button('Select').click();
  assert.equal(await f.page.locator('g.edge-condition[data-edge-condition="ec1"]').count(), 1);
  assert.equal(await f.page.locator('g.edge-condition[data-edge-condition="ec2"]').count(), 1);
  assert.equal(await f.page.getByRole('note', { name: 'DXF edge condition compatibility' }).count(), 1);
  await f.snapshot('01-edge-conditions-placed');

  f.phase = 'move and flip sign of ec2, verify Undo/Redo';
  await button('Move edge condition ec2').click();
  await button('Flip sign ec2').click();
  await wait(() => window.__studioDoc?.drawing?.edgeConditions?.find(e => e.id === 'ec2')?.sign === '-');
  await f.snapshot('02-edited-and-moved');

  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.edgeConditions?.find(e => e.id === 'ec2')?.sign === '+');
  await button('Redo').click();
  await wait(() => window.__studioDoc?.drawing?.edgeConditions?.find(e => e.id === 'ec2')?.sign === '-');

  f.phase = 'verify SVG and DXF exports';
  const svgText = await download('Export SVG', 'edge-condition-sheet.svg');
  assert.ok(svgText.includes('data-edge-condition="ec1"'));
  assert.ok(svgText.includes('data-edge-condition="ec2"'));
  assert.ok(svgText.includes('>−0.5</text>'));
  assert.ok(svgText.includes('>−0.1</text>'));
  assert.ok(svgText.includes('>−0.3</text>'));

  const dxfText = await download('Export DXF', 'edge-condition-sheet.dxf', 'latin1');
  assert.ok(dxfText.includes('0.5'));

  f.phase = 'save .bcad, reopen fresh, verify symbols and invariant part geometry';
  const savedBytes = await download('Save', 'edge-condition-saved.bcad', null);
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'edge-condition-saved.bcad', mimeType: 'application/octet-stream', buffer: savedBytes });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => window.__studioDoc?.drawing?.edgeConditions?.length === 2);
  const reopenedDoc = await f.doc();
  assert.equal(JSON.stringify(reopenedDoc.nodes), baselineNodes, 'native geometry nodes must be invariant');
  assert.equal(reopenedDoc.drawing.edgeConditions[0].upperMm, 0.5);
  assert.equal(reopenedDoc.drawing.edgeConditions[0].lowerMm, 0.1);
  assert.equal(reopenedDoc.drawing.edgeConditions[0].allAround, true);
  assert.equal(reopenedDoc.drawing.edgeConditions[1].sign, '-');
  await f.snapshot('03-reopened-verified');
});
