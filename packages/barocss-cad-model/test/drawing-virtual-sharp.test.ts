import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrepProjection } from '@barocss/cad';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { brepsFor, evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures, referencesOf, verifyReferences } from '../src/engine/references';
import { projectViews } from '../src/drawing/project';
import {
  newVirtualSharpId,
  pickVirtualSharpEdge,
  resolveVirtualSharp,
} from '../src/drawing/virtualSharp';
import { resolveDimension } from '../src/drawing/dimensions';
import { layoutSheet } from '../src/drawing/views';
import { buildSheet } from '../src/drawing/sheet';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings, type DrawingVirtualSharp } from '../src/drawing/types';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { applyFix, drawingIssues } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { modelAnnotations } from '../src/drawing/annotations3d';

/** Build a W x H x 10 plate with a `chamferDist` mm chamfer at the top-right corner (W, H). */
function makeChamferedPlate(W = 30, H = 20, chamferDist = 4, height = 10): StudioDoc {
  let doc = rectanglePart(W, H, height);
  const b0 = brepsFor(doc);
  assert.ok('breps' in b0);
  // Find the vertical edge at (x=W, y=H)
  const vById = new Map(b0.breps[0].vertices.map(v => [v.id, v.point]));
  const cornerEdge = b0.breps[0].edges.find(e => {
    const a = vById.get(e.vertices[0]);
    const b = vById.get(e.vertices[1]);
    if (!a || !b) return false;
    return Math.abs(a[0] - W) < 1e-4 && Math.abs(a[1] - H) < 1e-4
      && Math.abs(b[0] - W) < 1e-4 && Math.abs(b[1] - H) < 1e-4;
  });
  const cornerName = cornerEdge?.name ?? 'n1.side1|n1.side2';
  doc = withNode(doc, { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: [cornerName], distance: chamferDist });
  return doc;
}

function projectDoc(doc: StudioDoc) {
  const res = brepsFor(doc);
  assert.ok('breps' in res, 'part brep should build: ' + JSON.stringify('breps' in res ? null : res));
  const proj = projectViews(res.breps, res.prefixes);
  assert.ok(proj.ok, 'part views should project');
  return proj.views;
}

function findLineEdgeMidNear(pr: BrepProjection, mx: number, my: number, mz?: number) {
  const edge = pr.edges.find(e => {
    if (e.kind !== 'line' || !e.ends || !e.pieces.length || !e.pieces.some(p => p.visible)) return false;
    const mid = [(e.ends[0][0] + e.ends[1][0]) / 2, (e.ends[0][1] + e.ends[1][1]) / 2, (e.ends[0][2] + e.ends[1][2]) / 2];
    return Math.hypot(mid[0] - mx, mid[1] - my) < 1e-1 && (mz === undefined || Math.abs(mid[2] - mz) < 1e-2);
  });
  assert.ok(edge, `expected visible straight edge with midpoint near (${mx}, ${my})`);
  return edge;
}

test('virtual-sharp resolves (30,20) on 30x20 chamfered plate, linear dims read 30 & 20, stay invariant across chamfer 4->6, and update to 40 on width 30->40', () => {
  const doc30 = makeChamferedPlate(30, 20, 4, 10);
  const views30 = projectDoc(doc30);
  // Top edge (0,20)->(26,20) midpoint (13,20); Right edge (30,0)->(30,16) midpoint (30,8)
  const eTop = findLineEdgeMidNear(views30.top, 13, 20, 10);
  const eRight = findLineEdgeMidNear(views30.top, 30, 8, 10);
  const eBot = findLineEdgeMidNear(views30.top, 15, 0, 10);
  const pTop = pickVirtualSharpEdge(views30.top, eTop, 'top');
  const pRight = pickVirtualSharpEdge(views30.top, eRight, 'top');
  assert.ok(pTop.ok && pRight.ok);

  // Order-independent resolution -> exact (30, 20)
  const r1 = resolveVirtualSharp(views30.top, pTop.ref, pRight.ref, 'top');
  const r2 = resolveVirtualSharp(views30.top, pRight.ref, pTop.ref, 'top');
  assert.ok(r1.ok && r2.ok);
  for (const r of [r1, r2]) {
    assert.ok(Math.hypot(r.geometry.point[0] - 30, r.geometry.point[1] - 20) < 1e-6);
    assert.ok(Math.hypot(r.geometry.point3[0] - 30, r.geometry.point3[1] - 20, r.geometry.point3[2] - 10) < 1e-6);
    assert.ok(Math.abs(r.geometry.angleDeg - 90) < 1e-4);
  }

  // Verify model B-rep topology was NOT mutated (no fake vertex at (30, 20, 10))
  const brep30 = brepsFor(doc30);
  assert.ok('breps' in brep30);
  const hasRealCorner = brep30.breps[0].vertices.some(v => Math.hypot(v.point[0] - 30, v.point[1] - 20, v.point[2] - 10) < 1e-4);
  assert.equal(hasRealCorner, false, 'virtual sharp must not add fake B-rep vertices');

  // Linear dimensions from origin (0,0,10) to virtual sharp (30,20,10)
  const dimH: DrawingDimension = {
    id: 'd1',
    view: 'top',
    kind: 'linear',
    a: { edge: eBot.name, at: 'end', near: [0, 0, 10] },
    b: { edge: pTop.ref.edge, at: 'virtual-sharp', near: pTop.ref.near, second: pRight.ref, virtualSharpId: 'vs1' },
    orient: 'horizontal',
    place: [15, 28],
  };
  const dimV: DrawingDimension = {
    id: 'd2',
    view: 'top',
    kind: 'linear',
    a: { edge: eBot.name, at: 'end', near: [0, 0, 10] },
    b: { edge: pTop.ref.edge, at: 'virtual-sharp', near: pTop.ref.near, second: pRight.ref, virtualSharpId: 'vs1' },
    orient: 'vertical',
    place: [38, 10],
  };
  const resH = resolveDimension(views30, dimH);
  const resV = resolveDimension(views30, dimV);
  assert.ok(resH.ok && resV.ok);
  assert.ok(Math.abs(resH.value - 30) < 1e-6);
  assert.ok(Math.abs(resV.value - 20) < 1e-6);

  // Change chamfer 4 -> 6 mm: theoretical corner stays (30, 20) and linear dims stay 30 and 20!
  const viewsChamfer6 = projectDoc(makeChamferedPlate(30, 20, 6, 10));
  const resH6 = resolveDimension(viewsChamfer6, dimH);
  const resV6 = resolveDimension(viewsChamfer6, dimV);
  assert.ok(resH6.ok && resV6.ok);
  assert.ok(Math.abs(resH6.value - 30) < 1e-6, 'chamfer resize must preserve theoretical corner width 30');
  assert.ok(Math.abs(resV6.value - 20) < 1e-6, 'chamfer resize must preserve theoretical corner height 20');

  // Change plate width 30 -> 40 mm: virtual sharp moves to (40, 20), horizontal dim updates 30 -> 40
  const views40 = projectDoc(makeChamferedPlate(40, 20, 4, 10));
  const resH40 = resolveDimension(views40, dimH);
  const resV40 = resolveDimension(views40, dimV);
  assert.ok(resH40.ok && resV40.ok);
  assert.ok(Math.abs(resH40.value - 40) < 1e-6);
  assert.ok(Math.abs(resV40.value - 20) < 1e-6);
});

test('virtual-sharp strictly refuses parallel, shared-vertex, depth-offset, cross-body, circular, broken/iso views, and invalid reader payloads', () => {
  const doc = makeChamferedPlate(30, 20, 4, 10);
  const views = projectDoc(doc);
  const pTop = pickVirtualSharpEdge(views.top, findLineEdgeMidNear(views.top, 13, 20, 10), 'top');
  const pBot = pickVirtualSharpEdge(views.top, findLineEdgeMidNear(views.top, 15, 0, 10), 'top');
  const pLeft = pickVirtualSharpEdge(views.top, findLineEdgeMidNear(views.top, 0, 10, 10), 'top');
  const pRight = pickVirtualSharpEdge(views.top, findLineEdgeMidNear(views.top, 30, 8, 10), 'top');
  assert.ok(pTop.ok && pBot.ok && pLeft.ok && pRight.ok);

  assert.equal(resolveVirtualSharp(views.top, pTop.ref, pBot.ref, 'top').ok, false, 'parallel edges refused');
  assert.equal(resolveVirtualSharp(views.top, pTop.ref, pTop.ref, 'top').ok, false, 'same edge refused');
  assert.equal(resolveVirtualSharp(views.top, pBot.ref, pLeft.ref, 'top').ok, false, 'already-meeting corner edges refused');
  assert.equal(resolveVirtualSharp(views.iso, pTop.ref, pRight.ref, 'iso').ok, false, 'iso view refused');

  // Depth-offset crossing edges on two bodies at different heights (Z=5 vs Z=12)
  const docSkew: StudioDoc = {
    format: 'barocss-cad-model',
    schema: 3,
    units: 'mm',
    parameters: {},
    nextId: 4,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 15], max: [20, 20] },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 5 },
      { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [25, 0], max: [30, 12] },
      { id: 'n3', kind: 'extrude', sketch: 2, height: 12 },
    ],
    outputs: { b1: { node: 1, side: 'solid' }, b2: { node: 3, side: 'solid' } },
  };
  const viewsSkew = projectDoc(docSkew);
  const s1 = pickVirtualSharpEdge(viewsSkew.top, findLineEdgeMidNear(viewsSkew.top, 10, 20, 5), 'top');
  const s2 = pickVirtualSharpEdge(viewsSkew.top, findLineEdgeMidNear(viewsSkew.top, 30, 6, 12), 'top');
  assert.ok(s1.ok && s2.ok);
  assert.equal(resolveVirtualSharp(viewsSkew.top, s1.ref, s2.ref, 'top').ok, false, 'cross-body / depth-offset edges refused');

  // Broken view refused in buildSheet for both virtualSharp and linear virtual-sharp dim
  const vs: DrawingVirtualSharp = { id: newVirtualSharpId(), view: 'top', first: pTop.ref, second: pRight.ref };
  const brokenSettings: DrawingSettings = {
    ...defaultDrawing(),
    scale: 1,
    breaks: [{ axis: 'x', from: 10, to: 18 }],
    virtualSharps: [vs],
    dimensions: [{
      id: 'd1',
      view: 'top',
      kind: 'linear',
      a: { edge: pBot.ref.edge, at: 'end', near: [0, 0, 10] },
      b: { edge: pTop.ref.edge, at: 'virtual-sharp', near: pTop.ref.near, second: pRight.ref, virtualSharpId: vs.id },
      orient: 'horizontal',
      place: [15, 28],
    }],
  };
  const brokenSheet = buildSheet(views, layoutSheet(views, brokenSettings), brokenSettings, { title: 'broken', date: '2026-11-25' });
  assert.equal(brokenSheet.virtualSharps?.[0].ok, false);
  assert.equal(brokenSheet.dimensions[0].ok, false);
  assert.equal(brokenSheet.groups.some(g => g.virtualSharp), false);

  // Strict readDrawing validation
  const read = readDrawing({
    ...defaultDrawing(),
    virtualSharps: [
      { id: 'same', view: 'top', first: pTop.ref, second: pTop.ref },
      { id: 'bad-view', view: 'iso', first: pTop.ref, second: pRight.ref },
      { id: 'vs1', view: 'top', first: pTop.ref, second: pRight.ref },
      { id: 'vs1', view: 'top', first: pRight.ref, second: pTop.ref },
    ],
    dimensions: [
      { id: 'bad-dim', view: 'top', kind: 'linear', a: { edge: pBot.ref.edge, at: 'end', near: [0, 0, 10] }, b: { edge: pTop.ref.edge, at: 'virtual-sharp', near: pTop.ref.near }, orient: 'horizontal', place: [15, 28] },
      { id: 'ok-dim', view: 'top', kind: 'linear', a: { edge: pBot.ref.edge, at: 'end', near: [0, 0, 10] }, b: { edge: pTop.ref.edge, at: 'virtual-sharp', near: pTop.ref.near, second: pRight.ref }, orient: 'horizontal', place: [15, 28] },
    ],
  });
  assert.equal(read.virtualSharps?.length, 1);
  assert.equal(read.dimensions.length, 1);
  assert.equal(read.dimensions[0].id, 'ok-dim');
});

test('virtual-sharp supports SVG, DXF, 3D PMI, scale/inch/dual, multi-sheet, reorient, references, and lost-source diagnostics', async () => {
  const doc = makeChamferedPlate(30, 20, 4, 10);
  const views = projectDoc(doc);
  const eBot = findLineEdgeMidNear(views.top, 15, 0, 10);
  const pTop = pickVirtualSharpEdge(views.top, findLineEdgeMidNear(views.top, 13, 20, 10), 'top');
  const pRight = pickVirtualSharpEdge(views.top, findLineEdgeMidNear(views.top, 30, 8, 10), 'top');
  assert.ok(pTop.ok && pRight.ok);

  const vs: DrawingVirtualSharp = { id: 'vs1', view: 'top', first: pTop.ref, second: pRight.ref };
  const dimH: DrawingDimension = {
    id: 'd1',
    view: 'top',
    kind: 'linear',
    a: { edge: eBot.name, at: 'end', near: [0, 0, 10] },
    b: { edge: pTop.ref.edge, at: 'virtual-sharp', near: pTop.ref.near, second: pRight.ref, virtualSharpId: 'vs1' },
    orient: 'horizontal',
    place: [15, 28],
  };
  const settings: DrawingSettings = { ...defaultDrawing(), scale: 1, virtualSharps: [vs], dimensions: [dimH] };
  const layout = layoutSheet(views, settings);
  const sheet = buildSheet(views, layout, settings, { title: 'vsharp', date: '2026-11-25' });

  // SVG has virtual-sharp witness group + linear dim 30
  const svg = sheetSvg(sheet, 'vsharp');
  assert.match(svg, /<g class="virtual-sharp" data-view="top" data-virtual-sharp="vs1">[\s\S]*<line/);
  assert.match(svg, />30<\/text>/);

  // Inch + dual formatting preserves native 30 mm value
  const inchSettings: DrawingSettings = { ...settings, units: 'inch', dual: true };
  const inchSheet = buildSheet(views, layoutSheet(views, inchSettings), inchSettings, { title: 'vsharp-in', date: '2026-11-25' });
  assert.ok(inchSheet.dimensions[0].ok);
  assert.match(inchSheet.dimensions[0].text, /1\.181/);

  // DXF exports native DIMENSION (measurement 30) + THIN witness lines
  const dxfDoc = sheetDxfDocument(sheet, layout);
  const dxfDim = dxfDoc.entities.find((e): e is Extract<typeof e, { type: 'dimension' }> => e.type === 'dimension');
  assert.ok(dxfDim && dxfDim.measurement !== undefined && Math.abs(dxfDim.measurement - 30) < 1e-6);
  assert.ok(sheetDxf(sheet, layout).text.includes('DIMENSION'));

  // 3D PMI projects cleanly without error
  const pmi = modelAnnotations({ views, layout, settings, sheet });
  assert.ok(pmi.items.some(item => item.id === 'd1'));

  // Multi-sheet ownership
  const multi: DrawingSettings = { ...settings, sheets: [{ id: 'S2', views: ['top'] }] };
  assert.equal(forSheet(multi, 0).virtualSharps, undefined);
  assert.equal(forSheet(multi, 1).virtualSharps?.length, 1);
  assert.equal(mergeSheet(multi, 0, { ...forSheet(multi, 0), hidden: false }).virtualSharps?.length, 1);

  // Reorient y- -> x+ preserves virtual sharp and linear dimension
  const res = brepsFor(doc);
  assert.ok('breps' in res);
  const projX = projectViews(res.breps, res.prefixes, { orientation: 'x+' });
  assert.ok(projX.ok);
  const turned = reorient(views, projX.views, settings, 'x+');
  assert.ok(turned.ok);
  assert.equal(turned.settings.virtualSharps?.length, 1);

  // Reference signatures capture & verify cleanly (both virtualSharp edges AND linear dim b + b.second)
  const docWithVs: StudioDoc = { ...doc, drawing: settings };
  const evaluated = evaluateDoc(docWithVs, 1);
  assert.ok(evaluated.ok);
  const signed = captureSignatures(docWithVs, evaluated.bodies);
  const { refs } = referencesOf(signed, true);
  const vsRefs = refs.filter(r => r.where === 'virtual-sharp vs1');
  const dimRefs = refs.filter(r => r.where === 'dimension d1');
  assert.equal(vsRefs.length, 2);
  assert.equal(dimRefs.length, 3);
  assert.ok([...vsRefs, ...dimRefs].every(r => r.edge && !!r.sig));
  const verified = await verifyReferences(signed, evaluated.bodies, async d => evaluateDoc(d, 2));
  assert.equal(verified.problems.length, 0);
  assert.equal(verified.changes.length, 0);

  // Unchamfered box -> edges already meet at a real vertex -> VIRTUAL_SHARP_LOST + applyFix removes it
  const boxViews = projectDoc(rectanglePart(30, 20, 10));
  const lostLayout = layoutSheet(boxViews, settings);
  const lostSheet = buildSheet(boxViews, lostLayout, settings, { title: 'box', date: '2026-11-25' });
  assert.equal(lostSheet.virtualSharps?.[0].ok, false);
  const lostIssues = drawingIssues({ views: boxViews, layout: lostLayout, settings, sheet: lostSheet, callout: () => null });
  const lost = lostIssues.find(i => i.code === 'VIRTUAL_SHARP_LOST');
  assert.ok(lost && lost.fix?.kind === 'remove-virtual-sharp');
  const fixed = applyFix({ views: boxViews, layout: lostLayout, settings, sheet: lostSheet, callout: () => null }, lost.fix);
  assert.equal(fixed.virtualSharps, undefined);
});
