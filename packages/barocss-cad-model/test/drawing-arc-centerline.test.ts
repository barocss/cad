import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { newArcCenterlineId, pickArcCenterlineEdge, resolveArcCenterline } from '../src/drawing/arcCenterline';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingArcCenterline, type DrawingSettings } from '../src/drawing/types';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { drawingIssues, applyFix } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';

/** Build an extruded 90° annular sector (r=innerR, R=outerR, startDeg..endDeg, center=(0,0)). */
function makeSectorDoc(innerR = 10, outerR = 14, startDeg = 0, endDeg = 90, height = 10): StudioDoc {
  const s = startDeg * Math.PI / 180;
  const e = endDeg * Math.PI / 180;
  const pt = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      {
        id: 'n0',
        kind: 'sketch',
        profile: 'loop',
        segments: [
          { kind: 'line', start: pt(innerR, s) },
          { kind: 'arc', start: pt(outerR, s), center: [0, 0], direction: 'ccw' },
          { kind: 'line', start: pt(outerR, e) },
          { kind: 'arc', start: pt(innerR, e), center: [0, 0], direction: 'cw' },
        ],
      },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

/** Build a filleted shelled box: fillet radius R=14 and shell thickness 4 -> concentric 0°..90° arcs r=10, R=14. */
function makeShelledCornerDoc(filletR = 14, thickness = 4): StudioDoc {
  let doc = rectanglePart(50, 50, 15);
  const b0 = brepsFor(doc);
  assert.ok('breps' in b0);
  const corner = b0.breps[0].edges.find(e => e.name === 'n1.side1|n1.side2')?.name
    ?? b0.breps[0].edges.find(e => e.name?.includes('side1') && e.name?.includes('side2'))?.name
    ?? 'n1.side1|n1.side2';
  doc = withNode(doc, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [corner], radius: filletR });
  doc = withNode(doc, { kind: 'shell', parent: { node: 2, side: 'solid' }, open: ['n1.top'], thickness });
  return doc;
}

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'part brep should build: ' + JSON.stringify('breps' in res ? null : res));
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'part views should project');
  return proj.views;
}

function findArcByRadius(pr: BrepProjection, radius: number) {
  const edge = pr.edges.find(
    e => e.kind === 'circle'
      && e.circle
      && !e.circle.full
      && Math.abs(e.circle.radius - radius) < 1e-3
      && e.pieces.some(p => p.visible),
  );
  assert.ok(edge, `expected visible partial arc with radius ${radius}`);
  return edge;
}

test('arc-centerline computes exact R=12 for r=10/R=14 (0°..90°), handles wraparound 350°..370° and updates R=12->14 on outer 14->18', () => {
  const doc0 = makeSectorDoc(10, 14, 0, 90);
  const views0 = projectDoc(doc0);
  const inner = findArcByRadius(views0.top, 10);
  const outer = findArcByRadius(views0.top, 14);
  const pInner = pickArcCenterlineEdge(views0.top, inner, 'top');
  const pOuter = pickArcCenterlineEdge(views0.top, outer, 'top');
  assert.ok(pInner.ok && pOuter.ok);

  // Order-independent & traversal-direction-independent (outer is CCW, inner is CW in outline)
  const r1 = resolveArcCenterline(views0.top, pInner.ref, pOuter.ref, 'top');
  const r2 = resolveArcCenterline(views0.top, pOuter.ref, pInner.ref, 'top');
  assert.ok(r1.ok && r2.ok);
  for (const r of [r1, r2]) {
    assert.ok(Math.abs(r.geometry.midRadius - 12) < 1e-6);
    assert.ok(Math.abs(r.geometry.sweep - Math.PI / 2) < 1e-4);
    assert.ok(Math.hypot(r.geometry.startPoint[0] - 12, r.geometry.startPoint[1] - 0) < 1e-4);
    assert.ok(Math.hypot(r.geometry.endPoint[0] - 0, r.geometry.endPoint[1] - 12) < 1e-4);
    assert.ok(Math.hypot(r.geometry.midPoint[0] - 6 * Math.SQRT2, r.geometry.midPoint[1] - 6 * Math.SQRT2) < 1e-4);
  }

  // Edit outer radius 14 -> 18 updates curved centerline midRadius 12 -> 14
  const doc18 = makeSectorDoc(10, 18, 0, 90);
  const views18 = projectDoc(doc18);
  const r18 = resolveArcCenterline(views18.top, pInner.ref, pOuter.ref, 'top');
  assert.ok(r18.ok);
  assert.ok(Math.abs(r18.geometry.midRadius - 14) < 1e-6);
  assert.ok(Math.hypot(r18.geometry.startPoint[0] - 14, r18.geometry.startPoint[1]) < 1e-4);

  // Wraparound span across 0°/360° seam: 350°..370° (20° sweep centered at 0°)
  const docWrap = makeSectorDoc(10, 14, -10, 10);
  const viewsWrap = projectDoc(docWrap);
  const pW1 = pickArcCenterlineEdge(viewsWrap.top, findArcByRadius(viewsWrap.top, 10), 'top');
  const pW2 = pickArcCenterlineEdge(viewsWrap.top, findArcByRadius(viewsWrap.top, 14), 'top');
  assert.ok(pW1.ok && pW2.ok);
  const rWrap = resolveArcCenterline(viewsWrap.top, pW1.ref, pW2.ref, 'top');
  assert.ok(rWrap.ok);
  assert.ok(Math.abs(rWrap.geometry.midRadius - 12) < 1e-6);
  assert.ok(Math.abs(rWrap.geometry.sweep - (20 * Math.PI / 180)) < 1e-4);
  assert.ok(Math.hypot(rWrap.geometry.midPoint[0] - 12, rWrap.geometry.midPoint[1] - 0) < 1e-4);
});

test('refusal suite: equal radius, unequal spans, non-concentric, depth-offset, full circles, broken views', () => {
  const views0 = projectDoc(makeSectorDoc(10, 14, 0, 90));
  const pInner = pickArcCenterlineEdge(views0.top, findArcByRadius(views0.top, 10), 'top');
  const pOuter = pickArcCenterlineEdge(views0.top, findArcByRadius(views0.top, 14), 'top');
  assert.ok(pInner.ok && pOuter.ok);

  // 1. Same arc / equal radius refused
  assert.equal(resolveArcCenterline(views0.top, pInner.ref, pInner.ref, 'top').ok, false);

  // 2. Non-concentric (shifted 2D center) refused
  const shiftedCenter: BrepProjection = {
    ...views0.top,
    edges: views0.top.edges.map(e =>
      e.name === pOuter.ref.edge && e.circle && e.ends
        ? {
            ...e,
            circle: { ...e.circle, center: [e.circle.center[0] + 2, e.circle.center[1], e.circle.center[2]] },
            ends: [
              [e.ends[0][0] + 2, e.ends[0][1], e.ends[0][2]],
              [e.ends[1][0] + 2, e.ends[1][1], e.ends[1][2]],
            ],
            pieces: e.pieces.map(p => p.curve.kind === 'arc' ? { ...p, curve: { ...p.curve, center: [p.curve.center[0] + 2, p.curve.center[1]] } } : p),
          }
        : e,
    ),
  };
  const nonConcentric = resolveArcCenterline(shiftedCenter, pInner.ref, { ...pOuter.ref, near: [pOuter.ref.near[0] + 2, pOuter.ref.near[1], pOuter.ref.near[2]] }, 'top');
  assert.equal(nonConcentric.ok, false);
  assert.match(nonConcentric.reason, /concentric/i);

  // 3. Depth-offset 3D concentric arcs (same XY center, different Z height) refused
  const depthOffset: BrepProjection = {
    ...views0.top,
    edges: views0.top.edges.map(e =>
      e.name === pOuter.ref.edge && e.circle && e.ends
        ? {
            ...e,
            circle: { ...e.circle, center: [e.circle.center[0], e.circle.center[1], e.circle.center[2] + 5] },
            ends: [
              [e.ends[0][0], e.ends[0][1], e.ends[0][2] + 5],
              [e.ends[1][0], e.ends[1][1], e.ends[1][2] + 5],
            ],
          }
        : e,
    ),
  };
  const depthRes = resolveArcCenterline(depthOffset, pInner.ref, { ...pOuter.ref, near: [pOuter.ref.near[0], pOuter.ref.near[1], pOuter.ref.near[2] + 5] }, 'top');
  assert.equal(depthRes.ok, false);
  assert.match(depthRes.reason, /concentric in the same 3D plane/i);

  // 4. Unequal angular spans (0°..90° vs 0°..60°) refused
  const views60 = projectDoc(makeSectorDoc(10, 14, 0, 60));
  const outer60 = findArcByRadius(views60.top, 14);
  const mixedSpan: BrepProjection = {
    ...views0.top,
    edges: [...views0.top.edges.filter(e => e.name !== pOuter.ref.edge), { ...outer60, name: 'outer60' }],
  };
  const pOuter60 = pickArcCenterlineEdge(mixedSpan, mixedSpan.edges.find(e => e.name === 'outer60')!, 'top');
  assert.ok(pOuter60.ok);
  const spanRes = resolveArcCenterline(mixedSpan, pInner.ref, pOuter60.ref, 'top');
  assert.equal(spanRes.ok, false);
  assert.match(spanRes.reason, /angular span/i);

  // 5. Full circles refused
  const ringDoc: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 14 },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
  const ringViews = projectDoc(ringDoc);
  const fullCircle = ringViews.top.edges.find(e => e.kind === 'circle' && e.pieces.some(p => p.visible));
  assert.ok(fullCircle);
  assert.equal(pickArcCenterlineEdge(ringViews.top, fullCircle, 'top').ok, false);

  // 6. Broken view refused in buildSheet
  const ac: DrawingArcCenterline = { id: 'ac1', view: 'top', first: pInner.ref, second: pOuter.ref };
  const brokenSettings: DrawingSettings = { ...defaultDrawing(), breaks: [{ axis: 'x', from: 2, to: 8 }], arcCenterlines: [ac] };
  const brokenLayout = layoutSheet(views0, brokenSettings);
  const brokenSheet = buildSheet(views0, brokenLayout, brokenSettings, { title: 'broken', date: '2026-11-25' });
  assert.equal(brokenSheet.arcCenterlines?.[0].ok, false);
});

test('centers toggle, SVG, DXF CENTER ARC, multi-sheet, reorient, issues/fix, shelled corner edit, and references', async () => {
  const doc0 = makeShelledCornerDoc(14, 4);
  const views = projectDoc(doc0);
  const pInner = pickArcCenterlineEdge(views.top, findArcByRadius(views.top, 10), 'top');
  const pOuter = pickArcCenterlineEdge(views.top, findArcByRadius(views.top, 14), 'top');
  assert.ok(pInner.ok && pOuter.ok);

  const ac: DrawingArcCenterline = { id: newArcCenterlineId([]), view: 'top', first: pInner.ref, second: pOuter.ref };
  assert.equal(ac.id, 'ac1');

  // Strict readDrawing roundtrip
  const read = readDrawing({
    ...defaultDrawing(),
    arcCenterlines: [
      ac,
      { ...ac, id: 'ac1' }, // duplicate id dropped
      { ...ac, id: 'bad-iso', view: 'iso' },
    ],
  });
  assert.equal(read.arcCenterlines?.length, 1);

  // centers: true emits arc-centerline SVG group and DXF ARC on CENTER layer
  const settings: DrawingSettings = { ...defaultDrawing(), arcCenterlines: [ac] };
  const layout = layoutSheet(views, settings);
  const sheet = buildSheet(views, layout, settings, { title: 'slot', date: '2026-11-25' });
  assert.ok(sheet.arcCenterlines?.[0].ok);
  assert.ok(Math.abs(sheet.arcCenterlines[0].geometry.midRadius - 12) < 1e-4);
  const svg = sheetSvg(sheet, 'slot');
  assert.match(svg, /class="arc-centerline" data-view="top" data-arc-centerline="ac1"/);
  const dxfDoc = sheetDxfDocument(sheet, layout, 'AC1015');
  assert.ok(dxfDoc.entities.some(e => e.type === 'arc' && e.layer === 'CENTER'));
  assert.ok(sheetDxf(sheet, layout, 'AC1015').text.includes('CENTER'));

  // centers: false hides visual mark group while preserving record & resolution
  const hiddenSettings: DrawingSettings = { ...settings, centers: false };
  const hiddenSheet = buildSheet(views, layoutSheet(views, hiddenSettings), hiddenSettings, { title: 'slot', date: '2026-11-25' });
  assert.equal(hiddenSheet.arcCenterlines?.length, 1);
  assert.ok(hiddenSheet.arcCenterlines?.[0].ok);
  assert.equal(hiddenSheet.groups.some(g => g.arcCenterline), false);

  // Multi-sheet forSheet / mergeSheet ownership by view
  const multi: DrawingSettings = {
    ...settings,
    sheets: [{ id: 'S2', views: ['top'] }],
  };
  assert.equal(forSheet(multi, 0).arcCenterlines, undefined);
  assert.equal(forSheet(multi, 1).arcCenterlines?.length, 1);
  const merged = mergeSheet(multi, 1, forSheet(multi, 1));
  assert.equal(merged.arcCenterlines?.length, 1);

  // Reorient preserves arcCenterlines cleanly
  const b0 = brepsFor(doc0);
  assert.ok('breps' in b0);
  const viewsXPlus = projectViews(b0.breps, b0.prefixes, { orientation: 'x+' });
  assert.ok(viewsXPlus.ok);
  const turned = reorient(views, viewsXPlus.views, settings, 'x+');
  assert.ok(turned.ok);
  assert.equal(turned.settings.arcCenterlines?.length, 1);
  assert.ok(resolveArcCenterline(viewsXPlus.views[turned.settings.arcCenterlines![0].view], turned.settings.arcCenterlines![0].first, turned.settings.arcCenterlines![0].second, turned.settings.arcCenterlines![0].view).ok);

  // Lost centerline triggers ARC_CENTERLINE_LOST and fix removes it cleanly
  const boxViews = projectDoc(rectanglePart(50, 50, 15));
  const lostLayout = layoutSheet(boxViews, settings);
  const lostSheet = buildSheet(boxViews, lostLayout, settings, { title: 'box', date: '2026-11-25' });
  const issues = drawingIssues({ views: boxViews, layout: lostLayout, settings, sheet: lostSheet, callout: () => null });
  const lostIssue = issues.find(i => i.code === 'ARC_CENTERLINE_LOST');
  assert.ok(lostIssue && lostIssue.fix?.kind === 'remove-arc-centerline');
  const fixed = applyFix({ views: boxViews, layout: lostLayout, settings, sheet: lostSheet, callout: () => null }, lostIssue.fix);
  assert.equal(fixed.arcCenterlines, undefined);

  // Reference signatures capture & verify cleanly
  const docWithAc: StudioDoc = { ...doc0, drawing: settings };
  const evaluated = evaluateDoc(docWithAc, 1);
  assert.ok(evaluated.ok);
  const signed = captureSignatures(docWithAc, evaluated.bodies);
  const refs = referencesOf(signed, true).refs.filter(r => r.where === 'arc-centerline ac1');
  assert.equal(refs.length, 2);
  assert.ok(refs.every(r => r.edge && !!r.sig));
  const verified = await verifyReferences(signed, evaluated.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);
  assert.equal(verified.changes.length, 0);
});
