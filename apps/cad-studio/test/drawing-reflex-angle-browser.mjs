import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const sections = {
  right: { points: [[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]],
    edges: [[30, 20], [20, 30]], ordinary: 90, reflex: 270 },
  oblique: { points: [[0, 0], [40, 0], [40, 20], [20, 20], [30, 20 + 10 * Math.sqrt(3)], [30, 42], [0, 42]],
    edges: [[25, 20 + 5 * Math.sqrt(3)], [30, 20]], ordinary: 60, reflex: 300 },
};
const part = fixture => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'polygon', points: fixture.points }, { id: 'n1', kind: 'extrude', sketch: 0, height: 6 }],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
});
const baseline = process.argv.includes('--baseline');
const f = await createFlow({
  name: 'drawing-reflex-angle', output: process.argv[2], envFrozen: 'D1827_SOURCE_FROZEN',
  qualification: '#742 ordinary and reflex angular dimensions on original straight edges that share a native vertex.',
  limits: ['One extruded synthetic outline in the desktop Top drawing. Native file and actual SVG only.'],
  initialFiles: [import.meta.filename, 'packages/barocss-cad-model/src/drawing/dimensions.ts', 'packages/barocss-cad-model/src/drawing/project.ts',
    'packages/barocss-cad-model/src/drawing/types.ts', 'packages/barocss-cad-model/src/engine/savedDrawing.ts',
    'apps/cad-studio/src/ui/DrawingWorkspace.tsx', ...(baseline ? [] : ['packages/barocss-cad-model/src/drawing/reflexAngle.ts',
      'packages/barocss-cad-model/src/drawing/savedReflexAngle.ts'])],
});
const button = name => f.page.getByRole('button', { name, exact: true });
const pixel = p => f.page.evaluate(([x, y]) => window.__studioDrawingAt('top', x, y), p);
const click = async p => { const q = await pixel(p); await f.page.mouse.click(q.x, q.y); };
const measure = node => ({ value: parseFloat(node.querySelector('text')?.textContent ?? ''),
  arc: [...node.querySelectorAll('path')].find(path => (path.getAttribute('d') ?? '').includes('A'))?.getAttribute('d') });
const arcFlag = d => /A[^ ]+ [^ ]+ [^ ]+ ([01]) [01] /.exec(d ?? '')?.[1];
const count = () => f.page.evaluate(() => window.__studioDoc.drawing?.dimensions?.length ?? 0);

async function viewTop() {
  await button('Drawing').click();
  await f.page.waitForFunction(() => !!window.__studioDrawingAt?.('top', 20, 20));
}
async function open(fixture, filename) {
  const doc = part(fixture);
  await f.page.setInputFiles('input[aria-label="Model file"]',
    { name: `${filename}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  const area = Math.abs(fixture.points.reduce((sum, p, k, pts) => {
    const q = pts[(k + 1) % pts.length];
    return sum + p[0] * q[1] - p[1] * q[0];
  }, 0)) / 2;
  const { bodies: [body] } = await f.bodies();
  assert.ok(Math.abs(6 * area - body.volume) < 1e-7);
  await viewTop();
  return doc;
}
async function pickFirst(tool, fixture) {
  await button(tool).click();
  await click(fixture.edges[0]);
  await f.page.getByText('Now the second edge · Esc cancels', { exact: true }).waitFor();
}
async function preview(place, expected, flag) {
  const q = await pixel(place);
  await f.page.mouse.move(q.x, q.y);
  const group = f.page.locator('.dw-preview').filter({ has: f.page.locator('text') });
  await group.waitFor();
  const ink = await group.evaluate(measure);
  assert.equal(ink.value, expected);
  assert.equal(arcFlag(ink.arc), flag);
  return ink;
}
async function confirm(place, expected) {
  await click(place);
  await f.page.waitForFunction(value => window.__studioDrawing?.()?.dimensions?.some(d => d.value === value), expected);
  const dim = (await f.doc()).drawing.dimensions.at(-1);
  const group = f.page.locator(`g.dimension[data-dim="${dim.id}"]`);
  const ink = await group.evaluate(measure);
  assert.equal(ink.value, expected);
  return { dim, ink, group };
}
async function exportSvg(label, expected, dimension) {
  const before = await f.doc(), event = f.page.waitForEvent('download');
  await button('Export SVG').click();
  const download = await event, file = join(f.output, `${label}.svg`);
  await download.saveAs(file);
  assert.equal(await download.failure(), null);
  const bytes = await readFile(file), page = await f.context.newPage();
  try {
    await page.goto('data:image/svg+xml;base64,' + bytes.toString('base64'));
    const group = page.locator(`g.dimension[data-dim="${dimension}"]`);
    const ink = await group.evaluate(measure);
    assert.equal(ink.value, expected);
    assert.equal(arcFlag(ink.arc), '1');
    await page.screenshot({ path: join(f.output, `${label}-standalone.png`) });
    f.report.files.push({ kind: 'svg', file, bytes: bytes.length, sha256: sha256(bytes) });
  } finally {
    await page.close();
  }
  await f.same(before);
}

function referencePair(dim) {
  return [dim.a.edge, dim.b.edge].sort();
}

await f.run(async () => {
  await f.newPage();
  const right = sections.right, original = await open(right, 'concave-right-plate');
  await pickFirst('Angle', right);
  await click(right.edges[1]);
  const ordinaryPlace = [26, 26], ordinary = await preview(ordinaryPlace, right.ordinary, '0');
  if (baseline) {
    for (const [i, place] of [[26, 26], [14, 26], [14, 14], [26, 14]].entries()) {
      await preview(place, 90, '0');
      await f.snapshot(`baseline-0${i + 1}-ordinary-only`);
    }
    assert.equal(await button('Reflex angle').count(), 0);
    await confirm(ordinaryPlace, 90);
    return;
  }
  const short = await confirm(ordinaryPlace, right.ordinary);
  assert.equal(short.dim.mode, undefined);
  assert.deepEqual(short.ink, ordinary);
  await f.snapshot('01-ordinary-90');
  await f.undo();
  await f.same(original);

  await pickFirst('Reflex angle', right);
  assert.equal(await button('Reflex angle').locator('[data-ui-icon="restart_alt"]').count(), 1);
  await click([0, 10]);
  const warning = f.page.locator('.dw-hint.warn[role="status"]').filter({ hasText: /share|meet|corner|vertex/i });
  await warning.waitFor();
  assert.equal(await count(), 0);
  await f.same(original);
  await f.snapshot('02-separated-edges-refused');
  await click(right.edges[1]);
  const long = await preview([13, 13], right.reflex, '1');
  await f.snapshot('03-reflex-preview-270');
  await preview([25, 24], right.reflex, '1');
  const newAngle = await confirm([13, 13], right.reflex);
  assert.deepEqual(newAngle.ink, long);
  assert.equal(newAngle.dim.mode, 'reflex');
  assert.deepEqual(referencePair(newAngle.dim), referencePair(short.dim));
  const initial = await f.doc();
  await f.snapshot('04-reflex-270-applied');
  await button('Add break').click();
  await f.waitToast(/Reflex angle: broken Top views/i);
  await f.same(initial);
  await f.dismissToasts();

  await button('Select').click();
  const label = await newAngle.group.locator('text').evaluate(node => {
    const b = node.getBBox(), m = node.getScreenCTM();
    const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
    return [p.x, p.y];
  });
  await f.page.mouse.move(...label);
  await f.page.mouse.down();
  await f.page.mouse.move(label[0] - 13, label[1] + 9, { steps: 6 });
  await f.page.mouse.up();
  await f.changed(initial);
  const moved = await f.doc(), movedAngle = moved.drawing.dimensions[0];
  assert.notDeepEqual(movedAngle.place, newAngle.dim.place);
  assert.deepEqual({ ...movedAngle, place: newAngle.dim.place }, newAngle.dim);
  assert.equal((await newAngle.group.evaluate(measure)).value, 270);
  await f.undo();
  await f.same(initial);
  await f.redo();
  await f.same(moved);
  const saved = await f.save('reflex-angle-native');
  await f.freshOpen(saved.file, moved, '05-native-fresh-open');
  await viewTop();
  await exportSvg('06-reflex-270-export', 270, movedAngle.id);

  await button('Model').click();
  const changedCorner = structuredClone(moved);
  changedCorner.nodes[0].points[3] = [21, 20];
  await f.page.setInputFiles('input[aria-label="Model file"]',
    { name: 'changed-corner-same-edge-names.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changedCorner)) });
  await f.same(changedCorner);
  await viewTop();
  const stale = await f.page.waitForFunction(id => window.__studioDrawing?.()?.dimensions?.find(d => d.id === id && d.lost), movedAngle.id);
  assert.match((await stale.jsonValue()).lost, /Reflex angle/);
  assert.equal(await f.page.locator(`g.dimension[data-dim="${movedAngle.id}"]`).count(), 0);
  await f.same(changedCorner);
  await f.snapshot('07-changed-source-holds-reference');

  await button('Model').click();
  const oblique = sections.oblique;
  await open(oblique, 'concave-oblique-plate');
  await pickFirst('Reflex angle', oblique);
  await click(oblique.edges[1]);
  const expected = await preview([12, 13], oblique.reflex, '1');
  const obliqueAngle = await confirm([12, 13], oblique.reflex);
  assert.deepEqual(obliqueAngle.ink, expected);
  assert.equal(obliqueAngle.dim.mode, 'reflex');
  await f.snapshot('08-reflex-300-applied');
  await exportSvg('09-reflex-300-export', 300, obliqueAngle.dim.id);
  f.report.observations.push({ right: newAngle.dim, moved: movedAngle.place, oblique: obliqueAngle.dim, arcs: [newAngle.ink.arc, obliqueAngle.ink.arc] });
});
