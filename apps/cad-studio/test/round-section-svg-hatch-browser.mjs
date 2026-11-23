import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const f = await createFlow({
  name: 'round-section-svg-hatch', output: process.argv[2], envFrozen: 'D1826_SOURCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/round-section-svg-hatch-browser.mjs', 'packages/barocss-cad-model/src/drawing/section.ts',
    'packages/barocss-cad-model/src/drawing/sheet.ts', 'packages/barocss-cad-model/src/io/svg.ts'],
  qualification: '#743 circular hatch boundary in the actual Studio SVG, solid and annular controls.',
  limits: ['Principal top cut through synthetic round extrusions, one circle or concentric annulus. SVG only.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { commands } from '@barocss/cad-model/app/commands';
import { emptyDoc, rectanglePart } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const { profile, scale, x, y } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const command = commands.find(command => command.id === profile);
const context = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
const doc = profile === 'rectangle' ? rectanglePart(40, 30, 20) : command!.build!(context, { r: 20, ri: 10, h: 20, x, y, z: 0 });
console.log(JSON.stringify({ ...doc, drawing: { ...defaultDrawing(), sheet: scale === 2 ? 'A3' : 'A4', scope: { kind: 'part' }, scale,
  sections: [{ id: 'A', view: 'top', at: -10 }], dimensions: [] } }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const visibleSection = 'g.section[data-dim="A"]:not([data-view])';
const precisionMM = 0.00011;
const hypot = Math.hypot;
const round45 = Math.SQRT1_2;

async function openSection(label, profile, scale, x = 0, y = 0) {
  const seed = await f.inspect(label, { profile, scale, x, y });
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: `${label}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.page.waitForFunction(({ scale, nodes }) => window.__studioDoc?.drawing?.scale === scale
    && window.__studioDoc?.drawing?.sections?.[0]?.id === 'A'
    && JSON.stringify(window.__studioDoc?.nodes) === nodes, { scale, nodes: JSON.stringify(seed.nodes) });
  await f.ready();
  assert.deepEqual(await f.doc(), seed);
  const { bodies: [body] } = await f.bodies();
  const volume = profile === 'rectangle' ? 24000 : (profile === 'tube' ? 6000 : 8000) * Math.PI;
  assert.ok(Math.abs(body.volume - volume) < 1e-6);
  await button('Drawing').click();
  await f.page.waitForFunction(rings => window.__studioDrawing?.()?.sections?.some(s => s.id === 'A' && s.rings === rings && !s.error), profile === 'tube' ? 2 : 1);
  await f.page.locator(`svg[aria-label="Drawing sheet"] ${visibleSection}`).waitFor();
}

function sectionInk(group) {
  const arcs = [...group.querySelectorAll('path')].map(node => {
    const { x, y, width, height } = node.getBBox();
    return { d: node.getAttribute('d'), bounds: [x, y, x + width, y + height] };
  });
  const lines = [...group.querySelectorAll('line')].filter(node => node.getAttribute('stroke-width') === '0.25'
    && !node.getAttribute('stroke-dasharray')).map(node => ['x1', 'y1', 'x2', 'y2'].map(key => +node.getAttribute(key)));
  return { arcs, lines };
}

async function exportSection(label) {
  await f.snapshot(label);
  const accepted = await f.doc();
  const pending = f.page.waitForEvent('download');
  await button('Export SVG').click();
  const download = await pending, file = join(f.output, `${label}.svg`);
  await download.saveAs(file);
  assert.equal(await download.failure(), null);
  const bytes = await readFile(file);
  const svgPage = await f.context.newPage();
  try {
    await svgPage.goto('data:image/svg+xml;base64,' + bytes.toString('base64'));
    const group = svgPage.locator(visibleSection);
    await group.waitFor();
    const ink = await group.evaluate(sectionInk);
    const screen = await f.page.locator(`svg[aria-label="Drawing sheet"] ${visibleSection}`).evaluate(sectionInk);
    assert.deepEqual(ink, screen);
    await svgPage.screenshot({ path: join(f.output, `${label}-standalone.png`) });
    await f.same(accepted);
    f.report.files.push({ kind: 'svg', file, bytes: bytes.length, sha256: sha256(bytes), originalDownload: true });
    return ink;
  } finally {
    await svgPage.close();
  }
}

// Use the actual SVG outline bounds as the sheet translation. The intersection oracle uses the authored radii.
function verifyCircles({ arcs, lines }, radii) {
  assert.equal(arcs.length, 2 * radii.length);
  const union = boxes => [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])),
    Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
  const centerOf = ([x1, y1, x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2];
  const centers = radii.map(radius => {
    const paths = arcs.filter(arc => {
      const syntax = /A([\d.]+) ([\d.]+) /.exec(arc.d);
      return Number(syntax?.[1]) === radius && Number(syntax?.[2]) === radius;
    });
    assert.equal(paths.length, 2, radius);
    const bounds = union(paths.map(path => path.bounds));
    assert.ok(Math.abs(bounds[2] - bounds[0] - 2 * radius) < precisionMM && Math.abs(bounds[3] - bounds[1] - 2 * radius) < precisionMM);
    return centerOf(bounds);
  });
  const [cx, cy] = centers[0], [outer, inner] = radii;
  for (const [x, y] of centers) assert.ok(hypot(x - cx, y - cy) < precisionMM);
  const intervals = new Map();
  const axis = (x, y) => round45 * (x - cx + y - cy);
  const offset = (x, y) => round45 * (y - x);
  const centerOffset = offset(cx, cy);
  let endError = 0, outerShortfall = 0, boreIntrusion = 0, intrusionCount = 0;
  for (const [x1, y1, x2, y2] of lines) {
    const first = axis(x1, y1), last = axis(x2, y2), level = Math.round(offset(x1, y1) / 2.5);
    assert.ok(last > first && Math.abs(offset(x1, y1) - 2.5 * level) < precisionMM
      && Math.abs(offset(x2, y2) - 2.5 * level) < precisionMM);
    if (!intervals.has(level)) intervals.set(level, []);
    intervals.get(level).push([first, last]);
    const points = [[x1, y1], [x2, y2]];
    for (const [x, y] of points) {
      const radius = hypot(x - cx, y - cy);
      endError = Math.max(endError, Math.min(...radii.map(candidate => Math.abs(candidate - radius))));
      if (Math.abs(radius - outer) < Math.abs(radius - (inner ?? 0))) outerShortfall = Math.max(outerShortfall, outer - radius);
    }
    if (inner !== undefined) {
      const at = Math.max(first, Math.min(0, last));
      const intrusion = inner - hypot(at, 2.5 * level - centerOffset);
      if (intrusion > precisionMM) intrusionCount++;
      boreIntrusion = Math.max(boreIntrusion, intrusion);
    }
  }
  let maxEndpointShift = 0;
  for (let row = Math.ceil((centerOffset - outer) / 2.5); row <= Math.floor((centerOffset + outer) / 2.5); row++) {
    const d = Math.abs(2.5 * row - centerOffset);
    if (d >= outer) continue;
    const outside = Math.sqrt(outer ** 2 - d ** 2), inside = inner !== undefined && d < inner ? Math.sqrt(inner ** 2 - d ** 2) : 0;
    const expected = inside > 0 ? [[-outside, -inside], [inside, outside]] : [[-outside, outside]];
    const actual = intervals.get(row)?.sort((a, b) => a[0] - b[0]);
    assert.equal(actual?.length, expected.length, `segments on hatch line ${row}`);
    intervals.delete(row);
    for (const [i, pair] of expected.entries()) for (const end of [0, 1])
      maxEndpointShift = Math.max(maxEndpointShift, Math.abs(pair[end] - actual[i][end]));
  }
  assert.equal(intervals.size, 0);
  return { lines: lines.length, center: [cx, cy], endError, maxEndpointShift, outerShortfall, boreIntrusion, intrusionCount };
}

async function round(label, radii) {
  const ink = await exportSection(label), result = verifyCircles(ink, radii);
  f.report.observations.push({ label, radii, ...result });
  if (baseline) {
    assert.ok(result.intrusionCount > 0 && result.boreIntrusion > 0.01 && result.outerShortfall > 0.02);
  } else {
    assert.equal(result.intrusionCount, 0);
    assert.ok(result.endError < precisionMM && result.maxEndpointShift < precisionMM, JSON.stringify(result));
  }
}

await f.run(async () => {
  await f.newPage();
  await openSection('annulus', 'tube', 1);
  await round('01-annulus-actual-svg', [20, 10]);
  if (baseline) return;
  f.phase = 'Suppress the section hatch in Studio';
  await f.page.getByLabel('Section A hatch', { exact: true }).uncheck();
  await f.page.waitForFunction(() => window.__studioDoc?.drawing?.sections?.[0]?.hideHatch === true
    && !document.querySelector('svg[aria-label="Drawing sheet"] g.section[data-dim="A"]:not([data-view]) line'));
  assert.equal((await exportSection('02-hatch-hidden')).lines.length, 0);
  await f.page.getByLabel('Section A hatch', { exact: true }).check();
  await f.page.locator(`svg[aria-label="Drawing sheet"] ${visibleSection} line`).first().waitFor();
  await round('03-hatch-restored', [20, 10]);
  await button('Model').click();
  await openSection('translated-double-scale', 'tube', 2, 13, -7);
  await round('04-translated-2-to-1', [40, 20]);
  await button('Model').click();
  await openSection('solid', 'cylinder', 1);
  await round('05-solid-circle', [20]);
  await button('Model').click();
  await openSection('rectangle', 'rectangle', 1);
  const rect = await exportSection('06-rectangle-fallback');
  assert.equal(rect.arcs.length, 0);
  assert.ok(rect.lines.length > 10);
});
