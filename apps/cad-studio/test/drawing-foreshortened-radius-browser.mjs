import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/drawing-foreshortened-radius-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'packages/barocss-cad-model/src/drawing/types.ts',
  'packages/barocss-cad-model/src/drawing/dimensions.ts',
  'packages/barocss-cad-model/src/drawing/foreshorten.ts',
  'packages/barocss-cad-model/src/drawing/savedForeshorten.ts',
  'packages/barocss-cad-model/src/drawing/sheet.ts',
  'packages/barocss-cad-model/src/drawing/reorient.ts',
  'packages/barocss-cad-model/src/drawing/issues.ts',
  'packages/barocss-cad-model/src/engine/savedDrawing.ts',
];

const THETA = 5 * Math.PI / 180;
const ARC_X = 500 * Math.cos(THETA);
const ARC_Y = 500 * Math.sin(THETA);

const f = await createFlow({
  name: 'drawing-foreshortened-radius', output: process.argv[2], envFrozen: 'D1997_SOURCE_FROZEN',
  qualification: 'Foreshortened radial dimension preserves exact native R500 radius and true radial rim attachment while keeping the jogged leader inside the sheet across Add, Move origin, Cancel, Remove, Undo/Redo, SVG/DXF, fresh Open, and replacement with a same-ID dimension in another document.',
  initialFiles: pins, requiredFrozen: pins,
  snapshotExtra: () => ({ drawing: window.__studioDrawing?.() ?? null }),
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { brepsFor, partBreps } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing, readDrawing } from '@barocss/cad-model/drawing/types';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (input.prepare) {
  const doc = input.doc;
  const b = brepsFor(doc);
  if (!('breps' in b)) throw new Error('breps failed: ' + b.error);
  const r = projectViews(b.breps, b.prefixes);
  if (!r.ok) throw new Error('project failed: ' + r.error);
  const arcEdge = r.views.top.edges.find(e => e.circle && e.pieces.some(piece => piece.visible && piece.curve.kind === 'arc') && Math.abs(e.circle.radius - 500) < 1e-3);
  if (!arcEdge) throw new Error('R500 arc edge not found in top view');
  const drawing = readDrawing({
    ...defaultDrawing(),
    sheet: 'A3', scale: 1,
    dimensions: [
      { id: 'big-r', view: 'top', kind: 'radius', edge: arcEdge.name, near: [...arcEdge.circle.center], place: [516, 0] },
    ],
  });
  console.log(JSON.stringify({ doc: { ...doc, drawing } }));
} else {
  const [{ brep }] = partBreps(input);
  console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
}
`,
});

const seedBase = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    {
      id: 'n0', kind: 'sketch', profile: 'loop',
      segments: [
        { kind: 'line', start: [460, -ARC_Y] },
        { kind: 'arc', start: [ARC_X, -ARC_Y], center: [0, 0], direction: 'ccw' },
        { kind: 'line', start: [ARC_X, ARC_Y] },
        { kind: 'line', start: [460, ARC_Y] },
      ],
    },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

async function openDrawing() {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.waitForFunction(() => (window.__studioDrawing?.()?.dimensions?.length ?? 0) === 1);
}
async function downloadExport(buttonName, filename) {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(buttonName).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, 'utf8');
}
async function verifyNative(label, doc) {
  const { check, mass } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 0);
  // Independent exact area: rectangle [460, ARC_X] x [-ARC_Y, ARC_Y] + circular segment (R=500, 2*theta=10 deg)
  const rectArea = (ARC_X - 460) * (2 * ARC_Y);
  const segArea = 0.5 * 500 * 500 * (2 * THETA - Math.sin(2 * THETA));
  const expectedVol = (rectArea + segArea) * 10;
  near(mass.volume, expectedVol, 1e-2);
  f.report.observations.push({ label, volume: mass.volume, expectedVol });
}

async function sheetClientPoint(sheetX, sheetY) {
  return f.page.evaluate(([x, y]) => {
    const svg = document.querySelector('svg[aria-label="Drawing sheet"]');
    const pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const screen = pt.matrixTransform(svg.getScreenCTM());
    return [screen.x, screen.y];
  }, [sheetX, sheetY]);
}

/** Parse the actual downloaded ASCII DXF, independent of the exporter data structures. */
function checkDxfRadius(bytes) {
  const lines = bytes.trimEnd().split(/\r?\n/);
  const records = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]), value = lines[i + 1]?.trim();
    if (code === 0) records.push({ type: value, fields: [] });
    else if (records.length) records.at(-1).fields.push([code, value]);
  }
  const field = (record, code) => record.fields.find(([k]) => k === code)?.[1];
  const dimensions = records.filter(record => record.type === 'DIMENSION');
  assert.equal(dimensions.length, 1);
  const [radial] = dimensions;
  assert.equal(Number(field(radial, 70)) & 7, 4, 'Native DIMENSION type is radial');
  assert.equal(field(radial, 1), 'R500');
  const number = (record, code) => {
    const text = field(record, code);
    assert.ok(text?.length, `DXF group ${code} missing`);
    const value = Number(text);
    assert.ok(Number.isFinite(value));
    return value;
  };
  const center = [number(radial, 10), number(radial, 20)];
  const rim = [number(radial, 15), number(radial, 25)];
  near(number(radial, 42), 500);
  near(Math.hypot(rim[0] - center[0], rim[1] - center[1]), 500);
  const blockStart = records.findIndex(record => record.type === 'BLOCK' && field(record, 2) === field(radial, 2));
  assert.ok(blockStart >= 0, 'Radial DIMENSION points to a display block');
  const blockEnd = records.findIndex((record, i) => i > blockStart && record.type === 'ENDBLK');
  assert.ok(blockEnd > blockStart);
  const jog = records.slice(blockStart + 1, blockEnd).find(record => record.type === 'LWPOLYLINE');
  assert.ok(jog, 'The referenced block contains the actual jog');
  const vertices = number(jog, 90);
  assert.ok(vertices >= 4);
  const xs = jog.fields.filter(([k]) => k === 10).map(([, x]) => Number(x));
  const ys = jog.fields.filter(([k]) => k === 20).map(([, y]) => Number(y));
  assert.equal(xs.length, vertices);
  assert.equal(ys.length, vertices);
  near(xs.at(-1), rim[0]);
  near(ys.at(-1), rim[1]);
  near(Math.hypot(rim[0] - xs[0], rim[1] - ys[0]), 32, 1.5);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 3, 'Jog has a visible paper offset');
  return { center, rim, vertices };
}

await f.run(async () => {
  const { doc: seed } = await f.inspect('prepare-r500-drawing', { prepare: true, doc: seedBase });
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'large-arc-r500.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await verifyNative('initial-native', seed);
  await openDrawing();

  // Select the R500 radius dimension row in Dimensions list
  await f.page.locator('.dw-dim button.dw-annotation-select').first().click();
  const dim = await f.page.evaluate(() => window.__studioDrawing().dimensions[0]);
  assert.equal(dim.text, 'R500');
  near(dim.value, 500, 1e-6);

  const foreshortenBtn = button('Foreshorten radius big-r');
  if (baseline) {
    assert.equal(await foreshortenBtn.count(), 0, 'Previous Studio has no Foreshorten radius control');
    await f.snapshot('00-previous-unshortened-r500');
    return;
  }

  f.phase = 'add foreshortened display and verify R500 value, jogged polyline, no center dot, and geometry invariance';
  await foreshortenBtn.click();
  await f.page.waitForFunction(() => !!window.__studioDoc?.drawing?.dimensions?.[0]?.foreshorten);
  const foreshortenedDoc = (await f.snapshot('01-foreshortened-r500')).doc;
  assert.deepEqual(foreshortenedDoc.nodes, seed.nodes, 'Foreshortening must not mutate model geometry');
  assert.ok(Array.isArray(foreshortenedDoc.drawing.dimensions[0].foreshorten?.origin));
  const afterAdd = await f.page.evaluate(() => window.__studioDrawing().dimensions[0]);
  assert.equal(afterAdd.text, 'R500');
  near(afterAdd.value, 500, 1e-6);

  // Verify rendered SVG group has a jogged polyline (multiple vertices), no fake center dot path at origin, and stays inside A3 frame
  const markCheck = await f.page.evaluate(() => {
    const g = document.querySelector('g.dimension[data-dim="big-r"]');
    const polylines = [...g.querySelectorAll('polyline')].map(el => el.getAttribute('points'));
    const paths = [...g.querySelectorAll('path')].map(el => el.getAttribute('d'));
    const texts = [...g.querySelectorAll('text')].map(el => el.textContent);
    const bbox = g.getBBox();
    return { polylines, paths, texts, bbox: [bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height] };
  });
  assert.equal(markCheck.polylines.length, 1, 'Expected one jogged foreshortened leader polyline');
  assert.ok(markCheck.polylines[0].trim().split(/\s+/).length >= 4, `Expected >=4 jog vertices, got ${markCheck.polylines[0]}`);
  assert.equal(markCheck.paths.length, 1, 'Only arrowhead fill path, no fake center dot');
  assert.deepEqual(markCheck.texts, ['R500']);
  assert.ok(markCheck.bbox[0] >= 10 && markCheck.bbox[2] <= 410, `Foreshortened dimension stayed inside A3 frame: ${JSON.stringify(markCheck.bbox)}`);

  f.phase = 'move foreshorten origin via sheet click with Esc cancel test first';
  await button('Move foreshorten origin big-r').click();
  await f.page.keyboard.press('Escape');
  await f.same(foreshortenedDoc);

  await button('Move foreshorten origin big-r').click();
  // Move origin to model [468, 0] in Top view
  const topBox = await f.page.evaluate(() => window.__studioDrawing().boxes.top);
  // Top view model X range is [460, 500], Y range is [-ARC_Y, +ARC_Y]; scale 1:1
  const targetSheetX = topBox[0] + (468 - 460);
  const targetSheetY = (topBox[1] + topBox[3]) / 2;
  const [cx, cy] = await sheetClientPoint(targetSheetX, targetSheetY);
  await f.page.mouse.move(cx, cy);
  await f.page.mouse.click(cx, cy);
  await f.page.waitForFunction(() => {
    const o = window.__studioDoc?.drawing?.dimensions?.[0]?.foreshorten?.origin;
    return !!o && Math.abs(o[0] - 468) < 1.5;
  });
  const movedDoc = (await f.snapshot('02-moved-origin-r500')).doc;
  const movedDim = await f.page.evaluate(() => window.__studioDrawing().dimensions[0]);
  assert.equal(movedDim.text, 'R500');
  near(movedDim.value, 500, 1e-6);

  f.phase = 'export actual SVG and DXF and independently verify jogged polyline and true R500';
  const dxfNotice = f.page.getByRole('note', { name: 'DXF radius display compatibility' });
  await dxfNotice.waitFor();
  assert.match(await dxfNotice.innerText(), /display block.*redraws.*ordinary radius.*Use SVG/);
  const svg = await downloadExport('Export SVG', 'foreshortened-r500.svg');
  assert.ok(svg.includes('>R500</text>'), 'SVG missing R500');
  assert.ok(svg.includes('<polyline points='), 'SVG missing jogged polyline');
  const dxf = await downloadExport('Export DXF', 'foreshortened-r500.dxf');
  assert.ok(dxf.includes('R500'), 'DXF missing R500');
  f.report.observations.push({ label: 'independent-ascii-dxf', ...checkDxfRadius(dxf) });

  f.phase = 'verify Remove foreshorten, Undo back to moved, Redo, and Save -> fresh Open';
  await button('Remove foreshorten big-r').click();
  await f.page.waitForFunction(() => !window.__studioDoc?.drawing?.dimensions?.[0]?.foreshorten);
  await dxfNotice.waitFor({ state: 'hidden' });
  const removedDoc = (await f.snapshot('03-removed-foreshorten')).doc;
  await f.undo();
  await f.same(movedDoc);
  await f.redo();
  await f.same(removedDoc);
  await f.undo();
  await f.same(movedDoc);

  const saved = await f.save('foreshortened-r500-reopened');
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles(saved.file);
  await f.same(movedDoc);
  await verifyNative('fresh-open-native', await f.doc());
  await openDrawing();
  const reopenedDim = await f.page.evaluate(() => window.__studioDrawing().dimensions[0]);
  assert.equal(reopenedDim.text, 'R500');
  near(reopenedDim.value, 500, 1e-6);
  await f.snapshot('04-fresh-open');

  f.phase = 'late origin move cannot affect another open document with the same dimension ID';
  await f.page.locator('.dw-dim button.dw-annotation-select').first().click();
  await button('Move foreshorten origin big-r').click();
  const nextBox = await f.page.evaluate(() => window.__studioDrawing().boxes.top);
  const [mx, my] = await sheetClientPoint(nextBox[0] + 13, (nextBox[1] + nextBox[3]) / 2);
  await f.page.mouse.move(mx, my);
  const preview = f.page.getByLabel('Foreshortened radius origin preview', { exact: true });
  await preview.waitFor();
  await f.same(movedDoc);
  await f.snapshot('05-origin-preview-uncommitted');
  // Keep the pointer gesture alive over an invalid origin so the draft can't apply before New Open.
  const [badX, badY] = await sheetClientPoint(nextBox[2] + 2, (nextBox[1] + nextBox[3]) / 2);
  await f.page.mouse.move(badX, badY);
  await f.page.mouse.down();
  await f.same(movedDoc);
  const other = structuredClone(movedDoc);
  other.drawing.dimensions[0].foreshorten.origin = [475, 0];
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'another-arc-same-dimension-id.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)),
  });
  await f.same(other);
  await openDrawing();
  await preview.waitFor({ state: 'hidden' });
  await f.page.mouse.up();
  await f.same(other);
  await f.snapshot('06-other-document-origin-unchanged');
});
