import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { pickCylinderSilhouette, resolveCylinderDiameter } from '../src/drawing/cylinderDiameter';
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

type CylinderDiameterDim = Extract<DrawingDimension, { kind: 'cylinder-diameter' }>;

function makeCylinderDoc(radius = 6, height = 30): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

function makeSteppedShaftDoc(r1 = 10, l1 = 15, r2 = 6, l2 = 15): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [r1, 0], [r1, l1], [r2, l1], [r2, l1 + l2], [0, l1 + l2]] },
      { id: 'n1', kind: 'revolve', sketch: 0, axis: 'y', angle: 360 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

function makeTaperedConeDoc(): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [12, 0], [6, 30], [0, 30]] },
      { id: 'n1', kind: 'revolve', sketch: 0, axis: 'y', angle: 360 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

function makeTiltedCylinderDoc(radius = 6, height = 30): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 3,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
      { id: 'n2', kind: 'rotate', parent: { node: 1, side: 'solid' }, axis: 'x', angle: 30 },
    ],
    outputs: { b2: { node: 2, side: 'solid' } },
  };
}

function makeOccludedCylinderDoc(): StudioDoc {
  return {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 4,
    nodes: [
      // Cylinder behind a large solid wall along -Y (front view looks from -Y toward +Y)
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 20], radius: 5 },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 15 },
      { id: 'n2', kind: 'sketch', profile: 'polygon', points: [[-20, -3], [20, -3], [20, 3], [-20, 3]] },
      { id: 'n3', kind: 'extrude', sketch: 2, height: 30 },
    ],
    outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
  };
}

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'part brep should build');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'views should project');
  return proj.views;
}

function findCylinderSilhouettes(pr: BrepProjection, radius?: number): ProjectedEdge[] {
  return pr.edges.filter(
    e => e.kind === 'silhouette'
      && !!e.cylinder
      && e.pieces.some(p => p.visible)
      && (radius === undefined || Math.abs(e.cylinder.radius - radius) < 1e-4),
  );
}

test('cylinder-diameter measures exact 2*r (Ø12), updates to Ø14 on radius 6→7, and is invariant to placement & chain order', () => {
  const doc6 = makeCylinderDoc(6, 30);
  const views6 = projectDoc(doc6);
  const sils = findCylinderSilhouettes(views6.front, 6);
  assert.ok(sils.length >= 1, 'front view should expose visible cylinder silhouettes');

  const picked = pickCylinderSilhouette(views6.front, sils[0], 'front');
  assert.ok(picked.ok);
  assert.ok(Math.abs(picked.radius - 6) < 1e-9);
  assert.ok(Math.abs(picked.diameter - 12) < 1e-9);

  // Moving placement inside, outside left, outside right, or past axial ends never changes Ø12.
  const places: XY[] = [[0, 15], [14, 15], [-14, 15], [0, -8], [0, 38]];
  for (const place of places) {
    const dim: CylinderDiameterDim = { id: 'd1', view: 'front', kind: 'cylinder-diameter', cylinder: picked.ref, place };
    const r = resolveDimension(views6, dim);
    assert.ok(r.ok && r.kind === 'cylinder-diameter');
    assert.ok(Math.abs(r.value - 12) < 1e-9);
    assert.equal(r.text, 'Ø12');
    const settings: DrawingSettings = { ...defaultDrawing(), dimensions: [dim] };
    const layout = layoutSheet(views6, settings);
    const sheet = buildSheet(views6, layout, settings, { title: 'shaft', date: '2026-11-25' });
    const group = sheet.groups.find(g => g.role === 'dimension' && g.id === 'd1');
    assert.ok(group);
    const texts = group.marks.filter((m): m is Extract<Mark, { kind: 'text' }> => m.kind === 'text');
    assert.ok(texts.some(t => t.text === 'Ø12'));
  }

  // Chain-order / display-edge-name independence: reverse silhouettes and swap ~sil0/~sil1 suffixes.
  const swappedFront: BrepProjection = {
    ...views6.front,
    edges: [...views6.front.edges].reverse().map((e, idx) =>
      e.kind === 'silhouette' ? { ...e, name: `${e.cylinder?.face ?? 's'}~sil${idx + 99}` } : e,
    ),
  };
  const rSwapped = resolveCylinderDiameter(swappedFront, picked.ref, 'front');
  assert.ok(rSwapped.ok);
  assert.ok(Math.abs(rSwapped.geometry.diameter - 12) < 1e-9);

  // Edit source radius 6 → 7 updates diameter cleanly to Ø14 with the same persisted CylinderFaceRef.
  const doc7 = makeCylinderDoc(7, 30);
  const views7 = projectDoc(doc7);
  const r7 = resolveDimension(views7, { id: 'd1', view: 'front', kind: 'cylinder-diameter', cylinder: picked.ref, place: [14, 15] });
  assert.ok(r7.ok && r7.kind === 'cylinder-diameter');
  assert.ok(Math.abs(r7.value - 14) < 1e-9);
  assert.equal(r7.text, 'Ø14');
});

test('stepped coaxial shafts resolve each cylindrical face diameter independently (Ø12 and Ø20)', () => {
  const doc = makeSteppedShaftDoc(10, 15, 6, 15);
  const views = projectDoc(doc);
  const smallSils = findCylinderSilhouettes(views.top, 6);
  const largeSils = findCylinderSilhouettes(views.top, 10);
  assert.ok(smallSils.length >= 1, 'should find R6 cylinder silhouette');
  assert.ok(largeSils.length >= 1, 'should find R10 cylinder silhouette');

  const pSmall = pickCylinderSilhouette(views.top, smallSils[0], 'top');
  const pLarge = pickCylinderSilhouette(views.top, largeSils[0], 'top');
  assert.ok(pSmall.ok && pLarge.ok);
  assert.notEqual(pSmall.ref.face, pLarge.ref.face);

  const rSmall = resolveCylinderDiameter(views.top, pSmall.ref, 'top');
  const rLarge = resolveCylinderDiameter(views.top, pLarge.ref, 'top');
  assert.ok(rSmall.ok && rLarge.ok);
  assert.ok(Math.abs(rSmall.geometry.diameter - 12) < 1e-9);
  assert.ok(Math.abs(rLarge.geometry.diameter - 20) < 1e-9);
});

test('refusal suite: boxes, cones, end-on circles, oblique cylinders, hidden silhouettes, broken views, deleted faces', () => {
  // 1. Box straight edges have no cylinder provenance
  const boxViews = projectDoc(rectanglePart(30, 20, 10));
  for (const edge of boxViews.front.edges) {
    assert.equal(edge.cylinder, undefined);
    assert.equal(pickCylinderSilhouette(boxViews.front, edge, 'front').ok, false);
  }

  // 2. Tapered cone silhouettes (revolved about Y → side view in top) have no cylinder provenance
  const coneViews = projectDoc(makeTaperedConeDoc());
  const coneSils = coneViews.top.edges.filter(e => e.kind === 'silhouette');
  assert.ok(coneSils.length > 0, 'cone should have silhouette edges');
  for (const sil of coneSils) {
    assert.equal(sil.cylinder, undefined);
    assert.equal(pickCylinderSilhouette(coneViews.top, sil, 'top').ok, false);
  }

  // 3. End-on view (top view of vertical cylinder) has no side silhouettes; circular rims are refused
  const cylViews = projectDoc(makeCylinderDoc(6, 30));
  assert.equal(findCylinderSilhouettes(cylViews.top).length, 0);
  const topCircle = cylViews.top.edges.find(e => e.kind === 'circle');
  assert.ok(topCircle);
  assert.equal(pickCylinderSilhouette(cylViews.top, topCircle, 'top').ok, false);

  // 4. Oblique cylinder (tilted 30° around X) is refused in front view (axis not perpendicular to view toward)
  const tiltedViews = projectDoc(makeTiltedCylinderDoc(6, 30));
  const tiltedSils = tiltedViews.front.edges.filter(e => e.kind === 'silhouette' && e.cylinder);
  assert.ok(tiltedSils.length > 0, 'tilted cylinder should project silhouettes with cylinder metadata');
  for (const sil of tiltedSils) {
    const res = pickCylinderSilhouette(tiltedViews.front, sil, 'front');
    assert.equal(res.ok, false);
  }

  // 5. Hidden-only silhouette (occluded cylinder behind wall) is refused
  const occludedViews = projectDoc(makeOccludedCylinderDoc());
  const hiddenSils = occludedViews.front.edges.filter(e => e.kind === 'silhouette' && e.cylinder && !e.pieces.some(p => p.visible));
  assert.ok(hiddenSils.length > 0, 'occluded cylinder should have hidden-only silhouettes');
  for (const sil of hiddenSils) {
    assert.equal(pickCylinderSilhouette(occludedViews.front, sil, 'front').ok, false);
  }

  // 6. Broken view is refused in buildSheet
  const frontSil = findCylinderSilhouettes(cylViews.front, 6)[0];
  const picked = pickCylinderSilhouette(cylViews.front, frontSil, 'front');
  assert.ok(picked.ok);
  const dim: CylinderDiameterDim = { id: 'd1', view: 'front', kind: 'cylinder-diameter', cylinder: picked.ref, place: [14, 15] };
  const brokenSettings: DrawingSettings = {
    ...defaultDrawing(),
    breaks: [{ axis: 'z', from: 10, to: 20 }],
    dimensions: [dim],
  };
  const brokenLayout = layoutSheet(cylViews, brokenSettings);
  const brokenSheet = buildSheet(cylViews, brokenLayout, brokenSettings, { title: 'broken', date: '2026-11-25' });
  assert.equal(brokenSheet.dimensions[0].ok, false);
  assert.match(brokenSheet.dimensions[0].ok ? '' : brokenSheet.dimensions[0].reason, /broken view/i);

  // 7. Deleted/replaced cylinder becomes unresolved (DIMENSION_LOST), never retargeted to a box
  const rLost = resolveDimension(boxViews, dim);
  assert.equal(rLost.ok, false);
  const lostSettings: DrawingSettings = { ...defaultDrawing(), dimensions: [dim] };
  const lostLayout = layoutSheet(boxViews, lostSettings);
  const lostSheet = buildSheet(boxViews, lostLayout, lostSettings, { title: 'lost', date: '2026-11-25' });
  const issues = drawingIssues({ views: boxViews, layout: lostLayout, settings: lostSettings, sheet: lostSheet, callout: () => null });
  assert.ok(issues.some(i => i.code === 'DIMENSION_LOST' && i.dims?.includes('d1')));

  // 8. Non-orthographic view refused
  assert.equal(pickCylinderSilhouette(cylViews.iso, frontSil, 'iso').ok, false);
  assert.equal(resolveCylinderDiameter(cylViews.front, picked.ref, 'section:A').ok, false);
  assert.equal(resolveCylinderDiameter(cylViews.front, picked.ref, 'detail:B').ok, false);
});

test('scale, units, tolerances, SVG, DXF, PDF, 3D PMI, reorient, references, and readDrawing roundtrip', async () => {
  const doc0 = makeCylinderDoc(6, 30);
  const views = projectDoc(doc0);
  const sil = findCylinderSilhouettes(views.front, 6)[0];
  const picked = pickCylinderSilhouette(views.front, sil, 'front');
  assert.ok(picked.ok);

  const dim: CylinderDiameterDim = {
    id: 'd1',
    view: 'front',
    kind: 'cylinder-diameter',
    cylinder: picked.ref,
    place: [14, 15],
  };

  // Strict schema: no top-level edge/near, readDrawing validates strictly
  assert.equal('edge' in dim, false);
  assert.equal('near' in dim, false);
  const roundTripped = readDrawing({
    ...defaultDrawing(),
    dimensions: [
      dim,
      { ...dim, id: 'bad-iso', view: 'iso' },
      { ...dim, id: 'bad-auto', auto: true },
      { ...dim, id: 'bad-ref', cylinder: { face: '', near: [0, 0, 0] } },
    ],
  });
  assert.equal(roundTripped.dimensions.length, 1);
  assert.equal(roundTripped.dimensions[0].id, 'd1');

  // Scales 1:1, 2:1, 1:2 preserve Ø12
  for (const scale of [1, 2, 0.5]) {
    const settings: DrawingSettings = { ...defaultDrawing(), scale, dimensions: [dim] };
    const layout = layoutSheet(views, settings);
    const sheet = buildSheet(views, layout, settings, { title: 'shaft', date: '2026-11-25' });
    assert.ok(sheet.dimensions[0].ok);
    assert.equal(sheet.dimensions[0].text, 'Ø12');
  }

  // Inch + dual + symmetric tolerance + count + basic
  const inchSettings: DrawingSettings = {
    ...defaultDrawing(),
    units: 'inch',
    dual: true,
    dimensions: [{ ...dim, tol: { kind: 'symmetric', value: 0.05 }, count: 2, basic: true }],
  };
  const inchLayout = layoutSheet(views, inchSettings);
  const inchSheet = buildSheet(views, inchLayout, inchSettings, { title: 'shaft', date: '2026-11-25' });
  assert.ok(inchSheet.dimensions[0].ok);
  assert.match(inchSheet.dimensions[0].text, /2× Ø0?\.472/);
  assert.equal(inchSheet.dimensions[0].alt, '2× Ø12');

  // SVG, DXF (AC1015 & AC1009), PDF, 3D PMI, CSV refusal
  const baseSettings: DrawingSettings = { ...defaultDrawing(), dimensions: [dim] };
  const layout = layoutSheet(views, baseSettings);
  const sheet = buildSheet(views, layout, baseSettings, { title: 'shaft', date: '2026-11-25' });
  const svg = sheetSvg(sheet, 'shaft');
  assert.match(svg, /Ø12/);
  const dxf2000 = sheetDxf(sheet, layout, 'AC1015');
  assert.ok(dxf2000.text.includes('Ø12') || dxf2000.text.includes('%%c12'));
  const dxfDoc = sheetDxfDocument(sheet, layout, 'AC1015');
  assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text.includes('12')));
  const dxfR12 = sheetDxf(sheet, layout, 'AC1009');
  assert.ok(dxfR12.text.length > 0);
  assert.equal(pdfMissing(sheet).length, 0);

  const pmi = modelAnnotations({ views, layout, settings: baseSettings, sheet });
  const ann = pmi.items.find(item => item.id === 'd1');
  assert.ok(ann);
  assert.equal(ann.dimension?.measure, 'cylinder-diameter');
  assert.ok(Math.abs((ann.dimension?.value ?? 0) - 12) < 1e-9);
  assert.equal(ann.targets[0]?.face, picked.ref.face);

  // Dimension CSV refuses unsupported cylinder-diameter kind cleanly
  const csv = currentSheetDimensionsCsv({ resolved: sheet.dimensions, settings: baseSettings, wholeSettings: baseSettings, sheetNumber: 1 });
  assert.equal(csv.ok, false);

  // Reorient y- → x+ maps front → right and preserves exact Ø12
  const res = brepsFor(doc0);
  assert.ok('breps' in res);
  const viewsXPlus = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(viewsXPlus.ok);
  const turned = reorient(views, viewsXPlus.views, baseSettings, 'x+');
  assert.ok(turned.ok);
  const turnedDim = turned.settings.dimensions[0];
  assert.equal(turnedDim.kind, 'cylinder-diameter');
  const resolvedTurned = resolveDimension(viewsXPlus.views, turnedDim);
  assert.ok(resolvedTurned.ok && Math.abs(resolvedTurned.value - 12) < 1e-9);

  // Reference signatures: capture + verify on reopen produces zero problems & zero spurious rematches
  const docWithDim: StudioDoc = { ...doc0, drawing: baseSettings };
  const evaluated = evaluateDoc(docWithDim, 1);
  assert.ok(evaluated.ok);
  const signed = captureSignatures(docWithDim, evaluated.bodies);
  const refs = referencesOf(signed, true).refs;
  const cylRef = refs.find(r => r.where === 'dimension d1');
  assert.ok(cylRef);
  assert.equal(cylRef.edge, false);
  assert.ok(cylRef.sig);
  const verified = await verifyReferences(signed, evaluated.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);
  assert.equal(verified.changes.length, 0);
});
