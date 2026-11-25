import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import {
  BISECTOR_EXTENSION_MM,
  newBisectorCenterlineId,
  pickBisectorCenterlineEdge,
  resolveBisectorCenterline,
} from '../src/drawing/bisectorCenterline';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingBisectorCenterline, type DrawingSettings, type XY } from '../src/drawing/types';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { applyFix, drawingIssues } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'part brep should build: ' + JSON.stringify('breps' in res ? null : res));
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'part views should project');
  return proj.views;
}

function findLineEdgeMidNear(pr: BrepProjection, mx: number, my: number, mz?: number) {
  const edge = pr.edges.find(e => {
    if (e.kind !== 'line' || !e.ends || !e.pieces.length || !e.pieces.every(p => p.visible)) return false;
    const mid = [(e.ends[0][0] + e.ends[1][0]) / 2, (e.ends[0][1] + e.ends[1][1]) / 2, (e.ends[0][2] + e.ends[1][2]) / 2];
    return Math.hypot(mid[0] - mx, mid[1] - my) < 1e-2 && (mz === undefined || Math.abs(mid[2] - mz) < 1e-2);
  });
  assert.ok(edge, `expected visible straight edge with midpoint near (${mx}, ${my})`);
  return edge;
}

function makePolygonExtrude(points: readonly XY[], height = 5): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'polygon', points: points.map(([x, y]) => [x, y]) },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

test('bisector-centerline computes exact y=5 for A=(0,0,5)->(40,0,5), B=(0,10,5)->(40,10,5), updates to y=7 when width 10->14, and is invariant to pick order, rotation, translation, scale, and units', () => {
  const doc10 = rectanglePart(40, 10, 5);
  const views10 = projectDoc(doc10);
  const eBot = findLineEdgeMidNear(views10.top, 20, 0, 5);
  const eTop = findLineEdgeMidNear(views10.top, 20, 10, 5);
  const pBot = pickBisectorCenterlineEdge(views10.top, eBot, 'top');
  const pTop = pickBisectorCenterlineEdge(views10.top, eTop, 'top');
  assert.ok(pBot.ok && pTop.ok);

  const r1 = resolveBisectorCenterline(views10.top, pBot.ref, pTop.ref, 'top');
  const r2 = resolveBisectorCenterline(views10.top, pTop.ref, pBot.ref, 'top');
  assert.ok(r1.ok && r2.ok);
  for (const r of [r1, r2]) {
    assert.ok(Math.abs(r.geometry.length - 40) < 1e-6);
    assert.ok(Math.abs(r.geometry.separation - 10) < 1e-6);
    assert.ok(Math.hypot(r.geometry.start[0] - 0, r.geometry.start[1] - 5) < 1e-6);
    assert.ok(Math.hypot(r.geometry.end[0] - 40, r.geometry.end[1] - 5) < 1e-6);
  }

  // Edit width 10 -> 14 mm: bisector moves cleanly to y=7 with same refs
  const doc14 = rectanglePart(40, 14, 5);
  const views14 = projectDoc(doc14);
  const r14 = resolveBisectorCenterline(views14.top, pBot.ref, pTop.ref, 'top');
  assert.ok(r14.ok);
  assert.ok(Math.abs(r14.geometry.length - 40) < 1e-6);
  assert.ok(Math.abs(r14.geometry.separation - 14) < 1e-6);
  assert.ok(Math.hypot(r14.geometry.start[0] - 0, r14.geometry.start[1] - 7) < 1e-6);
  assert.ok(Math.hypot(r14.geometry.end[0] - 40, r14.geometry.end[1] - 7) < 1e-6);

  // Rotated & translated rectangle (3-4-5 angle: cos=0.6, sin=0.8, len=25, width=10, origin=(5,-3))
  const c = 0.6, s = 0.8;
  const pt = (u: number, v: number): XY => [5 + u * c - v * s, -3 + u * s + v * c];
  const docRot = makePolygonExtrude([pt(0, 0), pt(25, 0), pt(25, 10), pt(0, 10)], 5);
  const viewsRot = projectDoc(docRot);
  const eR1 = findLineEdgeMidNear(viewsRot.top, pt(12.5, 0)[0], pt(12.5, 0)[1], 5);
  const eR2 = findLineEdgeMidNear(viewsRot.top, pt(12.5, 10)[0], pt(12.5, 10)[1], 5);
  const pR1 = pickBisectorCenterlineEdge(viewsRot.top, eR1, 'top');
  const pR2 = pickBisectorCenterlineEdge(viewsRot.top, eR2, 'top');
  assert.ok(pR1.ok && pR2.ok);
  const rRot = resolveBisectorCenterline(viewsRot.top, pR1.ref, pR2.ref, 'top');
  assert.ok(rRot.ok);
  assert.ok(Math.abs(rRot.geometry.length - 25) < 1e-5);
  assert.ok(Math.abs(rRot.geometry.separation - 10) < 1e-5);
  const expA = pt(0, 5), expB = pt(25, 5);
  assert.ok(Math.hypot(rRot.geometry.start[0] - expA[0], rRot.geometry.start[1] - expA[1]) < 1e-5);
  assert.ok(Math.hypot(rRot.geometry.end[0] - expB[0], rRot.geometry.end[1] - expB[1]) < 1e-5);

  // Scale 1:1 vs 1:2 & inch display: fixed 2.5 mm paper extension, invariant model length
  const cl: DrawingBisectorCenterline = { id: newBisectorCenterlineId(), view: 'top', first: pBot.ref, second: pTop.ref };
  const s1: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [], bisectorCenterlines: [cl] };
  const sHalfInch: DrawingSettings = { ...defaultDrawing(), scale: 0.5, units: 'inch', dimensions: [], bisectorCenterlines: [cl] };
  const sh1 = buildSheet(views10, layoutSheet(views10, s1), s1, { title: 'slot', date: '2026-11-25' });
  const shHalf = buildSheet(views10, layoutSheet(views10, sHalfInch), sHalfInch, { title: 'slot', date: '2026-11-25' });
  const m1 = sh1.groups.find(g => g.bisectorCenterline && g.id === 'cl1')!.marks[0];
  const mHalf = shHalf.groups.find(g => g.bisectorCenterline && g.id === 'cl1')!.marks[0];
  assert.equal(m1.kind, 'line');
  assert.equal(mHalf.kind, 'line');
  if (m1.kind === 'line' && mHalf.kind === 'line') {
    assert.ok(Math.abs(Math.hypot(m1.b[0] - m1.a[0], m1.b[1] - m1.a[1]) - (40 + 2 * BISECTOR_EXTENSION_MM)) < 1e-5);
    assert.ok(Math.abs(Math.hypot(mHalf.b[0] - mHalf.a[0], mHalf.b[1] - mHalf.a[1]) - (20 + 2 * BISECTOR_EXTENSION_MM)) < 1e-5);
  }
});

test('bisector-centerline strictly refuses same edge, non-parallel, near-parallel, unequal span, depth-offset, different bodies, circular edges, broken/iso views, and invalid reader payloads', () => {
  const docBox = rectanglePart(40, 10, 5);
  const viewsBox = projectDoc(docBox);
  const pBot = pickBisectorCenterlineEdge(viewsBox.top, findLineEdgeMidNear(viewsBox.top, 20, 0, 5), 'top');
  const pTop = pickBisectorCenterlineEdge(viewsBox.top, findLineEdgeMidNear(viewsBox.top, 20, 10, 5), 'top');
  const pLeft = pickBisectorCenterlineEdge(viewsBox.top, findLineEdgeMidNear(viewsBox.top, 0, 5, 5), 'top');
  assert.ok(pBot.ok && pTop.ok && pLeft.ok);

  assert.equal(resolveBisectorCenterline(viewsBox.top, pBot.ref, pBot.ref, 'top').ok, false, 'same edge refused');
  assert.equal(resolveBisectorCenterline(viewsBox.top, pBot.ref, pLeft.ref, 'top').ok, false, 'perpendicular edges refused');
  assert.equal(resolveBisectorCenterline(viewsBox.iso, pBot.ref, pTop.ref, 'iso').ok, false, 'iso view refused');

  // Near-parallel outside tolerance (0.5 degree taper)
  const docTaper = makePolygonExtrude([[0, 0], [40, 0], [40, 10.35], [0, 10]], 5);
  const viewsTaper = projectDoc(docTaper);
  const tBot = pickBisectorCenterlineEdge(viewsTaper.top, findLineEdgeMidNear(viewsTaper.top, 20, 0, 5), 'top');
  const tTop = pickBisectorCenterlineEdge(viewsTaper.top, findLineEdgeMidNear(viewsTaper.top, 20, 10.175, 5), 'top');
  assert.ok(tBot.ok && tTop.ok);
  assert.equal(resolveBisectorCenterline(viewsTaper.top, tBot.ref, tTop.ref, 'top').ok, false, 'near-parallel refused');

  // Unequal length / staggered parallel edges (trapezoid with top span 5..35 vs bottom 0..40)
  const docTrap = makePolygonExtrude([[0, 0], [40, 0], [35, 10], [5, 10]], 5);
  const viewsTrap = projectDoc(docTrap);
  const trBot = pickBisectorCenterlineEdge(viewsTrap.top, findLineEdgeMidNear(viewsTrap.top, 20, 0, 5), 'top');
  const trTop = pickBisectorCenterlineEdge(viewsTrap.top, findLineEdgeMidNear(viewsTrap.top, 20, 10, 5), 'top');
  assert.ok(trBot.ok && trTop.ok);
  const rTrap = resolveBisectorCenterline(viewsTrap.top, trBot.ref, trTop.ref, 'top');
  assert.equal(rTrap.ok, false, 'unequal axial span must be refused');
  assert.match(rTrap.reason, /same axial span/i);

  // Different depth & different body (two boxes at Z=5 and Z=10)
  const docTwoBodies: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 4,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 5] },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 5 },
      { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, 10], max: [40, 15] },
      { id: 'n3', kind: 'extrude', sketch: 2, height: 10 },
    ],
    outputs: { b1: { node: 1, side: 'solid' }, b2: { node: 3, side: 'solid' } },
  };
  const viewsTwo = projectDoc(docTwoBodies);
  const b1Edge = pickBisectorCenterlineEdge(viewsTwo.top, findLineEdgeMidNear(viewsTwo.top, 20, 0, 5), 'top');
  const b2Edge = pickBisectorCenterlineEdge(viewsTwo.top, findLineEdgeMidNear(viewsTwo.top, 20, 10, 10), 'top');
  assert.ok(b1Edge.ok && b2Edge.ok);
  assert.equal(resolveBisectorCenterline(viewsTwo.top, b1Edge.ref, b2Edge.ref, 'top').ok, false, 'different body/depth refused');

  // Circular hole edge refused by picker
  const docHole = withNode(rectanglePart(40, 20, 5), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [20, 10], radius: 3 });
  const viewsHole = projectDoc(docHole);
  const circleEdge = viewsHole.top.edges.find(e => e.kind === 'circle' && e.pieces.some(p => p.visible));
  assert.ok(circleEdge);
  assert.equal(pickBisectorCenterlineEdge(viewsHole.top, circleEdge, 'top').ok, false);

  // Broken view refused in buildSheet
  const brokenSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    dimensions: [],
    breaks: [{ axis: 'x', from: 15, to: 25 }],
    bisectorCenterlines: [{ id: 'cl1', view: 'top', first: pBot.ref, second: pTop.ref }],
  };
  const brokenSheet = buildSheet(viewsBox, layoutSheet(viewsBox, brokenSettings), brokenSettings, { title: 'broken', date: '2026-11-25' });
  assert.equal(brokenSheet.bisectorCenterlines?.[0].ok, false);
  assert.equal(brokenSheet.groups.some(g => g.bisectorCenterline), false);

  // Strict readDrawing validation
  const read = readDrawing({
    ...defaultDrawing(),
    bisectorCenterlines: [
      { id: 'same', view: 'top', first: pBot.ref, second: pBot.ref },
      { id: 'bad-view', view: 'iso', first: pBot.ref, second: pTop.ref },
      { id: 'bad-nan', view: 'top', first: { edge: 'e1', near: [Number.NaN, 0, 0] }, second: pTop.ref },
      { id: 'cl1', view: 'top', first: pBot.ref, second: pTop.ref },
      { id: 'cl1', view: 'top', first: pTop.ref, second: pBot.ref },
    ],
  });
  assert.equal(read.bisectorCenterlines?.length, 1);
  assert.equal(read.bisectorCenterlines?.[0].id, 'cl1');
});

test('bisector-centerline supports centers toggle, SVG/DXF CENTER LINE output, multi-sheet ownership, reorient, references, and lost-edge diagnostics', async () => {
  const doc = rectanglePart(40, 10, 5);
  const views = projectDoc(doc);
  const pBot = pickBisectorCenterlineEdge(views.top, findLineEdgeMidNear(views.top, 20, 0, 5), 'top');
  const pTop = pickBisectorCenterlineEdge(views.top, findLineEdgeMidNear(views.top, 20, 10, 5), 'top');
  assert.ok(pBot.ok && pTop.ok);

  const cl: DrawingBisectorCenterline = { id: 'cl1', view: 'top', first: pBot.ref, second: pTop.ref };
  const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [], bisectorCenterlines: [cl] };
  const layout = layoutSheet(views, settings);
  const sheet = buildSheet(views, layout, settings, { title: 'slot', date: '2026-11-25' });

  // SVG contains distinct bisector-centerline group with dashed line of length 45 mm
  const svg = sheetSvg(sheet, 'slot');
  const match = svg.match(/<g class="bisector-centerline" data-view="top" data-bisector-centerline="cl1">([\s\S]*?)<\/g>/);
  assert.ok(match, 'SVG should contain bisector-centerline group');
  assert.match(match[1], /stroke-dasharray="8 1\.5 1\.5 1\.5"/);

  // DXF contains exact 45 mm LINE on CENTER layer
  const dxfDoc = sheetDxfDocument(sheet, layout);
  const centerLines = dxfDoc.entities.filter((e): e is Extract<typeof e, { type: 'line' }> => e.type === 'line' && e.layer === 'CENTER');
  assert.equal(centerLines.length, 1);
  assert.ok(Math.abs(Math.hypot(centerLines[0].b[0] - centerLines[0].a[0], centerLines[0].b[1] - centerLines[0].a[1]) - 45) < 1e-5);
  assert.ok(sheetDxf(sheet, layout).text.includes('CENTER'));

  // Global centers: false hides line while preserving record & resolution
  const hiddenSheet = buildSheet(views, layout, { ...settings, centers: false }, { title: 'slot', date: '2026-11-25' });
  assert.equal(hiddenSheet.bisectorCenterlines?.[0].ok, true);
  assert.equal(hiddenSheet.groups.some(g => g.bisectorCenterline), false);

  // Centerline must not suppress OVERALL_MISSING warning
  const issues = drawingIssues({ views, layout, settings, sheet, callout: () => null });
  assert.ok(issues.some(i => i.code === 'OVERALL_MISSING'));

  // Multi-sheet forSheet / mergeSheet ownership
  const multi: DrawingSettings = { ...settings, sheets: [{ id: 'S2', views: ['top'] }] };
  assert.equal(forSheet(multi, 0).bisectorCenterlines, undefined);
  assert.equal(forSheet(multi, 1).bisectorCenterlines?.length, 1);
  const afterS1 = mergeSheet(multi, 0, { ...forSheet(multi, 0), hidden: false });
  assert.equal(afterS1.bisectorCenterlines?.length, 1);

  // Reorient y- -> x+ preserves top view bisector centerline cleanly
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const projX = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(projX.ok);
  const turned = reorient(views, projX.views, settings, 'x+');
  assert.ok(turned.ok);
  assert.equal(turned.settings.bisectorCenterlines?.length, 1);
  assert.equal(turned.settings.bisectorCenterlines?.[0].view, 'top');

  // Reference capture & verification
  const docWithCl: StudioDoc = { ...doc, drawing: settings };
  const evaluated = evaluateDoc(docWithCl, 1);
  assert.ok(evaluated.ok);
  const signed = captureSignatures(docWithCl, evaluated.bodies);
  const refs = referencesOf(signed, true).refs.filter(r => r.where === 'bisector-centerline cl1');
  assert.equal(refs.length, 2);
  assert.ok(refs.every(r => r.edge && !!r.sig));
  const verified = await verifyReferences(signed, evaluated.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);
  assert.equal(verified.changes.length, 0);

  // Tapered / missing geometry triggers BISECTOR_CENTERLINE_LOST without drawing stale line + applyFix removes it
  const viewsTaper = projectDoc(makePolygonExtrude([[0, 0], [40, 0], [40, 12], [0, 10]], 5));
  const layoutLost = layoutSheet(viewsTaper, settings);
  const sheetLost = buildSheet(viewsTaper, layoutLost, settings, { title: 'taper', date: '2026-11-25' });
  assert.equal(sheetLost.bisectorCenterlines?.[0].ok, false);
  assert.equal(sheetLost.groups.some(g => g.bisectorCenterline), false);
  const lostIssues = drawingIssues({ views: viewsTaper, layout: layoutLost, settings, sheet: sheetLost, callout: () => null });
  const lost = lostIssues.find(i => i.code === 'BISECTOR_CENTERLINE_LOST');
  assert.ok(lost && lost.fix?.kind === 'remove-bisector-centerline');
  const fixed = applyFix({ views: viewsTaper, layout: layoutLost, settings, sheet: sheetLost, callout: () => null }, lost.fix);
  assert.equal(fixed.bisectorCenterlines, undefined);
});
