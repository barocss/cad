import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { referencesOf } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { pickRadialThicknessCircle, resolveRadialThicknessEdges } from '../src/drawing/radialThickness';
import { resolveDimension } from '../src/drawing/dimensions';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet, type Mark } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings, type XY } from '../src/drawing/types';
import { drawingIssues } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { pdfMissing } from '../src/io/pdf';
import { modelAnnotations } from '../src/drawing/annotations3d';
import { currentSheetDimensionsCsv } from '../src/drawing/currentSheetDimensionsCsv';

type RadialThicknessDim = Extract<DrawingDimension, { kind: 'radial-thickness' }>;

function makeRingDoc(outerR = 20, innerR = 15, height = 10, innerCenter: [number, number] = [0, 0]): StudioDoc {
  const base: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: outerR },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
  return withNode(base, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: innerCenter, radius: innerR });
}

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'ring brep should build');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'ring views should project');
  return proj.views;
}

function findCircleByRadius(pr: BrepProjection, radius: number) {
  const edge = pr.edges.find(
    e => e.kind === 'circle' && e.circle && Math.abs(e.circle.radius - radius) < 1e-4 && e.pieces.some(p => p.visible),
  );
  assert.ok(edge, `expected visible circle edge with radius ${radius}`);
  return edge;
}

test('radial-thickness measures exact R - r (5 mm), order-independent, updates on r=16 (4 mm) and R=22 (6 mm)', () => {
  const doc0 = makeRingDoc(20, 15, 10);
  const views0 = projectDoc(doc0);
  const outerEdge = findCircleByRadius(views0.top, 20);
  const innerEdge = findCircleByRadius(views0.top, 15);
  const pOuter = pickRadialThicknessCircle(views0.top, outerEdge, 'top');
  const pInner = pickRadialThicknessCircle(views0.top, innerEdge, 'top');
  assert.ok(pOuter.ok && pInner.ok);

  // Order-independence and multiple radial directions
  const angles = [0, Math.PI / 4, 3 * Math.PI / 4, 7 * Math.PI / 6];
  for (const ang of angles) {
    const place: XY = [28 * Math.cos(ang), 28 * Math.sin(ang)];
    const rA = resolveRadialThicknessEdges(views0.top, pOuter.ref, pInner.ref, 'top', place);
    const rB = resolveRadialThicknessEdges(views0.top, pInner.ref, pOuter.ref, 'top', place);
    assert.ok(rA.ok && rB.ok);
    assert.ok(Math.abs(rA.geometry.thickness - 5) < 1e-6);
    assert.ok(Math.abs(rB.geometry.thickness - 5) < 1e-6);
    // Exact circumference points on r=15 and R=20, distance between them = 5
    assert.ok(Math.abs(Math.hypot(rA.geometry.innerPoint[0], rA.geometry.innerPoint[1]) - 15) < 1e-6);
    assert.ok(Math.abs(Math.hypot(rA.geometry.outerPoint[0], rA.geometry.outerPoint[1]) - 20) < 1e-6);
    assert.ok(Math.abs(Math.hypot(rA.geometry.outerPoint[0] - rA.geometry.innerPoint[0], rA.geometry.outerPoint[1] - rA.geometry.innerPoint[1]) - 5) < 1e-6);
  }

  const dim: RadialThicknessDim = {
    id: 'd1',
    view: 'top',
    kind: 'radial-thickness',
    first: pOuter.ref,
    second: pInner.ref,
    place: [28, 12],
  };
  // Old-reader safety: no top-level edge/near/a/b
  assert.equal('edge' in dim, false);
  assert.equal('near' in dim, false);
  assert.equal('a' in dim, false);

  const settings0: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const sheet0 = buildSheet(views0, layoutSheet(views0, settings0), settings0, { title: 'Ring 5mm', date: '2026-11-25' });
  const r0 = sheet0.dimensions[0];
  assert.ok(r0.ok && r0.kind === 'radial-thickness');
  assert.equal(r0.text, '5');
  assert.deepEqual(pdfMissing(sheet0), []);

  // Edit inner radius 15 -> 16 mm => thickness = 4 mm
  const views1 = projectDoc(makeRingDoc(20, 16, 10));
  const sheet1 = buildSheet(views1, layoutSheet(views1, settings0), settings0, { title: 'Ring 4mm', date: '2026-11-25' });
  const r1 = sheet1.dimensions[0];
  assert.ok(r1.ok && r1.kind === 'radial-thickness');
  assert.ok(Math.abs(r1.value - 4) < 1e-6);
  assert.equal(r1.text, '4');

  // Edit outer radius 20 -> 22 mm => thickness = 6 mm
  const views2 = projectDoc(makeRingDoc(22, 16, 10));
  const sheet2 = buildSheet(views2, layoutSheet(views2, settings0), settings0, { title: 'Ring 6mm', date: '2026-11-25' });
  const r2 = sheet2.dimensions[0];
  assert.ok(r2.ok && r2.kind === 'radial-thickness');
  assert.ok(Math.abs(r2.value - 6) < 1e-6);
  assert.equal(r2.text, '6');
});

test('radial-thickness respects scale, inch/dual, tolerances, SVG, DXF, 3D PMI, reorient, and referencesOf', () => {
  const doc = makeRingDoc(20, 15, 10);
  const views = projectDoc(doc);
  const pOuter = pickRadialThicknessCircle(views.top, findCircleByRadius(views.top, 20), 'top');
  const pInner = pickRadialThicknessCircle(views.top, findCircleByRadius(views.top, 15), 'top');
  assert.ok(pOuter.ok && pInner.ok);

  const dim: RadialThicknessDim = {
    id: 'd1',
    view: 'top',
    kind: 'radial-thickness',
    first: pOuter.ref,
    second: pInner.ref,
    place: [28, 12],
  };

  // Scale 0.5 & dual mm/inch (5 mm = 5 / 25.4 = 0.19685... -> .197)
  const dualSettings: DrawingSettings = { ...defaultDrawing(), scale: 0.5, dual: true, dimensions: [dim] };
  const dualSheet = buildSheet(views, layoutSheet(views, dualSettings), dualSettings, { title: 'Dual Ring', date: '2026-11-25' });
  const rDual = dualSheet.dimensions[0];
  assert.ok(rDual.ok && rDual.kind === 'radial-thickness');
  assert.equal(rDual.text, '5');
  assert.equal(rDual.alt, '.197');

  // Plain mm SVG, DXF (2000 & R12), and 3D PMI
  const plainSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const plainLayout = layoutSheet(views, plainSettings);
  const plainSheet = buildSheet(views, plainLayout, plainSettings, { title: 'Plain Ring', date: '2026-11-25' });
  const svg = sheetSvg(plainSheet, 'Plain Ring');
  assert.match(svg, /<text[^>]*>5<\/text>/);
  const grp = plainSheet.groups.find(g => g.role === 'dimension' && g.id === 'd1');
  assert.ok(grp);
  const heads = grp.marks.filter((m): m is Extract<Mark, { kind: 'fill' }> => m.kind === 'fill' && !!m.head);
  assert.equal(heads.length, 2);

  for (const version of ['AC1015', 'AC1009'] as const) {
    const dxfDoc = sheetDxfDocument(plainSheet, plainLayout, version);
    assert.equal(dxfDoc.entities.some(e => e.type === 'dimension'), false);
    assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text === '5'));
    assert.ok(sheetDxf(plainSheet, plainLayout, version).text.includes('\n5\n'));
  }

  const pmi = modelAnnotations({ views, layout: plainLayout, settings: plainSettings, sheet: plainSheet });
  const item = pmi.items.find(i => i.id === 'd1');
  assert.ok(item);
  assert.equal(item.dimension?.measure, 'radial-thickness');
  assert.equal(item.dimension?.unit, 'mm');
  assert.ok(Math.abs((item.dimension?.value ?? 0) - 5) < 1e-6);
  assert.equal(item.targets.length, 2);

  // Reorient y- -> x+ preserves 5 mm
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const turnedProj = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(turnedProj.ok);
  const turned = reorient(views, turnedProj.views, plainSettings, 'x+');
  assert.ok(turned.ok, turned.ok ? '' : turned.message);
  const rTurned = resolveDimension(turnedProj.views, turned.settings.dimensions[0]);
  assert.ok(rTurned.ok && rTurned.kind === 'radial-thickness');
  assert.ok(Math.abs(rTurned.value - 5) < 1e-6);

  // referencesOf deep-copies first & second without mutating source doc
  const docWithDim: StudioDoc = { ...doc, drawing: plainSettings };
  const { doc: copied, refs } = referencesOf(docWithDim);
  const dimRefs = refs.filter(x => x.where === 'dimension d1');
  assert.equal(dimRefs.length, 2);
  dimRefs[0].rename('renamed.outer', true);
  assert.equal((docWithDim.drawing!.dimensions[0] as RadialThicknessDim).first.edge, pOuter.ref.edge);
  assert.equal((copied.drawing!.dimensions[0] as RadialThicknessDim).first.edge, 'renamed.outer');

  // readDrawing round-trip and Dimension CSV refusal
  const round = readDrawing(JSON.parse(JSON.stringify(plainSettings)));
  assert.equal(round.dimensions.length, 1);
  assert.equal(round.dimensions[0].kind, 'radial-thickness');
  const csvRes = currentSheetDimensionsCsv({ resolved: plainSheet.dimensions, settings: plainSettings, wholeSettings: plainSettings, sheetNumber: 1 });
  assert.equal(csvRes.ok, false);
});

test('radial-thickness strictly rejects same circle, non-concentric, different 3D depth, partial arcs, non-round/broken views, and deleted hole', () => {
  const views = projectDoc(makeRingDoc(20, 15, 10));
  const outerEdge = findCircleByRadius(views.top, 20);
  const innerEdge = findCircleByRadius(views.top, 15);
  const pOuter = pickRadialThicknessCircle(views.top, outerEdge, 'top');
  const pInner = pickRadialThicknessCircle(views.top, innerEdge, 'top');
  assert.ok(pOuter.ok && pInner.ok);

  // Same circle picked twice -> rejected
  const sameRes = resolveRadialThicknessEdges(views.top, pOuter.ref, pOuter.ref, 'top', [25, 0]);
  assert.equal(sameRes.ok, false);
  assert.match(sameRes.reason, /different radii/i);

  // Non-concentric hole at [3, 0] -> rejected
  const eccViews = projectDoc(makeRingDoc(20, 10, 10, [3, 0]));
  const eccOuter = pickRadialThicknessCircle(eccViews.top, findCircleByRadius(eccViews.top, 20), 'top');
  const eccInner = pickRadialThicknessCircle(eccViews.top, findCircleByRadius(eccViews.top, 10), 'top');
  assert.ok(eccOuter.ok && eccInner.ok);
  const eccRes = resolveRadialThicknessEdges(eccViews.top, eccOuter.ref, eccInner.ref, 'top', [25, 0]);
  assert.equal(eccRes.ok, false);
  assert.match(eccRes.reason, /not concentric/i);

  // Coaxial circles at DIFFERENT 3D depths (z = 10 vs z = 4) overlapping on screen -> rejected!
  const depthPr: BrepProjection = {
    right: [1, 0, 0],
    up: [0, 1, 0],
    toward: [0, 0, 1],
    min: [-20, -20],
    max: [20, 20],
    edges: [
      {
        name: 'outerTop',
        kind: 'circle',
        ends: null,
        circle: { center: [0, 0, 10], radius: 20, normal: [0, 0, 1], full: true, sweep: 2 * Math.PI },
        pieces: [{ visible: true, curve: { kind: 'arc', center: [0, 0], u: [20, 0], v: [0, 20], t0: 0, t1: 2 * Math.PI } }],
      },
      {
        name: 'innerStep',
        kind: 'circle',
        ends: null,
        circle: { center: [0, 0, 4], radius: 15, normal: [0, 0, 1], full: true, sweep: 2 * Math.PI },
        pieces: [{ visible: true, curve: { kind: 'arc', center: [0, 0], u: [15, 0], v: [0, 15], t0: 0, t1: 2 * Math.PI } }],
      },
    ],
  };
  const depthRes = resolveRadialThicknessEdges(depthPr, { edge: 'outerTop', near: [0, 0, 10] }, { edge: 'innerStep', near: [0, 0, 4] }, 'top', [25, 0]);
  assert.equal(depthRes.ok, false);
  assert.match(depthRes.reason, /same 3D plane/i);

  // Partial circular arc (fillet) -> rejected!
  let filleted = rectanglePart(40, 30, 10);
  filleted = withNode(filleted, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], radius: 8 });
  const filletViews = projectDoc(filleted);
  const partialArc = filletViews.top.edges.find(e => e.kind === 'circle' && e.circle && !e.circle.full && e.pieces.some(p => p.visible));
  assert.ok(partialArc);
  const partialPick = pickRadialThicknessCircle(filletViews.top, partialArc, 'top');
  assert.equal(partialPick.ok, false);
  assert.match(partialPick.reason, /Partial arcs/i);

  // Non-round view (front), iso/section/detail, and broken view rejected
  assert.equal(resolveRadialThicknessEdges(views.front, pOuter.ref, pInner.ref, 'front', [25, 0]).ok, false);
  for (const badView of ['iso', 'section:A', 'detail:B'] as const) {
    assert.equal(resolveRadialThicknessEdges(views.top, pOuter.ref, pInner.ref, badView, [25, 0]).ok, false);
  }
  const dim: RadialThicknessDim = { id: 'd1', view: 'top', kind: 'radial-thickness', first: pOuter.ref, second: pInner.ref, place: [28, 12] };
  const brokenSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, breaks: [{ axis: 'x', from: -5, to: 5 }], dimensions: [dim] };
  const brokenSheet = buildSheet(views, layoutSheet(views, brokenSettings), brokenSettings, { title: 'Broken', date: '2026-11-25' });
  assert.equal(brokenSheet.dimensions[0].ok, false);
  assert.match(brokenSheet.dimensions[0].reason, /broken view/i);

  // Deleted inner hole -> unresolved DIMENSION_LOST
  const solidCylinder: StudioDoc = {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 20 },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
  const cylViews = projectDoc(solidCylinder);
  const lostSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const lostLayout = layoutSheet(cylViews, lostSettings);
  const lostSheet = buildSheet(cylViews, lostLayout, lostSettings, { title: 'Lost', date: '2026-11-25' });
  assert.equal(lostSheet.dimensions[0].ok, false);
  const issues = drawingIssues({ views: cylViews, layout: lostLayout, sheet: lostSheet, settings: lostSettings, callout: () => null });
  assert.ok(issues.some(i => i.code === 'DIMENSION_LOST' && i.dims?.includes('d1')));
});
