import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import {
  newCenterMarkGroupId,
  pickCenterMarkGroupCircle,
  resolveCenterMarkGroup,
  validateCenterMarkGroupCandidate,
} from '../src/drawing/centerMarkGroup';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingCenterMarkGroup, type DrawingSettings, type Vec3 } from '../src/drawing/types';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { applyFix, drawingIssues } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';

interface HoleSpec {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly z?: number;
}

/** Build a rectangular plate spanning [-20,-20]..[75,45] (height 10) with through-holes on Z=10. */
function makePlateWithHoles(holes: readonly HoleSpec[], height = 10, translate: readonly [number, number] = [0, 0]): StudioDoc {
  const [tx, ty] = translate;
  let doc: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20 + tx, -20 + ty], max: [75 + tx, 45 + ty] },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
  let parentNode = 1;
  for (const h of holes) {
    doc = withNode(doc, {
      kind: 'hole',
      parent: { node: parentNode, side: 'solid' },
      center: [h.x + tx, h.y + ty],
      radius: h.radius,
    });
    parentNode = doc.nodes.length - 1;
  }
  return doc;
}

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'part brep should build: ' + JSON.stringify('breps' in res ? null : res));
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'part views should project');
  return proj.views;
}

function findHoleEdgeAt(pr: BrepProjection, x: number, y: number, radius: number, z?: number) {
  const edge = pr.edges.find(
    e => e.kind === 'circle'
      && e.circle
      && Math.abs(e.circle.radius - radius) < 1e-3
      && Math.hypot(e.circle.center[0] - x, e.circle.center[1] - y) < 1e-2
      && (z === undefined || Math.abs(e.circle.center[2] - z) < 1e-2)
      && e.pieces.length > 0
      && e.pieces.every(p => p.visible),
  );
  assert.ok(edge, `expected visible full circular hole edge at (${x}, ${y}) R=${radius}`);
  return edge;
}

test('center-mark-group resolves 3 collinear R=3 holes (0,20,40), tracks end-hole move to 50 without auto-enrolling a 4th hole, and avoids duplicate crosses', () => {
  const doc0 = makePlateWithHoles([
    { x: 0, y: 0, radius: 3 },
    { x: 20, y: 0, radius: 3 },
    { x: 40, y: 0, radius: 3 },
  ]);
  const views0 = projectDoc(doc0);
  const picks = [
    pickCenterMarkGroupCircle(views0.top, findHoleEdgeAt(views0.top, 0, 0, 3), 'top'),
    pickCenterMarkGroupCircle(views0.top, findHoleEdgeAt(views0.top, 20, 0, 3), 'top'),
    pickCenterMarkGroupCircle(views0.top, findHoleEdgeAt(views0.top, 40, 0, 3), 'top'),
  ];
  assert.ok(picks.every(p => p.ok));
  const members = picks.map(p => (p as Extract<typeof p, { ok: true }>).ref);

  const rFwd = resolveCenterMarkGroup(views0.top, members, 'top');
  const rRev = resolveCenterMarkGroup(views0.top, [...members].reverse(), 'top');
  assert.ok(rFwd.ok && rRev.ok);
  for (const r of [rFwd, rRev]) {
    assert.equal(r.geometry.members.length, 3);
    assert.ok(Math.abs(r.geometry.radius - 3) < 1e-6);
    assert.equal(r.geometry.segments.length, 2);
    assert.ok(Math.hypot(r.geometry.segments[0][0][0] - 0, r.geometry.segments[0][0][1] - 0) < 1e-6);
    assert.ok(Math.hypot(r.geometry.segments[0][1][0] - 20, r.geometry.segments[0][1][1] - 0) < 1e-6);
    assert.ok(Math.hypot(r.geometry.segments[1][0][0] - 20, r.geometry.segments[1][0][1] - 0) < 1e-6);
    assert.ok(Math.hypot(r.geometry.segments[1][1][0] - 40, r.geometry.segments[1][1][1] - 0) < 1e-6);
  }

  // Verify automatic crosses are not duplicated when adding the center-mark-group
  const baseSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [] };
  const layout0 = layoutSheet(views0, baseSettings);
  const sheetWithout = buildSheet(views0, layout0, baseSettings, { title: 'plate', date: '2026-11-25' });
  const cmg: DrawingCenterMarkGroup = { id: newCenterMarkGroupId(), kind: 'linear', view: 'top', members, connectingLines: true };
  const settingsWith: DrawingSettings = { ...baseSettings, centerMarkGroups: [cmg] };
  const sheetWith = buildSheet(views0, layout0, settingsWith, { title: 'plate', date: '2026-11-25' });
  const topViewMarksWithout = sheetWithout.groups.find(g => g.role === 'view' && g.view === 'top' && !g.centerMarkGroup)!.marks.filter(m => m.kind === 'line' && m.pen === 'center');
  const topViewMarksWith = sheetWith.groups.find(g => g.role === 'view' && g.view === 'top' && !g.centerMarkGroup)!.marks.filter(m => m.kind === 'line' && m.pen === 'center');
  assert.equal(topViewMarksWith.length, topViewMarksWithout.length, 'automatic center crosses must not be duplicated');
  const cmgGroup = sheetWith.groups.find(g => g.centerMarkGroup && g.id === 'cmg1');
  assert.ok(cmgGroup && cmgGroup.marks.length === 2);

  // Move end hole 40 -> 50 mm (non-constant pitch: 20 mm + 30 mm) and add a 4th hole at 60 mm
  const doc50Plus4th = makePlateWithHoles([
    { x: 0, y: 0, radius: 3 },
    { x: 20, y: 0, radius: 3 },
    { x: 50, y: 0, radius: 3 },
    { x: 60, y: 0, radius: 3 },
  ]);
  const views50 = projectDoc(doc50Plus4th);
  const r50 = resolveCenterMarkGroup(views50.top, members, 'top');
  assert.ok(r50.ok);
  assert.equal(r50.geometry.members.length, 3, '4th hole must never be auto-enrolled');
  assert.equal(r50.geometry.segments.length, 2);
  assert.ok(Math.hypot(r50.geometry.segments[0][1][0] - 20, r50.geometry.segments[0][1][1]) < 1e-6);
  assert.ok(Math.hypot(r50.geometry.segments[1][1][0] - 50, r50.geometry.segments[1][1][1]) < 1e-6);
});

test('center-mark-group supports diagonal collinear row (0,0)-(12,16)-(24,32), translation, 1:2 scale, and inch display without mutating payload', () => {
  const docDiag = makePlateWithHoles([
    { x: 0, y: 0, radius: 3 },
    { x: 12, y: 16, radius: 3 },
    { x: 24, y: 32, radius: 3 },
  ], 10, [5, -4]);
  const viewsDiag = projectDoc(docDiag);
  const members = [
    pickCenterMarkGroupCircle(viewsDiag.top, findHoleEdgeAt(viewsDiag.top, 5, -4, 3), 'top'),
    pickCenterMarkGroupCircle(viewsDiag.top, findHoleEdgeAt(viewsDiag.top, 17, 12, 3), 'top'),
    pickCenterMarkGroupCircle(viewsDiag.top, findHoleEdgeAt(viewsDiag.top, 29, 28, 3), 'top'),
  ].map(p => { assert.ok(p.ok); return p.ref; });

  const resolved = resolveCenterMarkGroup(viewsDiag.top, members, 'top');
  assert.ok(resolved.ok);
  assert.ok(Math.abs(resolved.geometry.axis[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(resolved.geometry.axis[1] - 0.8) < 1e-6);
  for (const [a, b] of resolved.geometry.segments) {
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 20) < 1e-5);
  }

  const cmg: DrawingCenterMarkGroup = { id: 'cmg1', kind: 'linear', view: 'top', members, connectingLines: true };
  const settingsHalfInch: DrawingSettings = { ...defaultDrawing(), scale: 0.5, units: 'inch', dimensions: [], centerMarkGroups: [cmg] };
  const layoutHalf = layoutSheet(viewsDiag, settingsHalfInch);
  const sheetHalf = buildSheet(viewsDiag, layoutHalf, settingsHalfInch, { title: 'diag', date: '2026-11-25' });
  const g = sheetHalf.groups.find(x => x.centerMarkGroup && x.id === 'cmg1');
  assert.ok(g && g.marks.length === 2);
  for (const m of g.marks) {
    assert.equal(m.kind, 'line');
    if (m.kind === 'line') {
      // 20 mm model distance at 1:2 scale = 10 mm on sheet
      assert.ok(Math.abs(Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) - 10) < 1e-4);
    }
  }
});

test('center-mark-group refuses non-collinear, depth-offset, unequal-radius, duplicate, partial-arc, count bounds, invalid reader payloads, and broken/iso views', () => {
  // Non-collinear + unequal radius
  const docMix = makePlateWithHoles([
    { x: 0, y: 0, radius: 3 },
    { x: 20, y: 0, radius: 3 },
    { x: 40, y: 0, radius: 3 },
    { x: 20, y: 12, radius: 3 }, // off-axis
    { x: 60, y: 0, radius: 4 },  // different radius
  ]);
  const viewsMix = projectDoc(docMix);
  const p0 = pickCenterMarkGroupCircle(viewsMix.top, findHoleEdgeAt(viewsMix.top, 0, 0, 3), 'top');
  const p1 = pickCenterMarkGroupCircle(viewsMix.top, findHoleEdgeAt(viewsMix.top, 20, 0, 3), 'top');
  const p2 = pickCenterMarkGroupCircle(viewsMix.top, findHoleEdgeAt(viewsMix.top, 40, 0, 3), 'top');
  const pOff = pickCenterMarkGroupCircle(viewsMix.top, findHoleEdgeAt(viewsMix.top, 20, 12, 3), 'top');
  const pR4 = pickCenterMarkGroupCircle(viewsMix.top, findHoleEdgeAt(viewsMix.top, 60, 0, 4), 'top');
  assert.ok(p0.ok && p1.ok && p2.ok && pOff.ok && pR4.ok);

  assert.equal(resolveCenterMarkGroup(viewsMix.top, [p0.ref, p1.ref], 'top').ok, false, 'fewer than 3 refused');
  assert.equal(resolveCenterMarkGroup(viewsMix.top, [p0.ref, p1.ref, pOff.ref], 'top').ok, false, 'non-collinear refused');
  assert.equal(validateCenterMarkGroupCandidate(viewsMix.top, [p0.ref, p1.ref], pOff.ref, 'top').ok, false);
  assert.equal(resolveCenterMarkGroup(viewsMix.top, [p0.ref, p1.ref, pR4.ref], 'top').ok, false, 'unequal radius refused');
  assert.equal(validateCenterMarkGroupCandidate(viewsMix.top, [p0.ref], pR4.ref, 'top').ok, false);
  assert.equal(resolveCenterMarkGroup(viewsMix.top, [p0.ref, p1.ref, p1.ref], 'top').ok, false, 'duplicate hole refused');
  assert.equal(validateCenterMarkGroupCandidate(viewsMix.top, [p0.ref, p1.ref], p1.ref, 'top').ok, false);
  assert.equal(resolveCenterMarkGroup(viewsMix.iso, [p0.ref, p1.ref, p2.ref], 'iso').ok, false, 'iso view refused');

  // Straight edge refused by picker
  const straight = viewsMix.top.edges.find(e => e.kind === 'line' && e.pieces.some(p => p.visible));
  assert.ok(straight);
  assert.equal(pickCenterMarkGroupCircle(viewsMix.top, straight, 'top').ok, false);

  // Depth-offset 3D plane (looks collinear in Top view, but middle circle sits at Z=15 vs Z=10)
  const docStep: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 6,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 3 },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
      { id: 'n2', kind: 'sketch', profile: 'circle', center: [20, 0], radius: 3 },
      { id: 'n3', kind: 'extrude', sketch: 2, height: 15 },
      { id: 'n4', kind: 'sketch', profile: 'circle', center: [40, 0], radius: 3 },
      { id: 'n5', kind: 'extrude', sketch: 4, height: 10 },
    ],
    outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' }, b5: { node: 5, side: 'solid' } },
  };
  const viewsStep = projectDoc(docStep);
  const s0 = pickCenterMarkGroupCircle(viewsStep.top, findHoleEdgeAt(viewsStep.top, 0, 0, 3, 10), 'top');
  const s1 = pickCenterMarkGroupCircle(viewsStep.top, findHoleEdgeAt(viewsStep.top, 20, 0, 3, 15), 'top');
  const s2 = pickCenterMarkGroupCircle(viewsStep.top, findHoleEdgeAt(viewsStep.top, 40, 0, 3, 10), 'top');
  assert.ok(s0.ok && s1.ok && s2.ok);
  const rDepth = resolveCenterMarkGroup(viewsStep.top, [s0.ref, s1.ref, s2.ref], 'top');
  assert.equal(rDepth.ok, false, 'depth-offset circles on different 3D planes must be rejected');
  assert.match(rDepth.reason, /same 3D plane/i);

  // Partial arc (fillet corner) refused
  let docFillet: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 2,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 40] },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
  const bF0 = brepsFor(docFillet);
  assert.ok('breps' in bF0);
  const corner = bF0.breps[0].edges.find(e => e.name === 'n1.side1|n1.side2')?.name ?? 'n1.side1|n1.side2';
  docFillet = withNode(docFillet, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [corner], radius: 8 });
  const viewsFillet = projectDoc(docFillet);
  const partialArc = viewsFillet.top.edges.find(e => e.kind === 'circle' && e.circle && !e.circle.full && e.pieces.some(p => p.visible));
  assert.ok(partialArc);
  assert.equal(pickCenterMarkGroupCircle(viewsFillet.top, partialArc, 'top').ok, false);

  // Broken view refused in buildSheet
  const brokenSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    dimensions: [],
    breaks: [{ axis: 'x', from: 10, to: 30 }],
    centerMarkGroups: [{ id: 'cmg1', kind: 'linear', view: 'top', members: [p0.ref, p1.ref, p2.ref], connectingLines: true }],
  };
  const brokenLayout = layoutSheet(viewsMix, brokenSettings);
  const brokenSheet = buildSheet(viewsMix, brokenLayout, brokenSettings, { title: 'broken', date: '2026-11-25' });
  assert.equal(brokenSheet.centerMarkGroups?.[0].ok, false);
  assert.equal(brokenSheet.groups.some(g => g.centerMarkGroup), false);

  // Strict readDrawing validation (count bounds 2 & 33, unknown kind, NaN, duplicate id, duplicate member, bad connectingLines)
  const many33 = Array.from({ length: 33 }, (_, i) => ({ edge: `h${i}`, near: [i * 10, 0, 10] as Vec3 }));
  const read = readDrawing({
    ...defaultDrawing(),
    centerMarkGroups: [
      { id: 'too-few', kind: 'linear', view: 'top', members: [p0.ref, p1.ref], connectingLines: true },
      { id: 'too-many', kind: 'linear', view: 'top', members: many33, connectingLines: true },
      { id: 'bad-kind', kind: 'circular', view: 'top', members: [p0.ref, p1.ref, p2.ref], connectingLines: true },
      { id: 'bad-nan', kind: 'linear', view: 'top', members: [p0.ref, p1.ref, { edge: 'x', near: [Number.NaN, 0, 0] }], connectingLines: true },
      { id: 'bad-toggle', kind: 'linear', view: 'top', members: [p0.ref, p1.ref, p2.ref], connectingLines: 'yes' },
      { id: 'dup-member', kind: 'linear', view: 'top', members: [p0.ref, p1.ref, p1.ref], connectingLines: true },
      { id: 'good', kind: 'linear', view: 'top', members: [p0.ref, p1.ref, p2.ref], connectingLines: true },
      { id: 'good', kind: 'linear', view: 'top', members: [p0.ref, p1.ref, p2.ref], connectingLines: false },
    ],
  });
  assert.equal(read.centerMarkGroups?.length, 1);
  assert.equal(read.centerMarkGroups?.[0].id, 'good');
  assert.equal(read.centerMarkGroups?.[0].connectingLines, true);
});

test('center-mark-group supports connectingLines/centers toggles, SVG/DXF output, multi-sheet ownership, reorient, references, and lost-member diagnostics', async () => {
  const doc3 = makePlateWithHoles([
    { x: 0, y: 0, radius: 3 },
    { x: 20, y: 0, radius: 3 },
    { x: 40, y: 0, radius: 3 },
  ]);
  const views3 = projectDoc(doc3);
  const members = [
    pickCenterMarkGroupCircle(views3.top, findHoleEdgeAt(views3.top, 0, 0, 3), 'top'),
    pickCenterMarkGroupCircle(views3.top, findHoleEdgeAt(views3.top, 20, 0, 3), 'top'),
    pickCenterMarkGroupCircle(views3.top, findHoleEdgeAt(views3.top, 40, 0, 3), 'top'),
  ].map(p => { assert.ok(p.ok); return p.ref; });

  const cmg: DrawingCenterMarkGroup = { id: 'cmg1', kind: 'linear', view: 'top', members, connectingLines: true };
  const settingsOn: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [], centerMarkGroups: [cmg] };
  const layout = layoutSheet(views3, settingsOn);
  const sheetOn = buildSheet(views3, layout, settingsOn, { title: 'holes', date: '2026-11-25' });

  // SVG contains distinct group with 2 center-dashed lines
  const svg = sheetSvg(sheetOn, 'holes');
  const groupMatch = svg.match(/<g class="center-mark-group" data-view="top" data-center-mark-group="cmg1">([\s\S]*?)<\/g>/);
  assert.ok(groupMatch, 'SVG should contain center-mark-group element');
  const lineTags = [...groupMatch[1].matchAll(/<line\b[^>]*>/g)].map(m => m[0]);
  assert.equal(lineTags.length, 2);
  for (const tag of lineTags) {
    assert.match(tag, /stroke-dasharray="8 1\.5 1\.5 1\.5"/);
  }

  // DXF contains the 2 connecting LINE entities on CENTER layer with exact 20 mm length
  const dxfDoc = sheetDxfDocument(sheetOn, layout);
  const dxfWithout = sheetDxfDocument(
    buildSheet(views3, layout, { ...settingsOn, centerMarkGroups: [{ ...cmg, connectingLines: false }] }, { title: 'holes', date: '2026-11-25' }),
    layout,
  );
  const centerLinesOn = dxfDoc.entities.filter(e => e.type === 'line' && e.layer === 'CENTER');
  const centerLinesOff = dxfWithout.entities.filter(e => e.type === 'line' && e.layer === 'CENTER');
  assert.equal(centerLinesOn.length - centerLinesOff.length, 2, 'DXF should add exactly 2 CENTER LINE entities');
  const dxfOut = sheetDxf(sheetOn, layout);
  assert.ok(dxfOut.text.includes('CENTER'));

  // Toggle connectingLines: false and global centers: false hide lines while retaining record
  const sheetLineOff = buildSheet(views3, layout, { ...settingsOn, centerMarkGroups: [{ ...cmg, connectingLines: false }] }, { title: 'holes', date: '2026-11-25' });
  assert.equal(sheetLineOff.centerMarkGroups?.[0].ok, true);
  assert.equal(sheetLineOff.groups.some(g => g.centerMarkGroup), false);
  const sheetCentersOff = buildSheet(views3, layout, { ...settingsOn, centers: false }, { title: 'holes', date: '2026-11-25' });
  assert.equal(sheetCentersOff.centerMarkGroups?.[0].ok, true);
  assert.equal(sheetCentersOff.groups.some(g => g.centerMarkGroup), false);

  // Hole row does NOT satisfy HOLE_SIZE_MISSING / HOLE_NOT_LOCATED
  const issuesOn = drawingIssues({ views: views3, layout, settings: settingsOn, sheet: sheetOn, callout: () => null });
  assert.ok(issuesOn.some(i => i.code === 'HOLE_SIZE_MISSING'), 'hole row must not suppress HOLE_SIZE_MISSING');
  assert.ok(issuesOn.some(i => i.code === 'HOLE_NOT_LOCATED'), 'hole row must not suppress HOLE_NOT_LOCATED');

  // Multi-sheet ownership: move top view to Sheet 2; sheet 1 edits preserve sheet 2's hole row
  const multi: DrawingSettings = { ...settingsOn, sheets: [{ id: 'S2', views: ['top'] }] };
  const s1 = forSheet(multi, 0);
  const s2 = forSheet(multi, 1);
  assert.equal(s1.centerMarkGroups, undefined);
  assert.equal(s2.centerMarkGroups?.length, 1);
  const afterS1Edit = mergeSheet(multi, 0, { ...s1, hidden: false });
  assert.equal(afterS1Edit.centerMarkGroups?.length, 1);
  assert.equal(afterS1Edit.centerMarkGroups?.[0].id, 'cmg1');

  // Reorient y- -> x+ preserves top view hole row cleanly
  const res3 = brepsFor(doc3);
  assert.ok('breps' in res3);
  const projX = projectViews(res3.breps, res3.prefixes, { orientation: 'x+' });
  assert.ok(projX.ok);
  const turned = reorient(views3, projX.views, settingsOn, 'x+');
  assert.ok(turned.ok);
  assert.equal(turned.settings.centerMarkGroups?.length, 1);
  assert.equal(turned.settings.centerMarkGroups?.[0].view, 'top');

  // Reference capture & verification
  const docWithGroup: StudioDoc = { ...doc3, drawing: settingsOn };
  const eval3 = evaluateDoc(docWithGroup, 1);
  assert.ok(eval3.ok);
  const signed = captureSignatures(docWithGroup, eval3.bodies);
  const { refs } = referencesOf(signed, true);
  const groupRefs = refs.filter(r => r.where === 'center-mark-group cmg1');
  assert.equal(groupRefs.length, 3);
  assert.ok(groupRefs.every(r => r.edge && !!r.sig));
  const verified = await verifyReferences(signed, eval3.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);
  assert.equal(verified.changes.length, 0);

  // Middle hole deleted/suppressed -> record preserved, no connecting lines emitted, CENTER_MARK_GROUP_LOST + applyFix
  const docMissingMiddle = makePlateWithHoles([
    { x: 0, y: 0, radius: 3 },
    { x: 40, y: 0, radius: 3 },
  ]);
  const viewsMissing = projectDoc(docMissingMiddle);
  const layoutMissing = layoutSheet(viewsMissing, settingsOn);
  const sheetMissing = buildSheet(viewsMissing, layoutMissing, settingsOn, { title: 'missing', date: '2026-11-25' });
  assert.equal(sheetMissing.centerMarkGroups?.length, 1);
  assert.equal(sheetMissing.centerMarkGroups?.[0].ok, false);
  assert.equal(sheetMissing.groups.some(g => g.centerMarkGroup), false, 'unresolved group must emit no connecting lines');
  const lostIssues = drawingIssues({ views: viewsMissing, layout: layoutMissing, settings: settingsOn, sheet: sheetMissing, callout: () => null });
  const lost = lostIssues.find(i => i.code === 'CENTER_MARK_GROUP_LOST');
  assert.ok(lost && lost.fix?.kind === 'remove-center-mark-group');
  const fixed = applyFix({ views: viewsMissing, layout: layoutMissing, settings: settingsOn, sheet: sheetMissing, callout: () => null }, lost.fix);
  assert.equal(fixed.centerMarkGroups, undefined);
});
