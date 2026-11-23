import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const f = await createFlow({
  name: 'prior-rectangular-cut-pattern', output: process.argv[2], envFrozen: 'D1828_SOURCE_FROZEN',
  qualification: '#25 repeat only the chosen earlier through-Subtract on its current same-stock result.',
  limits: ['One original rectangular stock and two disjoint full-height rectangular cuts, XY rectangular pattern in desktop Studio.'],
  initialFiles: [import.meta.filename, 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/cutPatternSource.ts',
    'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad-model/src/app/commands.ts',
    'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/part.ts',
    'packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/part/part-transform.ts',
    'packages/barocss-cad/src/part/part-types.ts', 'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode, type BodyRef } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!input.nodes) {
  let doc = emptyDoc();
  const ref = (node: number): BodyRef => ({ node, side: 'solid' });
  const box = (min: [number, number], max: [number, number]) => {
    const sketch = doc.nodes.length;
    doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min, max });
    doc = withNode(doc, { kind: 'extrude', sketch, height: 10 });
  };
  box([0, 0], [60, 40]);
  box([8, 8], [12, 10]);
  doc = withNode(doc, { kind: 'difference', parent: ref(1), tool: ref(3) });
  box([8, 26], [14, 28]);
  console.log(JSON.stringify(withNode(doc, { kind: 'difference', parent: ref(4), tool: ref(6) })));
} else {
  const [body] = partBreps(input);
  const { brep } = body;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const caps = brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane' || Math.abs(plane.n[2]) < 1 - 1e-9) return [];
    const openings = face.loops.map(id => loops.get(id)!).filter(loop => loop.kind === 'inner').map(loop => {
      const curves = loop.coedges.map(id => edges.get(uses.get(id)!.edge)!.curve);
      if (curves.length !== 4 || curves.some(curve => curve.degree !== 1 || curve.controlPoints.length !== 2))
        throw Error('Expected four native straight edges for a rectangular opening.');
      const points = curves.flatMap(curve => curve.controlPoints);
      if (points.some(point => Math.abs(point[2] - plane.o[2]) > 1e-8)) throw Error('Opening is off its cap.');
      return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
        Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    });
    return [{ z: plane.o[2], openings }];
  });
  console.log(JSON.stringify({ counts: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1), caps }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Rectangular cut pattern', exact: true });
const phase = (p, state) => p.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
const field = (p, label) => p.getByLabel(label, { exact: true });
const equivalent = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, JSON.stringify({ actual: a, expected: b }));
const order = (a, b) => a[0] - b[0] || a[1] - b[1];
const older = [8, 8, 12, 10], later = [8, 26, 14, 28];
const shift = (box, x, y) => [box[0] + x, box[1] + y, box[2] + x, box[3] + y];
const grid = (box, sx) => [box, shift(box, sx, 0), shift(box, 0, 8), shift(box, sx, 8)];

async function native(label, doc, openings) {
  const result = await f.inspect(label, doc);
  assert.ok(result.counts.valid, result.counts.issues.join('\n'));
  assert.equal(result.counts.topology.length, 1);
  assert.equal(result.counts.topology[0].genus, openings.length);
  assert.equal(result.caps.length, 2);
  result.caps.map(cap => cap.z).sort((a, b) => a - b).forEach((z, i) => equivalent(z, 10 * i));
  const expected = [...openings].sort(order);
  for (const cap of result.caps) {
    assert.equal(cap.openings.length, expected.length);
    cap.openings.sort(order).forEach((opening, i) => opening.forEach((p, k) => equivalent(p, expected[i][k])));
  }
  const net = { volume: 24000, moment: [24000 * 30, 24000 * 20, 24000 * 5] };
  for (const [x0, y0, x1, y1] of openings) {
    const removed = 10 * (x1 - x0) * (y1 - y0);
    net.volume -= removed;
    net.moment[0] -= removed * (x0 + x1) / 2;
    net.moment[1] -= removed * (y0 + y1) / 2;
    net.moment[2] -= removed * 5;
  }
  equivalent(result.mass.volume, net.volume);
  result.mass.centroid.forEach((value, i) => equivalent(value, net.moment[i] / net.volume));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  equivalent(bodies[0].volume, net.volume);
  f.report.observations.push({ label, volume: result.mass.volume, centroid: result.mass.centroid, openings: expected });
  return result;
}

async function chooseSource(entry) {
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await browser.locator('.ol:not(.ol-step)').first().click();
  if (entry === 'Browser') await browser.locator('.ol-step').filter({ hasText: 'Subtract' }).first().click();
  if (entry === 'History') await f.page.locator('.history [data-node-index="4"]').click();
  if (entry) await f.closeEditor();
}

async function openPattern(entry) {
  await chooseSource(entry);
  await clickModelCommand(f.page, 'Pattern', 'Rectangular cut pattern');
  const p = hud();
  await p.waitFor();
  const source = entry ? 'Subtract 1 (n4)' : 'Subtract 2 (n7)';
  await p.getByText(source, { exact: true }).waitFor();
  return p;
}

async function setGrid(p, secondSpacing = 8) {
  await field(p, 'First count').fill('2');
  await field(p, 'Second spacing').fill(String(secondSpacing));
  await field(p, 'Second count').fill('2');
}

async function apply(p, before, label, usesEarlier) {
  await phase(p, 'preview');
  await f.same(before);
  await button('Apply', p).click();
  await f.changed(before);
  const doc = (await f.snapshot(label)).doc, pattern = doc.nodes.at(-1);
  assert.deepEqual(doc.nodes.slice(0, -1), before.nodes);
  assert.deepEqual(pattern.parent, { node: 7, side: 'solid' });
  assert.deepEqual(pattern.source, usesEarlier ? { node: 4, side: 'solid' } : undefined);
  assert.deepEqual([pattern.axis, pattern.spacing, pattern.count, pattern.axis2, pattern.spacing2, pattern.count2], ['x', 16, 2, 'y', 8, 2]);
  return doc;
}

await f.run(async () => {
  const source = await f.inspect('seed', {});
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'two-rectangular-through-cuts.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await native('original-two-cuts', source, [older, later]);

  const latest = await openPattern(null);
  await setGrid(latest);
  const latestDoc = await apply(latest, source, '01-current-cut-control', false);
  await native('current-source', latestDoc, [older, ...grid(later, 16)]);
  await f.undo();
  await f.same(source);

  const fromBrowser = await openPattern('Browser');
  const undo = await button('Undo').getAttribute('data-tip');
  await setGrid(fromBrowser, 18);
  await phase(fromBrowser, 'refused');
  assert.ok(await button('Apply', fromBrowser).isDisabled());
  const refused = fromBrowser.locator('.hud-error');
  const disclosure = refused.locator('details:not([open]) > summary');
  if (await disclosure.count()) await disclosure.click();
  assert.match(await refused.innerText(), /overlap|touch|intersect|disjoint/i);
  await f.same(source);
  assert.equal(await button('Undo').getAttribute('data-tip'), undo);
  await f.snapshot('02-overlap-refused');
  await setGrid(fromBrowser);
  await phase(fromBrowser, 'preview');
  await f.snapshot('03-earlier-cut-preview');
  const browserDoc = await apply(fromBrowser, source, '04-earlier-cut-applied', true);
  await native('earlier-source-browser', browserDoc, [...grid(older, 16), later]);
  await f.undo();
  await f.same(source);

  const fromHistory = await openPattern('History');
  await setGrid(fromHistory);
  const historyDoc = await apply(fromHistory, source, '05-earlier-cut-history', true);
  assert.deepEqual(historyDoc, browserDoc);
  await native('earlier-source-history', historyDoc, [...grid(older, 16), later]);

  await f.openFeatureEditor(8, 'rectangular cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'First spacing').fill('18');
  const edited = (await f.applyEditor(historyDoc, '06-first-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...historyDoc.nodes.at(-1), spacing: 18 });
  await native('after-spacing-edit', edited, [...grid(older, 18), later]);
  await f.undo();
  await f.same(historyDoc);
  await f.redo();
  await f.same(edited);
  const stored = await f.save('earlier-cut-pattern');
  await f.freshOpen(stored.file, edited, '07-saved-earlier-cut-fresh-open');
  await native('after-fresh-open', edited, [...grid(older, 18), later]);
  await f.openFeatureEditor(8, 'retained earlier source');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'First spacing').inputValue(), '18');
  await f.snapshot('08-reopened-earlier-source');
  await f.closeEditor();
  await f.same(edited);
});
