import assert from 'node:assert/strict';
import test from 'node:test';
import { commands } from '../src/app/commands';
import { drawingInputs } from '../src/chat/drawing';
import { issueContext } from '../src/drawing/issues';
import { sectionsCut } from '../src/drawing/section';
import { hatchSectionCircles } from '../src/drawing/svgCircleHatch';
import { defaultDrawing, type DrawingSection, type XY } from '../src/drawing/types';
import { emptyDoc, rectanglePart } from '../src/engine/doc';
import { sheetDxf } from '../src/io/dxf';
import { sheetPdf } from '../src/io/pdf';
import { marksSvg, sheetSvg } from '../src/io/svg';

const section: DrawingSection = { id: 'A', view: 'top', at: -10 };
const center: XY = [12, -2.5];
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} vs ${expected}`);

test('the circle scan uses exact annular crossings and skips zero-length outside tangents', () => {
  const lines = hatchSectionCircles({ center, radii: [20, 10] }, 2.5, 0);
  const row = lines.filter(line => line.a[1] === 0);
  assert.equal(row.length, 2);
  const outside = Math.sqrt(400 - 6.25), hole = Math.sqrt(100 - 6.25);
  for (const [actual, expected] of [[row[0].a[0], 12 - outside], [row[0].b[0], 12 - hole],
    [row[1].a[0], 12 + hole], [row[1].b[0], 12 + outside]]) near(actual, expected);
  const solid = hatchSectionCircles({ center: [3, 0], radii: [10] }, 2.5, 0);
  assert.equal(solid.length, 7);
  assert.ok(solid.every(line => Math.abs(line.a[1]) < 10 && line.a[0] < line.b[0]));
  const tangent = hatchSectionCircles({ center: [0, 0], radii: [20, 10] }, 2.5, 0).filter(line => line.a[1] === 10);
  assert.equal(tangent.length, 1);
  near(tangent[0].a[0], -Math.sqrt(300));
  near(tangent[0].b[0], Math.sqrt(300));
});

test('SVG text clearance intersects existing exact segments and keeps the annular gap', () => {
  const svg = marksSvg([{ kind: 'hatch', pen: 'thin', rings: [], spacing: 10, angle: 0,
    svgCircleHatch: { center: [0, 0], radii: [20, 10] }, svgTextExclusions: [[[-16, -1], [-14, -1], [-14, 1], [-16, 1]]] }]);
  const row = [...svg.matchAll(/<line x1="(-?[\d.]+)" y1="0" x2="(-?[\d.]+)" y2="0"/g)].map(match => [+match[1], +match[2]]);
  assert.deepEqual(row, [[-20, -16], [-14, -10], [10, 20]]);
});

test('native full circular sections retain exact SVG geometry across paper scale and retain the other exporters', () => {
  for (const profile of ['tube', 'cylinder']) {
    const command = commands.find(command => command.id === profile)!;
    const doc = command.build!({ doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } },
      { r: 20, ri: 10, h: 20, x: 11, y: -6, z: 0 });
    const settings = { ...defaultDrawing(), scope: { kind: 'part' as const }, sheet: 'A3' as const, scale: 2, sections: [section] };
    const input = drawingInputs(doc, settings);
    assert.ok(typeof input !== 'string');
    const { sheet, layout } = issueContext(input);
    const cut = sheet.groups.find(group => group.role === 'section' && group.id === 'A' && !group.view);
    const hatch = cut?.marks.find(mark => mark.kind === 'hatch');
    assert.ok(hatch?.svgCircleHatch, profile);
    assert.ok(cut?.marks.filter(mark => mark.kind === 'arc').every(mark =>
      Math.hypot(mark.center[0] - hatch.svgCircleHatch!.center[0], mark.center[1] - hatch.svgCircleHatch!.center[1]) < 1e-8));
    const radii = profile === 'tube' ? [40, 20] : [40];
    assert.equal(hatch.svgCircleHatch.radii.length, radii.length);
    radii.forEach((radius, index) => near(hatch.svgCircleHatch!.radii[index]!, radius));
    const polygon = { ...sheet, groups: sheet.groups.map(group => ({ ...group, marks: group.marks.map(mark => {
      if (mark.kind !== 'hatch' || !mark.svgCircleHatch) return mark;
      const sampled = { ...mark };
      delete sampled.svgCircleHatch;
      return sampled;
    }) })) };
    assert.notEqual(sheetSvg(sheet, 'round section'), sheetSvg(polygon, 'round section'));
    assert.deepEqual(sheetPdf(sheet, 'round section'), sheetPdf(polygon, 'round section'));
    assert.equal(sheetDxf(sheet, layout).text, sheetDxf(polygon, layout).text);
  }
});

test('noncircular and partial sections keep their sampled hatch route', () => {
  const [rect, half] = [section, { ...section, half: { line: 'vertical', at: 0, cut: 'after' } } as const];
  const result = sectionsCut(rectanglePart(40, 30, 20), [rect, half]);
  for (const { result: cut } of result) {
    assert.ok(cut.ok);
    assert.equal(cut.circleHatch, undefined);
    assert.ok(cut.rings.length);
  }
});
