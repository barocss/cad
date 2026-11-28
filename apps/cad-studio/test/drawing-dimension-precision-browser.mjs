import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/drawing-dimension-precision-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  ...['dimensions', 'standard', 'sheet', 'types'].map(name => `packages/barocss-cad-model/src/drawing/${name}.ts`),
  ...['dxf', 'pdf'].map(name => `packages/barocss-cad-model/src/io/${name}.ts`),
  ...(baseline ? [] : [
    'packages/barocss-cad-model/src/drawing/savedDimensionDecimals.ts',
    'packages/barocss-cad-model/src/engine/savedDrawing.ts',
  ]),
];
const f = await createFlow({
  name: 'drawing-dimension-precision', output: process.argv[2], envFrozen: 'DIMENSION_PRECISION_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  snapshotExtra: () => ({ drawing: window.__studioDrawing?.() }),
  qualification: 'Change the displayed precision of one manual dimension without changing its measurement, references or neighboring dimensions.',
  inspectorSource: `
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { defaultDrawing, readDrawing } from '@barocss/cad-model/drawing/types';
const width = 12.3456;
const doc = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon',
  points: [[0, 0], [width, 0], [width, 7]] }), { kind: 'extrude', sketch: 0, height: 6 });
const native = brepsFor(doc);
assert.ok('breps' in native);
const projected = projectViews(native.breps, native.prefixes);
assert.ok(projected.ok);
const top = projected.views.top;
const endpoint = (x,y) => snapPoints(top).find(s => s.ref.at === 'end' && Math.hypot(s.at[0]-x,s.at[1]-y)<1e-8).ref;
const edge = (x,y) => {
  const found = top.edges.find(e => e.kind === 'line' && e.ends && e.pieces.some(p => p.visible)
    && Math.hypot((e.ends[0][0]+e.ends[1][0])/2-x, (e.ends[0][1]+e.ends[1][1])/2-y)<1e-8);
  assert.ok(found);
  return { edge: found.name, near: found.ends[0].map((v,i) => (v + found.ends[1][i]) / 2) };
};
const linear = { kind: 'linear', view: 'top', orient: 'horizontal', a: endpoint(0,0), b: endpoint(width,0) };
console.log(JSON.stringify({ ...doc, drawing: readDrawing({ ...defaultDrawing(), precision: { mm: 2 }, scale: 3, dimensions: [
  { ...linear, id: 'width-a', place: [width/2,-5] },
  { ...linear, id: 'width-b', place: [width/2,-12] },
  { id: 'angle-a', kind: 'angle', view: 'top', a: edge(width/2,0), b: edge(width/2,3.5), place: [8, 1.5] },
] }) }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const label = name => f.page.getByLabel(name, { exact: true });
const control = () => label('Decimal places');
const dim = id => f.page.locator(`g.dimension[data-dim="${id}"]`);
const angle = Math.atan2(7, 12.3456) * 180 / Math.PI;
const labels = (a, b, c) => [['width-a', a], ['width-b', b], ['angle-a', c]];
const normalLabels = labels('12.35', '12.35', `${angle.toFixed(2)}°`);

async function showDrawing() {
  await button('Drawing').click();
  await dim('angle-a').waitFor();
}
async function select(id) {
  const position = await dim(id).locator('text').first().boundingBox();
  assert.ok(position);
  await f.page.mouse.click(position.x + position.width / 2, position.y + position.height / 2);
}
async function expectLabels(expected) {
  for (const [id, text] of expected) {
    await f.page.waitForFunction(([id, text]) => Array.from(document.querySelectorAll(`g.dimension[data-dim="${id}"] text`))
      .some(e => e.textContent === text), [id, text]);
  }
}
async function verifyMeasurements(source) {
  const current = await f.doc();
  const data = await f.page.evaluate(() => window.__studioDrawing().dimensions.map(d => [d.id, d.value]));
  const values = Object.fromEntries(data);
  for (const [id, expected] of [['width-a', 12.3456], ['width-b', 12.3456], ['angle-a', angle]])
    assert.ok(Math.abs(values[id] - expected) < 1e-8, `${id}: ${values[id]} vs ${expected}`);
  assert.deepEqual(current.nodes, source.nodes);
  assert.deepEqual(current.drawing.dimensions.map(({ displayDecimals, ...rest }) => rest), source.drawing.dimensions);
}

function captureOutput() {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    await context.addInitScript(() => {
      const saved = new Map();
      const create = URL.createObjectURL;
      const click = HTMLAnchorElement.prototype.click;
      window.__precisionOutputs = {};
      URL.createObjectURL = function (blob) {
        const url = create.call(this, blob);
        saved.set(url, blob);
        return url;
      };
      HTMLAnchorElement.prototype.click = function () {
        const kind = this.download.split('.').at(-1);
        const blob = saved.get(this.href);
        if (!blob || !['svg', 'pdf', 'dxf'].includes(kind)) return click.call(this);
        void blob.arrayBuffer().then(bytes => { window.__precisionOutputs[kind] = [...new Uint8Array(bytes)]; });
      };
    });
    return context;
  };
}

async function exportBytes(kind, label = 'precision') {
  await f.page.evaluate(kind => { delete window.__precisionOutputs[kind]; }, kind);
  await button('Export ' + kind.toUpperCase()).click();
  await f.page.waitForFunction(kind => window.__precisionOutputs[kind]?.length > 0, kind);
  const bytes = Buffer.from(await f.page.evaluate(kind => window.__precisionOutputs[kind], kind));
  const file = join(f.output, label + '.' + kind);
  await writeFile(file, bytes);
  f.report.files.push({ kind, file, bytes: bytes.length, sha256: sha256(bytes) });
  return bytes;
}

function dimensionsInDxf(bytes) {
  const lines = bytes.toString('latin1').trim().split(/\r?\n/);
  const entities = [];
  let current;
  assert.equal(lines.length % 2, 0);
  for (let at = 0; at < lines.length; at += 2) {
    const code = Number(lines[at].trim()), value = lines[at + 1].trim();
    if (code === 0) {
      current = value === 'DIMENSION' ? {} : undefined;
      if (current) entities.push(current);
    } else if (current && code !== 100) current[code] = value;
  }
  return entities;
}

async function verifyExports(expected, originalDxf) {
  const svg = await exportBytes('svg');
  const printedSvg = await f.page.evaluate(({ svg, ids }) => {
    const drawing = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return ids.map(id => [...drawing.querySelectorAll(`g.dimension[data-dim="${id}"] text`)].map(node => node.textContent));
  }, { svg: svg.toString('utf8'), ids: expected.map(([id]) => id) });
  for (const [[, text], actual] of expected.map((entry, i) => [entry, printedSvg[i]])) assert.ok(actual.includes(text), actual.join(', '));

  const pdf = await exportBytes('pdf');
  assert.match(pdf.toString('latin1'), /^%PDF-1\.4/);
  const printedPdf = Array.from(pdf.toString('latin1').matchAll(/\(((?:\\.|[^()\\])*)\) Tj/g), match =>
    match[1].replace(/\\([0-7]{3}|[()\\])/g, (_, char) => char.length === 3 ? String.fromCharCode(parseInt(char, 8)) : char));
  for (const [, text] of expected) assert.ok(printedPdf.includes(text), text);

  const dxf = dimensionsInDxf(await exportBytes('dxf'));
  assert.deepEqual(dxf.map(entity => entity[1]), expected.map(([, text]) => text.replace('°', '%%d')));
  assert.deepEqual(dxf.map(entity => entity[42]), ['12.3456', '12.3456', undefined]);
  const definition = ({ 1: _text, 5: _handle, 11: _tx, 21: _ty, 31: _tz, ...shape }) => shape;
  assert.deepEqual(dxf.map(definition), originalDxf.map(definition), 'Only display text and its placement may change');
  f.report.observations.push({ svg: expected, pdf: expected, dxf: dxf.map(entity => ({ text: entity[1], nominal: entity[42] })) });
}

await f.run(async () => {
  f.phase = 'Open the native drawing and select one of its two equal measured widths';
  const source = await f.inspect('drawing-fixture', {});
  if (!baseline) captureOutput();
  await f.newPage();
  await label('Model file').setInputFiles({ name: 'dimension-precision.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  await showDrawing();
  await expectLabels(normalLabels);
  await verifyMeasurements(source);
  await select('width-a');
  if (baseline) {
    assert.equal(await control().count(), 0);
    await f.snapshot('sheet-default-baseline');
    return;
  }

  f.phase = 'Set just one width to three decimal places and one angle to four';
  const originalDxf = dimensionsInDxf(await exportBytes('dxf', 'sheet-default'));
  await control().selectOption('3');
  await expectLabels(labels('12.346', '12.35', `${angle.toFixed(2)}°`));
  await verifyMeasurements(source);
  await select('angle-a');
  await control().selectOption('4');
  const changed = labels('12.346', '12.35', `${angle.toFixed(4)}°`);
  await expectLabels(changed);
  await verifyMeasurements(source);
  await f.snapshot('independent-decimal-places');

  f.phase = 'Clear only the selected width and verify Undo, Redo and native Save and Open';
  await select('width-a');
  await control().selectOption('');
  const cleared = labels('12.35', '12.35', `${angle.toFixed(4)}°`);
  await expectLabels(cleared);
  assert.equal((await f.doc()).drawing.dimensions[0].displayDecimals, undefined);
  await f.snapshot('width-default-restored');
  await f.undo();
  await expectLabels(changed);
  await f.redo();
  await expectLabels(cleared);
  await f.undo();
  await expectLabels(changed);
  const accepted = await f.doc();
  const saved = await f.save('dimension-precision-edit');
  await f.newPage();
  await f.openFile(saved.file, accepted.nodes.length);
  assert.deepEqual(await f.doc(), accepted);
  await showDrawing();
  await expectLabels(changed);
  await verifyMeasurements(source);
  await select('angle-a');
  assert.equal(await control().inputValue(), '4');
  await f.snapshot('dimension-precision-reopened');

  f.phase = 'Read the actual SVG, PDF and DXF outputs from the reopened sheet';
  await verifyExports(changed, originalDxf);
  await verifyMeasurements(source);
});
