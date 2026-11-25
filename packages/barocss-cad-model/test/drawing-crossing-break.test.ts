import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { snapPoints } from '../src/drawing/dimensions';
import { layoutSheet, toSheet } from '../src/drawing/views';
import { buildSheet, PENS, type Mark } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings, type XY } from '../src/drawing/types';
import {
  DEFAULT_CROSSING_BREAK_GAP,
  crossingTargetOf,
  eligibleCrossingBreaks,
  properSegmentCrossing,
  readLinearCrossingBreak,
} from '../src/drawing/crossingBreak';
import { drawingIssues } from '../src/drawing/issues';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { modelAnnotations } from '../src/drawing/annotations3d';

type LinearDim = Extract<DrawingDimension, { kind: 'linear' }>;

function makeCrossingFixture(opts: { scale?: number; standard?: 'iso' | 'asme'; units?: 'mm' | 'inch'; dual?: boolean } = {}) {
  const doc = rectanglePart(40, 8, 24);
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok);
  const points = snapPoints(proj.views.front);
  const at = (x: number, y: number) => {
    const found = points.find(p => Math.abs(p.at[0] - x) + Math.abs(p.at[1] - y) < 1e-6);
    assert.ok(found, `missing snap point (${x}, ${y})`);
    return found.ref;
  };
  // Horizontal overall (0..40) placed at y = 10 (inside front view height 0..24),
  // Vertical overall (0..24) placed at x = 10 (asymmetric, well away from h1's midpoint text at x = 20 and ends at 0/40).
  const h1: LinearDim = { id: 'h1', view: 'front', kind: 'linear', orient: 'horizontal', a: at(0, 0), b: at(40, 0), place: [20, 10] };
  const v1: LinearDim = { id: 'v1', view: 'front', kind: 'linear', orient: 'vertical', a: at(0, 0), b: at(0, 24), place: [10, 12] };
  const settings: DrawingSettings = {
    ...defaultDrawing(),
    scale: opts.scale ?? 1,
    ...(opts.standard ? { standard: opts.standard } : {}),
    ...(opts.units ? { units: opts.units } : {}),
    ...(opts.dual ? { dual: true } : {}),
    dimensions: [h1, v1],
  };
  return { doc, views: proj.views, h1, v1, settings };
}

function dimLinesOf(marks: readonly Mark[]): Extract<Mark, { kind: 'line' }>[] {
  return marks.filter((m): m is Extract<Mark, { kind: 'line' }> => m.kind === 'line' && m.role === 'dimension');
}

function dist(a: XY, b: XY): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

test('properSegmentCrossing verifies exact asymmetric arithmetic and rejects parallel, collinear, and endpoint touches', () => {
  const hit = properSegmentCrossing([0, 0], [40, 0], [12, -8], [12, 24]);
  assert.ok(hit);
  assert.ok(Math.abs(hit.point[0] - 12) < 1e-9 && Math.abs(hit.point[1]) < 1e-9);
  assert.ok(Math.abs(hit.distanceAlongA - 12) < 1e-9);
  assert.equal(hit.lengthA, 40);
  // Centerline interval [11, 13] for a 2 mm gap
  assert.deepEqual([hit.distanceAlongA - 1, hit.distanceAlongA + 1], [11, 13]);

  // Parallel
  assert.equal(properSegmentCrossing([0, 0], [40, 0], [0, 5], [40, 5]), null);
  // Collinear overlapping
  assert.equal(properSegmentCrossing([0, 0], [40, 0], [10, 0], [50, 0]), null);
  // Endpoint touch
  assert.equal(properSegmentCrossing([0, 0], [40, 0], [0, -5], [0, 5]), null);
  assert.equal(properSegmentCrossing([0, 0], [40, 0], [12, 0], [12, 10]), null);
  // Non-intersecting
  assert.equal(properSegmentCrossing([0, 0], [40, 0], [12, 2], [12, 10]), null);
});

test('crossing break splits only host dimension line with exact paper-mm gap across scales, units, SVG, DXF, and 3D PMI', () => {
  const { views, h1, v1, settings: baseSettings } = makeCrossingFixture({ scale: 1 });
  const baseLayout = layoutSheet(views, baseSettings);
  const baseSheet = buildSheet(views, baseLayout, baseSettings, { title: 'Test', date: '2026-11-25' });

  const candidates = eligibleCrossingBreaks(baseSheet.groups, baseSheet.dimensions, baseSettings, baseLayout, 'h1');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'v1');
  assert.equal(candidates[0].conflict, false);

  const h1Broken: LinearDim = {
    ...h1,
    crossingBreak: { over: 'v1', gap: DEFAULT_CROSSING_BREAK_GAP, target: crossingTargetOf(v1) },
  };
  const brokenSettings: DrawingSettings = { ...baseSettings, dimensions: [h1Broken, v1] };
  const brokenLayout = layoutSheet(views, brokenSettings);
  const brokenSheet = buildSheet(views, brokenLayout, brokenSettings, { title: 'Test', date: '2026-11-25' });

  // Evaluation & exact centerline removal vs visible stroke-cap clearance
  assert.equal(brokenSheet.crossingBreaks?.length, 1);
  const eval1 = brokenSheet.crossingBreaks![0];
  assert.equal(eval1.status, 'applied');
  assert.equal(eval1.gap, 2);
  assert.equal(eval1.visibleGap, 2 - PENS.thin.width);

  const baseH1Group = baseSheet.groups.find(g => g.role === 'dimension' && g.id === 'h1')!;
  const brokenH1Group = brokenSheet.groups.find(g => g.role === 'dimension' && g.id === 'h1')!;
  const baseV1Group = baseSheet.groups.find(g => g.role === 'dimension' && g.id === 'v1')!;
  const brokenV1Group = brokenSheet.groups.find(g => g.role === 'dimension' && g.id === 'v1')!;

  // Target dimension is completely unchanged; host splits into 2 exact dimension lines around the crossing
  assert.deepEqual(brokenV1Group.marks, baseV1Group.marks);
  const origLines = dimLinesOf(baseH1Group.marks);
  const splitLines = dimLinesOf(brokenH1Group.marks);
  assert.equal(origLines.length, 1);
  assert.equal(splitLines.length, 2);
  assert.deepEqual(splitLines[0].a, origLines[0].a);
  assert.deepEqual(splitLines[1].b, origLines[0].b);
  assert.ok(Math.abs(dist(splitLines[0].b, splitLines[1].a) - 2) < 1e-6);
  const expectedCross = toSheet(brokenLayout.views.front, [10, 10]);
  const midGap: XY = [(splitLines[0].b[0] + splitLines[1].a[0]) / 2, (splitLines[0].b[1] + splitLines[1].a[1]) / 2];
  assert.ok(dist(midGap, expectedCross) < 1e-6);

  // Arrows, extensions, text, and resolved values are identical
  const nonDim = (marks: readonly Mark[]) => marks.filter(m => !(m.kind === 'line' && m.role === 'dimension'));
  assert.deepEqual(nonDim(brokenH1Group.marks), nonDim(baseH1Group.marks));
  const h1Res = brokenSheet.dimensions.find(r => r.dim.id === 'h1');
  const v1Res = brokenSheet.dimensions.find(r => r.dim.id === 'v1');
  assert.ok(h1Res?.ok && v1Res?.ok);
  assert.equal(h1Res.value, 40);
  assert.equal(v1Res.value, 24);

  // Removing the break reproduces the exact original marks
  const clearedSheet = buildSheet(views, baseLayout, baseSettings, { title: 'Test', date: '2026-11-25' });
  assert.deepEqual(clearedSheet.groups, baseSheet.groups);

  // Independent SVG check: exact two <line> segments separated by 2.0 mm inside data-dim="h1", continuous v1
  const svg = sheetSvg(brokenSheet, 'Test');
  const h1Svg = svg.match(/<g class="dimension"[^>]+data-dim="h1">([^]*?)<\/g>/)?.[1];
  const v1Svg = svg.match(/<g class="dimension"[^>]+data-dim="v1">([^]*?)<\/g>/)?.[1];
  assert.ok(h1Svg && v1Svg);
  const parseLines = (chunk: string) => [...chunk.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)]
    .map(m => ({ a: [Number(m[1]), Number(m[2])] as XY, b: [Number(m[3]), Number(m[4])] as XY }));
  const h1HorizontalLines = parseLines(h1Svg).filter(l => Math.abs(l.a[1] - l.b[1]) < 1e-3);
  const v1VerticalLines = parseLines(v1Svg).filter(l => Math.abs(l.a[0] - l.b[0]) < 1e-3);
  assert.equal(h1HorizontalLines.length, 2);
  assert.equal(v1VerticalLines.length, 1);
  assert.ok(Math.abs(dist(h1HorizontalLines[0].b, h1HorizontalLines[1].a) - 2) < 1e-2);

  // Independent DXF check: native DIMENSION value 40 preserved, display block has the split horizontal segments
  const dxfDoc = sheetDxfDocument(brokenSheet, brokenLayout);
  const dxfDim = dxfDoc.entities.find(e => e.type === 'dimension' && e.measurement === 40);
  assert.ok(dxfDim && dxfDim.type === 'dimension');
  assert.equal(dxfDim.measurement, 40);
  const dxfHorizBlockLines = dxfDim.block.filter(e => e.type === 'line' && Math.abs(e.a[1] - e.b[1]) < 1e-3);
  assert.equal(dxfHorizBlockLines.length, 2);
  const dxfText = sheetDxf(brokenSheet, brokenLayout).text;
  assert.ok(dxfText.includes('DIMENSION'));

  // 3D PMI isolation: 2D paper crossing break MUST NOT split the 3D model-space annotation line
  const pmiBase = modelAnnotations({ views, layout: baseLayout, sheet: baseSheet, settings: baseSettings });
  const pmiBroken = modelAnnotations({ views, layout: brokenLayout, sheet: brokenSheet, settings: brokenSettings });
  const pmiH1Base = pmiBase.items.find(item => item.id === 'h1')!;
  const pmiH1Broken = pmiBroken.items.find(item => item.id === 'h1')!;
  assert.equal(pmiH1Base.lines.filter(l => l.role === 'dimension').length, 1);
  assert.equal(pmiH1Broken.lines.filter(l => l.role === 'dimension').length, 1);
  assert.deepEqual(pmiH1Broken.lines, pmiH1Base.lines);

  // Paper-mm invariance at 2:1 scale + inch dual units (model value stays 40 mm, paper gap stays 2.0 mm)
  const scaledSettings: DrawingSettings = {
    ...brokenSettings,
    scale: 2,
    units: 'inch',
    dual: true,
    dimensions: [h1Broken, v1],
  };
  const scaledLayout = layoutSheet(views, scaledSettings);
  const scaledSheet = buildSheet(views, scaledLayout, scaledSettings, { title: 'Test', date: '2026-11-25' });
  const scaledH1Lines = dimLinesOf(scaledSheet.groups.find(g => g.role === 'dimension' && g.id === 'h1')!.marks);
  assert.equal(scaledH1Lines.length, 2);
  assert.ok(Math.abs(dist(scaledH1Lines[0].b, scaledH1Lines[1].a) - 2) < 1e-6);
  const scaledRes = scaledSheet.dimensions.find(r => r.dim.id === 'h1');
  assert.ok(scaledRes?.ok && scaledRes.value === 40 && scaledRes.alt === '40');
});

test('negative controls: NaN/negative gap, mutual conflict, move-away, target deletion, ID reuse, Auto replacement, and ASME text gap', () => {
  const { views, h1, v1, settings } = makeCrossingFixture({ scale: 1 });
  const target = crossingTargetOf(v1);

  // Invalid gaps rejected by reader
  assert.equal(readLinearCrossingBreak({ over: 'v1', gap: Number.NaN, target }), undefined);
  assert.equal(readLinearCrossingBreak({ over: 'v1', gap: -2, target }), undefined);
  assert.equal(readLinearCrossingBreak({ over: 'v1', gap: 0, target }), undefined);
  assert.equal(readLinearCrossingBreak({ over: 'v1', gap: 25, target }), undefined);
  assert.equal(readLinearCrossingBreak({ over: 'v1', gap: 2 }), undefined);
  const readBack = readDrawing({ ...settings, dimensions: [{ ...h1, crossingBreak: { over: 'v1', gap: -1, target } }, v1] });
  assert.equal((readBack.dimensions[0] as LinearDim).crossingBreak, undefined);

  // Mutual conflict: neither broken, explicit CROSSING_BREAK_CONFLICT warning
  const mutualSettings: DrawingSettings = {
    ...settings,
    dimensions: [
      { ...h1, crossingBreak: { over: 'v1', gap: 2, target } },
      { ...v1, crossingBreak: { over: 'h1', gap: 2, target: crossingTargetOf(h1) } },
    ],
  };
  const mutualLayout = layoutSheet(views, mutualSettings);
  const mutualSheet = buildSheet(views, mutualLayout, mutualSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(dimLinesOf(mutualSheet.groups.find(g => g.id === 'h1')!.marks).length, 1);
  assert.equal(dimLinesOf(mutualSheet.groups.find(g => g.id === 'v1')!.marks).length, 1);
  const mutualIssues = drawingIssues({ views, layout: mutualLayout, sheet: mutualSheet, settings: mutualSettings, callout: () => null });
  assert.ok(mutualIssues.some(i => i.code === 'CROSSING_BREAK_CONFLICT'));

  // Move away: leaves zero ghost hole, reports CROSSING_BREAK_INACTIVE
  const movedAwaySettings: DrawingSettings = {
    ...settings,
    dimensions: [
      { ...h1, place: [20, -12], crossingBreak: { over: 'v1', gap: 2, target } },
      v1,
    ],
  };
  const movedLayout = layoutSheet(views, movedAwaySettings);
  const movedSheet = buildSheet(views, movedLayout, movedAwaySettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(dimLinesOf(movedSheet.groups.find(g => g.id === 'h1')!.marks).length, 1);
  assert.equal(movedSheet.crossingBreaks?.[0].status, 'no-crossing');
  assert.ok(drawingIssues({ views, layout: movedLayout, sheet: movedSheet, settings: movedAwaySettings, callout: () => null }).some(i => i.code === 'CROSSING_BREAK_INACTIVE'));

  // Target deleted: unbroken, missing-target
  const deletedSettings: DrawingSettings = {
    ...settings,
    dimensions: [{ ...h1, crossingBreak: { over: 'v1', gap: 2, target } }],
  };
  const deletedLayout = layoutSheet(views, deletedSettings);
  const deletedSheet = buildSheet(views, deletedLayout, deletedSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(dimLinesOf(deletedSheet.groups.find(g => g.id === 'h1')!.marks).length, 1);
  assert.equal(deletedSheet.crossingBreaks?.[0].status, 'missing-target');

  // Target ID reused by a different edge pair or replaced by Auto-dimension: NO silent transfer
  const points = snapPoints(views.front);
  const rightTop = points.find(p => Math.abs(p.at[0] - 40) + Math.abs(p.at[1] - 24) < 1e-6)!.ref;
  const rightBot = points.find(p => Math.abs(p.at[0] - 40) + Math.abs(p.at[1]) < 1e-6)!.ref;
  const reusedV1: LinearDim = { ...v1, a: rightBot, b: rightTop };
  const reusedSettings: DrawingSettings = {
    ...settings,
    dimensions: [{ ...h1, crossingBreak: { over: 'v1', gap: 2, target } }, reusedV1],
  };
  const reusedLayout = layoutSheet(views, reusedSettings);
  const reusedSheet = buildSheet(views, reusedLayout, reusedSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(dimLinesOf(reusedSheet.groups.find(g => g.id === 'h1')!.marks).length, 1);
  assert.equal(reusedSheet.crossingBreaks?.[0].status, 'target-changed');

  const autoReplacedSettings: DrawingSettings = {
    ...settings,
    dimensions: [{ ...h1, crossingBreak: { over: 'v1', gap: 2, target } }, { ...v1, auto: true }],
  };
  const autoLayout = layoutSheet(views, autoReplacedSettings);
  const autoSheet = buildSheet(views, autoLayout, autoReplacedSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(dimLinesOf(autoSheet.groups.find(g => g.id === 'h1')!.marks).length, 1);
  assert.equal(autoSheet.crossingBreaks?.[0].status, 'target-changed');

  // Crossing too close to arrowhead (x = 1.5 near left arrow at x = 0): refused cleanly
  const nearArrowV1: LinearDim = { ...v1, place: [1.5, 12] };
  const nearArrowSettings: DrawingSettings = {
    ...settings,
    dimensions: [{ ...h1, crossingBreak: { over: 'v1', gap: 2, target } }, nearArrowV1],
  };
  const nearArrowLayout = layoutSheet(views, nearArrowSettings);
  const nearArrowSheet = buildSheet(views, nearArrowLayout, nearArrowSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(dimLinesOf(nearArrowSheet.groups.find(g => g.id === 'h1')!.marks).length, 1);
  assert.equal(nearArrowSheet.crossingBreaks?.[0].status, 'too-close');

  // ASME unidirectional text gap preserved when crossing is clear of both center text gaps (x = 8, y = 6)
  const asme = makeCrossingFixture({ scale: 1, standard: 'asme' });
  const asmeH1: LinearDim = { ...asme.h1, place: [20, 6] };
  const asmeV1: LinearDim = { ...asme.v1, place: [8, 12] };
  const asmeSettings: DrawingSettings = {
    ...asme.settings,
    dimensions: [{ ...asmeH1, crossingBreak: { over: 'v1', gap: 2, target: crossingTargetOf(asmeV1) } }, asmeV1],
  };
  const asmeLayout = layoutSheet(asme.views, asmeSettings);
  const asmeSheet = buildSheet(asme.views, asmeLayout, asmeSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(asmeSheet.crossingBreaks?.[0].status, 'applied');
  // ASME already splits the line into 2 around text, so breaking the left half produces 3 dimension segments
  assert.equal(dimLinesOf(asmeSheet.groups.find(g => g.id === 'h1')!.marks).length, 3);

  // Broken view disables crossing break cleanly (no ghost hole)
  const brokenViewSettings: DrawingSettings = {
    ...settings,
    breaks: [{ axis: 'x', from: 15, to: 25 }],
    dimensions: [{ ...h1, crossingBreak: { over: 'v1', gap: 2, target } }, v1],
  };
  const brokenViewLayout = layoutSheet(views, brokenViewSettings);
  const brokenViewSheet = buildSheet(views, brokenViewLayout, brokenViewSettings, { title: 'Test', date: '2026-11-25' });
  assert.equal(brokenViewSheet.crossingBreaks?.[0].status, 'unsupported-view');
});
