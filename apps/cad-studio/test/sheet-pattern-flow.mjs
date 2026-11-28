import assert from 'node:assert/strict';
import { sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const table = {
  id: 'pattern-coupon',
  sources: [{ id: 'coupon', label: 'Pattern coupon' }],
  rows: [
    { thickness: 1.5, radius: 1.5, angle: 90, kFactor: 0.44, source: 'coupon' },
    { thickness: 2, radius: 1.5, angle: 90, kFactor: 0.46, source: 'coupon' },
  ],
};
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1e-8, `${label}: ${actual} != ${expected}`);
const pointNear = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, axis) => near(value, expected[axis], label));
};
const button = (parent, name) => parent.getByRole('button', { name, exact: true });

export function patternFixture(seed) {
  return { ...seed, nodes: seed.nodes.map(node => {
    if (node.id === 'n0') {
      const { kFactor, ...source } = node;
      assert.equal(kFactor, 0.44);
      return { ...source, bendTable: table };
    }
    return node.id === 'n1' ? { ...node, center: [25, 18] } : node;
  }) };
}

function copyPoint([x, y, z], pattern, index) {
  if (pattern === 'linear') return [x + 60 * index, y, z];
  if (index === 1) return [100 - y, x - 100, z];
  if (index === 2) return [200 - x, -y, z];
  return [x, y, z];
}

function sheetTruth(row, bends) {
  const { thickness, radius, kFactor } = table.rows[row];
  const outerRadius = radius + thickness;
  const allowance = Math.PI * (radius + kFactor * thickness) / 2;
  const outside = bends === 1 ? 70 : 90;
  const straight = outside - 2 * bends * outerRadius;
  const length = straight + bends * allowance;
  const volume = 30 * (thickness * straight + bends * Math.PI * (outerRadius ** 2 - radius ** 2) / 4)
    - 2 * Math.PI * 2.75 ** 2 * thickness;
  return { thickness, allowance, length, volume, area: 30 * length - 2 * Math.PI * 2.75 ** 2 };
}

function checkDxf(text, bendCount) {
  const lines = text.trimEnd().split(/\r?\n/).map(line => line.trim());
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) pairs.push([lines[i], lines[i + 1]]);
  assert.ok(pairs.some(([code, value], index) => code === '9' && value === '$INSUNITS'
    && pairs[index + 1]?.[1] === '4'), 'DXF millimetres');
  const start = pairs.findIndex(([code, value]) => code === '2' && value === 'ENTITIES');
  assert.ok(start >= 0);
  const entities = [];
  for (const [code, value] of pairs.slice(start + 1)) {
    if (code === '0' && value === 'ENDSEC') break;
    if (code === '0') entities.push({ type: value });
    else if (code === '8') entities.at(-1).layer = value;
    else if (code === '40') entities.at(-1).size = Number(value);
  }
  const holes = entities.filter(entity => entity.type === 'CIRCLE');
  assert.equal(holes.length, 2);
  holes.forEach(entity => {
    assert.equal(entity.layer, 'OUTLINE');
    near(entity.size, 2.75, 'DXF hole radius');
  });
  assert.deepEqual(entities.filter(entity => entity.type === 'LINE' && entity.layer.startsWith('BEND_')).map(entity => entity.layer),
    bendCount === 1 ? ['BEND_DOWN'] : ['BEND_DOWN', 'BEND_UP']);
  assert.equal(entities.filter(entity => entity.type === 'TEXT' && entity.layer === 'BEND_NOTES').length, bendCount);
}

function verifySheet(body, row, bends, owner) {
  const expected = sheetTruth(row, bends);
  assert.equal(body.valid, true);
  assert.equal(body.bodyCount, 1);
  assert.ok(body.sheet && body.flat, JSON.stringify(body.flatError));
  assert.deepEqual(body.sheet.bendTable, table);
  assert.equal(body.sheet.fixedFace, `${owner}.leg0.a`);
  assert.equal(body.flat.fixedFace, body.sheet.fixedFace);
  assert.equal(body.sheet.thickness, expected.thickness);
  const selection = { table: table.id, rows: [row], how: 'exact', estimate: false };
  for (const bend of [...body.sheet.bends, ...body.flat.bends]) {
    assert.deepEqual(bend.table, selection);
    near(bend.allowance, expected.allowance, 'bend allowance');
  }
  assert.equal(body.flat.bends.length, bends);
  assert.equal(body.flat.bends[0].name, `${owner}.bend1`);
  assert.deepEqual(body.flat.bends.map(bend => bend.direction), bends === 1 ? ['down'] : ['down', 'up']);
  near(body.mass.volume, expected.volume, 'folded volume');
  near(body.flat.area, expected.area, 'flat area');
  pointNear([...body.flat.box.max].sort((a, b) => a - b), [30, expected.length], 'flat extents');
  const holes = body.flat.loops.filter(loop => !loop.outer);
  assert.equal(holes.length, 2);
  for (const hole of holes) {
    assert.equal(hole.segments.length, 1);
    const [circle] = hole.segments;
    assert.equal(circle.kind, 'arc');
    assert.equal(circle.ccw, false);
    near(circle.radius, 2.75, 'hole radius');
  }
  checkDxf(body.dxf, bends);
  return expected;
}

async function selectOccurrence(f, index) {
  const rows = f.page.locator('.outliner .ol-row > button.ol');
  await rows.nth(index).click();
  await f.page.waitForFunction(i => window.__studioSelection.selection.bodies[0] === i, index);
}

async function pickLastEdge(f, pattern) {
  await button(f.page, 'View cube directions').click();
  await f.page.getByRole('menuitem', { name: pattern === 'linear' ? 'Bottom right' : 'Bottom left', exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button(f.page, 'Selection filter');
  for (let step = 0; step < 4 && !(await filter.innerText()).includes('Edges'); step++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.waitForTimeout(450);
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), copyPoint([40, 15, 0], pattern, 2));
  assert.ok(pixel?.length === 2 && pixel.every(Number.isFinite));
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
}

export async function qualifySheetPattern(f, seed, { pattern, showFlat, projectRoundTrip }) {
  const sources = ['n0', 'n7', 'n15'];
  const label = pattern === 'linear' ? 'Linear pattern' : 'Circular pattern';
  const readyPreview = () => f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview');
  const openPattern = async result => {
    await selectOccurrence(f, 0);
    await clickModelCommand(f.page, 'Pattern', label);
    const hud = f.page.getByRole('dialog', { name: label, exact: true });
    await hud.waitFor();
    await hud.getByLabel('Result', { exact: true }).selectOption(result);
    await hud.getByLabel('Count', { exact: true }).fill('3');
    if (pattern === 'linear') await hud.getByLabel('Spacing', { exact: true }).fill('60');
    else {
      await hud.getByLabel('Spread over', { exact: true }).fill('180');
      await hud.getByLabel('Axis at X', { exact: true }).fill('100');
    }
    await readyPreview();
    return hud;
  };
  const apply = async (hud, previous) => {
    await button(hud, 'Apply').click();
    await hud.waitFor({ state: 'hidden' });
    await f.changed(previous);
    return f.doc();
  };

  f.phase = 'verify the existing One body output drops sheet ownership';
  const combined = await apply(await openPattern('one'), seed);
  const combinedNative = await f.inspect('combined-no-sheet', combined, { multiple: true, exportFlat: true });
  assert.equal(combinedNative.length, 1);
  assert.equal(combinedNative[0].bodyCount, 3);
  assert.equal(combinedNative[0].sheet, null);
  assert.equal(combinedNative[0].flatError.code, 'CAPABILITY');
  await f.undo();
  await f.same(seed);

  f.phase = `create original plus two separate ${pattern} occurrences`;
  const patternHud = await openPattern('separate');
  await f.same(seed);
  const patterned = await apply(patternHud, seed);
  assert.deepEqual(patterned.nodes.slice(0, 7), seed.nodes);
  assert.deepEqual(Object.keys(patterned.outputs), ['b6', 'b14', 'b22']);
  const copies = await f.inspect('three-original-occurrences', patterned, { multiple: true, exportFlat: true });
  assert.deepEqual(copies.map(body => body.id), ['n6', 'n14', 'n22']);
  for (const [index, body] of copies.entries()) {
    verifySheet(body, 0, 1, sources[index]);
    pointNear(body.mass.centroid, copyPoint(copies[0].mass.centroid, pattern, index), 'occurrence centroid');
    pointNear(body.sheet.bends[0].axis.origin, copyPoint([3, 30, 3], pattern, index), 'owned bend origin');
    assert.equal(body.flat.loops.filter(loop => !loop.outer).length, 2);
  }
  const firstGeometry = new Set(copies[0].faces);
  assert.ok(copies.slice(1).every(body => body.faces.every(name => !firstGeometry.has(name))));
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('three-independent-sheet-bodies');
  await selectOccurrence(f, 0);
  await showFlat('original-one-bend-flat');

  f.phase = 'apply a Flange only on the last original retained end edge';
  await pickLastEdge(f, pattern);
  await clickModelCommand(f.page, 'Modify', 'Flange');
  const flangeHud = f.page.getByRole('dialog', { name: 'Flange', exact: true });
  await flangeHud.getByText('n15.end|n15.leg1.a', { exact: true }).waitFor();
  await readyPreview();
  const flanged = await apply(flangeHud, patterned);
  const last = flanged.nodes.at(-1);
  assert.equal(last.kind, 'sheet-flange');
  assert.deepEqual(last.parent, { node: 22, side: 'solid' });
  assert.deepEqual(last.edges, ['n15.end|n15.leg1.a']);
  const afterFlange = await f.inspect('last-copy-flanged', flanged, { multiple: true, exportFlat: true });
  assert.deepEqual(afterFlange.slice(0, 2), copies.slice(0, 2));
  verifySheet(afterFlange[2], 0, 2, sources[2]);

  f.phase = 'edit only the last copy and select its independent thickness row';
  await f.openFeatureEditor(15, 'last independent sheet source');
  const thickness = f.editor().getByLabel('Thickness', { exact: true });
  assert.equal(await thickness.inputValue(), '1.5');
  await thickness.fill('2');
  await f.applyEditor(flanged, 'last-copy-thickness-2');
  const edited = await f.doc();
  assert.deepEqual(edited.nodes, flanged.nodes.map((node, index) => index === 15 ? { ...node, thickness: 2 } : node));
  const final = await f.inspect('last-copy-independent-bend-row', edited, { multiple: true, exportFlat: true });
  assert.deepEqual(final.slice(0, 2), copies.slice(0, 2));
  const expected = verifySheet(final[2], 1, 2, sources[2]);
  await selectOccurrence(f, 2);
  await showFlat('only-last-copy-two-bend-flat');

  await f.undo();
  await f.same(flanged);
  await f.undo();
  await f.same(patterned);
  await f.redo();
  await f.same(flanged);
  await f.redo();
  await f.same(edited);
  const saved = await projectRoundTrip(edited);
  assert.deepEqual(await f.inspect('fresh-open-with-independent-pattern-copies', await f.doc(), { multiple: true, exportFlat: true }), final);
  await selectOccurrence(f, 2);
  await showFlat('fresh-open-last-copy-flat');
  f.report.observations.push({ label, selectedEdge: last.edges[0], original: sheetTruth(0, 1), edited: expected, sha256: sha256(saved) });
}
