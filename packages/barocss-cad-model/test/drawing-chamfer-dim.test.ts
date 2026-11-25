import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { referencesOf } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { pickChamferLineEdge, resolveChamferEdges } from '../src/drawing/chamferDim';
import { resolveDimension } from '../src/drawing/dimensions';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet, type Mark } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings } from '../src/drawing/types';
import { drawingIssues } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { pdfMissing } from '../src/io/pdf';
import { modelAnnotations } from '../src/drawing/annotations3d';
import { currentSheetDimensionsCsv } from '../src/drawing/currentSheetDimensionsCsv';

type ChamferDim = Extract<DrawingDimension, { kind: 'chamfer' }>;

function makeChamferPlate(distance = 2, withFillet = false): {
  doc: StudioDoc;
  views: NonNullable<Extract<ReturnType<typeof projectViews>, { ok: true }>['views']>;
} {
  let doc: StudioDoc = rectanglePart(20, 10, 6);
  doc = withNode(doc, { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], distance });
  if (withFillet) {
    doc = withNode(doc, { kind: 'fillet', parent: { node: 2, side: 'solid' }, edges: ['n1.side0|n1.side3'], radius: 2 });
  }
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'chamfer plate brep should build');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'chamfer plate views should project');
  return { doc, views: proj.views };
}

function findTopEdgeNear(
  pr: BrepProjection,
  x: number,
  y: number,
) {
  const edge = pr.edges.find(e => {
    if (e.kind !== 'line' || !e.ends || !e.pieces.some(p => p.visible)) return false;
    const mx = (e.ends[0][0] + e.ends[1][0]) / 2;
    const my = (e.ends[0][1] + e.ends[1][1]) / 2;
    return Math.hypot(mx - x, my - y) < 0.2;
  });
  assert.ok(edge, `expected visible top line edge near (${x}, ${y})`);
  return edge;
}

function makeSyntheticAngleProjection(angleDeg: number, depthOffsetZ = 0, obliqueZ = 0): BrepProjection {
  // Right-angle corner at (20, 10, 6) cut with leg along top = 2 and leg along right = 2 * tan(angleDeg)
  const rad = angleDeg * Math.PI / 180;
  const legX = 2;
  const legY = 2 * Math.tan(rad);
  const shared: [number, number, number] = [20 - legX, 10, 6];
  const opp: [number, number, number] = [20, 10 - legY, 6 + obliqueZ];
  const topFar: [number, number, number] = [0, 10, 6 + depthOffsetZ];
  const topNear: [number, number, number] = [20 - legX, 10, 6 + depthOffsetZ];
  const rightFar: [number, number, number] = [20, 0, 6];
  return {
    right: [1, 0, 0],
    up: [0, 1, 0],
    toward: [0, 0, 1],
    min: [0, 0],
    max: [20, 10],
    edges: [
      {
        name: 'bevel',
        kind: 'line',
        ends: [shared, opp],
        circle: null,
        pieces: [{ visible: true, curve: { kind: 'line', a: [shared[0], shared[1]], b: [opp[0], opp[1]] } }],
      },
      {
        name: 'topWall',
        kind: 'line',
        ends: [topFar, topNear],
        circle: null,
        pieces: [{ visible: true, curve: { kind: 'line', a: [topFar[0], topFar[1]], b: [topNear[0], topNear[1]] } }],
      },
      {
        name: 'rightWall',
        kind: 'line',
        ends: [opp, rightFar],
        circle: null,
        pieces: [{ visible: true, curve: { kind: 'line', a: [opp[0], opp[1]], b: [rightFar[0], rightFar[1]] } }],
      },
    ],
  };
}

test('45° chamfer dimension measures exact setback (2 × 45°, not 2√2) and updates 2 → 3 mm on source edit', () => {
  const plate2 = makeChamferPlate(2);
  // Top view of 20×10 plate with 2 mm chamfer at (20, 10): bevel runs (18, 10) -> (20, 8), midpoint (19, 9)
  const bevelEdge = findTopEdgeNear(plate2.views.top, 19, 9);
  const topWallEdge = findTopEdgeNear(plate2.views.top, 9, 10);
  const bevelPick = pickChamferLineEdge(plate2.views.top, bevelEdge, 'top');
  const wallPick = pickChamferLineEdge(plate2.views.top, topWallEdge, 'top');
  assert.ok(bevelPick.ok && wallPick.ok);

  const resolvedGeom = resolveChamferEdges(plate2.views.top, bevelPick.ref, wallPick.ref, 'top');
  assert.ok(resolvedGeom.ok, resolvedGeom.ok ? '' : resolvedGeom.reason);
  assert.ok(Math.abs(resolvedGeom.geometry.setback - 2) < 1e-6);
  assert.ok(Math.abs(resolvedGeom.geometry.setback - 2 * Math.SQRT2) > 0.8);
  assert.ok(Math.abs(resolvedGeom.geometry.angleDeg - 45) < 1e-6);
  assert.ok(Math.hypot(resolvedGeom.geometry.midpoint[0] - 19, resolvedGeom.geometry.midpoint[1] - 9) < 1e-6);

  const dim: ChamferDim = {
    id: 'd1',
    view: 'top',
    kind: 'chamfer',
    chamfer: bevelPick.ref,
    adjacent: wallPick.ref,
    place: [26, 15],
  };
  // Old-reader safety: no top-level edge/near/a/b
  assert.equal('edge' in dim, false);
  assert.equal('near' in dim, false);
  assert.equal('a' in dim, false);

  const settings2: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const layout2 = layoutSheet(plate2.views, settings2);
  const sheet2 = buildSheet(plate2.views, layout2, settings2, { title: 'Chamfer 2', date: '2026-11-25' });
  const r2 = sheet2.dimensions[0];
  assert.ok(r2.ok && r2.kind === 'chamfer');
  assert.ok(Math.abs(r2.value - 2) < 1e-6);
  assert.equal(r2.text, '2 × 45°');
  assert.deepEqual(pdfMissing(sheet2), []);

  // Moving label placement never changes setback or bevel midpoint
  const movedSettings: DrawingSettings = { ...settings2, dimensions: [{ ...dim, place: [32, 4] }] };
  const movedSheet = buildSheet(plate2.views, layoutSheet(plate2.views, movedSettings), movedSettings, { title: 'Moved', date: '2026-11-25' });
  const rMoved = movedSheet.dimensions[0];
  assert.ok(rMoved.ok && rMoved.kind === 'chamfer');
  assert.equal(rMoved.text, '2 × 45°');
  assert.ok(Math.hypot(rMoved.midpoint[0] - 19, rMoved.midpoint[1] - 9) < 1e-6);

  // Source edit: setback 2 -> 3 mm updates bevel to (17, 10) -> (20, 7), midpoint (18.5, 8.5), text 3 × 45°
  const plate3 = makeChamferPlate(3);
  const layout3 = layoutSheet(plate3.views, settings2);
  const sheet3 = buildSheet(plate3.views, layout3, settings2, { title: 'Chamfer 3', date: '2026-11-25' });
  const r3 = sheet3.dimensions[0];
  assert.ok(r3.ok && r3.kind === 'chamfer');
  assert.ok(Math.abs(r3.value - 3) < 1e-6);
  assert.equal(r3.text, '3 × 45°');
  assert.ok(Math.hypot(r3.midpoint[0] - 18.5, r3.midpoint[1] - 8.5) < 1e-6);
});

test('chamfer converts length only in inch/dual/precision while keeping 45°, and exports cleanly to SVG, DXF, 3D PMI, reorient, and referencesOf', () => {
  const plate = makeChamferPlate(2);
  const bevelEdge = findTopEdgeNear(plate.views.top, 19, 9);
  const topWallEdge = findTopEdgeNear(plate.views.top, 9, 10);
  const bevelPick = pickChamferLineEdge(plate.views.top, bevelEdge, 'top');
  const wallPick = pickChamferLineEdge(plate.views.top, topWallEdge, 'top');
  assert.ok(bevelPick.ok && wallPick.ok);

  const dim: ChamferDim = { id: 'd1', view: 'top', kind: 'chamfer', chamfer: bevelPick.ref, adjacent: wallPick.ref, place: [26, 15] };

  // Inch: 2 / 25.4 = 0.078740157... -> .079 × 45° (45° NEVER converted!)
  const inchSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, units: 'inch', dimensions: [dim] };
  const inchSheet = buildSheet(plate.views, layoutSheet(plate.views, inchSettings), inchSettings, { title: 'Inch', date: '2026-11-25' });
  const rInch = inchSheet.dimensions[0];
  assert.ok(rInch.ok && rInch.kind === 'chamfer');
  assert.equal(rInch.text, '.079 × 45°');

  // Dual + custom precision (mm: 3, inch: 4) + scale 1:2
  const dualSettings: DrawingSettings = { ...defaultDrawing(), scale: 0.5, dual: true, precision: { mm: 3, inch: 4 }, dimensions: [dim] };
  const dualSheet = buildSheet(plate.views, layoutSheet(plate.views, dualSettings), dualSettings, { title: 'Dual', date: '2026-11-25' });
  const rDual = dualSheet.dimensions[0];
  assert.ok(rDual.ok && rDual.kind === 'chamfer');
  assert.equal(rDual.text, '2.000 × 45°');
  assert.equal(rDual.alt, '.0787 × 45°');

  // Plain mm SVG, DXF (2000 & R12), and 3D PMI
  const plainSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const plainLayout = layoutSheet(plate.views, plainSettings);
  const plainSheet = buildSheet(plate.views, plainLayout, plainSettings, { title: 'Plain', date: '2026-11-25' });
  const svg = sheetSvg(plainSheet, 'Plain');
  assert.match(svg, /<text[^>]*>2 × 45°<\/text>/);
  const grp = plainSheet.groups.find(g => g.role === 'dimension' && g.id === 'd1');
  assert.ok(grp);
  const head = grp.marks.find((m): m is Extract<Mark, { kind: 'fill' }> => m.kind === 'fill' && !!m.head);
  assert.ok(head);

  for (const version of ['AC1015', 'AC1009'] as const) {
    const dxfDoc = sheetDxfDocument(plainSheet, plainLayout, version);
    assert.equal(dxfDoc.entities.some(e => e.type === 'dimension'), false);
    assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text === '2 × 45°'));
    assert.ok(sheetDxf(plainSheet, plainLayout, version).text.includes('2 × 45'));
  }

  const pmi = modelAnnotations({ views: plate.views, layout: plainLayout, settings: plainSettings, sheet: plainSheet });
  const item = pmi.items.find(i => i.id === 'd1');
  assert.ok(item);
  assert.equal(item.dimension?.measure, 'chamfer');
  assert.equal(item.dimension?.unit, 'mm');
  assert.ok(Math.abs((item.dimension?.value ?? 0) - 2) < 1e-6);
  assert.equal(item.targets.length, 2);

  // Reorient y- -> x+ preserves 2 × 45°
  const res = brepsFor(plate.doc);
  assert.ok('breps' in res);
  const turnedProj = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(turnedProj.ok);
  const turned = reorient(plate.views, turnedProj.views, plainSettings, 'x+');
  assert.ok(turned.ok, turned.ok ? '' : turned.message);
  const rTurned = resolveDimension(turnedProj.views, turned.settings.dimensions[0]);
  assert.ok(rTurned.ok && rTurned.kind === 'chamfer');
  assert.ok(Math.abs(rTurned.value - 2) < 1e-6);

  // referencesOf deep-copies chamfer & adjacent without mutating source doc
  const docWithDim: StudioDoc = { ...plate.doc, drawing: plainSettings };
  const { doc: copied, refs } = referencesOf(docWithDim);
  const dimRefs = refs.filter(x => x.where === 'dimension d1');
  assert.equal(dimRefs.length, 2);
  dimRefs[0].rename('renamed.bevel', true);
  assert.equal((docWithDim.drawing!.dimensions[0] as ChamferDim).chamfer.edge, bevelPick.ref.edge);
  assert.equal((copied.drawing!.dimensions[0] as ChamferDim).chamfer.edge, 'renamed.bevel');

  // Dimension CSV refuses chamfer explicitly
  const csvRes = currentSheetDimensionsCsv({ resolved: plainSheet.dimensions, settings: plainSettings, wholeSettings: plainSettings, sheetNumber: 1 });
  assert.equal(csvRes.ok, false);
});

test('chamfer strictly rejects 44.96°, 30°, 60°, depth-offset crossings, oblique edges, fillets, non-touching edges, unsupported options, and broken/deleted state', () => {
  // 44.96° must NOT be rounded to 45° and accepted!
  for (const badAngle of [44.96, 45.04, 30, 60]) {
    const pr = makeSyntheticAngleProjection(badAngle);
    const res = resolveChamferEdges(pr, { edge: 'bevel', near: [19, 9, 6] }, { edge: 'topWall', near: [9, 10, 6] }, 'top');
    assert.equal(res.ok, false, `angle ${badAngle}° must be rejected`);
    assert.match(res.reason, /45°/);
  }

  // Exact 45° synthetic control passes
  const pr45 = makeSyntheticAngleProjection(45);
  const ok45 = resolveChamferEdges(pr45, { edge: 'bevel', near: [19, 9, 6] }, { edge: 'topWall', near: [9, 10, 6] }, 'top');
  assert.ok(ok45.ok);
  assert.ok(Math.abs(ok45.geometry.setback - 2) < 1e-6);

  // Screen-overlapping lines at different 3D depths (z = 6 vs z = 2) rejected
  const prDepth = makeSyntheticAngleProjection(45, -4, 0);
  const resDepth = resolveChamferEdges(prDepth, { edge: 'bevel', near: [19, 9, 6] }, { edge: 'topWall', near: [9, 10, 2] }, 'top');
  assert.equal(resDepth.ok, false);
  assert.match(resDepth.reason, /3D corner vertex/i);

  // Oblique / foreshortened bevel (z varies along bevel) rejected
  const prOblique = makeSyntheticAngleProjection(45, 0, 2);
  const resOblique = resolveChamferEdges(prOblique, { edge: 'bevel', near: [19, 9, 7] }, { edge: 'topWall', near: [9, 10, 6] }, 'top');
  assert.equal(resOblique.ok, false);
  assert.match(resOblique.reason, /true shape/i);

  // Non-touching edges and fillet arc rejected on real plate
  const plate = makeChamferPlate(2, true);
  const bevelEdge = findTopEdgeNear(plate.views.top, 19, 9);
  const bottomWallEdge = findTopEdgeNear(plate.views.top, 11, 0);
  const bevelPick = pickChamferLineEdge(plate.views.top, bevelEdge, 'top');
  const bottomPick = pickChamferLineEdge(plate.views.top, bottomWallEdge, 'top');
  assert.ok(bevelPick.ok && bottomPick.ok);
  const nonTouch = resolveChamferEdges(plate.views.top, bevelPick.ref, bottomPick.ref, 'top');
  assert.equal(nonTouch.ok, false);

  const filletArc = plate.views.top.edges.find(e => e.kind === 'circle' && e.pieces.some(p => p.visible));
  assert.ok(filletArc);
  const filletPick = pickChamferLineEdge(plate.views.top, filletArc, 'top');
  assert.equal(filletPick.ok, false);

  // Unsupported tol/basic/count/auto stripped on readDrawing and rejected in resolveDimension
  const topWallEdge = findTopEdgeNear(plate.views.top, 9, 10);
  const wallPick = pickChamferLineEdge(plate.views.top, topWallEdge, 'top');
  assert.ok(wallPick.ok);
  const badTolDim: DrawingDimension = {
    id: 'd-tol',
    view: 'top',
    kind: 'chamfer',
    chamfer: bevelPick.ref,
    adjacent: wallPick.ref,
    place: [26, 15],
    tol: { kind: 'symmetric', value: 0.1 },
  };
  const tolResolved = resolveDimension(plate.views, badTolDim);
  assert.equal(tolResolved.ok, false);
  const cleaned = readDrawing({ ...defaultDrawing(), dimensions: [badTolDim] });
  assert.equal(cleaned.dimensions.length, 1);
  assert.equal(cleaned.dimensions[0].tol, undefined);

  // Iso/section/detail and broken view rejected
  for (const badView of ['iso', 'section:A', 'detail:B'] as const) {
    const res = resolveChamferEdges(plate.views.top, bevelPick.ref, wallPick.ref, badView);
    assert.equal(res.ok, false);
  }
  const validDim: ChamferDim = { id: 'd1', view: 'top', kind: 'chamfer', chamfer: bevelPick.ref, adjacent: wallPick.ref, place: [26, 15] };
  const brokenSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, breaks: [{ axis: 'x', from: 6, to: 12 }], dimensions: [validDim] };
  const brokenSheet = buildSheet(plate.views, layoutSheet(plate.views, brokenSettings), brokenSettings, { title: 'Broken', date: '2026-11-25' });
  assert.equal(brokenSheet.dimensions[0].ok, false);
  assert.match(brokenSheet.dimensions[0].reason, /broken view/i);

  // Deleted chamfer reports DIMENSION_LOST cleanly
  const unchamfered = rectanglePart(20, 10, 6);
  const uRes = brepsFor(unchamfered);
  assert.ok('breps' in uRes);
  const uProj = projectViews(uRes.breps, uRes.prefixes);
  assert.ok(uProj.ok);
  const lostSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [validDim] };
  const lostLayout = layoutSheet(uProj.views, lostSettings);
  const lostSheet = buildSheet(uProj.views, lostLayout, lostSettings, { title: 'Lost', date: '2026-11-25' });
  assert.equal(lostSheet.dimensions[0].ok, false);
  const issues = drawingIssues({ views: uProj.views, layout: lostLayout, sheet: lostSheet, settings: lostSettings, callout: () => null });
  assert.ok(issues.some(i => i.code === 'DIMENSION_LOST' && i.dims?.includes('d1')));
});
