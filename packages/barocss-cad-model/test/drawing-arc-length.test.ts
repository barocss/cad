import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { referencesOf } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { pickArcLengthEdge, resolveArcLengthEdge } from '../src/drawing/arcLength';
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

type ArcLengthDim = Extract<DrawingDimension, { kind: 'arc-length' }>;

function makeFilletPlate(radius = 10, withHole = true): { doc: StudioDoc; views: NonNullable<Extract<ReturnType<typeof projectViews>, { ok: true }>['views']> } {
  let doc: StudioDoc = rectanglePart(50, 30, 10);
  doc = withNode(doc, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], radius });
  if (withHole) {
    doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [15, 15], radius: 5 });
  }
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'fillet plate brep should build');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'fillet plate views should project');
  return { doc, views: proj.views };
}

function makeMajorArcPart(radius = 10): { doc: StudioDoc; views: NonNullable<Extract<ReturnType<typeof projectViews>, { ok: true }>['views']> } {
  // 270-degree circular sector (Pac-Man) extruded along Z: exact major arc sweep = 3*pi/2.
  const doc: StudioDoc = {
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
          { kind: 'arc', start: [radius, 0], center: [0, 0], direction: 'ccw' },
          { kind: 'line', start: [0, -radius] },
          { kind: 'line', start: [0, 0] },
        ],
      },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'major arc brep should build');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'major arc views should project');
  return { doc, views: proj.views };
}

function makeSyntheticMajorArcViews(radius = 10): NonNullable<Extract<ReturnType<typeof projectViews>, { ok: true }>['views']> {
  // Exact 270° (3π/2) single circular arc edge in Top view (sweep > π)
  const sweep = 1.5 * Math.PI;
  const top: BrepProjection = {
    right: [1, 0, 0],
    up: [0, 1, 0],
    toward: [0, 0, 1],
    min: [-radius, -radius],
    max: [radius, radius],
    edges: [
      {
        name: 'major.arc',
        kind: 'circle',
        ends: [[radius, 0, 8], [0, -radius, 8]],
        circle: { center: [0, 0, 8], radius, normal: [0, 0, 1], full: false, sweep },
        pieces: [
          {
            visible: true,
            curve: { kind: 'arc', center: [0, 0], u: [radius, 0], v: [0, radius], t0: 0, t1: sweep },
          },
        ],
      },
    ],
  };
  const empty = (right: [number, number, number], up: [number, number, number], toward: [number, number, number]): BrepProjection => ({
    right, up, toward, min: [-radius, 0], max: [radius, 8], edges: [],
  });
  return {
    top,
    front: empty([1, 0, 0], [0, 0, 1], [0, -1, 0]),
    right: empty([0, 1, 0], [0, 0, 1], [1, 0, 0]),
    iso: empty([0.7071, 0.7071, 0], [-0.4082, 0.4082, 0.8165], [0.5774, -0.5774, 0.5774]),
  };
}

function findPartialArcEdge(views: ReturnType<typeof makeFilletPlate>['views'], view: 'top' | 'front' | 'right' = 'top') {
  const edge = views[view].edges.find(e => e.kind === 'circle' && e.circle && !e.circle.full && e.pieces.some(p => p.visible) && pickArcLengthEdge(views[view], e, view).ok);
  assert.ok(edge, `expected visible partial circular arc edge in ${view} view`);
  return edge;
}

test('arc-length measures exact L = r * sweep for minor (90°) and major (270°) arcs, distinct from chord and radius', () => {
  const plate = makeFilletPlate(10);
  const filletEdge = findPartialArcEdge(plate.views, 'top');
  const picked = pickArcLengthEdge(plate.views.top, filletEdge, 'top');
  assert.ok(picked.ok, picked.ok ? '' : picked.reason);

  const expectedMinor = 10 * (Math.PI / 2); // 15.707963...
  const chord = 10 * Math.SQRT2; // 14.142135...
  assert.ok(Math.abs(picked.geometry.value - expectedMinor) < 1e-6);
  assert.ok(Math.abs(picked.geometry.value - chord) > 1.5);
  assert.ok(Math.abs(picked.geometry.value - 10) > 5);

  const dim: ArcLengthDim = { id: 'd1', view: 'top', kind: 'arc-length', arc: picked.ref, place: [58, 38] };
  // Old-reader safety: no top-level edge/near so older readers never misread as radius.
  assert.equal('edge' in dim, false);
  assert.equal('near' in dim, false);

  const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const layout = layoutSheet(plate.views, settings);
  const sheet = buildSheet(plate.views, layout, settings, { title: 'Fillet Plate', date: '2026-11-25' });
  const r = sheet.dimensions[0];
  assert.ok(r.ok && r.kind === 'arc-length');
  assert.ok(Math.abs(r.value - expectedMinor) < 1e-6);
  assert.equal(r.text, 'ARC 15.71');
  assert.deepEqual(pdfMissing(sheet), []);

  // Real B-rep 135° arc (> 90°) from extruded 270° sketch loop (kernel splits >180° cylinder into two 135° halves)
  const majorBrep = makeMajorArcPart(10);
  const brepArcEdge = findPartialArcEdge(majorBrep.views, 'top');
  const brepArcPick = pickArcLengthEdge(majorBrep.views.top, brepArcEdge, 'top');
  assert.ok(brepArcPick.ok, brepArcPick.ok ? '' : brepArcPick.reason);
  assert.ok(Math.abs(brepArcPick.geometry.sweep - 0.75 * Math.PI) < 1e-6);
  assert.ok(Math.abs(brepArcPick.geometry.value - 10 * 0.75 * Math.PI) < 1e-6);

  // Exact single-edge major arc (270° = 3π/2, R = 10 → L = 15π ≈ 47.12389)
  const majorViews = makeSyntheticMajorArcViews(10);
  const majorEdge = majorViews.top.edges[0];
  const majorPick = pickArcLengthEdge(majorViews.top, majorEdge, 'top');
  assert.ok(majorPick.ok, majorPick.ok ? '' : majorPick.reason);
  const expectedMajor = 10 * (1.5 * Math.PI);
  assert.ok(Math.abs(majorPick.geometry.sweep - 1.5 * Math.PI) < 1e-6);
  assert.ok(Math.abs(majorPick.geometry.value - expectedMajor) < 1e-6);

  const majorDim: ArcLengthDim = { id: 'd2', view: 'top', kind: 'arc-length', arc: majorPick.ref, place: [-20, 20] };
  const majorSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [majorDim] };
  const majorLayout = layoutSheet(majorViews, majorSettings);
  const majorSheet = buildSheet(majorViews, majorLayout, majorSettings, { title: 'Major Arc', date: '2026-11-25' });
  const rMajor = majorSheet.dimensions[0];
  assert.ok(rMajor.ok && rMajor.kind === 'arc-length');
  assert.equal(rMajor.text, 'ARC 47.12');
  // SVG major arc must use large-arc-flag = 1
  const svgMajor = sheetSvg(majorSheet, 'Major Arc');
  const dimGroupMatch = svgMajor.match(/<g class="dimension"[^>]*data-dim="d2"[^>]*>([\s\S]*?)<\/g>/);
  assert.ok(dimGroupMatch);
  assert.match(dimGroupMatch[1], /A[\d.]+ [\d.]+ [-\d.]+ 1 [01]/, 'major arc dimension should set SVG large-arc-flag=1');
});

test('arc-length updates on source radius edit and dragging place never flips to conjugate arc', () => {
  const plate10 = makeFilletPlate(10);
  const edge10 = findPartialArcEdge(plate10.views, 'top');
  const picked = pickArcLengthEdge(plate10.views.top, edge10, 'top');
  assert.ok(picked.ok);

  // Drag placement to multiple quadrants including directly opposite the arc across the center
  const baseDim: ArcLengthDim = { id: 'd1', view: 'top', kind: 'arc-length', arc: picked.ref, place: [58, 38] };
  const testPlaces: XY[] = [
    [58, 38], // outside arc midpoint
    [45, 25], // inside arc
    [20, 5],  // opposite quadrant across circle center (40, 20)
    [40, 20], // directly on circle center
  ];
  for (const place of testPlaces) {
    const dim: ArcLengthDim = { ...baseDim, place };
    const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
    const layout = layoutSheet(plate10.views, settings);
    const sheet = buildSheet(plate10.views, layout, settings, { title: 'Drag Test', date: '2026-11-25' });
    const r = sheet.dimensions[0];
    assert.ok(r.ok && r.kind === 'arc-length');
    assert.ok(Math.abs(r.value - 5 * Math.PI) < 1e-6, `place ${place} must never flip to conjugate arc`);
    assert.ok(Math.abs(r.sweep - Math.PI / 2) < 1e-6);
    assert.equal(r.text, 'ARC 15.71');
    const grp = sheet.groups.find(g => g.role === 'dimension' && g.id === 'd1');
    assert.ok(grp);
    const arcMark = grp.marks.find((m): m is Extract<Mark, { kind: 'arc' }> => m.kind === 'arc');
    assert.ok(arcMark);
    assert.ok(Math.abs((arcMark.t1 - arcMark.t0) - Math.PI / 2) < 1e-6);
  }

  // Edit fillet radius from 10 to 15 mm: same persisted dim updates to 15 * pi/2 = 23.5619...
  const plate15 = makeFilletPlate(15);
  const settings15: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [baseDim] };
  const layout15 = layoutSheet(plate15.views, settings15);
  const sheet15 = buildSheet(plate15.views, layout15, settings15, { title: 'Edited R15', date: '2026-11-25' });
  const r15 = sheet15.dimensions[0];
  assert.ok(r15.ok && r15.kind === 'arc-length');
  assert.ok(Math.abs(r15.value - 7.5 * Math.PI) < 1e-6);
  assert.equal(r15.text, 'ARC 23.56');
});

test('arc-length respects scale, inch/dual units, precision, tolerances, SVG, DXF, 3D PMI, reorient, and referencesOf', () => {
  const plate = makeFilletPlate(10);
  const edge = findPartialArcEdge(plate.views, 'top');
  const picked = pickArcLengthEdge(plate.views.top, edge, 'top');
  assert.ok(picked.ok);

  const dim: ArcLengthDim = {
    id: 'd1',
    view: 'top',
    kind: 'arc-length',
    arc: picked.ref,
    place: [58, 38],
    tol: { kind: 'symmetric', value: 0.1 },
  };

  // Scale 1:2, dual mm + inch
  const settings: DrawingSettings = { ...defaultDrawing(), scale: 0.5, dual: true, dimensions: [dim] };
  const layout = layoutSheet(plate.views, settings);
  const sheet = buildSheet(plate.views, layout, settings, { title: 'Dual Scale', date: '2026-11-25' });
  const r = sheet.dimensions[0];
  assert.ok(r.ok && r.kind === 'arc-length');
  assert.equal(r.text, 'ARC 15.71');
  assert.equal(r.alt, 'ARC .618');

  // Plain inch
  const inchSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, units: 'inch', dimensions: [{ ...dim, tol: undefined }] };
  const inchLayout = layoutSheet(plate.views, inchSettings);
  const inchSheet = buildSheet(plate.views, inchLayout, inchSettings, { title: 'Inch', date: '2026-11-25' });
  const rInch = inchSheet.dimensions[0];
  assert.ok(rInch.ok && rInch.kind === 'arc-length');
  assert.equal(rInch.text, 'ARC .618');

  // SVG contains arc path, 2 radial extensions, 2 arrowheads, and ARC text
  const plainSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [{ ...dim, tol: undefined }] };
  const plainLayout = layoutSheet(plate.views, plainSettings);
  const plainSheet = buildSheet(plate.views, plainLayout, plainSettings, { title: 'Plain', date: '2026-11-25' });
  const svg = sheetSvg(plainSheet, 'Plain');
  assert.match(svg, /<text[^>]*>ARC 15\.71<\/text>/);

  // DXF (2000 & R12) emits drawn ARC/LINE/SOLID/TEXT and zero fake DIMENSION entities
  for (const version of ['AC1015', 'AC1009'] as const) {
    const dxfDoc = sheetDxfDocument(plainSheet, plainLayout, version);
    assert.equal(dxfDoc.entities.some(e => e.type === 'dimension'), false, `DXF ${version} must not misrepresent arc-length as a RADIUS/ANGULAR DIMENSION`);
    assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text === 'ARC 15.71'), `DXF ${version} must preserve ARC 15.71 text`);
    const dxfText = sheetDxf(plainSheet, plainLayout, version).text;
    assert.ok(dxfText.includes('ARC 15.71'));
  }

  // 3D PMI lifts arc-length cleanly
  const pmi = modelAnnotations({ views: plate.views, layout: plainLayout, settings: plainSettings, sheet: plainSheet });
  const item = pmi.items.find(i => i.id === 'd1');
  assert.ok(item);
  assert.equal(item.dimension?.measure, 'arc-length');
  assert.equal(item.dimension?.unit, 'mm');
  assert.ok(Math.abs((item.dimension?.value ?? 0) - 5 * Math.PI) < 1e-6);
  assert.equal(item.arcs.length, 1);
  assert.equal(item.arrows.length, 2);
  assert.equal(item.lines.length, 2);

  // Reorient y- -> x+ preserves arc-length value
  const res = brepsFor(plate.doc);
  assert.ok('breps' in res);
  const turnedProj = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(turnedProj.ok);
  const turned = reorient(plate.views, turnedProj.views, plainSettings, 'x+');
  assert.ok(turned.ok, turned.ok ? '' : turned.message);
  const rTurned = resolveDimension(turnedProj.views, turned.settings.dimensions[0]);
  assert.ok(rTurned.ok && rTurned.kind === 'arc-length');
  assert.ok(Math.abs(rTurned.value - 5 * Math.PI) < 1e-6);

  // referencesOf deep-copies d.arc without mutating original doc
  const docWithDim: StudioDoc = { ...plate.doc, drawing: plainSettings };
  const { doc: copied, refs } = referencesOf(docWithDim);
  const ref = refs.find(x => x.where === 'dimension d1');
  assert.ok(ref);
  ref.rename('renamed.edge', true);
  assert.equal((docWithDim.drawing!.dimensions[0] as ArcLengthDim).arc.edge, picked.ref.edge);
  assert.equal((copied.drawing!.dimensions[0] as ArcLengthDim).arc.edge, 'renamed.edge');
  assert.equal((copied.drawing!.dimensions[0] as ArcLengthDim).arc.was, picked.ref.edge);

  // readDrawing round-trip preserves valid arc-length and drops invalid ones
  const round = readDrawing(JSON.parse(JSON.stringify(plainSettings)));
  assert.equal(round.dimensions.length, 1);
  assert.equal(round.dimensions[0].kind, 'arc-length');
  const bad = readDrawing({
    ...plainSettings,
    dimensions: [
      { id: 'bad-iso', view: 'iso', kind: 'arc-length', arc: picked.ref, place: [0, 0] },
      { id: 'bad-auto', view: 'top', kind: 'arc-length', auto: true, arc: picked.ref, place: [0, 0] },
      { id: 'bad-arc', view: 'top', kind: 'arc-length', arc: { edge: '', near: [0, 0, 0] }, place: [0, 0] },
    ],
  });
  assert.equal(bad.dimensions.length, 0);

  // Dimension CSV refuses arc-length explicitly rather than silently omitting
  const csvRes = currentSheetDimensionsCsv({ resolved: plainSheet.dimensions, settings: plainSettings, wholeSettings: plainSettings, sheetNumber: 1 });
  assert.equal(csvRes.ok, false);
});

test('arc-length rejects full circles, straight lines, silhouettes, non-round views, detail/section/broken views, and deleted edges', () => {
  const plate = makeFilletPlate(10, true);
  // Real hole rim (seam-split full 360° circle centered at (15, 15), R = 5) must be rejected as a full circle
  const holeRimEdge = plate.views.top.edges.find(
    e => e.kind === 'circle' && e.circle && Math.hypot(e.circle.center[0] - 15, e.circle.center[1] - 15) < 1e-4 && e.pieces.some(p => p.visible),
  );
  assert.ok(holeRimEdge, 'expected visible hole rim circle edge');
  const fullRes = pickArcLengthEdge(plate.views.top, holeRimEdge, 'top');
  assert.equal(fullRes.ok, false);
  assert.match(fullRes.reason, /Full circles/i);

  const straightLine = plate.views.top.edges.find(e => e.kind === 'line' && e.pieces.some(p => p.visible));
  assert.ok(straightLine, 'expected visible straight edge');
  const lineRes = pickArcLengthEdge(plate.views.top, straightLine, 'top');
  assert.equal(lineRes.ok, false);

  const silhouette = plate.views.front.edges.find(e => e.kind === 'silhouette');
  if (silhouette) {
    const silRes = pickArcLengthEdge(plate.views.front, silhouette, 'front');
    assert.equal(silRes.ok, false);
    assert.match(silRes.reason, /Silhouette/i);
  }

  // Non-round view: same fillet edge seen edge-on in front view
  const filletTop = findPartialArcEdge(plate.views, 'top');
  const pickedTop = pickArcLengthEdge(plate.views.top, filletTop, 'top');
  assert.ok(pickedTop.ok);
  const nonRound = resolveArcLengthEdge(plate.views.front, pickedTop.ref, 'front');
  assert.equal(nonRound.ok, false);

  // Iso, section, detail views refused
  for (const badView of ['iso', 'section:A', 'detail:B'] as const) {
    const badRes = resolveArcLengthEdge(plate.views.top, pickedTop.ref, badView);
    assert.equal(badRes.ok, false);
  }

  // Broken view refused in buildSheet
  const dim: ArcLengthDim = { id: 'd1', view: 'top', kind: 'arc-length', arc: pickedTop.ref, place: [58, 38] };
  const brokenSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    breaks: [{ axis: 'x', from: 20, to: 30 }],
    dimensions: [dim],
  };
  const brokenLayout = layoutSheet(plate.views, brokenSettings);
  const brokenSheet = buildSheet(plate.views, brokenLayout, brokenSettings, { title: 'Broken', date: '2026-11-25' });
  assert.equal(brokenSheet.dimensions[0].ok, false);
  assert.match(brokenSheet.dimensions[0].reason, /broken view/i);

  // Deleted/missing edge (fillet removed) becomes cleanly unresolved and reported in drawingIssues
  const unfilleted = rectanglePart(50, 30, 10);
  const resPlain = brepsFor(unfilleted);
  assert.ok('breps' in resPlain);
  const projPlain = projectViews(resPlain.breps, resPlain.prefixes);
  assert.ok(projPlain.ok);
  const lostSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [dim] };
  const lostLayout = layoutSheet(projPlain.views, lostSettings);
  const lostSheet = buildSheet(projPlain.views, lostLayout, lostSettings, { title: 'Lost', date: '2026-11-25' });
  assert.equal(lostSheet.dimensions[0].ok, false);
  const issues = drawingIssues({ views: projPlain.views, layout: lostLayout, sheet: lostSheet, settings: lostSettings, callout: () => null });
  assert.ok(issues.some(i => i.code === 'DIMENSION_LOST' && i.dims?.includes('d1')));
});
