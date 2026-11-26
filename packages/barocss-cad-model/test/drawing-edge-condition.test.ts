import assert from 'node:assert/strict';
import test from 'node:test';
import { brepsFor } from '../src/engine/evaluate';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { decodeStudioFile, encodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { projectViews } from '../src/drawing/project';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { sheetSvg } from '../src/io/svg';
import { applyFix, drawingIssues } from '../src/drawing/issues';
import {
  checkEdgeConditionValues,
  edgeConditionMarks,
  formatEdgeConditionSize,
  newEdgeConditionId,
  pickEdgeConditionEdge,
  resolveEdgeCondition,
} from '../src/drawing/edgeCondition';
import { checkSavedAnnotationRefs } from '../src/drawing/savedAnnotationRefs';
import { buildSheet } from '../src/drawing/sheet';
import { presetFor } from '../src/drawing/standard';
import { readDrawing, type DrawingEdgeCondition, type DrawingSettings, type DrawingViews } from '../src/drawing/types';
import { layoutSheet } from '../src/drawing/views';

function asymmetricPlate(width = 60): { doc: StudioDoc; views: DrawingViews } {
  const doc: StudioDoc = {
    ...emptyDoc(),
    nodes: [
      { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [width, 35] },
      { kind: 'extrude', id: 'n1', sketch: 0, height: 10 },
      { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [15, 12], radius: 3, axis: 'z' },
    ],
    outputs: { b1: { node: 2, side: 'solid' } },
    nextId: 3,
  };
  const built = brepsFor(doc);
  assert.ok('breps' in built && built.breps.length > 0);
  const proj = projectViews(built.breps);
  assert.equal(proj.ok, true);
  return { doc, views: proj.views };
}

test('D2024 edge-condition value validation rejects zero, negative, swapped bounds, and numeric unspecified', () => {
  assert.equal(checkEdgeConditionValues('-', 'any', 0.5, undefined).ok, true);
  assert.equal(checkEdgeConditionValues('+', 'horizontal', 0.4, 0.1).ok, true);
  assert.equal(checkEdgeConditionValues('±', 'vertical', 0.3, 0.3).ok, true);
  assert.equal(checkEdgeConditionValues('unspecified', 'any', undefined, undefined).ok, true);

  // Refusals: unspecified with numbers, zero, negative, lower > upper, lower without upper
  assert.equal(checkEdgeConditionValues('unspecified', 'any', 0.5, undefined).ok, false);
  assert.equal(checkEdgeConditionValues('-', 'any', 0, undefined).ok, false);
  assert.equal(checkEdgeConditionValues('-', 'any', -0.2, undefined).ok, false);
  assert.equal(checkEdgeConditionValues('+', 'any', 0.2, 0.5).ok, false);
  assert.equal(checkEdgeConditionValues('+', 'any', undefined, 0.2).ok, false);

  // Inch formatting truncates conservatively (never rounds upward to relax allowance!)
  const inchPreset = presetFor({ units: 'inch' });
  // 0.5 / 25.4 = 0.019685... -> must be 0.0196 in (<= 0.019685, never relaxed to 0.02!)
  assert.equal(formatEdgeConditionSize(0.5, inchPreset), '0.0196 in');
  assert.equal(formatEdgeConditionSize(25.4, inchPreset), '1 in');
  assert.equal(newEdgeConditionId([{ id: 'ec1' }, { id: 'ec3' }]), 'ec2');
});

test('D2024 two distinct edges on asymmetric plate: scale-invariant paper-mm symbol, mm/inch separation, SVG & DXF readback', () => {
  const { views } = asymmetricPlate();
  const topLines = views.top.edges.filter(e => e.kind === 'line' && e.ends && e.pieces.some(p => p.visible));
  assert.ok(topLines.length >= 2);
  const pick1 = pickEdgeConditionEdge(views.top, topLines[0], 'top');
  const pick2 = pickEdgeConditionEdge(views.top, topLines[1], 'top');
  assert.ok(pick1.ok && pick2.ok);

  const ec1: DrawingEdgeCondition = {
    id: 'ec1',
    view: 'top',
    edge: pick1.ref,
    place: [pick1.anchor2[0] - 8, pick1.anchor2[1] + 10],
    sign: '-',
    upperMm: 0.5,
    lowerMm: 0.1,
    direction: 'horizontal',
    allAround: true,
  };
  const ec2: DrawingEdgeCondition = {
    id: 'ec2',
    view: 'top',
    edge: pick2.ref,
    place: [pick2.anchor2[0] + 10, pick2.anchor2[1] - 8],
    sign: '+',
    upperMm: 0.3,
    direction: 'vertical',
  };

  // Scale invariance: paper-mm corner glyph leg length is identically 3.2 mm at 1:1 and 1:2!
  const s1: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, scale: 1, dimensions: [], edgeConditions: [ec1, ec2] };
  const s2: DrawingSettings = { ...s1, scale: 0.5 };
  const l1 = layoutSheet(views, s1), l2 = layoutSheet(views, s2);
  const r1 = resolveEdgeCondition(views.top, ec1, 'top', presetFor(s1));
  const r2 = resolveEdgeCondition(views.top, ec1, 'top', presetFor(s2));
  assert.ok(r1.ok && r2.ok);
  const poly1 = edgeConditionMarks(l1.views.top, r1).find(m => m.kind === 'polyline')!;
  const poly2 = edgeConditionMarks(l2.views.top, r2).find(m => m.kind === 'polyline')!;
  assert.equal(poly1.kind, 'polyline');
  assert.equal(poly2.kind, 'polyline');
  if (poly1.kind === 'polyline' && poly2.kind === 'polyline') {
    const leg1 = Math.hypot(poly1.points[1][0] - poly1.points[0][0], poly1.points[1][1] - poly1.points[0][1]);
    const leg2 = Math.hypot(poly2.points[1][0] - poly2.points[0][0], poly2.points[1][1] - poly2.points[0][1]);
    assert.ok(Math.abs(leg1 - 3.2) < 1e-6);
    assert.ok(Math.abs(leg2 - 3.2) < 1e-6);
  }

  // Independent SVG & DXF readback preserves distinct IDs, signs, stacked limits, and corner glyphs
  const sheet1 = buildSheet(views, l1, s1, { title: 'Plate', date: '2026-11-26' });
  const svg = sheetSvg(sheet1, 'Plate');
  assert.ok(svg.includes('data-edge-condition="ec1"'));
  assert.ok(svg.includes('data-edge-condition="ec2"'));
  assert.ok(svg.includes('>−0.5</text>'));
  assert.ok(svg.includes('>−0.1</text>'));
  assert.ok(svg.includes('>+0.3</text>'));

  const dxfDoc = sheetDxfDocument(sheet1, l1);
  const dxfTexts = dxfDoc.entities.filter(e => e.type === 'text').map(e => e.text);
  assert.ok(dxfTexts.includes('−0.5') && dxfTexts.includes('−0.1') && dxfTexts.includes('+0.3'));
  for (const version of ['AC1015', 'AC1009'] as const) {
    assert.ok(sheetDxf(sheet1, l1, version).bytes.length > 100);
  }

  // Inch display keeps stored model mm untouched while formatting conservatively
  const sInch: DrawingSettings = { ...s1, units: 'inch' };
  const sheetInch = buildSheet(views, layoutSheet(views, sInch), sInch, { title: 'Plate', date: '2026-11-26' });
  const svgInch = sheetSvg(sheetInch, 'Plate');
  assert.ok(svgInch.includes('−0.0196 in'));
  assert.equal(sInch.edgeConditions![0].upperMm, 0.5);
});

test('D2024 lost target diagnosis, saved admission rejection, and .bcad round-trip', async () => {
  const { doc, views } = asymmetricPlate();
  const topLine = views.top.edges.find(e => e.kind === 'line' && e.ends && e.pieces.some(p => p.visible))!;
  const pick = pickEdgeConditionEdge(views.top, topLine, 'top');
  assert.ok(pick.ok);

  // Missing edge -> EDGE_CONDITION_LOST with remove-edge-condition fix (never snaps to nearby edge!)
  const missingEc: DrawingEdgeCondition = {
    id: 'ec1',
    view: 'top',
    edge: { edge: 'n99.deleted_edge', near: [10, 10, 10] },
    place: [20, 20],
    sign: '-',
    upperMm: 0.5,
    direction: 'any',
  };
  const lostSettings: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], edgeConditions: [missingEc] };
  const layout = layoutSheet(views, lostSettings);
  const sheet = buildSheet(views, layout, lostSettings, { title: 'Plate', date: '2026-11-26' });
  const issues = drawingIssues({ views, layout, settings: lostSettings, sheet, callout: () => null });
  const lostIssue = issues.find(i => i.code === 'EDGE_CONDITION_LOST');
  assert.ok(lostIssue && lostIssue.fix?.kind === 'remove-edge-condition');
  const fixed = applyFix({ views, layout, settings: lostSettings, sheet, callout: () => null }, lostIssue.fix!);
  assert.equal(fixed.edgeConditions, undefined);

  // Raw saved admission rejects swapped bounds, unspecified+numeric, and malformed sig
  assert.ok(checkSavedAnnotationRefs({
    edgeConditions: [{ id: 'ec1', view: 'top', edge: pick.ref, place: [10, 10], sign: '+', upperMm: 0.1, lowerMm: 0.5, direction: 'any' }],
  }).length > 0);
  assert.ok(checkSavedAnnotationRefs({
    edgeConditions: [{ id: 'ec1', view: 'top', edge: pick.ref, place: [10, 10], sign: 'unspecified', upperMm: 0.5, direction: 'any' }],
  }).length > 0);
  assert.ok(checkSavedAnnotationRefs({
    edgeConditions: [{ id: 'ec1', view: 'top', edge: { ...pick.ref, sig: {} }, place: [10, 10], sign: '-', direction: 'any' }],
  }).length > 0);

  // .bcad round-trip preserves structured sign, direction, upperMm, lowerMm, allAround identically
  const validEc: DrawingEdgeCondition = {
    id: 'ec1',
    view: 'top',
    edge: pick.ref,
    place: [pick.anchor2[0] + 8, pick.anchor2[1] + 8],
    sign: '±',
    upperMm: 0.5,
    lowerMm: 0.2,
    direction: 'horizontal',
    allAround: true,
  };
  const withEc: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], edgeConditions: [validEc] };
  const decoded = await decodeStudioFile(encodeStudioFile({ ...doc, drawing: withEc }));
  const reopened = readStudioDoc(decoded.text);
  assert.ok('doc' in reopened);
  if (!('doc' in reopened)) return;
  const restored = readDrawing(reopened.doc.drawing);
  assert.deepEqual(restored.edgeConditions, [validEc]);
});
