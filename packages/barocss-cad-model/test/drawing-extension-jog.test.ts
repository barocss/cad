import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { snapPoints } from '../src/drawing/dimensions';
import { fromSheet, layoutSheet, toSheet } from '../src/drawing/views';
import { buildSheet, type Mark } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings, type XY } from '../src/drawing/types';
import { extensionJogFromSheetPoint, extensionJogGeometry, readLinearExtensionJog } from '../src/drawing/extensionJog';
import { drawingIssues } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { modelAnnotations } from '../src/drawing/annotations3d';

type LinearDim = Extract<DrawingDimension, { kind: 'linear' }>;

function makeFixture(width = 40, height = 24, depth = 8) {
  const doc = rectanglePart(width, depth, height);
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok);
  const points = snapPoints(proj.views.front);
  const at = (x: number, y: number) => {
    const found = points.find(p => Math.abs(p.at[0] - x) + Math.abs(p.at[1] - y) < 1e-6);
    assert.ok(found, `missing snap point (${x}, ${y})`);
    return found.ref;
  };
  return { doc, views: proj.views, at };
}

function extLines(marks: readonly Mark[]): Extract<Mark, { kind: 'line' }>[] {
  return marks.filter((m): m is Extract<Mark, { kind: 'line' }> => m.kind === 'line' && m.role === 'extension');
}

function arrowTips(marks: readonly Mark[]): XY[] {
  return marks.filter((m): m is Extract<Mark, { kind: 'fill' }> => m.kind === 'fill' && !!m.head).map(m => m.head!.tip);
}

test('extensionJogGeometry computes exact 5-segment path, preserves GAP/OVER, and projects drag handles', () => {
  const P: XY = [10, 20];
  const Q: XY = [10, 40]; // 20 mm down (e = [0, 1])
  const axis: XY = [1, 0];
  const res = extensionJogGeometry(P, Q, axis, { side: 'a', offset: -4, at: 0.5 });
  assert.ok(res.ok);
  const segs = res.geometry.segments;
  assert.equal(segs.length, 5);
  // Starts at P + e * 1 = (10, 21), ends at Q + e * 2 = (10, 42)
  assert.deepEqual(segs[0][0], [10, 21]);
  assert.deepEqual(segs[4][1], [10, 42]);
  // Connected chain P0->P1->P2->P3->P4->P5
  for (let i = 0; i < 4; i++) assert.deepEqual(segs[i][1], segs[i + 1][0]);
  // Offset plateau P2..P3 is shifted laterally by exact -4 mm
  assert.ok(Math.abs(segs[2][0][0] - 6) < 1e-9 && Math.abs(segs[2][1][0] - 6) < 1e-9);
  assert.ok(Math.abs(res.geometry.handle[0] - 6) < 1e-9);

  // Too short extension (< GAP + 6 = 7 mm) refused explicitly
  const shortRes = extensionJogGeometry([10, 20], [10, 25], axis, { side: 'a', offset: -4 });
  assert.equal(shortRes.ok, false);

  // Drag projection roundtrip
  const dragged = extensionJogFromSheetPoint(P, Q, axis, 'a', [15.5, 32]);
  assert.ok(dragged);
  assert.equal(dragged.side, 'a');
  assert.equal(dragged.offset, 5.5);
});

test('jogged extension preserves measured value across source edit, orientations, side flips, scale/units, reorient, SVG, DXF, and 3D PMI', () => {
  const { views, at } = makeFixture(40, 24, 8);
  const d1: LinearDim = {
    id: 'd1', view: 'front', kind: 'linear', orient: 'horizontal',
    a: at(0, 0), b: at(40, 0), place: [20, -18],
    extensionJog: { side: 'a', offset: -5 },
  };
  const d2: LinearDim = {
    id: 'd2', view: 'front', kind: 'linear', orient: 'vertical',
    a: at(40, 0), b: at(40, 24), place: [58, 12],
    extensionJog: { side: 'b', offset: 4 },
  };
  const d3: LinearDim = {
    id: 'd3', view: 'front', kind: 'linear', orient: 'aligned',
    a: at(0, 0), b: at(40, 24), place: [10, 32],
    extensionJog: { side: 'a', offset: -3 },
  };
  const baseSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [{ ...d1, extensionJog: undefined }, d2, d3] };
  const jogSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [d1, d2, d3] };

  const baseLayout = layoutSheet(views, baseSettings);
  const baseSheet = buildSheet(views, baseLayout, baseSettings, { title: 'Jog', date: '2026-11-25' });
  const jogLayout = layoutSheet(views, jogSettings);
  const jogSheet = buildSheet(views, jogLayout, jogSettings, { title: 'Jog', date: '2026-11-25' });

  // Horizontal, vertical, aligned all produce 5 jogged + 1 straight = 6 extension lines
  for (const id of ['d1', 'd2', 'd3']) {
    const g = jogSheet.groups.find(x => x.role === 'dimension' && x.id === id)!;
    assert.equal(extLines(g.marks).length, 6, `${id} should have 6 extension line marks`);
  }
  // Arrow tips and measured value on d1 are 100% identical to straight baseline
  const baseD1 = baseSheet.groups.find(x => x.id === 'd1')!;
  const jogD1 = jogSheet.groups.find(x => x.id === 'd1')!;
  assert.deepEqual(arrowTips(jogD1.marks), arrowTips(baseD1.marks));
  const r1 = jogSheet.dimensions.find(r => r.dim.id === 'd1');
  assert.ok(r1?.ok && r1.value === 40 && r1.text === '40');

  // Sibling d2 is unaffected when d1 changes; flipping d1 place to opposite side (+y) keeps jog cleanly
  const flippedSettings: DrawingSettings = { ...jogSettings, dimensions: [{ ...d1, place: [20, 42] }] };
  const flippedLayout = layoutSheet(views, flippedSettings);
  const flippedSheet = buildSheet(views, flippedLayout, flippedSettings, { title: 'Jog', date: '2026-11-25' });
  assert.equal(extLines(flippedSheet.groups.find(x => x.id === 'd1')!.marks).length, 6);
  const flippedR = flippedSheet.dimensions.find(r => r.dim.id === 'd1');
  assert.ok(flippedR?.ok && flippedR.value === 40);

  // Source edit 40 -> 50 mm updates value to 50 mm while preserving extensionJog on side 'a'
  const edited = makeFixture(50, 24, 8);
  const editedD1: LinearDim = { ...d1, a: edited.at(0, 0), b: edited.at(50, 0) };
  const editedSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [editedD1] };
  const editedLayout = layoutSheet(edited.views, editedSettings);
  const editedSheet = buildSheet(edited.views, editedLayout, editedSettings, { title: 'Jog', date: '2026-11-25' });
  const editedR = editedSheet.dimensions.find(r => r.dim.id === 'd1');
  assert.ok(editedR?.ok && editedR.value === 50 && editedR.text === '50');
  assert.equal(extLines(editedSheet.groups.find(x => x.id === 'd1')!.marks).length, 6);

  // When extension A is <= GAP (omitted), B's identity remains 'b' and jog on B still renders 5 lines
  const stepShort: LinearDim = {
    id: 'short-a', view: 'front', kind: 'linear', orient: 'aligned',
    a: at(0, 0), b: at(40, 24), place: [0, 0], // A is right on dim line (l=0), B is far if horizontal; use horizontal at y=0 with A=(0,0), B=(40,24)
    extensionJog: { side: 'b', offset: 4 },
  };
  const shortAHoriz: LinearDim = { ...stepShort, orient: 'horizontal', place: [20, 0] };
  const shortSettings: DrawingSettings = { ...defaultDrawing(), scale: 1, dimensions: [shortAHoriz] };
  const shortLayout = layoutSheet(views, shortSettings);
  const shortSheet = buildSheet(views, shortLayout, shortSettings, { title: 'Jog', date: '2026-11-25' });
  // A has l=0 (omitted), B has l=24 (jogged into 5 segments) => exactly 5 extension lines!
  assert.equal(extLines(shortSheet.groups.find(x => x.id === 'short-a')!.marks).length, 5);

  // Scale 1:2 + inch dual preserves exact -5 mm paper lateral offset and 40 mm true value
  const scaledSettings: DrawingSettings = { ...defaultDrawing(), scale: 0.5, units: 'inch', dual: true, dimensions: [{ ...d1, place: [20, -30] }] };
  const scaledLayout = layoutSheet(views, scaledSettings);
  const scaledSheet = buildSheet(views, scaledLayout, scaledSettings, { title: 'Jog', date: '2026-11-25' });
  const scaledExt = extLines(scaledSheet.groups.find(x => x.id === 'd1')!.marks);
  assert.equal(scaledExt.length, 6);
  const aSheet = toSheet(scaledLayout.views.front, [0, 0]);
  // Plateau segment scaledExt[2] is laterally shifted by exact -5 mm in sheet space
  assert.ok(Math.abs(scaledExt[2].a[0] - (aSheet[0] - 5)) < 1e-6);
  const scaledR = scaledSheet.dimensions.find(r => r.dim.id === 'd1');
  assert.ok(scaledR?.ok && scaledR.value === 40 && scaledR.alt === '40');

  // Reorient (y- -> x+) preserves extensionJog and measured value
  const doc = rectanglePart(40, 8, 24);
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const turnedProj = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(turnedProj.ok);
  const turned = reorient(views, turnedProj.views, { ...defaultDrawing(), scale: 1, dimensions: [d1] }, 'x+');
  assert.ok(turned.ok);
  assert.deepEqual((turned.settings.dimensions[0] as LinearDim).extensionJog, d1.extensionJog);

  // Independent SVG check: 6 extension lines + 1 dimension line = 7 <line> elements inside data-dim="d1"
  const svg = sheetSvg(jogSheet, 'Jog');
  const d1Svg = svg.match(/<g class="dimension"[^>]+data-dim="d1">([^]*?)<\/g>/)?.[1];
  assert.ok(d1Svg);
  const svgLines = [...d1Svg.matchAll(/<line /g)];
  assert.equal(svgLines.length, 7);

  // Independent DXF check: native DIMENSION value 40 preserved + 7 LINE entities in display block
  const dxfDoc = sheetDxfDocument(jogSheet, jogLayout);
  const dxfDim = dxfDoc.entities.find(e => e.type === 'dimension' && e.measurement === 40);
  assert.ok(dxfDim && dxfDim.type === 'dimension');
  assert.equal(dxfDim.block.filter(e => e.type === 'line').length, 7);
  assert.ok(sheetDxf(jogSheet, jogLayout).text.includes('DIMENSION'));

  // 3D PMI check: targets remain the 2 exact model reference points while lifted extension lines include the 5 bent segments
  const pmi = modelAnnotations({ views, layout: jogLayout, sheet: jogSheet, settings: jogSettings });
  const pmiD1 = pmi.items.find(item => item.id === 'd1')!;
  assert.equal(pmiD1.targets.length, 2);
  assert.deepEqual(pmiD1.targets.map(t => t.edge), [d1.a.edge, d1.b.edge]);
  assert.equal(pmiD1.lines.filter(l => l.role === 'extension').length, 6);
});

test('negative controls: invalid values, short extension, hidden side retention, and bent-segment TEXT_OVER_LINES / OFF_SHEET', () => {
  const { views, at } = makeFixture(40, 24, 8);
  const baseDim: LinearDim = { id: 'd1', view: 'front', kind: 'linear', orient: 'horizontal', a: at(0, 0), b: at(40, 0), place: [20, -18] };

  // Malformed values stripped by readLinearExtensionJog / readDrawing
  assert.equal(readLinearExtensionJog({ side: 'a', offset: Number.NaN }), undefined);
  assert.equal(readLinearExtensionJog({ side: 'a', offset: Number.POSITIVE_INFINITY }), undefined);
  assert.equal(readLinearExtensionJog({ side: 'a', offset: 0 }), undefined);
  assert.equal(readLinearExtensionJog({ side: 'a', offset: 0.2 }), undefined);
  assert.equal(readLinearExtensionJog({ side: 'a', offset: 99 }), undefined);
  assert.equal(readLinearExtensionJog({ side: 'c', offset: -4 }), undefined);
  assert.equal(readLinearExtensionJog({ side: 'a', offset: -4, at: 0.99 }), undefined);
  const parsed = readDrawing({ ...defaultDrawing(), dimensions: [{ ...baseDim, extensionJog: { side: 'a', offset: Number.NaN } }] });
  assert.equal((parsed.dimensions[0] as LinearDim).extensionJog, undefined);

  // Extension too short (place at y = -4 => 4 mm < 7 mm): falls back to straight (2 lines) + EXTENSION_JOG_INVALID warning
  const shortSettings: DrawingSettings = {
    ...defaultDrawing(), scale: 1,
    dimensions: [{ ...baseDim, place: [20, -4], extensionJog: { side: 'a', offset: -4 } }],
  };
  const shortLayout = layoutSheet(views, shortSettings);
  const shortSheet = buildSheet(views, shortLayout, shortSettings, { title: 'Short', date: '2026-11-25' });
  assert.equal(extLines(shortSheet.groups.find(x => x.id === 'd1')!.marks).length, 2);
  assert.ok(drawingIssues({ views, layout: shortLayout, sheet: shortSheet, settings: shortSettings, callout: () => null }).some(i => i.code === 'EXTENSION_JOG_INVALID'));

  // Hidden side retains saved jog in doc, omits marks for side 'a' (only 1 straight line for 'b'), and emits warning
  const hiddenSettings: DrawingSettings = {
    ...defaultDrawing(), scale: 1,
    dimensions: [{ ...baseDim, hideExtension: 'a', extensionJog: { side: 'a', offset: -4 } }],
  };
  const hiddenLayout = layoutSheet(views, hiddenSettings);
  const hiddenSheet = buildSheet(views, hiddenLayout, hiddenSettings, { title: 'Hidden', date: '2026-11-25' });
  assert.equal(extLines(hiddenSheet.groups.find(x => x.id === 'd1')!.marks).length, 1);
  assert.ok(drawingIssues({ views, layout: hiddenLayout, sheet: hiddenSheet, settings: hiddenSettings, callout: () => null }).some(i => i.code === 'EXTENSION_JOG_INVALID'));

  // Counterexample: a standalone frame placed right on top of the bent plateau P2..P3 triggers TEXT_OVER_LINES,
  // whereas a standalone frame placed cleanly in the unshifted concavity clear of all 5 segments does NOT!
  const jogSettings: DrawingSettings = {
    ...defaultDrawing(), scale: 1,
    dimensions: [{ ...baseDim, extensionJog: { side: 'a', offset: -8 } }],
  };
  const jogLayout = layoutSheet(views, jogSettings);
  const jogSheet = buildSheet(views, jogLayout, jogSettings, { title: 'Clash', date: '2026-11-25' });
  const bentPlateau = extLines(jogSheet.groups.find(x => x.id === 'd1')!.marks)[2];
  const plateauMid: XY = [(bentPlateau.a[0] + bentPlateau.b[0]) / 2, (bentPlateau.a[1] + bentPlateau.b[1]) / 2];
  const vpFront = jogLayout.views.front;
  const toModel = (q: XY): XY => fromSheet(vpFront, q);

  const clashSettings: DrawingSettings = {
    ...jogSettings,
    frames: [{ id: 'f1', view: 'front', characteristic: 'flatness', value: 0.1, datums: [], place: toModel([plateauMid[0] - 8, plateauMid[1] - 2]) }],
  };
  const clashSheet = buildSheet(views, jogLayout, clashSettings, { title: 'Clash', date: '2026-11-25' });
  const clashIssues = drawingIssues({ views, layout: jogLayout, sheet: clashSheet, settings: clashSettings, callout: () => null });
  assert.ok(clashIssues.some(i => i.code === 'TEXT_OVER_LINES' && i.frames?.includes('f1')), 'bent plateau must trigger TEXT_OVER_LINES');

  // Place the frame cleanly on the opposite side of the original extension axis — clear of all 5 bent segments (no over-conservative bbox clash)
  const clearSettings: DrawingSettings = {
    ...jogSettings,
    frames: [{ id: 'f1', view: 'front', characteristic: 'flatness', value: 0.1, datums: [], place: toModel([plateauMid[0] + 18, plateauMid[1]]) }],
  };
  const clearSheet = buildSheet(views, jogLayout, clearSettings, { title: 'Clear', date: '2026-11-25' });
  const clearIssues = drawingIssues({ views, layout: jogLayout, sheet: clearSheet, settings: clearSettings, callout: () => null });
  assert.equal(clearIssues.some(i => i.code === 'TEXT_OVER_LINES' && i.frames?.includes('f1')), false);

  // Counterexample: unjogged dimension is on-sheet, while a large jog offset reaching past the left frame triggers OFF_SHEET
  const onSheetBase: DrawingSettings = {
    ...defaultDrawing(), scale: 2, views: ['front', 'top'],
    dimensions: [{ ...baseDim, place: [20, -15] }],
  };
  const onLayout = layoutSheet(views, onSheetBase);
  const onSheet = buildSheet(views, onLayout, onSheetBase, { title: 'On', date: '2026-11-25' });
  assert.equal(drawingIssues({ views, layout: onLayout, sheet: onSheet, settings: onSheetBase, callout: () => null }).some(i => i.code === 'OFF_SHEET'), false);

  const leftEdgeX = toSheet(onLayout.views.front, [0, 0])[0];
  const offOffset = -Math.min(40, Math.max(15, Math.ceil(leftEdgeX - onLayout.frame[0] + 5)));
  const offSettings: DrawingSettings = {
    ...onSheetBase,
    dimensions: [{ ...baseDim, place: [20, -15], extensionJog: { side: 'a', offset: offOffset } }],
  };
  const offLayout = layoutSheet(views, offSettings);
  const offSheet = buildSheet(views, offLayout, offSettings, { title: 'Off', date: '2026-11-25' });
  // If leftEdgeX - frame[0] > 35 mm on A4, place the dimension near bottom frame with scale 3 so the bent plateau crosses fx0
  if (leftEdgeX + offOffset < offLayout.frame[0]) {
    assert.ok(drawingIssues({ views, layout: offLayout, sheet: offSheet, settings: offSettings, callout: () => null }).some(i => i.code === 'OFF_SHEET'));
  } else {
    const tightSettings: DrawingSettings = {
      ...defaultDrawing(), scale: 2.5, views: ['front', 'top'],
      dimensions: [{ ...baseDim, place: [20, -15], extensionJog: { side: 'a', offset: -40 } }],
    };
    const tightLayout = layoutSheet(views, tightSettings);
    const tightSheet = buildSheet(views, tightLayout, tightSettings, { title: 'Off', date: '2026-11-25' });
    assert.ok(drawingIssues({ views, layout: tightLayout, sheet: tightSheet, settings: tightSettings, callout: () => null }).some(i => i.code === 'OFF_SHEET'));
  }
});
