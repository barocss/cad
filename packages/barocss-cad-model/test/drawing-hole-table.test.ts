import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { encodeStudioFile, decodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { projectViews } from '../src/drawing/project';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { drawingIssues, applyFix } from '../src/drawing/issues';
import { readDrawing, type DrawingHoleTable, type DrawingSettings, type DrawingViews, type DimPoint } from '../src/drawing/types';
import { qualifyHoleTableRim, resolveHoleTable, holeTableContent, HOLE_TABLE_MAX_MEMBERS } from '../src/drawing/holeTable';
import { presetFor } from '../src/drawing/standard';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { checkSavedAnnotationRefs } from '../src/drawing/savedAnnotationRefs';

/**
 * Exact fixture from #232:
 * Flat plate 40x40x8 mm on XY (0..40, 0..40, 0..8) with:
 * - Origin hole O (n2) at (10, 10), radius 2 (Ø4) — NOT selected as a table row!
 * - Selected Hole 1 (n3) at (20, 15), radius 2 (Ø4) -> expected (X, Y) = (+10, +5) mm
 * - Selected Hole 2 (n4) at (5, 15),  radius 2 (Ø4) -> expected (X, Y) = (-5, +5) mm
 * - Selected Hole 3 (n5) at (20, 30), radius 3 (Ø6) -> expected (X, Y) = (+10, +20) mm
 */
function plateDoc(opts: {
  includeBoss?: boolean;
  includeBlind?: boolean;
  includePattern?: boolean;
  suppressN3?: boolean;
  n4Radius?: number;
  n4Center?: [number, number];
} = {}): StudioDoc {
  const nodes: StudioDoc['nodes'] = [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [40, 40] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 8 },
    { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [10, 10], radius: 2, axis: 'z' },
    { kind: 'hole', id: 'n3', parent: { node: 2, side: 'solid' }, center: [20, 15], radius: 2, axis: 'z', ...(opts.suppressN3 ? { suppressed: true as const } : {}) },
    { kind: 'hole', id: 'n4', parent: { node: 3, side: 'solid' }, center: opts.n4Center ?? [5, 15], radius: opts.n4Radius ?? 2, axis: 'z' },
    { kind: 'hole', id: 'n5', parent: { node: 4, side: 'solid' }, center: [20, 30], radius: 3, axis: 'z' },
  ];
  let top = 5;
  if (opts.includeBlind) {
    nodes.push({ kind: 'hole', id: 'n6', parent: { node: top, side: 'solid' }, center: [32, 10], radius: 2, depth: 4, axis: 'z' });
    top = nodes.length - 1;
  }
  if (opts.includePattern) {
    nodes.push({ kind: 'hole', id: 'n7', parent: { node: top, side: 'solid' }, center: [32, 20], radius: 1.5, axis: 'z', pattern: { count: 2, step: [0, 6] } });
    top = nodes.length - 1;
  }
  if (opts.includeBoss) {
    nodes.push({ kind: 'sketch', id: 'n8', profile: 'circle', center: [32, 32], radius: 3 });
    const skIdx = nodes.length - 1;
    nodes.push({ kind: 'extrude', id: 'n9', sketch: skIdx, height: 12 });
    const bossIdx = nodes.length - 1;
    nodes.push({ kind: 'union', id: 'n10', left: { node: top, side: 'solid' }, right: { node: bossIdx, side: 'solid' } });
    top = nodes.length - 1;
  }
  return {
    ...emptyDoc(),
    nodes,
    outputs: { b1: { node: top, side: 'solid' } },
    nextId: nodes.length,
  };
}

function projectDoc(doc: StudioDoc): DrawingViews {
  const got = brepsFor(doc);
  assert.ok('breps' in got, 'error' in got ? got.error : '');
  const proj = projectViews(got.breps);
  assert.ok(proj.ok, proj.ok ? '' : proj.error);
  return proj.views;
}

function findCircleEdge(views: DrawingViews, ownerPrefix: string) {
  const top = views.top;
  const edge = top.edges.find(e => e.kind === 'circle' && e.pieces.some(p => p.visible) && e.name.includes(`${ownerPrefix}.side`));
  assert.ok(edge, `expected visible circle edge for ${ownerPrefix}`);
  return edge;
}

function buildHoleTableFor(doc: StudioDoc, views: DrawingViews): DrawingHoleTable {
  const oEdge = findCircleEdge(views, 'n2');
  const origin: DimPoint = { edge: oEdge.name, at: 'center', near: [...oEdge.circle!.center] as [number, number, number] };
  const owners = ['n3', 'n4', 'n5'] as const;
  const tags = ['A1', 'A2', 'B1'] as const;
  const members = owners.map((owner, idx) => {
    const edge = findCircleEdge(views, owner);
    const q = qualifyHoleTableRim(doc, views.top, 'top', edge);
    assert.ok(q.ok, q.ok ? '' : q.reason);
    assert.equal(q.owner, owner);
    return { id: `hm${idx + 1}`, tag: tags[idx], owner: q.owner, rim: q.rim };
  });
  return { id: 'ht1', view: 'top', origin, members };
}

test('D2021 #232 exact fixture: signed X/Y coordinates (10,5), (-5,5), (10,20), diameters 4/4/6, SVG & DXF export', () => {
  const doc = plateDoc();
  const views = projectDoc(doc);
  const ht = buildHoleTableFor(doc, views);
  const settings: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], holeTables: [ht] };
  const layout = layoutSheet(views, settings);
  const sheet = buildSheet(views, layout, settings, { title: 'Plate', date: '2026-11-26', doc });

  assert.equal(sheet.holeTables?.length, 1);
  const resolved = sheet.holeTables![0];
  assert.ok(resolved.ok, resolved.ok ? '' : resolved.reason);
  assert.equal(resolved.hasLostMember, false);
  assert.equal(resolved.members.length, 3);

  const expected = [
    { tag: 'A1', owner: 'n3', x: 10, y: 5, d: 4 },
    { tag: 'A2', owner: 'n4', x: -5, y: 5, d: 4 },
    { tag: 'B1', owner: 'n5', x: 10, y: 20, d: 6 },
  ];
  resolved.members.forEach((m, i) => {
    assert.ok(m.ok, m.ok ? '' : m.reason);
    assert.equal(m.member.tag, expected[i].tag);
    assert.equal(m.member.owner, expected[i].owner);
    assert.ok(Math.abs(m.x - expected[i].x) <= 1e-6, `${expected[i].tag} X: got ${m.x}`);
    assert.ok(Math.abs(m.y - expected[i].y) <= 1e-6, `${expected[i].tag} Y: got ${m.y}`);
    assert.ok(Math.abs(m.diameter - expected[i].d) <= 1e-6, `${expected[i].tag} D: got ${m.diameter}`);
  });

  // Origin hole n2 is NOT auto-enrolled in rows; note states explicit selection only.
  const content = holeTableContent(resolved, presetFor(settings));
  assert.equal(content.rows.length, 3);
  assert.match(content.notes?.[0] ?? '', /Selected holes: 3/);

  // SVG contains data-hole-table groups, tags, coordinates, and sizes.
  const svg = sheetSvg(sheet, 'Plate');
  assert.match(svg, /data-hole-table="ht1"/);
  assert.match(svg, />A1</);
  assert.match(svg, />A2</);
  assert.match(svg, />B1</);
  assert.match(svg, />-5</);
  assert.match(svg, />Ø6 THRU</);

  // DXF exports table and tag text cleanly in both AC1015 and R12.
  const dxf2000 = sheetDxfDocument(sheet, layout);
  assert.ok(dxf2000.entities.some(e => e.type === 'text' && e.text === 'HOLE TABLE'));
  assert.ok(dxf2000.entities.some(e => e.type === 'text' && e.text === 'B1'));
  const dxfR12 = sheetDxf(sheet, layout, 'AC1009');
  assert.match(dxfR12.text, /HOLE TABLE/);
  assert.match(dxfR12.text, /B1/);

  // Hole table does NOT silence HOLE_NOT_LOCATED completeness warnings.
  const issues = drawingIssues({ views, layout, sheet, settings, callout: () => null });
  assert.ok(issues.some(i => i.code === 'HOLE_NOT_LOCATED'), 'hole table must not silence HOLE_NOT_LOCATED');
  assert.ok(!issues.some(i => i.code === 'HOLE_TABLE_ORIGIN_LOST' || i.code === 'HOLE_TABLE_MEMBER_LOST'));
});

test('D2021 #232 scale, sheet size, row reorder, inch units, and targeted hole edit preserve identity & math', async () => {
  const doc = plateDoc();
  const views = projectDoc(doc);
  const ht = buildHoleTableFor(doc, views);

  // Scale 1:2, A3 sheet, reordered rows [B1, A1, A2], and explicit inch units.
  const reordered: DrawingHoleTable = {
    ...ht,
    members: [ht.members[2], ht.members[0], ht.members[1]],
    at: [120, 40],
    corner: 'top-left',
  };
  const inchSettings: DrawingSettings = {
    sheet: 'A3',
    scale: 0.5,
    units: 'inch',
    projection: 'third',
    hidden: true,
    dimensions: [],
    holeTables: [reordered],
  };
  const inchLayout = layoutSheet(views, inchSettings);
  const inchSheet = buildSheet(views, inchLayout, inchSettings, { title: 'Plate', date: '2026-11-26', doc });
  const rInch = inchSheet.holeTables![0];
  assert.ok(rInch.ok);
  const b1 = rInch.members[0];
  assert.ok(b1.ok);
  assert.equal(b1.member.tag, 'B1');
  assert.equal(b1.member.owner, 'n5');
  assert.ok(Math.abs(b1.x - 10) <= 1e-6);
  assert.ok(Math.abs(b1.y - 20) <= 1e-6);
  assert.equal(b1.xText, '.394');
  assert.equal(b1.yText, '.787');

  // Editing ONLY n4 (A2) radius 2 -> 2.5 (Ø5) and center (5, 15) -> (8, 20) updates ONLY A2; A1 & B1 unchanged.
  const editedDoc = plateDoc({ n4Radius: 2.5, n4Center: [8, 20] });
  const views2 = projectDoc(editedDoc);
  const mmSettings: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], holeTables: [ht] };
  const r2 = resolveHoleTable(editedDoc, views2.top, ht, 'top', presetFor(mmSettings));
  assert.ok(r2.ok);
  const [mA1, mA2, mB1] = r2.members;
  assert.ok(mA1.ok && mA2.ok && mB1.ok);
  assert.ok(Math.abs(mA1.x - 10) <= 1e-6 && Math.abs(mA1.y - 5) <= 1e-6 && Math.abs(mA1.diameter - 4) <= 1e-6);
  assert.ok(Math.abs(mA2.x - (-2)) <= 1e-6 && Math.abs(mA2.y - 10) <= 1e-6 && Math.abs(mA2.diameter - 5) <= 1e-6);
  assert.ok(Math.abs(mB1.x - 10) <= 1e-6 && Math.abs(mB1.y - 20) <= 1e-6 && Math.abs(mB1.diameter - 6) <= 1e-6);

  // .bcad Save / fresh Open roundtrip preserves holeTables identically.
  const withDrawing: StudioDoc = { ...doc, drawing: mmSettings };
  const decoded = await decodeStudioFile(encodeStudioFile(withDrawing));
  const read = readStudioDoc(decoded.text);
  assert.ok('doc' in read);
  const restoredSettings = readDrawing(read.doc.drawing);
  assert.deepEqual(restoredSettings.holeTables, mmSettings.holeTables);
});

test('D2021 #232 refuses boss, blind hole, patterned hole, malformed sig, and marks suppressed hole unresolved without dropping', () => {
  const doc = plateDoc({ includeBoss: true, includeBlind: true, includePattern: true });
  const views = projectDoc(doc);

  // Boss (n9) refused
  const bossEdge = views.top.edges.find(e => e.kind === 'circle' && e.pieces.some(p => p.visible) && e.name.includes('n9.'));
  assert.ok(bossEdge, 'expected visible boss circle edge');
  const qBoss = qualifyHoleTableRim(doc, views.top, 'top', bossEdge);
  assert.equal(qBoss.ok, false);

  // Blind hole (n6) refused
  const blindEdge = findCircleEdge(views, 'n6');
  const qBlind = qualifyHoleTableRim(doc, views.top, 'top', blindEdge);
  assert.equal(qBlind.ok, false);
  assert.match(qBlind.reason, /blind/i);

  // Patterned hole (n7) refused
  const patEdge = views.top.edges.find(e => e.kind === 'circle' && e.pieces.some(p => p.visible) && e.name.includes('n7'));
  assert.ok(patEdge);
  const qPat = qualifyHoleTableRim(doc, views.top, 'top', patEdge);
  assert.equal(qPat.ok, false);
  assert.match(qPat.reason, /pattern/i);

  // Suppressing n3 marks ONLY A1 unresolved (HOLE_TABLE_MEMBER_LOST) while keeping A2 & B1 live.
  const baseDoc = plateDoc();
  const baseViews = projectDoc(baseDoc);
  const ht = buildHoleTableFor(baseDoc, baseViews);

  const supDoc = plateDoc({ suppressN3: true });
  const supViews = projectDoc(supDoc);
  const settings: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], holeTables: [ht] };
  const layout = layoutSheet(supViews, settings);
  const sheet = buildSheet(supViews, layout, settings, { title: 'Plate', date: '2026-11-26', doc: supDoc });
  const resolved = sheet.holeTables![0];
  assert.ok(resolved.ok);
  assert.equal(resolved.hasLostMember, true);
  assert.equal(resolved.members[0].ok, false);
  assert.equal(resolved.members[1].ok, true);
  assert.equal(resolved.members[2].ok, true);
  const content = holeTableContent(resolved, presetFor(settings));
  assert.equal(content.rows[0][1], 'UNRESOLVED');

  const ctx = { views: supViews, layout, sheet, settings, callout: () => null };
  const issues = drawingIssues(ctx);
  const lostIssue = issues.find(i => i.code === 'HOLE_TABLE_MEMBER_LOST');
  assert.ok(lostIssue && lostIssue.fix?.kind === 'remove-hole-table-member');
  const fixed = applyFix(ctx, lostIssue.fix);
  assert.equal(fixed.holeTables?.[0].members.length, 2);

  // Malformed sig on saved holeTables is rejected upfront with DRAWING_OPTIONS (D2019 hardening).
  const badSigProblems = checkSavedAnnotationRefs({
    holeTables: [{ ...ht, members: [{ ...ht.members[0], rim: { ...ht.members[0].rim, sig: {} } }] }],
  });
  assert.equal(badSigProblems.length, 1);
  assert.equal(badSigProblems[0].code, 'DRAWING_OPTIONS');

  // >3 members rejected by readDrawing
  const overMax = readDrawing({
    ...settings,
    holeTables: [{ ...ht, members: [...ht.members, { ...ht.members[0], id: 'hm4', tag: 'C1', owner: 'n99' }] }],
  });
  assert.equal(overMax.holeTables, undefined);
  assert.equal(HOLE_TABLE_MAX_MEMBERS, 3);
});
