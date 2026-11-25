// #275: Optional fractional inch display for plain untoleranced Drawing length dimensions.
// Original model geometry stays in mm; toleranced, fit, basic, hole callout, GD&T, datum target,
// table, and angle labels stay decimal/degrees; nonzero values below half the fraction grid stay
// decimal and emit UNIT_PRECISION instead of rounding to 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brepsFor } from '../src/engine/evaluate';
import { starterDoc, type StudioDoc } from '../src/engine/doc';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { projectViews } from '../src/drawing/project';
import { layoutSheet } from '../src/drawing/views';
import { snapPoints } from '../src/drawing/dimensions';
import { buildSheet, dimensionLine, type Mark, type MarkGroup, type Sheet } from '../src/drawing/sheet';
import { holeCallout } from '../src/drawing/callout';
import { drawingIssues, issueContext } from '../src/drawing/issues';
import { modelAnnotations } from '../src/drawing/annotations3d';
import { formatFractionalInch, formatLength, INCH_FRACTION_DENOMINATORS, inchFractionOk, presetFor, type InchFractionDenominator } from '../src/drawing/standard';
import { runDrawingTool } from '../src/chat/drawing';
import { sheetSvg } from '../src/io/svg';
import { sheetDxfDocument } from '../src/io/dxf';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingSettings, type DrawingViews } from '../src/drawing/types';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

function plateDoc(width = 31.75, depth = 25.5, height = 12.7, holeRadius = 6.35): StudioDoc {
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [width, depth] },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
      { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, face: 'n1.top', center: [width / 2, depth / 2], radius: holeRadius },
    ],
    outputs: { b2: { node: 2, side: 'solid' } },
  };
}

function viewsOf(doc: StudioDoc): DrawingViews {
  const b = brepsFor(doc);
  assert.ok('breps' in b);
  const r = projectViews(b.breps, b.prefixes);
  assert.ok(r.ok);
  return r.views;
}

function buildPlateSheet(doc: StudioDoc, extra: Partial<DrawingSettings> = {}, customDims?: DrawingDimension[]) {
  const views = viewsOf(doc);
  const f = snapPoints(views.front), t = snapPoints(views.top);
  const fAt = (u: number, w: number) => f.find(p => near(p.at[0], u) && near(p.at[1], w))!.ref;
  const tAt = (u: number, w: number) => t.find(p => near(p.at[0], u) && near(p.at[1], w))!.ref;
  const hole = views.top.edges.find(e => e.kind === 'circle')!;
  const circle = { edge: hole.name, near: [...hole.circle!.center] as [number, number, number] };
  const rect = doc.nodes[0] as Extract<StudioDoc['nodes'][number], { kind: 'sketch'; profile: 'rectangle' }>;
  const extrude = doc.nodes[1] as Extract<StudioDoc['nodes'][number], { kind: 'extrude' }>;
  const W = Number(rect.max[0]), D = Number(rect.max[1]), H = Number(extrude.height);
  const dimensions: DrawingDimension[] = customDims ?? [
    { id: 'plain-w', view: 'front', kind: 'linear', a: fAt(0, 0), b: fAt(W, 0), orient: 'horizontal', place: [W / 2, -10] },
    { id: 'plain-h', view: 'front', kind: 'linear', a: fAt(0, 0), b: fAt(0, H), orient: 'vertical', place: [-10, H / 2] },
    { id: 'tol-sym', view: 'top', kind: 'linear', a: tAt(0, 0), b: tAt(0, D), orient: 'vertical', place: [-10, D / 2], tol: { kind: 'symmetric', value: 0.01 } },
    { id: 'tol-dev', view: 'top', kind: 'linear', a: tAt(0, 0), b: tAt(W, 0), orient: 'horizontal', place: [W / 2, -10], tol: { kind: 'deviation', upper: 0.05, lower: -0.02 } },
    { id: 'tol-fit', view: 'front', kind: 'linear', a: fAt(0, 0), b: fAt(W, H), orient: 'aligned', place: [W / 2, H + 12], tol: { kind: 'fit', code: 'h7' } },
    { id: 'basic-w', view: 'front', kind: 'linear', a: fAt(0, 0), b: fAt(W, 0), orient: 'horizontal', place: [W / 2, -20], basic: true },
    { id: 'hole-dia', view: 'top', kind: 'diameter', ...circle, place: [W + 8, D / 2] },
    { id: 'plain-rad', view: 'top', kind: 'radius', ...circle, place: [W + 8, 4] },
  ];
  const settings: DrawingSettings = {
    ...defaultDrawing(),
    sheet: 'A3', scale: 2, units: 'inch',
    dimensions,
    frames: [{ id: 'flat', dim: 'tol-sym', characteristic: 'flatness', value: 0.1, datums: [] }],
    ...extra,
  };
  const layout = layoutSheet(views, settings);
  const callout = (edge: string, diameter?: number, fmt?: Parameters<typeof holeCallout>[3]) => holeCallout(doc.nodes, edge, doc.parameters, fmt);
  const sheet = buildSheet(views, layout, settings, { title: 'Fractional', date: '2026-11-25', callout });
  return { doc, views, settings, layout, callout, sheet };
}

const groupOf = (sheet: Sheet, id: string): MarkGroup => {
  const g = sheet.groups.find(x => x.id === id);
  assert.ok(g, `missing group ${id}`);
  return g;
};
const texts = (g: MarkGroup) => g.marks.filter((m): m is Extract<Mark, { kind: 'text' }> => m.kind === 'text').map(m => m.text);

test('formatFractionalInch: exact rational conversion, reduction, half-up tie-breaking, carry and bounds', () => {
  // Exact values across denominators
  assert.deepEqual(formatFractionalInch(25.4, 16), { ok: true, text: '1' });
  assert.deepEqual(formatFractionalInch(31.75, 16), { ok: true, text: '1 1/4' });
  assert.deepEqual(formatFractionalInch(38.1, 16), { ok: true, text: '1 1/2' });
  assert.deepEqual(formatFractionalInch(12.7, 64), { ok: true, text: '1/2' });
  assert.deepEqual(formatFractionalInch(0.396875, 64), { ok: true, text: '1/64' });
  assert.deepEqual(formatFractionalInch(0, 16), { ok: true, text: '0' });
  assert.deepEqual(formatFractionalInch(-0, 16), { ok: true, text: '0' });
  assert.deepEqual(formatFractionalInch(-31.75, 16), { ok: true, text: '-1 1/4' });
  assert.deepEqual(formatFractionalInch(-6.35, 32), { ok: true, text: '-1/4' });

  // Exact half-up ties and whole-number carry on 1/64 grid:
  // 0.5/64 in = 0.1984375 mm -> rounds up to 1/64
  assert.deepEqual(formatFractionalInch(0.1984375, 64), { ok: true, text: '1/64' });
  // Just below 0.5/64 in -> below-grid, never "0"
  assert.deepEqual(formatFractionalInch(0.1984374, 64), { ok: false, reason: 'below-grid' });
  // 63.5/64 in = 25.2015625 mm -> exact tie rounds up to 64/64 = "1"
  assert.deepEqual(formatFractionalInch(25.2015625, 64), { ok: true, text: '1' });
  assert.deepEqual(formatFractionalInch(25.2015624, 64), { ok: true, text: '63/64' });
  // Carry at every supported denominator: exact (2D - 1)/(2D) inches = 25.4 * (2D - 1) / (2D) mm -> "1"
  const exactCases: readonly (readonly [InchFractionDenominator, number, number])[] = [
    [2, 6.35, 19.05],
    [4, 3.175, 22.225],
    [8, 1.5875, 23.8125],
    [16, 0.79375, 24.60625],
    [32, 0.396875, 25.003125],
    [64, 0.1984375, 25.2015625],
  ];
  for (const [d, halfStep, carryTie] of exactCases) {
    assert.deepEqual(formatFractionalInch(carryTie, d), { ok: true, text: '1' }, `carry at 1/${d}`);
    assert.deepEqual(formatFractionalInch(halfStep, d), { ok: true, text: `1/${d}` }, `half-step tie at 1/${d}`);
    assert.deepEqual(formatFractionalInch(halfStep * 0.5, d), { ok: false, reason: 'below-grid' }, `below-grid at 1/${d}`);
  }

  // Non-finite, huge, subnormal, and unsupported denominators
  assert.deepEqual(formatFractionalInch(Number.NaN, 16), { ok: false, reason: 'invalid' });
  assert.deepEqual(formatFractionalInch(Number.POSITIVE_INFINITY, 16), { ok: false, reason: 'invalid' });
  assert.deepEqual(formatFractionalInch(1e16, 16), { ok: false, reason: 'invalid' });
  assert.deepEqual(formatFractionalInch(1e-300, 64), { ok: false, reason: 'below-grid' });
  assert.deepEqual(formatFractionalInch(25.4, 3 as unknown as InchFractionDenominator), { ok: false, reason: 'invalid' });
  assert.deepEqual(formatFractionalInch(25.4, 128 as unknown as InchFractionDenominator), { ok: false, reason: 'invalid' });
  assert.deepEqual(INCH_FRACTION_DENOMINATORS, [2, 4, 8, 16, 32, 64]);
  assert.equal(inchFractionOk(16), true);
  assert.equal(inchFractionOk(10), false);
  assert.equal(inchFractionOk('16'), false);
});

test('plain inch lengths format as fractions while tolerances, fits, basic, callouts and frames stay decimal', () => {
  const { sheet } = buildPlateSheet(plateDoc(), { units: 'inch', inchFraction: 16 });
  assert.deepEqual(texts(groupOf(sheet, 'plain-w')), ['1 1/4']);
  assert.deepEqual(texts(groupOf(sheet, 'plain-h')), ['1/2']);
  assert.deepEqual(texts(groupOf(sheet, 'plain-rad')), ['R1/4']);
  // Tolerance negative fixtures stay decimal and keep inward rounding
  assert.deepEqual(texts(groupOf(sheet, 'tol-sym')), ['1.0039 +.0004/-.0003']);
  assert.deepEqual(texts(groupOf(sheet, 'tol-dev')), ['1.2500', '+.0019', '-.0007']);
  assert.deepEqual(texts(groupOf(sheet, 'tol-fit')), ['1.346 h7']);
  assert.deepEqual(texts(groupOf(sheet, 'basic-w')), ['1.250']);
  assert.deepEqual(texts(groupOf(sheet, 'hole-dia')), ['Ø.500 THRU']);
  assert.ok(texts(groupOf(sheet, 'flat')).includes('.0039'), 'GD&T frame stays decimal');
  // Original mm model values on Resolved are unchanged
  const w = sheet.dimensions.find(d => d.dim.id === 'plain-w')!;
  assert.ok(w.ok && near(w.value, 31.75));
  const h = sheet.dimensions.find(d => d.dim.id === 'plain-h')!;
  assert.ok(h.ok && near(h.value, 12.7));
  // formatLength global helper remains decimal
  assert.equal(formatLength(31.75, presetFor({ units: 'inch', inchFraction: 16 })), '1.250');
});

test('dual units apply fractional inch only to plain inch primary or secondary values', () => {
  const inchFirst = buildPlateSheet(plateDoc(), { units: 'inch', dual: true, inchFraction: 16 }).sheet;
  assert.deepEqual(texts(groupOf(inchFirst, 'plain-w')), ['1 1/4 [31.75]']);
  assert.deepEqual(texts(groupOf(inchFirst, 'plain-h')), ['1/2 [12.7]']);
  assert.deepEqual(texts(groupOf(inchFirst, 'plain-rad')), ['R1/4 [R6.35]']);
  assert.deepEqual(texts(groupOf(inchFirst, 'tol-sym')), ['1.0039 +.0004/-.0003 [25.5 ±0.01]']);
  assert.deepEqual(texts(groupOf(inchFirst, 'hole-dia')), ['Ø.500 THRU [Ø12.7 THRU]']);

  const mmFirst = buildPlateSheet(plateDoc(), { units: 'mm', dual: true, inchFraction: 16 }).sheet;
  assert.deepEqual(texts(groupOf(mmFirst, 'plain-w')), ['31.75 [1 1/4]']);
  assert.deepEqual(texts(groupOf(mmFirst, 'plain-h')), ['12.7 [1/2]']);
  assert.deepEqual(texts(groupOf(mmFirst, 'plain-rad')), ['R6.35 [R1/4]']);
  assert.deepEqual(texts(groupOf(mmFirst, 'tol-sym')), ['25.5 ±0.01 [1.0039 +.0004/-.0003]']);
  assert.deepEqual(texts(groupOf(mmFirst, 'hole-dia')), ['Ø12.7 THRU [Ø.500 THRU]']);
});

test('below-grid nonzero length stays decimal and reports UNIT_PRECISION warning instead of printing 0', () => {
  // 0.2 mm < 0.5/16 in (0.79375 mm): must NOT print "0"
  const tiny = plateDoc(31.75, 25.5, 0.2, 6.35);
  const built = buildPlateSheet(tiny, { units: 'inch', inchFraction: 16 });
  const h = built.sheet.dimensions.find(d => d.dim.id === 'plain-h')!;
  assert.ok(h.ok);
  assert.equal(h.text, '.008');
  assert.equal(h.fractionFallback, 'below-grid');
  assert.deepEqual(texts(groupOf(built.sheet, 'plain-h')), ['.008']);
  const issues = drawingIssues(issueContext({ views: built.views, settings: built.settings, callout: built.callout, meta: { title: 'Tiny', date: '2026-11-25' } }));
  const warn = issues.find(i => i.code === 'UNIT_PRECISION' && i.dims?.includes('plain-h'));
  assert.ok(warn, `expected UNIT_PRECISION warning, got ${JSON.stringify(issues)}`);
  assert.equal(warn.severity, 'warning');
  assert.match(warn.message, /1\/16 inch/);
});

test('unset inchFraction keeps existing output identical, and SVG/DXF/3D annotations match fractional text', () => {
  const withoutFrac = buildPlateSheet(plateDoc(), { units: 'inch' });
  assert.deepEqual(texts(groupOf(withoutFrac.sheet, 'plain-w')), ['1.250']);
  assert.deepEqual(texts(groupOf(withoutFrac.sheet, 'plain-h')), ['.500']);

  const withFrac = buildPlateSheet(plateDoc(), { units: 'inch', inchFraction: 16 });
  assert.equal(withFrac.sheet.units?.inchFraction, 16);
  const svg = sheetSvg(withFrac.sheet, 'Fractional');
  assert.ok(svg.includes('>1 1/4</text>'));
  assert.ok(svg.includes('>1/2</text>'));
  assert.ok(svg.includes('>R1/4</text>'));
  assert.ok(svg.includes('>1.0039 +.0004/-.0003</text>'));
  assert.ok(svg.includes('>Ø.500 THRU</text>'));

  const dxf = sheetDxfDocument(withFrac.sheet, withFrac.layout);
  const dimTexts = new Set(dxf.entities.filter((e): e is Extract<typeof e, { type: 'dimension' }> => e.type === 'dimension').map(e => e.text));
  assert.ok(dimTexts.has('1 1/4'));
  assert.ok(dimTexts.has('1/2'));
  assert.ok(dimTexts.has('R1/4'));
  assert.ok(dimTexts.has('1.0039 +.0004/-.0003'));
  assert.ok(dimTexts.has('Ø.500 THRU'));
  const resolvedW = withFrac.sheet.dimensions.find(d => d.dim.id === 'plain-w')!;
  assert.ok(resolvedW.ok && dimensionLine(resolvedW, presetFor(withFrac.settings)) === '1 1/4');

  const ann = modelAnnotations({ views: withFrac.views, layout: withFrac.layout, settings: withFrac.settings, sheet: withFrac.sheet });
  const annW = ann.items.find(i => i.id === 'plain-w');
  assert.ok(annW?.dimension);
  assert.equal(annW.dimension.text, '1 1/4');
  assert.equal(annW.dimension.unit, 'mm');
  assert.ok(near(annW.dimension.value, 31.75));
});

test('persistence roundtrip, invalid value stripping, and set_drawing tool validation', async () => {
  const doc: StudioDoc = {
    ...starterDoc(),
    drawing: { ...defaultDrawing(), units: 'inch', inchFraction: 32 },
  };
  const reopened = await readStudioFile(encodeStudioFile(doc));
  assert.ok('doc' in reopened, JSON.stringify(reopened));
  assert.equal(reopened.doc.drawing?.inchFraction, 32);
  assert.deepEqual(reopened.doc.nodes, doc.nodes);

  // Invalid values stripped gracefully on readDrawing
  assert.equal(readDrawing({ units: 'inch', inchFraction: 3 }).inchFraction, undefined);
  assert.equal(readDrawing({ units: 'inch', inchFraction: 128 }).inchFraction, undefined);
  assert.equal(readDrawing({ units: 'inch', inchFraction: '16' }).inchFraction, undefined);

  // set_drawing valid, reset, and refusal
  const base = starterDoc();
  const ok = runDrawingTool(base, 'set_drawing', { units: 'inch', inchFraction: 16 });
  assert.ok(!('error' in ok), JSON.stringify(ok));
  assert.equal(ok.doc.drawing?.inchFraction, 16);

  const reset = runDrawingTool(ok.doc, 'set_drawing', { inchFraction: 'none' });
  assert.ok(!('error' in reset), JSON.stringify(reset));
  assert.equal(reset.doc.drawing?.inchFraction, undefined);

  for (const bad of [3, 10, 128, 0, -4, '1/16', true]) {
    const refused = runDrawingTool(ok.doc, 'set_drawing', { inchFraction: bad });
    assert.ok('error' in refused, `expected refusal for ${String(bad)}`);
    assert.match(refused.error, /DRAWING_OPTIONS/);
  }
});
