import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { pickCircleSeparationEdge, resolveCircleSeparationEdges } from '../src/drawing/circleSeparation';
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

type CircleSepDim = Extract<DrawingDimension, { kind: 'circle-separation' }>;

function makePlate(height = 10): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 50] },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

function makeTwoHolePlate(
  cA: [number, number] = [0, 0],
  rA = 4,
  cB: [number, number] = [30, 0],
  rB = 6,
): StudioDoc {
  let doc = makePlate(10);
  doc = withNode(doc, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: cA, radius: rA });
  doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: cB, radius: rB });
  return doc;
}

function makePartialArcPlate(): StudioDoc {
  let doc = rectanglePart(60, 40, 10);
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const verticalEdge = res.breps[0].edges.find(e => e.name?.includes('side0') && e.name?.includes('side1'))?.name ?? 'n1.side0|n1.side1';
  doc = withNode(doc, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [verticalEdge], radius: 8 });
  return doc;
}

function makeSteppedTwoDepthHoles(): StudioDoc {
  const doc: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 4,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 4 },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
      { id: 'n2', kind: 'sketch', profile: 'circle', center: [30, 0], radius: 6 },
      { id: 'n3', kind: 'extrude', sketch: 2, height: 20 },
    ],
    outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
  };
  return doc;
}

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'plate brep should build');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'plate views should project');
  return proj.views;
}

function findCircleNear(pr: BrepProjection, cx: number, cy: number, radius: number) {
  const edge = pr.edges.find(
    e => e.kind === 'circle'
      && e.circle
      && Math.abs(e.circle.radius - radius) < 1e-4
      && Math.hypot(e.circle.center[0] - cx, e.circle.center[1] - cy) < 1e-3
      && e.pieces.some(p => p.visible),
  );
  assert.ok(edge, `expected visible circle at (${cx}, ${cy}) r=${radius}`);
  return edge;
}

test('circle-separation measures exact min (20) and max (40) for C_A=(0,0) r=4, C_B=(30,0) r=6, diagonal (18,24), order-independent, updates on rB=8 (18/42)', () => {
  // Horizontal pair: C_A=(0,0) r=4, C_B=(30,0) r=6 -> d=30 -> min=20 at (4,0)/(24,0), max=40 at (-4,0)/(36,0)
  const doc0 = makeTwoHolePlate([0, 0], 4, [30, 0], 6);
  const views0 = projectDoc(doc0);
  const edgeA = findCircleNear(views0.top, 0, 0, 4);
  const edgeB = findCircleNear(views0.top, 30, 0, 6);
  const pA = pickCircleSeparationEdge(views0.top, edgeA, 'top');
  const pB = pickCircleSeparationEdge(views0.top, edgeB, 'top');
  assert.ok(pA.ok && pB.ok);

  const rMinAB = resolveCircleSeparationEdges(views0.top, pA.ref, pB.ref, 'min', 'top');
  const rMinBA = resolveCircleSeparationEdges(views0.top, pB.ref, pA.ref, 'min', 'top');
  assert.ok(rMinAB.ok && rMinBA.ok);
  assert.ok(Math.abs(rMinAB.geometry.value - 20) < 1e-9);
  assert.ok(Math.abs(rMinBA.geometry.value - 20) < 1e-9);
  assert.ok(Math.hypot(rMinAB.geometry.pointA[0] - 4, rMinAB.geometry.pointA[1] - 0) < 1e-6);
  assert.ok(Math.hypot(rMinAB.geometry.pointB[0] - 24, rMinAB.geometry.pointB[1] - 0) < 1e-6);

  const rMaxAB = resolveCircleSeparationEdges(views0.top, pA.ref, pB.ref, 'max', 'top');
  const rMaxBA = resolveCircleSeparationEdges(views0.top, pB.ref, pA.ref, 'max', 'top');
  assert.ok(rMaxAB.ok && rMaxBA.ok);
  assert.ok(Math.abs(rMaxAB.geometry.value - 40) < 1e-9);
  assert.ok(Math.abs(rMaxBA.geometry.value - 40) < 1e-9);
  assert.ok(Math.hypot(rMaxAB.geometry.pointA[0] - (-4), rMaxAB.geometry.pointA[1] - 0) < 1e-6);
  assert.ok(Math.hypot(rMaxAB.geometry.pointB[0] - 36, rMaxAB.geometry.pointB[1] - 0) < 1e-6);

  // Dragging placement above/below never flips min <-> max or alters value
  for (const place of [[15, 22], [15, -22], [0, 14]] as XY[]) {
    const dMin: CircleSepDim = { id: 'd1', view: 'top', kind: 'circle-separation', first: pA.ref, second: pB.ref, mode: 'min', place };
    const dMax: CircleSepDim = { id: 'd2', view: 'top', kind: 'circle-separation', first: pA.ref, second: pB.ref, mode: 'max', place };
    const rm = resolveDimension(views0, dMin);
    const rx = resolveDimension(views0, dMax);
    assert.ok(rm.ok && rm.kind === 'circle-separation' && rm.mode === 'min' && Math.abs(rm.value - 20) < 1e-9);
    assert.ok(rx.ok && rx.kind === 'circle-separation' && rx.mode === 'max' && Math.abs(rx.value - 40) < 1e-9);
  }

  // Edit rB: 6 -> 8 => min 20 -> 18, max 40 -> 42
  const docEdited = makeTwoHolePlate([0, 0], 4, [30, 0], 8);
  const viewsEdited = projectDoc(docEdited);
  const rMinEdit = resolveCircleSeparationEdges(viewsEdited.top, pA.ref, pB.ref, 'min', 'top');
  const rMaxEdit = resolveCircleSeparationEdges(viewsEdited.top, pA.ref, pB.ref, 'max', 'top');
  assert.ok(rMinEdit.ok && rMaxEdit.ok);
  assert.ok(Math.abs(rMinEdit.geometry.value - 18) < 1e-9);
  assert.ok(Math.abs(rMaxEdit.geometry.value - 42) < 1e-9);

  // Diagonal 3-4-5 pair: C_A=(0,0) r=4, C_B=(18,24) r=6 -> d=30 -> still min=20, max=40 along u=(0.6, 0.8)
  const docDiag = makeTwoHolePlate([0, 0], 4, [18, 24], 6);
  const viewsDiag = projectDoc(docDiag);
  const dA = pickCircleSeparationEdge(viewsDiag.top, findCircleNear(viewsDiag.top, 0, 0, 4), 'top');
  const dB = pickCircleSeparationEdge(viewsDiag.top, findCircleNear(viewsDiag.top, 18, 24, 6), 'top');
  assert.ok(dA.ok && dB.ok);
  const diagMin = resolveCircleSeparationEdges(viewsDiag.top, dA.ref, dB.ref, 'min', 'top');
  const diagMax = resolveCircleSeparationEdges(viewsDiag.top, dA.ref, dB.ref, 'max', 'top');
  assert.ok(diagMin.ok && diagMax.ok);
  assert.ok(Math.abs(diagMin.geometry.value - 20) < 1e-9);
  assert.ok(Math.abs(diagMax.geometry.value - 40) < 1e-9);
  assert.ok(Math.hypot(diagMin.geometry.pointA[0] - 2.4, diagMin.geometry.pointA[1] - 3.2) < 1e-6);
  assert.ok(Math.hypot(diagMin.geometry.pointB[0] - 14.4, diagMin.geometry.pointB[1] - 19.2) < 1e-6);
});

test('refusal suite: concentric, tangent, overlapping, partial arcs, depth-offset, broken views, deleted hole', () => {
  // 1. Same / concentric circles rejected
  const baseViews = projectDoc(makeTwoHolePlate([0, 0], 4, [30, 0], 6));
  const pA = pickCircleSeparationEdge(baseViews.top, findCircleNear(baseViews.top, 0, 0, 4), 'top');
  assert.ok(pA.ok);
  const sameRes = resolveCircleSeparationEdges(baseViews.top, pA.ref, pA.ref, 'min', 'top');
  assert.equal(sameRes.ok, false);

  // 2. Externally tangent (d = rA + rB = 10) rejected via synthetic circles
  const pB = pickCircleSeparationEdge(baseViews.top, findCircleNear(baseViews.top, 30, 0, 6), 'top');
  assert.ok(pB.ok);
  const shiftedViews = (cx: number): BrepProjection => ({
    ...baseViews.top,
    edges: baseViews.top.edges.map(e =>
      e.circle && Math.hypot(e.circle.center[0] - 30, e.circle.center[1]) < 1e-3
        ? { ...e, circle: { ...e.circle, center: [cx, 0, e.circle.center[2]] } }
        : e,
    ),
  });
  const tangentRes = resolveCircleSeparationEdges(shiftedViews(10), pA.ref, { ...pB.ref, near: [10, 0, pB.ref.near[2]] }, 'min', 'top');
  assert.equal(tangentRes.ok, false);
  assert.match(tangentRes.reason, /tangent/i);

  // 3. Overlapping (d = 8 < 10) rejected
  const overlapRes = resolveCircleSeparationEdges(shiftedViews(8), pA.ref, { ...pB.ref, near: [8, 0, pB.ref.near[2]] }, 'min', 'top');
  assert.equal(overlapRes.ok, false);
  assert.match(overlapRes.reason, /overlapping/i);

  // 4. Partial arc rejected
  const arcViews = projectDoc(makePartialArcPlate());
  const partialArc = arcViews.top.edges.find(e => e.kind === 'circle' && e.circle && !e.circle.full && e.circle.sweep < Math.PI);
  assert.ok(partialArc);
  assert.equal(pickCircleSeparationEdge(arcViews.top, partialArc, 'top').ok, false);

  // 5. Non-coplanar (different 3D Z heights z=10 vs z=20) rejected in top view
  const depthViews = projectDoc(makeSteppedTwoDepthHoles());
  const cZ10 = findCircleNear(depthViews.top, 0, 0, 4);
  const cZ20 = findCircleNear(depthViews.top, 30, 0, 6);
  const pdA = pickCircleSeparationEdge(depthViews.top, cZ10, 'top');
  const pdB = pickCircleSeparationEdge(depthViews.top, cZ20, 'top');
  assert.ok(pdA.ok && pdB.ok);
  const nonCoplanar = resolveCircleSeparationEdges(depthViews.top, pdA.ref, pdB.ref, 'min', 'top');
  assert.equal(nonCoplanar.ok, false);
  assert.match(nonCoplanar.reason, /same 3D plane/i);

  // 6. Broken view refused in buildSheet
  const dim: CircleSepDim = { id: 'd1', view: 'top', kind: 'circle-separation', first: pA.ref, second: pB.ref, mode: 'min', place: [15, 22] };
  const brokenSettings: DrawingSettings = { ...defaultDrawing(), breaks: [{ axis: 'x', from: 10, to: 20 }], dimensions: [dim] };
  const brokenLayout = layoutSheet(baseViews, brokenSettings);
  const brokenSheet = buildSheet(baseViews, brokenLayout, brokenSettings, { title: 'broken', date: '2026-11-25' });
  assert.equal(brokenSheet.dimensions[0].ok, false);
  assert.match(brokenSheet.dimensions[0].ok ? '' : brokenSheet.dimensions[0].reason, /broken view/i);

  // 7. Deleted second hole becomes unresolved (DIMENSION_LOST)
  const oneHoleViews = projectDoc(withNode(makePlate(10), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [0, 0], radius: 4 }));
  const lostSettings: DrawingSettings = { ...defaultDrawing(), dimensions: [dim] };
  const lostLayout = layoutSheet(oneHoleViews, lostSettings);
  const lostSheet = buildSheet(oneHoleViews, lostLayout, lostSettings, { title: 'lost', date: '2026-11-25' });
  assert.equal(lostSheet.dimensions[0].ok, false);
  const issues = drawingIssues({ views: oneHoleViews, layout: lostLayout, settings: lostSettings, sheet: lostSheet, callout: () => null });
  assert.ok(issues.some(i => i.code === 'DIMENSION_LOST' && i.dims?.includes('d1')));
});

test('scale, units, tolerances, SVG, DXF, PDF, 3D PMI, reorient, references, and readDrawing roundtrip', async () => {
  const doc0 = makeTwoHolePlate([0, 0], 4, [30, 0], 6);
  const views = projectDoc(doc0);
  const pA = pickCircleSeparationEdge(views.top, findCircleNear(views.top, 0, 0, 4), 'top');
  const pB = pickCircleSeparationEdge(views.top, findCircleNear(views.top, 30, 0, 6), 'top');
  assert.ok(pA.ok && pB.ok);

  const dimMin: CircleSepDim = { id: 'd1', view: 'top', kind: 'circle-separation', first: pA.ref, second: pB.ref, mode: 'min', place: [15, 22] };
  const dimMax: CircleSepDim = { id: 'd2', view: 'top', kind: 'circle-separation', first: pA.ref, second: pB.ref, mode: 'max', place: [15, -22] };

  // No top-level edge/near, strict readDrawing filtering
  assert.equal('edge' in dimMin, false);
  assert.equal('near' in dimMin, false);
  const read = readDrawing({
    ...defaultDrawing(),
    dimensions: [
      dimMin,
      dimMax,
      { ...dimMin, id: 'bad-mode', mode: 'center' },
      { ...dimMin, id: 'bad-iso', view: 'iso' },
      { ...dimMin, id: 'bad-auto', auto: true },
    ],
  });
  assert.equal(read.dimensions.length, 2);

  // Scales 1:1, 2:1, 1:2 preserve 20 and 40
  for (const scale of [1, 2, 0.5]) {
    const settings: DrawingSettings = { ...defaultDrawing(), scale, dimensions: [dimMin, dimMax] };
    const layout = layoutSheet(views, settings);
    const sheet = buildSheet(views, layout, settings, { title: 'gap', date: '2026-11-25' });
    assert.ok(sheet.dimensions[0].ok && sheet.dimensions[1].ok);
    assert.equal(sheet.dimensions[0].text, '20');
    assert.equal(sheet.dimensions[1].text, '40');
    const g1 = sheet.groups.find(g => g.role === 'dimension' && g.id === 'd1');
    assert.ok(g1 && g1.marks.some((m): m is Extract<Mark, { kind: 'text' }> => m.kind === 'text' && m.text === '20'));
  }

  // Inch + dual + tolerance
  const inchSettings: DrawingSettings = {
    ...defaultDrawing(),
    units: 'inch',
    dual: true,
    dimensions: [{ ...dimMin, tol: { kind: 'symmetric', value: 0.1 } }],
  };
  const inchLayout = layoutSheet(views, inchSettings);
  const inchSheet = buildSheet(views, inchLayout, inchSettings, { title: 'gap', date: '2026-11-25' });
  assert.ok(inchSheet.dimensions[0].ok);
  assert.match(inchSheet.dimensions[0].text, /0?\.787/);
  assert.equal(inchSheet.dimensions[0].alt, '20');

  // SVG, DXF (AC1015 & AC1009), PDF, 3D PMI, CSV refusal
  const baseSettings: DrawingSettings = { ...defaultDrawing(), dimensions: [dimMin, dimMax] };
  const layout = layoutSheet(views, baseSettings);
  const sheet = buildSheet(views, layout, baseSettings, { title: 'gap', date: '2026-11-25' });
  const svg = sheetSvg(sheet, 'gap');
  assert.match(svg, />20<\/text>/);
  assert.match(svg, />40<\/text>/);
  const dxf2000 = sheetDxf(sheet, layout, 'AC1015');
  assert.ok(dxf2000.text.includes('20') && dxf2000.text.includes('40'));
  const dxfDoc = sheetDxfDocument(sheet, layout, 'AC1015');
  assert.equal(dxfDoc.entities.some(e => e.type === 'dimension'), false);
  assert.ok(sheetDxf(sheet, layout, 'AC1009').text.length > 0);
  assert.equal(pdfMissing(sheet).length, 0);

  const pmi = modelAnnotations({ views, layout, settings: baseSettings, sheet });
  const ann1 = pmi.items.find(item => item.id === 'd1');
  const ann2 = pmi.items.find(item => item.id === 'd2');
  assert.ok(ann1 && ann2);
  assert.equal(ann1.dimension?.measure, 'circle-separation');
  assert.ok(Math.abs((ann1.dimension?.value ?? 0) - 20) < 1e-9);
  assert.ok(Math.abs((ann2.dimension?.value ?? 0) - 40) < 1e-9);

  // Dimension CSV refuses unsupported circle-separation cleanly
  assert.equal(currentSheetDimensionsCsv({ resolved: sheet.dimensions, settings: baseSettings, wholeSettings: baseSettings, sheetNumber: 1 }).ok, false);

  // Reorient y- -> x+ preserves exact 20 and 40
  const res = brepsFor(doc0);
  assert.ok('breps' in res);
  const viewsXPlus = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(viewsXPlus.ok);
  const turned = reorient(views, viewsXPlus.views, baseSettings, 'x+');
  assert.ok(turned.ok);
  const rTurnedMin = resolveDimension(viewsXPlus.views, turned.settings.dimensions[0]);
  const rTurnedMax = resolveDimension(viewsXPlus.views, turned.settings.dimensions[1]);
  assert.ok(rTurnedMin.ok && Math.abs(rTurnedMin.value - 20) < 1e-9);
  assert.ok(rTurnedMax.ok && Math.abs(rTurnedMax.value - 40) < 1e-9);

  // Reference signatures capture & verify cleanly
  const docWithDim: StudioDoc = { ...doc0, drawing: baseSettings };
  const evaluated = evaluateDoc(docWithDim, 1);
  assert.ok(evaluated.ok);
  const signed = captureSignatures(docWithDim, evaluated.bodies);
  const refs = referencesOf(signed, true).refs.filter(r => r.where === 'dimension d1');
  assert.equal(refs.length, 2);
  assert.ok(refs.every(r => r.edge && !!r.sig));
  const verified = await verifyReferences(signed, evaluated.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);
  assert.equal(verified.changes.length, 0);
});
