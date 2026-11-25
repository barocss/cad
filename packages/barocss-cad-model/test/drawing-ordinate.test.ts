import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { applyFix, drawingIssues } from '../src/drawing/issues';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { reorient } from '../src/drawing/reorient';
import { defaultDrawing, readDrawing, type DimPoint, type DrawingOrdinateGroup, type DrawingSettings, type DrawingViews, type Vec3 } from '../src/drawing/types';
import { newOrdinateGroupId, newOrdinateMemberId, resolveOrdinateGroup } from '../src/drawing/ordinate';
import { presetFor } from '../src/drawing/standard';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';

/** Asymmetric 60x30x10 mm plate with three holes at X = 10, 25, 40 (and optional duplicate-X hole at (25, 22)). */
function plateWithHolesDoc(
  shiftX = 0,
  shiftY = 0,
  holeXs: readonly [number, number, number] = [10, 25, 40],
  withSecondHoleAt25 = false,
): StudioDoc {
  let doc = rectanglePart(60, 30, 10);
  // Shift the base rectangle if requested to test whole-part translation invariance
  if (shiftX !== 0 || shiftY !== 0) {
    doc = {
      ...doc,
      nodes: doc.nodes.map((n, i) =>
        i === 0 && n.kind === 'sketch' && n.profile === 'rectangle'
          ? { ...n, min: [shiftX, shiftY], max: [shiftX + 60, shiftY + 30] }
          : n),
    };
  }
  doc = withNode(doc, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [shiftX + holeXs[0], shiftY + 12], axis: 'z', radius: 3 });
  doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [shiftX + holeXs[1], shiftY + 12], axis: 'z', radius: 3 });
  doc = withNode(doc, { kind: 'hole', parent: { node: 3, side: 'solid' }, center: [shiftX + holeXs[2], shiftY + 12], axis: 'z', radius: 3 });
  if (withSecondHoleAt25) {
    doc = withNode(doc, { kind: 'hole', parent: { node: 4, side: 'solid' }, center: [shiftX + holeXs[1], shiftY + 22], axis: 'z', radius: 3 });
  }
  return doc;
}

function projectDoc(doc: StudioDoc): DrawingViews {
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok);
  return proj.views;
}

function snapCorner(views: DrawingViews, x: number, y: number): DimPoint {
  const e = views.top.edges.find(ed => ed.ends?.some(p => Math.abs(p[0] - x) < 1e-4 && Math.abs(p[1] - y) < 1e-4));
  assert.ok(e && e.ends, `No edge end at (${x}, ${y})`);
  const end = e.ends.find(p => Math.abs(p[0] - x) < 1e-4 && Math.abs(p[1] - y) < 1e-4)!;
  return { edge: e.name, at: 'end', near: [end[0], end[1], end[2]] as Vec3 };
}

function snapHole(views: DrawingViews, x: number, y: number): DimPoint {
  const e = views.top.edges.find(ed => ed.circle && Math.abs(ed.circle.center[0] - x) < 1e-4 && Math.abs(ed.circle.center[1] - y) < 1e-4);
  assert.ok(e && e.circle, `No hole center at (${x}, ${y})`);
  return { edge: e.name, at: 'center', near: [e.circle.center[0], e.circle.center[1], e.circle.center[2]] as Vec3 };
}

function near(a: number, b: number, tol = 1e-6): void {
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b}`);
}

test('drawing ordinate groups: measures 10/25/40 from origin, stays invariant to part translation, group move, jog, scale, and units', () => {
  const doc = plateWithHolesDoc(0, 0, [10, 25, 40]);
  const views = projectDoc(doc);
  const origin = snapCorner(views, 0, 0);
  const h1 = snapHole(views, 10, 12);
  const h2 = snapHole(views, 25, 12);
  const h3 = snapHole(views, 40, 12);

  const group: DrawingOrdinateGroup = {
    id: newOrdinateGroupId(),
    view: 'top',
    axis: 'horizontal',
    origin,
    lineCoord: 38,
    members: [
      { id: newOrdinateMemberId([]), point: h1 },
      { id: 'm2', point: h2, jog: 4 },
      { id: 'm3', point: h3 },
    ],
  };

  const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, ordinateGroups: [group], dimensions: [] };
  const layout = layoutSheet(views, settings);
  const sheet = buildSheet(views, layout, settings, { title: 'Ordinate', date: '2026-11-26' });
  const r = sheet.ordinateGroups?.[0];
  assert.ok(r && r.ok);
  assert.equal(r.originText, '0');
  assert.deepEqual(r.members.map(m => m.ok ? m.text : 'lost'), ['10', '25', '40']);
  near(r.members[0].ok ? r.members[0].value : NaN, 10);
  near(r.members[1].ok ? r.members[1].value : NaN, 25);
  near(r.members[2].ok ? r.members[2].value : NaN, 40);

  // Moving the group baseline (lineCoord 38 -> 48) and changing jog (4 -> -6) NEVER alters values
  const movedSettings: DrawingSettings = {
    ...settings,
    scale: 0.5,
    ordinateGroups: [{ ...group, lineCoord: 48, members: group.members.map(m => m.id === 'm2' ? { ...m, jog: -6 } : m) }],
  };
  const movedSheet = buildSheet(views, layoutSheet(views, movedSettings), movedSettings, { title: 'Moved', date: '2026-11-26' });
  const mr = movedSheet.ordinateGroups?.[0];
  assert.ok(mr && mr.ok);
  assert.deepEqual(mr.members.map(m => m.ok ? m.value : NaN), [10, 25, 40]);

  // Whole-part translation (+100, +50) keeps identical relative values 10 / 25 / 40!
  const shiftedDoc = plateWithHolesDoc(100, 50, [10, 25, 40]);
  const shiftedViews = projectDoc(shiftedDoc);
  const shiftedGroup: DrawingOrdinateGroup = {
    id: 'ord1',
    view: 'top',
    axis: 'horizontal',
    origin: snapCorner(shiftedViews, 100, 50),
    lineCoord: 88,
    members: [
      { id: 'm1', point: snapHole(shiftedViews, 110, 62) },
      { id: 'm2', point: snapHole(shiftedViews, 125, 62) },
      { id: 'm3', point: snapHole(shiftedViews, 140, 62) },
    ],
  };
  const sr = resolveOrdinateGroup(shiftedViews.top, shiftedGroup, 'top', presetFor(settings));
  assert.ok(sr.ok);
  assert.deepEqual(sr.members.map(m => m.ok ? m.value : NaN), [10, 25, 40]);

  // Inch + dual display converts display text while preserving mm values
  const inchSettings: DrawingSettings = { ...settings, units: 'inch', dual: true };
  const inchSheet = buildSheet(views, layoutSheet(views, inchSettings), inchSettings, { title: 'Inch', date: '2026-11-26' });
  const ir = inchSheet.ordinateGroups?.[0];
  assert.ok(ir && ir.ok && ir.members[0].ok);
  near(ir.members[0].value, 10);
  assert.equal(ir.members[0].alt, '10');
  assert.equal(ir.members[0].text, '.394');
});

test('drawing ordinate groups: distinguishes origin 0, signed both sides of origin, and duplicate-coordinate distinct holes', () => {
  const doc = plateWithHolesDoc(0, 0, [10, 25, 40], true);
  const views = projectDoc(doc);
  // Set origin at hole 2 (X = 25) -> hole 1 is -15, hole 2B (at X=25, Y=22) is 0 (distinct from origin!), hole 3 is +15
  const group: DrawingOrdinateGroup = {
    id: 'ord1',
    view: 'top',
    axis: 'horizontal',
    origin: snapHole(views, 25, 12),
    lineCoord: 38,
    members: [
      { id: 'm1', point: snapHole(views, 10, 12) },
      { id: 'm2', point: snapHole(views, 25, 22) }, // same X=25 as origin, distinct hole target!
      { id: 'm3', point: snapHole(views, 40, 12) },
    ],
  };
  const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, ordinateGroups: [group], dimensions: [] };
  const sheet = buildSheet(views, layoutSheet(views, settings), settings, { title: 'Signed', date: '2026-11-26' });
  const r = sheet.ordinateGroups?.[0];
  assert.ok(r && r.ok);
  assert.equal(r.members.length, 3); // duplicate-X target NOT collapsed!
  assert.deepEqual(r.members.map(m => m.ok ? m.text : 'lost'), ['-15', '0', '15']);
  const svg = sheetSvg(sheet, 'Signed');
  assert.ok(svg.includes('data-ordinate-group="ord1"'));
  assert.ok(svg.includes('>-15</text>'));
  assert.ok(svg.includes('>15</text>'));
  // Origin renders a distinct circle arc mark
  const ordGroupMarks = sheet.groups.find(g => g.ordinateGroup && g.id === 'ord1')?.marks ?? [];
  assert.equal(ordGroupMarks.filter(m => m.kind === 'arc').length, 1);
});

test('drawing ordinate groups: separates member loss from origin loss, refuses broken/assembly/iso views, and supports applyFix', () => {
  const doc = plateWithHolesDoc(0, 0, [10, 25, 40]);
  const views = projectDoc(doc);
  const origin = snapCorner(views, 0, 0);
  const h1 = snapHole(views, 10, 12);
  const h3 = snapHole(views, 40, 12);

  // 1. Single member lost -> origin & remaining members keep resolving, ORDINATE_MEMBER_LOST raised with remove-ordinate-member fix
  const memberLostSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    ordinateGroups: [{
      id: 'ord1',
      view: 'top',
      axis: 'horizontal',
      origin,
      lineCoord: 38,
      members: [
        { id: 'm1', point: h1 },
        { id: 'm2', point: { edge: 'missing.edge', at: 'center', near: [25, 12, 10] } },
        { id: 'm3', point: h3 },
      ],
    }],
    dimensions: [],
  };
  const mlLayout = layoutSheet(views, memberLostSettings);
  const mlSheet = buildSheet(views, mlLayout, memberLostSettings, { title: 'MemberLost', date: '2026-11-26' });
  const mlr = mlSheet.ordinateGroups?.[0];
  assert.ok(mlr && mlr.ok);
  assert.equal(mlr.members[0].ok, true);
  assert.equal(mlr.members[1].ok, false);
  assert.equal(mlr.members[2].ok, true);
  const mlIssues = drawingIssues({ views, layout: mlLayout, settings: memberLostSettings, sheet: mlSheet, callout: () => null });
  const memIssue = mlIssues.find(i => i.code === 'ORDINATE_MEMBER_LOST');
  assert.deepEqual(memIssue?.fix, { kind: 'remove-ordinate-member', groupId: 'ord1', memberId: 'm2' });
  const afterMemFix = applyFix({ views, layout: mlLayout, settings: memberLostSettings, sheet: mlSheet, callout: () => null }, memIssue!.fix!);
  assert.deepEqual(afterMemFix.ordinateGroups?.[0].members.map(m => m.id), ['m1', 'm3']);

  // 2. Origin lost -> WHOLE group lost (ORDINATE_ORIGIN_LOST), never fabricates 0 or silently rebinds
  const originLostSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    ordinateGroups: [{
      id: 'ord1',
      view: 'top',
      axis: 'horizontal',
      origin: { edge: 'gone.origin', at: 'end', near: [0, 0, 10] },
      lineCoord: 38,
      members: [{ id: 'm1', point: h1 }],
    }],
    dimensions: [],
  };
  const olLayout = layoutSheet(views, originLostSettings);
  const olSheet = buildSheet(views, olLayout, originLostSettings, { title: 'OriginLost', date: '2026-11-26' });
  assert.equal(olSheet.ordinateGroups?.[0].ok, false);
  assert.equal(olSheet.groups.some(g => g.ordinateGroup), false);
  const olIssues = drawingIssues({ views, layout: olLayout, settings: originLostSettings, sheet: olSheet, callout: () => null });
  const orgIssue = olIssues.find(i => i.code === 'ORDINATE_ORIGIN_LOST');
  assert.deepEqual(orgIssue?.fix, { kind: 'remove-ordinate-group', id: 'ord1' });
  const afterOrgFix = applyFix({ views, layout: olLayout, settings: originLostSettings, sheet: olSheet, callout: () => null }, orgIssue!.fix!);
  assert.equal(afterOrgFix.ordinateGroups, undefined);

  // 3. Broken view & assembly scope refusal
  const brokenSettings: DrawingSettings = { ...memberLostSettings, breaks: [{ axis: 'x', from: 15, to: 20 }] };
  const brokenSheet = buildSheet(views, layoutSheet(views, brokenSettings), brokenSettings, { title: 'Broken', date: '2026-11-26' });
  assert.equal(brokenSheet.ordinateGroups?.[0].ok, false);

  const asmSettings: DrawingSettings = { ...memberLostSettings, scope: { kind: 'assembly' } };
  const asmSheet = buildSheet(views, layoutSheet(views, asmSettings), asmSettings, { title: 'Asm', date: '2026-11-26' });
  assert.equal(asmSheet.ordinateGroups?.[0].ok, false);
});

test('drawing ordinate groups: survives readDrawing, reference signatures, multi-sheet, reorient, and SVG/DXF export', async () => {
  const doc = plateWithHolesDoc(0, 0, [10, 25, 40]);
  const views = projectDoc(doc);
  const group: DrawingOrdinateGroup = {
    id: 'ord1',
    view: 'top',
    axis: 'horizontal',
    origin: snapCorner(views, 0, 0),
    lineCoord: 38,
    members: [
      { id: 'm1', point: snapHole(views, 10, 12) },
      { id: 'm2', point: snapHole(views, 25, 12), jog: 4 },
      { id: 'm3', point: snapHole(views, 40, 12) },
    ],
  };
  const rawSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, ordinateGroups: [group], dimensions: [] };
  const roundTripped = readDrawing(JSON.parse(JSON.stringify(rawSettings)));
  assert.equal(roundTripped.ordinateGroups?.length, 1);
  assert.equal(roundTripped.ordinateGroups?.[0].members.length, 3);
  assert.equal(roundTripped.ordinateGroups?.[0].members[1].jog, 4);

  // Reference signatures capture & verify cleanly
  const withDrawing: StudioDoc = { ...doc, drawing: roundTripped };
  const evaluated = evaluateDoc(withDrawing, 1);
  assert.ok(evaluated.ok);
  const signed = captureSignatures(withDrawing, evaluated.bodies);
  const { refs } = referencesOf(signed, true);
  assert.equal(refs.filter(r => r.where.startsWith('ordinate-group ord1')).length, 4);
  const verified = await verifyReferences(signed, evaluated.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);

  // Multi-sheet forSheet / mergeSheet
  const multi: DrawingSettings = { ...roundTripped, sheets: [{ id: 's2', views: ['top'] }] };
  assert.equal(forSheet(multi, 0).ordinateGroups, undefined);
  assert.equal(forSheet(multi, 1).ordinateGroups?.length, 1);
  assert.equal(mergeSheet(multi, 0, { ...forSheet(multi, 0), hidden: false }).ordinateGroups?.length, 1);

  // Reorient y- -> x+ preserves ordinate group and values
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const projX = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(projX.ok);
  const turned = reorient(views, projX.views, roundTripped, 'x+');
  assert.ok(turned.ok);
  assert.equal(turned.settings.ordinateGroups?.length, 1);
  assert.equal(turned.settings.ordinateGroups?.[0].axis, 'vertical');

  // SVG & DXF export (jogged member produces 3 witness segments)
  const layout = layoutSheet(views, roundTripped);
  const sheet = buildSheet(views, layout, roundTripped, { title: 'OrdDXF', date: '2026-11-26' });
  const svg = sheetSvg(sheet, 'OrdDXF');
  assert.ok(svg.includes('data-ordinate-group="ord1"'));
  assert.ok(svg.includes('>0</text>'));
  assert.ok(svg.includes('>10</text>'));
  assert.ok(svg.includes('>25</text>'));
  assert.ok(svg.includes('>40</text>'));
  const dxfDoc = sheetDxfDocument(sheet, layout, 'AC1015');
  assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text === '10'));
  assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text === '25'));
  assert.ok(dxfDoc.entities.some(e => e.type === 'text' && e.text === '40'));
  assert.ok(sheetDxf(sheet, layout, 'AC1015').text.includes('40'));
});
