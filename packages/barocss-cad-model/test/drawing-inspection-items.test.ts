import assert from 'node:assert/strict';
import test from 'node:test';
import { brepsFor } from '../src/engine/evaluate';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { decodeStudioFile, encodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { projectViews } from '../src/drawing/project';
import { autoDimensions } from '../src/drawing/auto';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { sheetSvg } from '../src/io/svg';
import { applyFix, drawingIssues } from '../src/drawing/issues';
import {
  captureInspectionBaseline,
  diffInspectionBaseline,
  dimensionTargetKey,
  inspectionItemEligible,
  inspectionListCsv,
  newInspectionItemId,
  nextInspectionNumber,
  resolveAllInspectionItems,
  validateInspectionNumber,
} from '../src/drawing/inspectionItems';
import { checkSavedAnnotationRefs } from '../src/drawing/savedAnnotationRefs';
import { buildSheet } from '../src/drawing/sheet';
import { buildSheets } from '../src/drawing/sheetSet';
import { presetFor } from '../src/drawing/standard';
import { readDrawing, type DrawingDimension, type DrawingInspectionItem, type DrawingSettings, type DrawingViews } from '../src/drawing/types';
import { layoutSheet } from '../src/drawing/views';

function bracketFixture(): {
  doc: StudioDoc;
  views: DrawingViews;
  dims: [DrawingDimension, DrawingDimension, DrawingDimension];
} {
  const doc: StudioDoc = {
    ...emptyDoc(),
    nodes: [
      { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [50.8, 25.4] },
      { kind: 'extrude', id: 'n1', sketch: 0, height: 12 },
      { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [25.4, 12.7], radius: 4, axis: 'z' },
    ],
    outputs: { b1: { node: 2, side: 'solid' } },
    nextId: 3,
  };
  const built = brepsFor(doc);
  assert.ok('breps' in built && built.breps.length > 0);
  const proj = projectViews(built.breps);
  assert.equal(proj.ok, true);
  const views = proj.views;
  const baseSettings: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [] };
  const layout = layoutSheet(views, baseSettings);
  const generated = autoDimensions(views, layout, baseSettings, () => null).dimensions;

  // Pick 1 linear + 1 hole diameter in top (Sheet 1), and 1 horizontal linear edge (25.4 mm) in right (Sheet 2)
  const linearTop = generated.find(d => d.kind === 'linear' && d.view === 'top');
  const diameterTop = generated.find(d => d.kind === 'diameter' && d.view === 'top');
  const rightHoriz = views.right.edges.find(e => e.kind === 'line' && e.ends && e.pieces.some(p => p.visible)
    && Math.abs(e.ends[0][1] - e.ends[1][1]) > 20 && Math.abs(e.ends[0][2] - e.ends[1][2]) < 1e-6);
  assert.ok(linearTop && diameterTop && rightHoriz?.ends, 'expected top linear, top diameter, and right horizontal edge');

  const d1: DrawingDimension = { ...linearTop, id: 'd1', auto: undefined, tol: { kind: 'symmetric', value: 0.1 } };
  const d2: DrawingDimension = { ...diameterTop, id: 'd2', auto: undefined, tol: { kind: 'fit', code: 'H7' } };
  const d3: DrawingDimension = {
    id: 'd3',
    view: 'right',
    kind: 'linear',
    orient: 'horizontal',
    a: { edge: rightHoriz.name, at: 'end', near: [...rightHoriz.ends[0]] },
    b: { edge: rightHoriz.name, at: 'end', near: [...rightHoriz.ends[1]] },
    place: [12.7, -8],
    tol: { kind: 'deviation', upper: 0.2, lower: -0.05 },
  };
  return { doc, views, dims: [d1, d2, d3] };
}

test('D2023 multi-sheet inspection items, renumbering, sheet moves, SVG/DXF badges, and table parity', () => {
  const { views, dims: [d1, d2, d3] } = bracketFixture();
  const items: DrawingInspectionItem[] = [
    { id: 'ii1', number: 1, dim: d1.id, targetKey: dimensionTargetKey(d1) },
    { id: 'ii2', number: 2, dim: d2.id, targetKey: dimensionTargetKey(d2) },
    { id: 'ii3', number: 3, dim: d3.id, targetKey: dimensionTargetKey(d3) },
  ];
  const settings: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    revision: 'A',
    sheets: [{ id: 'S2', name: 'Right Sheet', views: ['right'] }],
    dimensions: [d1, d2, d3],
    tables: [{ id: 'inspection', from: 'inspection' }],
    inspectionItems: items,
  };

  // Multi-sheet build: Sheet 1 renders ii1 & ii2 + full 3-row INSPECTION LIST table; Sheet 2 renders ii3
  const built = buildSheets(views, settings, { title: 'Bracket', date: '2026-11-26' });
  assert.equal(built.length, 2);
  const svg1 = sheetSvg(built[0].sheet, 'Bracket S1');
  const svg2 = sheetSvg(built[1].sheet, 'Bracket S2');
  assert.ok(svg1.includes('data-inspection-item="ii1"'));
  assert.ok(svg1.includes('data-inspection-item="ii2"'));
  assert.ok(!svg1.includes('data-inspection-item="ii3"'));
  assert.ok(svg1.includes('>INSPECTION LIST</text>'));
  assert.ok(svg1.includes('>ii1</text>'));
  assert.ok(svg1.includes('>ii3</text>'));
  assert.ok(svg2.includes('data-inspection-item="ii3"'));
  assert.ok(!svg2.includes('data-inspection-item="ii1"'));

  // Renumber ii2 (2 -> 7) preserves stable identity ii2 and leaves target dimensions invariant
  assert.equal(validateInspectionNumber(7, items, 'ii2').ok, true);
  assert.equal(validateInspectionNumber(1, items, 'ii2').ok, false);
  assert.equal(validateInspectionNumber(0, items, 'ii2').ok, false);
  assert.equal(validateInspectionNumber(10000, items, 'ii2').ok, false);
  assert.equal(validateInspectionNumber(1.5, items, 'ii2').ok, false);

  // Moving 'right' back to Sheet 1 preserves ii3 identity and updates its sheet number to 1
  const singleSheet: DrawingSettings = { ...settings, sheets: undefined };
  const resolvedSingle = resolveAllInspectionItems(views, singleSheet);
  const r3 = resolvedSingle.find(r => r.item.id === 'ii3')!;
  assert.equal(r3.status, 'ok');
  assert.equal(r3.sheetNumber, 1);

  // DXF readback contains pill badge text and INSPECTION LIST table
  const dxfDoc = sheetDxfDocument(built[0].sheet, built[0].layout);
  const dxfTexts = dxfDoc.entities.filter(e => e.type === 'text').map(e => e.text);
  assert.ok(dxfTexts.includes('INSPECTION LIST'));
  assert.ok(dxfTexts.includes('ii1'));
  assert.ok(dxfTexts.includes('H7'));
  for (const version of ['AC1015', 'AC1009'] as const) {
    const raw = new TextDecoder().decode(sheetDxf(built[0].sheet, built[0].layout, version).bytes);
    assert.ok(raw.includes('INSPECTION LIST'), `${version} DXF missing INSPECTION LIST`);
  }
});

test('D2023 negative controls: basic refusal, ID reuse stale detection, target deletion lost, and saved admission', () => {
  const { views, dims: [d1, d2, d3] } = bracketFixture();

  // Basic dimension refused on creation
  assert.equal(inspectionItemEligible({ ...d1, basic: true }).ok, false);

  // Target deletion -> INSPECTION_ITEM_LOST; ID reuse on different geometry -> INSPECTION_ITEM_STALE; basic conversion -> STALE
  const items: DrawingInspectionItem[] = [
    { id: 'ii1', number: 1, dim: 'd1', targetKey: dimensionTargetKey(d1) },
    { id: 'ii2', number: 2, dim: 'd2', targetKey: dimensionTargetKey(d2) },
    { id: 'ii3', number: 3, dim: 'd3', targetKey: dimensionTargetKey(d3) },
  ];
  const mutatedSettings: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    dimensions: [
      // d1 deleted!
      { ...d2, basic: true },           // d2 converted to basic!
      { ...d1, id: 'd3' },              // d3 ID reused by d1's geometry!
    ],
    inspectionItems: items,
  };
  const layout = layoutSheet(views, mutatedSettings);
  const sheet = buildSheet(views, layout, mutatedSettings, { title: 'Bracket', date: '2026-11-26' });
  const issues = drawingIssues({ views, layout, settings: mutatedSettings, sheet, callout: () => null });

  const lost = issues.find(i => i.code === 'INSPECTION_ITEM_LOST');
  const stales = issues.filter(i => i.code === 'INSPECTION_ITEM_STALE');
  assert.ok(lost && lost.fix?.kind === 'remove-inspection-item' && lost.fix.id === 'ii1');
  assert.equal(stales.length, 2, 'expected stale diagnostics for basic conversion and ID reuse');

  // applyFix removes the lost item without touching others
  const afterFix = applyFix({ views, layout, settings: mutatedSettings, sheet, callout: () => null }, lost.fix!);
  assert.deepEqual(afterFix.inspectionItems?.map(i => i.id), ['ii2', 'ii3']);

  // Raw saved admission rejects duplicate numbers, duplicate IDs, non-finite offsets
  assert.ok(checkSavedAnnotationRefs({
    inspectionItems: [
      { id: 'ii1', number: 1, dim: 'd1', targetKey: 'k1' },
      { id: 'ii2', number: 1, dim: 'd2', targetKey: 'k2' },
    ],
  }).length > 0);
  assert.ok(checkSavedAnnotationRefs({
    inspectionItems: [{ id: 'ii1', number: 1, dim: 'd1', targetKey: 'k1', offset: [Number.NaN, 0] }],
  }).length > 0);
});

test('D2023 baseline A -> B diff (unchanged/changed/removed/reassigned), retired number protection, and reuse warning', () => {
  const { views, dims: [d1, d2, d3] } = bracketFixture();
  const revAItems: DrawingInspectionItem[] = [
    { id: 'ii1', number: 1, dim: d1.id, targetKey: dimensionTargetKey(d1) },
    { id: 'ii2', number: 2, dim: d2.id, targetKey: dimensionTargetKey(d2) },
    { id: 'ii3', number: 3, dim: d3.id, targetKey: dimensionTargetKey(d3) },
  ];
  const revASettings: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    revision: 'A',
    dimensions: [d1, d2, d3],
    inspectionItems: revAItems,
  };
  const resolvedA = resolveAllInspectionItems(views, revASettings);
  const baselineA = captureInspectionBaseline('A', resolvedA);

  // New item after removing ii3 does NOT auto-recycle retired number 3 -> allocates 4
  const afterRemove3 = revAItems.filter(i => i.id !== 'ii3');
  assert.equal(nextInspectionNumber(afterRemove3, [baselineA]), 4);
  assert.equal(newInspectionItemId(afterRemove3, [baselineA]), 'ii4');

  // Rev B:
  // - ii1 (#1) unchanged
  // - ii2 (#2) tolerance changed (H7 -> symmetric ±0.05) -> changed
  // - ii3 (#3) removed, and a brand-new item ii4 explicitly reuses retired #3 on d3 -> reassigned + reuse warning!
  const d2Edited: DrawingDimension = { ...d2, tol: { kind: 'symmetric', value: 0.05 } };
  const revBItems: DrawingInspectionItem[] = [
    revAItems[0],
    revAItems[1],
    { id: 'ii4', number: 3, dim: d3.id, targetKey: dimensionTargetKey(d3) },
  ];
  const revBSettings: DrawingSettings = {
    ...revASettings,
    revision: 'B',
    dimensions: [d1, d2Edited, d3],
    inspectionItems: revBItems,
    inspectionBaselines: [baselineA],
  };
  const resolvedB = resolveAllInspectionItems(views, revBSettings);
  const diff = diffInspectionBaseline(baselineA, resolvedB);
  assert.equal(diff.find(e => e.number === 1)?.kind, 'unchanged');
  assert.equal(diff.find(e => e.number === 2)?.kind, 'changed');
  assert.equal(diff.find(e => e.number === 3)?.kind, 'reassigned');

  // Reuse warning emitted in drawingIssues while baseline A remains intact
  const layoutB = layoutSheet(views, revBSettings);
  const sheetB = buildSheet(views, layoutB, revBSettings, { title: 'Bracket', date: '2026-11-26' });
  const issuesB = drawingIssues({ views, layout: layoutB, settings: revBSettings, sheet: sheetB, callout: () => null });
  assert.ok(issuesB.some(i => i.code === 'INSPECTION_NUMBER_REUSED' && i.severity === 'warning'));
  assert.equal(baselineA.entries.find(e => e.number === 3)?.id, 'ii3');
});

test('D2023 inch/dual precision separation, fit-code limit honesty, formula-safe CSV readback, and .bcad round-trip', async () => {
  const { doc, views, dims: [d1, d2, d3] } = bracketFixture();
  const items: DrawingInspectionItem[] = [
    { id: 'ii1', number: 1, dim: d1.id, targetKey: dimensionTargetKey(d1) },
    { id: 'ii2', number: 2, dim: d2.id, targetKey: dimensionTargetKey(d2) },
    { id: 'ii3', number: 3, dim: d3.id, targetKey: dimensionTargetKey(d3) },
  ];
  const inchDualSettings: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    units: 'inch',
    dual: true,
    revision: 'A',
    dimensions: [d1, d2, d3],
    inspectionItems: items,
  };
  const resolved = resolveAllInspectionItems(views, inchDualSettings, [], presetFor(inchDualSettings));
  // Dual dimension produces ONE inspection item (never duplicated!)
  assert.equal(resolved.length, 3);
  const r1 = resolved[0], r2 = resolved[1], r3 = resolved[2];
  // Symmetric ±0.1 keeps exact mm limits independent of inch display rounding
  assert.ok(r1.nominalMm !== null && r1.tolerance.upperMm !== null && r1.tolerance.lowerMm !== null);
  assert.ok(Math.abs(r1.tolerance.upperMm! - (r1.nominalMm! + 0.1)) < 1e-6);
  assert.ok(Math.abs(r1.tolerance.lowerMm! - (r1.nominalMm! - 0.1)) < 1e-6);
  // Fit code H7 never fabricates numeric upper/lower limits
  assert.equal(r2.tolerance.kind, 'fit');
  assert.equal(r2.tolerance.code, 'H7');
  assert.equal(r2.tolerance.lowerMm, null);
  assert.equal(r2.tolerance.upperMm, null);
  // Deviation +0.2 / -0.05 keeps exact signed mm limits
  assert.ok(Math.abs(r3.tolerance.upperMm! - (r3.nominalMm! + 0.2)) < 1e-6);
  assert.ok(Math.abs(r3.tolerance.lowerMm! - (r3.nominalMm! - 0.05)) < 1e-6);

  // Formula-injection-safe CSV export
  const csvRes = inspectionListCsv('=SUM(A1:A2)', inchDualSettings, resolved, presetFor(inchDualSettings));
  assert.equal(csvRes.ok, true);
  if (!csvRes.ok) return;
  const lines = csvRes.csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[0].includes('nominal_mm') && !lines[0].includes('pass') && !lines[0].includes('actual'));
  assert.ok(lines[1].includes("'=SUM(A1:A2)"), 'formula title must be neutralized with leading apostrophe');
  assert.ok(lines[2].includes(',fit,H7,,,ok,'), 'fit code row must leave lower_mm and upper_mm empty');

  // .bcad round-trip preserves items and baselines identically
  const baselineA = captureInspectionBaseline('A', resolved);
  const withBaseline: DrawingSettings = { ...inchDualSettings, inspectionBaselines: [baselineA] };
  const decoded = await decodeStudioFile(encodeStudioFile({ ...doc, drawing: withBaseline }));
  const reopened = readStudioDoc(decoded.text);
  assert.ok('doc' in reopened);
  if (!('doc' in reopened)) return;
  const restored = readDrawing(reopened.doc.drawing);
  assert.deepEqual(restored.inspectionItems, withBaseline.inspectionItems);
  assert.deepEqual(restored.inspectionBaselines, withBaseline.inspectionBaselines);
});
