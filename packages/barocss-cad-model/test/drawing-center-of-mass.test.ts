import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc, type BodyResult } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { drawingIssues, applyFix } from '../src/drawing/issues';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { reorient } from '../src/drawing/reorient';
import { defaultDrawing, readDrawing, type DrawingCenterOfMass, type DrawingDimension, type DrawingSettings, type DrawingViews, type Vec3 } from '../src/drawing/types';
import { COM_SYMBOL_DEFAULT_MM, newCenterOfMassId, qualifiedCenterOfMassSources, resolveCenterOfMass, type DrawingBodyMassSource } from '../src/drawing/centerOfMass';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';

/** Asymmetric 40x20x10 mm plate with a 10x10x10 mm through-cut at [cutX, cutX+10] x [5, 15]. */
function asymmetricPlateDoc(width = 40, cutX = 25): StudioDoc {
  let doc = rectanglePart(width, 20, 10);
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [cutX, 5], max: [cutX + 10, 15] });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 10 });
  doc = withNode(doc, { kind: 'difference', parent: { node: 1, side: 'solid' }, tool: { node: 3, side: 'solid' } });
  return doc;
}

/** Hollow frame whose centroid lies in empty air (outside solid material). */
function hollowFrameDoc(): StudioDoc {
  let doc = rectanglePart(40, 40, 10);
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [5, 5], max: [35, 35] });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 10 });
  doc = withNode(doc, { kind: 'difference', parent: { node: 1, side: 'solid' }, tool: { node: 3, side: 'solid' } });
  return doc;
}

function evalPart(doc: StudioDoc): { bodies: BodyResult[]; views: DrawingViews } {
  const ev = evaluateDoc(doc, 1);
  assert.ok(ev.ok, 'evaluateDoc must succeed');
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'brepsFor must return breps');
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'projectViews must succeed');
  return { bodies: ev.bodies, views: proj.views };
}

function originEdgePoint(views: DrawingViews): { edge: string; near: Vec3 } {
  const e = views.top.edges.find(ed => ed.ends?.some(p => Math.abs(p[0]) < 1e-4 && Math.abs(p[1]) < 1e-4));
  assert.ok(e && e.ends, 'No edge at origin (0,0)');
  const end = e.ends.find(p => Math.abs(p[0]) < 1e-4 && Math.abs(p[1]) < 1e-4)!;
  return { edge: e.name, near: [end[0], end[1], end[2]] };
}

function near(actual: number, expected: number, tol = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} ≈ ${expected} (±${tol})`);
}

test('drawing center of mass: exact analytic centroid on box, asymmetric plate, shifted cut, and widened plate', () => {
  // 1. Symmetric 40x20x10 box -> COM = (20, 10, 5)
  const boxDoc = rectanglePart(40, 20, 10);
  const boxEval = evalPart(boxDoc);
  const boxSources = qualifiedCenterOfMassSources(boxDoc, boxEval.bodies, { kind: 'part' });
  assert.equal(boxSources.size, 1);
  const boxKey = [...boxSources.keys()][0];
  const boxRes = resolveCenterOfMass(boxEval.views.top, boxKey, 'top', boxSources);
  assert.ok(boxRes.ok);
  near(boxRes.geometry.centroid3[0], 20);
  near(boxRes.geometry.centroid3[1], 10);
  near(boxRes.geometry.centroid3[2], 5);

  // 2. Asymmetric 40x20x10 plate with 10x10 cut at x=25..35, y=5..15 -> X = 130/7 ≈ 18.57142857 (distinct from bbox 20)
  const plateDoc = asymmetricPlateDoc(40, 25);
  const plateEval = evalPart(plateDoc);
  const plateSources = qualifiedCenterOfMassSources(plateDoc, plateEval.bodies, { kind: 'part' });
  assert.equal(plateSources.size, 1);
  const plateKey = [...plateSources.keys()][0];
  const expectedX1 = 130 / 7;
  const orig = originEdgePoint(plateEval.views);
  const comItem: DrawingCenterOfMass = { id: newCenterOfMassId(), view: 'top', bodyKey: plateKey };
  const dimX: DrawingDimension = {
    id: 'd1',
    view: 'top',
    kind: 'linear',
    orient: 'horizontal',
    a: { edge: orig.edge, at: 'end', near: orig.near },
    // Deliberately stale near=[0,0,0] — resolver must use live mass source, never stale near!
    b: { edge: '', at: 'com', near: [0, 0, 0], bodyKey: plateKey, comId: comItem.id },
    place: [10, 28],
  };
  const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, centerOfMass: [comItem], dimensions: [dimX] };
  const layout = layoutSheet(plateEval.views, settings);
  const sheet = buildSheet(plateEval.views, layout, settings, { title: 'Plate', date: '2026-11-26', bodyMassSources: plateSources });
  assert.ok(sheet.centerOfMass?.[0].ok);
  near(sheet.centerOfMass[0].geometry.point[0], expectedX1);
  near(sheet.centerOfMass[0].geometry.point[1], 10);
  assert.ok(sheet.dimensions[0].ok);
  near(sheet.dimensions[0].value, expectedX1);
  assert.equal(sheet.dimensions[0].text, '18.57');
  assert.ok(Math.abs(sheet.dimensions[0].value - 20) > 1.4, 'COM must differ from bounding-box center 20');

  // 3. Shift cutout -5 mm along X (x=20..30) -> X = 135/7 ≈ 19.28571429
  const shiftedDoc = asymmetricPlateDoc(40, 20);
  const shiftedEval = evalPart(shiftedDoc);
  const shiftedSources = qualifiedCenterOfMassSources(shiftedDoc, shiftedEval.bodies, { kind: 'part' });
  const shiftedSheet = buildSheet(shiftedEval.views, layoutSheet(shiftedEval.views, settings), settings, { title: 'Plate', date: '2026-11-26', bodyMassSources: shiftedSources });
  assert.ok(shiftedSheet.dimensions[0].ok);
  near(shiftedSheet.dimensions[0].value, 135 / 7);
  assert.equal(shiftedSheet.dimensions[0].text, '19.29');

  // 4. Widen plate 40 -> 50 (cut stays 25..35) -> X = 220/9 ≈ 24.44444444
  const wideDoc = asymmetricPlateDoc(50, 25);
  const wideEval = evalPart(wideDoc);
  const wideSources = qualifiedCenterOfMassSources(wideDoc, wideEval.bodies, { kind: 'part' });
  const wideSheet = buildSheet(wideEval.views, layoutSheet(wideEval.views, settings), settings, { title: 'Plate', date: '2026-11-26', bodyMassSources: wideSources });
  assert.ok(wideSheet.dimensions[0].ok);
  near(wideSheet.dimensions[0].value, 220 / 9);
  assert.equal(wideSheet.dimensions[0].text, '24.44');
});

test('drawing center of mass: supports hollow frame with COM in empty air and density invariance', () => {
  const frameDoc = hollowFrameDoc();
  const { bodies, views } = evalPart(frameDoc);
  const sources1 = qualifiedCenterOfMassSources(frameDoc, bodies, { kind: 'part' });
  const key = [...sources1.keys()][0];
  const r1 = resolveCenterOfMass(views.top, key, 'top', sources1);
  assert.ok(r1.ok);
  // Centroid is (20, 20, 5), which lies inside the 30x30 empty air cutout!
  near(r1.geometry.centroid3[0], 20);
  near(r1.geometry.centroid3[1], 20);
  near(r1.geometry.centroid3[2], 5);

  // Uniform single-body centroid is invariant under material density change
  const baseDoc = asymmetricPlateDoc(40, 25);
  const baseEval = evalPart(baseDoc);
  const bodyKey = baseEval.bodies[0].key;
  const alumDoc: StudioDoc = { ...baseDoc, bodies: { [bodyKey]: { material: '6061-T6' } } };
  const steelDoc: StudioDoc = { ...baseDoc, bodies: { [bodyKey]: { material: '304' } } };
  const alumEval = evalPart(alumDoc), steelEval = evalPart(steelDoc);
  const alumSrc = qualifiedCenterOfMassSources(alumDoc, alumEval.bodies, { kind: 'part' });
  const steelSrc = qualifiedCenterOfMassSources(steelDoc, steelEval.bodies, { kind: 'part' });
  near(alumSrc.get(bodyKey)!.centroid[0], 130 / 7);
  near(steelSrc.get(bodyKey)!.centroid[0], 130 / 7);
  near(alumSrc.get(bodyKey)!.centroid[0], steelSrc.get(bodyKey)!.centroid[0], 1e-9);
});

test('drawing center of mass: hidden symbol keeps dependent dimensions live and diameter/units/scale stay presentation-only', () => {
  const doc = asymmetricPlateDoc(40, 25);
  const { bodies, views } = evalPart(doc);
  const sources = qualifiedCenterOfMassSources(doc, bodies, { kind: 'part' });
  const bodyKey = [...sources.keys()][0];
  const orig = originEdgePoint(views);
  const dimX: DrawingDimension = {
    id: 'd1',
    view: 'top',
    kind: 'linear',
    orient: 'horizontal',
    a: { edge: orig.edge, at: 'end', near: orig.near },
    b: { edge: '', at: 'com', near: [18.57, 10, 5], bodyKey, comId: 'com1' },
    place: [10, 28],
  };

  const visibleSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, centerOfMass: [{ id: 'com1', view: 'top', bodyKey }], dimensions: [dimX] };
  const hiddenSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, centerOfMass: [{ id: 'com1', view: 'top', bodyKey, hidden: true }], dimensions: [dimX] };
  const bigSymSettings: DrawingSettings = { ...defaultDrawing(), scale: 0.5, units: 'inch', dual: true, precision: { mm: 3, inch: 4 }, centerOfMass: [{ id: 'com1', view: 'top', bodyKey, diameter: 8 }], dimensions: [dimX] };

  const sVisible = buildSheet(views, layoutSheet(views, visibleSettings), visibleSettings, { title: 'V', date: '2026-11-26', bodyMassSources: sources });
  const sHidden = buildSheet(views, layoutSheet(views, hiddenSettings), hiddenSettings, { title: 'H', date: '2026-11-26', bodyMassSources: sources });
  const sBig = buildSheet(views, layoutSheet(views, bigSymSettings), bigSymSettings, { title: 'B', date: '2026-11-26', bodyMassSources: sources });

  const visGroup = sVisible.groups.find(g => g.centerOfMass && g.id === 'com1');
  assert.equal(visGroup?.marks.length, 5);
  assert.ok(sheetSvg(sVisible, 'V').includes('data-center-of-mass="com1"'));

  // Hidden omits symbol group & SVG element, while dependent dimension STILL resolves!
  assert.equal(sHidden.groups.some(g => g.centerOfMass), false);
  assert.equal(sheetSvg(sHidden, 'H').includes('data-center-of-mass'), false);
  assert.ok(sHidden.dimensions[0].ok);
  near(sHidden.dimensions[0].value, 130 / 7);

  // Larger symbol diameter (8 mm), scale 1:2, inch dual display -> underlying model value stays exact 130/7 mm
  const bigGroup = sBig.groups.find(g => g.centerOfMass && g.id === 'com1');
  const circle = bigGroup?.marks.find(m => m.kind === 'arc');
  assert.ok(circle && circle.kind === 'arc');
  near(Math.hypot(circle.u[0], circle.u[1]), 4);
  assert.ok(sBig.dimensions[0].ok);
  near(sBig.dimensions[0].value, 130 / 7);
  assert.equal(sBig.dimensions[0].alt, '18.571');
});

test('drawing center of mass: strictly refuses pending/missing-method/NaN/bought/assembly/broken/iso/unknown body without fallback', () => {
  const doc = asymmetricPlateDoc(40, 25);
  const { bodies, views } = evalPart(doc);
  const body = bodies[0];
  const orig = originEdgePoint(views);

  // Pending mass (massRef defined) -> excluded
  const pendingBodies: BodyResult[] = [{ ...body, volume: null, mass: null, centroid: undefined, massMethod: undefined, massRef: 42 }];
  assert.equal(qualifiedCenterOfMassSources(doc, pendingBodies, { kind: 'part' }).size, 0);

  // Missing massMethod -> excluded (NEVER treated as exact)
  const noMethodBodies: BodyResult[] = [{ ...body, massMethod: undefined }];
  assert.equal(qualifiedCenterOfMassSources(doc, noMethodBodies, { kind: 'part' }).size, 0);

  // Non-finite centroid -> excluded
  const nanBodies: BodyResult[] = [{ ...body, centroid: [Number.NaN, 10, 5] }];
  assert.equal(qualifiedCenterOfMassSources(doc, nanBodies, { kind: 'part' }).size, 0);

  // Bought node -> excluded
  const boughtDoc: StudioDoc = { ...doc, nodes: doc.nodes.map((n, i) => i === body.ref?.node ? { ...n, bought: true } : n) };
  assert.equal(qualifiedCenterOfMassSources(boughtDoc, bodies, { kind: 'part' }).size, 0);

  // Assembly scope -> excluded
  assert.equal(qualifiedCenterOfMassSources(doc, bodies, { kind: 'assembly' }).size, 0);

  // Lost source reports CENTER_OF_MASS_LOST + DIMENSION_LOST (never resolves to (0,0,0) or near!)
  const lostSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    centerOfMass: [{ id: 'com1', view: 'top', bodyKey: 'b999' }],
    dimensions: [{
      id: 'd1',
      view: 'top',
      kind: 'linear',
      orient: 'horizontal',
      a: { edge: orig.edge, at: 'end', near: orig.near },
      b: { edge: '', at: 'com', near: [18.57, 10, 5], bodyKey: 'b999', comId: 'com1' },
      place: [10, 28],
    }],
  };
  const realSources = qualifiedCenterOfMassSources(doc, bodies, { kind: 'part' });
  const lostLayout = layoutSheet(views, lostSettings);
  const lostSheet = buildSheet(views, lostLayout, lostSettings, { title: 'Lost', date: '2026-11-26', bodyMassSources: realSources });
  assert.equal(lostSheet.centerOfMass?.[0].ok, false);
  assert.equal(lostSheet.dimensions[0].ok, false);
  assert.equal(lostSheet.groups.some(g => g.centerOfMass), false);
  const issues = drawingIssues({ views, layout: lostLayout, settings: lostSettings, sheet: lostSheet, callout: () => null });
  const comIssue = issues.find(x => x.code === 'CENTER_OF_MASS_LOST');
  assert.deepEqual(comIssue?.fix, { kind: 'remove-center-of-mass', id: 'com1' });
  assert.equal(issues.some(x => x.code === 'DIMENSION_LOST'), true);
  const fixed = applyFix({ views, layout: lostLayout, settings: lostSettings, sheet: lostSheet, callout: () => null }, comIssue!.fix!);
  assert.equal(fixed.centerOfMass, undefined);

  // Broken view refusal
  const brokenSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    breaks: [{ axis: 'x', from: 10, to: 15 }],
    centerOfMass: [{ id: 'com1', view: 'top', bodyKey: body.key }],
    dimensions: [{
      id: 'd1',
      view: 'top',
      kind: 'linear',
      orient: 'horizontal',
      a: { edge: orig.edge, at: 'end', near: orig.near },
      b: { edge: '', at: 'com', near: [18.57, 10, 5], bodyKey: body.key, comId: 'com1' },
      place: [10, 28],
    }],
  };
  const brokenLayout = layoutSheet(views, brokenSettings);
  const brokenSheet = buildSheet(views, brokenLayout, brokenSettings, { title: 'Broken', date: '2026-11-26', bodyMassSources: realSources });
  assert.equal(brokenSheet.centerOfMass?.[0].ok, false);
  assert.equal(brokenSheet.dimensions[0].ok, false);

  // Non-orthographic view refusal
  assert.equal(resolveCenterOfMass(views.iso, body.key, 'iso', realSources).ok, false);
});

test('drawing center of mass: multi-body explicit binding, signature skipping, persistence, sheets, reorient, and DXF export', async () => {
  let multi = emptyDoc();
  multi = withNode(multi, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] });
  multi = withNode(multi, { kind: 'extrude', sketch: 0, height: 10 });
  multi = withNode(multi, { kind: 'sketch', profile: 'rectangle', min: [30, 0], max: [50, 10] });
  multi = withNode(multi, { kind: 'extrude', sketch: 2, height: 10 });
  const multiEval = evalPart(multi);
  const multiSrc = qualifiedCenterOfMassSources(multi, multiEval.bodies, { kind: 'part' });
  assert.equal(multiSrc.size, 2);
  const keys = [...multiSrc.keys()];
  const firstCom = resolveCenterOfMass(multiEval.views.top, keys[0], 'top', multiSrc);
  const secondCom = resolveCenterOfMass(multiEval.views.top, keys[1], 'top', multiSrc);
  assert.ok(firstCom.ok && secondCom.ok);
  assert.ok(Math.abs(firstCom.geometry.centroid3[0] - secondCom.geometry.centroid3[0]) > 30);

  const doc = asymmetricPlateDoc(40, 25);
  const { bodies, views } = evalPart(doc);
  const sources: ReadonlyMap<string, DrawingBodyMassSource> = qualifiedCenterOfMassSources(doc, bodies, { kind: 'part' });
  const bodyKey = [...sources.keys()][0];
  const orig = originEdgePoint(views);
  const rawSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    centerOfMass: [
      { id: 'com1', view: 'top', bodyKey },
      { id: 'com2', view: 'front', bodyKey, diameter: 6 },
    ],
    dimensions: [{
      id: 'd1',
      view: 'top',
      kind: 'linear',
      orient: 'horizontal',
      a: { edge: orig.edge, at: 'end', near: orig.near },
      b: { edge: '', at: 'com', near: [18.57, 10, 5], bodyKey, comId: 'com1' },
      place: [10, 28],
    }],
  };

  // readDrawing round-trip
  const roundTripped = readDrawing(JSON.parse(JSON.stringify(rawSettings)));
  assert.deepEqual(roundTripped.centerOfMass, [
    { id: 'com1', view: 'top', bodyKey },
    { id: 'com2', view: 'front', bodyKey, diameter: 6 },
  ]);
  assert.equal(roundTripped.dimensions.length, 1);
  assert.equal(roundTripped.dimensions[0].kind === 'linear' && roundTripped.dimensions[0].b.at, 'com');

  // engine/references: COM endpoint never creates a fake edge reference or verification problem
  const withDrawing: StudioDoc = { ...doc, drawing: roundTripped };
  const signed = captureSignatures(withDrawing, bodies);
  const refs = referencesOf(signed, true).refs;
  assert.equal(refs.every(r => r.name !== ''), true);
  const verified = await verifyReferences(signed, bodies, async d => evaluateDoc(d, 1));
  assert.equal(verified.problems.length, 0);

  // Multi-sheet forSheet / mergeSheet
  const multiSheetSettings: DrawingSettings = { ...roundTripped, sheets: [{ id: 's2', name: 'Front', views: ['front'] }] };
  const s1 = forSheet(multiSheetSettings, 0);
  const s2 = forSheet(multiSheetSettings, 1);
  assert.deepEqual(s1.centerOfMass?.map(x => x.id), ['com1']);
  assert.deepEqual(s2.centerOfMass?.map(x => x.id), ['com2']);
  const merged = mergeSheet(multiSheetSettings, 1, { ...s2, centerOfMass: s2.centerOfMass?.map(x => ({ ...x, hidden: true as const })) });
  assert.equal(merged.centerOfMass?.find(x => x.id === 'com1')?.hidden, undefined);
  assert.equal(merged.centerOfMass?.find(x => x.id === 'com2')?.hidden, true);

  // Reorient drawing (y- -> x+) keeps COM markers & COM linear dimensions intact
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const projRight = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(projRight.ok);
  const turned = reorient(views, projRight.views, roundTripped, 'x+', sources);
  assert.ok(turned.ok);
  assert.equal(turned.settings.centerOfMass?.find(x => x.id === 'com2')?.view, 'right');

  // DXF export (AC1015 and R12) verified via structured DxfDocument + written DXF text
  const layout = layoutSheet(views, roundTripped);
  const sheet = buildSheet(views, layout, roundTripped, { title: 'COM DXF', date: '2026-11-26', bodyMassSources: sources });
  for (const ver of ['AC1015', 'AC1009'] as const) {
    const dxfDoc = sheetDxfDocument(sheet, layout, ver);
    const dimEntity = dxfDoc.entities.find((e): e is Extract<typeof e, { type: 'dimension' }> => e.type === 'dimension');
    assert.ok(dimEntity && dimEntity.measurement !== undefined);
    near(dimEntity.measurement, 130 / 7);
    assert.equal(dimEntity.text, '18.57');
    assert.ok(dxfDoc.entities.some(e => e.layer === 'THIN' && (e.type === 'hatch' || e.type === 'solid')));
    const written = sheetDxf(sheet, layout, ver);
    assert.ok(written.text.includes('DIMENSION'));
    assert.ok(written.text.includes('18.57'));
  }
  assert.equal(COM_SYMBOL_DEFAULT_MM, 4);
});
