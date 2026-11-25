// #251: Foreshortened radial dimension for large arcs preserving exact native radius and radial rim attachment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brepsFor } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import type { StudioDoc } from '../src/engine/doc';
import { projectViews } from '../src/drawing/project';
import { layoutSheet, toSheet } from '../src/drawing/views';
import { buildSheet, type Mark, type MarkGroup, type Sheet } from '../src/drawing/sheet';
import { defaultForeshortenOrigin, foreshortenGeometry, foreshortenOk } from '../src/drawing/foreshorten';
import { checkSavedForeshorten } from '../src/drawing/savedForeshorten';
import { drawingIssues, issueContext } from '../src/drawing/issues';
import { reorient } from '../src/drawing/reorient';
import { modelAnnotations } from '../src/drawing/annotations3d';
import { sheetSvg } from '../src/io/svg';
import { sheetDxfDocument } from '../src/io/dxf';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings, type DrawingViews } from '../src/drawing/types';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Independent analytic R500 arc part: center (0, 0), arc theta in [-5°, +5°], body x in [460, 500]. */
function largeArcDoc(radius = 500, halfSpanDeg = 5, backOffset = 40): StudioDoc {
  const theta = halfSpanDeg * Math.PI / 180;
  const x1 = radius * Math.cos(theta);
  const y1 = radius * Math.sin(theta);
  const backX = radius - backOffset;
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
    nodes: [
      {
        id: 'n0', kind: 'sketch', profile: 'loop',
        segments: [
          { kind: 'line', start: [backX, -y1] },
          { kind: 'arc', start: [x1, -y1], center: [0, 0], direction: 'ccw' },
          { kind: 'line', start: [x1, y1] },
          { kind: 'line', start: [backX, y1] },
        ],
      },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
  };
}

function viewsOf(doc: StudioDoc): DrawingViews {
  const b = brepsFor(doc);
  assert.ok('breps' in b, JSON.stringify(b));
  const r = projectViews(b.breps, b.prefixes);
  assert.ok(r.ok);
  return r.views;
}

function buildArcSheet(doc: StudioDoc, radius: number, extraDim: Partial<Extract<DrawingDimension, { kind: 'radius' }>> = {}, extraSettings: Partial<DrawingSettings> = {}) {
  const views = viewsOf(doc);
  const arcEdge = views.top.edges.find(e => e.circle && e.pieces.some(piece => piece.visible && piece.curve.kind === 'arc') && Math.abs(e.circle.radius - radius) < 1e-3);
  assert.ok(arcEdge, `R${radius} arc edge not found`);
  const dim: Extract<DrawingDimension, { kind: 'radius' }> = {
    id: 'big-r', view: 'top', kind: 'radius',
    edge: arcEdge.name, near: [...arcEdge.circle!.center] as [number, number, number],
    place: [radius + 16, 0],
    ...extraDim,
  };
  const settings: DrawingSettings = readDrawing({
    ...defaultDrawing(), sheet: 'A3', scale: 1,
    dimensions: [dim],
    ...extraSettings,
  });
  const layout = layoutSheet(views, settings);
  const sheet = buildSheet(views, layout, settings, { title: 'LargeArc', date: '2026-11-25' });
  return { doc, views, settings, layout, sheet, arcEdge };
}

const groupOf = (sheet: Sheet, id: string): MarkGroup => {
  const g = sheet.groups.find(x => x.id === id);
  assert.ok(g, `missing group ${id}`);
  return g;
};

test('independent R500 analytic oracle: foreshortened leader keeps exact R500, true radial rim, crisp Z-jog and no fake center dot', () => {
  const { views, layout, sheet, settings } = buildArcSheet(largeArcDoc(500), 500, { foreshorten: { origin: [468, 0] } });
  const r = sheet.dimensions[0];
  assert.ok(r.ok && r.kind === 'radius');
  assert.equal(r.text, 'R500');
  assert.ok(near(r.value, 500), `expected exact R500, got ${r.value}`);

  const g = groupOf(sheet, 'big-r');
  const polylines = g.marks.filter((m): m is Extract<Mark, { kind: 'polyline' }> => m.kind === 'polyline');
  const fills = g.marks.filter((m): m is Extract<Mark, { kind: 'fill' }> => m.kind === 'fill');
  const texts = g.marks.filter((m): m is Extract<Mark, { kind: 'text' }> => m.kind === 'text');
  assert.equal(polylines.length, 1);
  assert.ok(polylines[0].points.length >= 4, 'jogged polyline has >=4 vertices');
  assert.equal(fills.length, 1, 'only arrowhead fill, no fake center dot at origin or center');
  assert.equal(fills[0].head?.style, 'filled');
  assert.deepEqual(texts.map(t => t.text), ['R500']);

  // Independent radial oracle: arrow tip lies strictly on circle |tip - C| === R, final segment direction === true radial direction
  const vp = layout.views.top;
  const C = toSheet(vp, [0, 0]);
  const R = 500 * vp.scale;
  const pts = polylines[0].points;
  const rim = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  assert.ok(near(Math.hypot(rim[0] - C[0], rim[1] - C[1]), R, 1e-6), 'rim lies on true R500 circle');
  const radialDir: [number, number] = [(rim[0] - C[0]) / R, (rim[1] - C[1]) / R];
  const segLen = Math.hypot(rim[0] - prev[0], rim[1] - prev[1]);
  assert.ok(segLen >= 5, `final radial segment length ${segLen} must clear arrowhead`);
  const segDir: [number, number] = [(rim[0] - prev[0]) / segLen, (rim[1] - prev[1]) / segLen];
  assert.ok(near(segDir[0], radialDir[0], 1e-9) && near(segDir[1], radialDir[1], 1e-9), 'final segment is strictly collinear with true radial ray');

  // Entire foreshortened dimension fits inside A3 sheet frame without OFF_SHEET error
  const issues = drawingIssues(issueContext({ views, settings, callout: () => null, meta: { title: 'LargeArc', date: '2026-11-25' } }));
  assert.ok(!issues.some(i => i.code === 'OFF_SHEET' && i.dims?.includes('big-r')), JSON.stringify(issues));
  assert.ok(!issues.some(i => i.code === 'FORESHORTEN_INVALID'), JSON.stringify(issues));
});

test('a label beyond the trim keeps the jog attached to the real ±5° native arc', () => {
  const { layout, sheet } = buildArcSheet(largeArcDoc(500), 500,
    { place: [516, 92], foreshorten: { origin: [468, 40] } });
  const jog = groupOf(sheet, 'big-r').marks.find(m => m.kind === 'polyline');
  assert.ok(jog && jog.kind === 'polyline');
  const rim = jog.points.at(-1)!;
  assert.ok(near(rim[0], toSheet(layout.views.top, [500 * Math.cos(5 * Math.PI / 180), 0])[0]));
  assert.ok(near(rim[1], toSheet(layout.views.top, [0, 500 * Math.sin(5 * Math.PI / 180)])[1]));
});

test('source edit R500 -> R600 updates displayed radius while retaining authored foreshorten, and scale/units preserve invariants', () => {
  const before = buildArcSheet(largeArcDoc(500), 500, { foreshorten: { origin: [468, 0] } });
  const authored = before.settings.dimensions[0];
  assert.equal(authored.kind, 'radius');
  const r600 = buildArcSheet(largeArcDoc(600, 4, 40), 600, authored);
  assert.deepEqual(r600.settings.dimensions, before.settings.dimensions);
  assert.ok(groupOf(r600.sheet, 'big-r').marks.some(m => m.kind === 'polyline'));
  const res = r600.sheet.dimensions[0];
  assert.ok(res.ok && res.kind === 'radius');
  assert.equal(res.text, 'R600');
  assert.ok(near(res.value, 600));

  // Scale 1:2 keeps fixed paper-mm jog amplitude and stays valid
  const halfScale = buildArcSheet(largeArcDoc(500), 500, { foreshorten: { origin: [460, 0] } }, { scale: 0.5 });
  const polyHalf = groupOf(halfScale.sheet, 'big-r').marks.find((m): m is Extract<Mark, { kind: 'polyline' }> => m.kind === 'polyline');
  assert.ok(polyHalf, 'valid at 1:2 scale');
  const ys = polyHalf.points.map(p => p[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 3.5, 'paper-mm jog amplitude stays clear at 1:2');

  // Units: inch + dual preserve true R500 mm value
  const inchDual = buildArcSheet(largeArcDoc(500), 500, { foreshorten: { origin: [468, 0] } }, { units: 'inch', dual: true });
  const inchRes = inchDual.sheet.dimensions[0];
  assert.ok(inchRes.ok && near(inchRes.value, 500));
  assert.equal(inchRes.text, 'R19.685');
  assert.equal(inchRes.alt, 'R500');
});

test('offset origin Z-jog, interior placement, and explicit refusal on invalid/degenerate origins', () => {
  // Offset origin (|perp| >= jogAmp) creates 4-point ASME Z-jog ending strictly on true radial ray
  const offset = foreshortenGeometry([0, 0], 500, [516, 0], [468, 8], 3);
  assert.ok(offset.ok);
  assert.equal(offset.geometry.polyline.length, 4);
  const [p0, p1, p2, p3] = offset.geometry.polyline;
  assert.deepEqual(p0, [468, 8]);
  assert.ok(near(p1[1], 8), 'first segment runs parallel to radial ray');
  assert.ok(near(p2[1], 0) && near(p3[1], 0), 'final segment runs on true radial ray');
  assert.deepEqual(p3, [500, 0]);

  // Refusals: origin outside rim, too close to rim, past true center, tiny arc default
  assert.equal(foreshortenGeometry([0, 0], 500, [516, 0], [505, 0], 3).ok, false);
  assert.equal(foreshortenGeometry([0, 0], 500, [516, 0], [496, 0], 3).ok, false);
  assert.equal(foreshortenGeometry([0, 0], 500, [516, 0], [-10, 0], 3).ok, false);
  assert.equal(defaultForeshortenOrigin([0, 0], 5, [8, 0], 1, 3).ok, false);

  // Invalid saved origin on sheet emits explicit FORESHORTEN_INVALID warning
  const invalid = buildArcSheet(largeArcDoc(500), 500, { foreshorten: { origin: [498, 0] } });
  const issues = drawingIssues(issueContext({ views: invalid.views, settings: invalid.settings, callout: () => null, meta: { title: 'Invalid', date: '2026-11-25' } }));
  assert.ok(issues.some(i => i.code === 'FORESHORTEN_INVALID' && i.dims?.includes('big-r')), JSON.stringify(issues));
});

test('SVG, DXF (jogged block + true R500 measurement & true center), 3D annotations, reorient, and .bcad Save/Open', async () => {
  const built = buildArcSheet(largeArcDoc(500), 500, { foreshorten: { origin: [468, 0] } });
  const svg = sheetSvg(built.sheet, 'LargeArc');
  assert.ok(svg.includes('>R500</text>'));
  assert.ok(svg.includes('<polyline points='));

  const dxf = sheetDxfDocument(built.sheet, built.layout);
  const dimEntity = dxf.entities.find((e): e is Extract<typeof e, { type: 'dimension' }> => e.type === 'dimension');
  assert.ok(dimEntity);
  assert.equal(dimEntity.text, 'R500');
  assert.ok(near(dimEntity.measurement ?? NaN, 500));
  assert.equal(dimEntity.geometry.kind, 'radius');
  assert.ok(dimEntity.block.some(e => e.type === 'lwpolyline'), 'DXF block retains jogged polyline');

  const ann = modelAnnotations({ views: built.views, layout: built.layout, settings: built.settings, sheet: built.sheet });
  const item = ann.items.find(i => i.id === 'big-r');
  assert.ok(item?.dimension);
  assert.equal(item.dimension.measure, 'radius');
  assert.equal(item.dimension.text, 'R500');
  assert.ok(near(item.dimension.value, 500));
  assert.equal(item.targets[0].edge, built.arcEdge.name, '3D target retains original circular edge, not display origin');

  // Reorient remaps foreshorten.origin cleanly
  const turnedViews = projectViews((brepsFor(built.doc) as Extract<ReturnType<typeof brepsFor>, { breps: unknown }>).breps, (brepsFor(built.doc) as Extract<ReturnType<typeof brepsFor>, { breps: unknown }>).prefixes, { orientation: 'x+' });
  assert.ok(turnedViews.ok);
  const turned = reorient(built.views, turnedViews.views, built.settings, 'x+');
  assert.ok(turned.ok);
  const turnedDim = turned.settings.dimensions[0];
  assert.ok(turnedDim.kind === 'radius' && turnedDim.foreshorten);
  // Turning front y- -> x+ rotates Top view by 90°, mapping (468, 0) -> (0, -468) or (0, 468)
  assert.ok(near(Math.hypot(turnedDim.foreshorten.origin[0], turnedDim.foreshorten.origin[1]), 468, 1e-6));

  // Save/Open roundtrip & raw admission refusals
  const docWithDrawing: StudioDoc = { ...built.doc, drawing: built.settings };
  const reopened = await readStudioFile(encodeStudioFile(docWithDrawing));
  assert.ok('doc' in reopened, JSON.stringify(reopened));
  const reopenedDim = reopened.doc.drawing?.dimensions[0];
  assert.ok(reopenedDim?.kind === 'radius' && reopenedDim.foreshorten);
  assert.deepEqual(reopenedDim.foreshorten.origin, [468, 0]);

  assert.equal(foreshortenOk({ origin: [1, 2], extra: true }), false);
  assert.equal(foreshortenOk({ origin: [Number.NaN, 0] }), false);
  assert.ok(checkSavedForeshorten({ dimensions: [{ id: 'd1', view: 'top', kind: 'diameter', edge: 'e', near: [0, 0, 0], place: [1, 1], foreshorten: { origin: [0, 0] } }] }).length > 0);
  assert.ok(checkSavedForeshorten({ dimensions: [{ id: 'd1', view: 'iso', kind: 'radius', edge: 'e', near: [0, 0, 0], place: [1, 1], foreshorten: { origin: [0, 0] } }] }).length > 0);
  assert.ok(checkSavedForeshorten({ scope: { kind: 'assembly' }, dimensions: [{ id: 'd1', view: 'top', kind: 'radius', edge: 'e', near: [0, 0, 0], place: [1, 1], foreshorten: { origin: [0, 0] } }] }).length > 0);
});
