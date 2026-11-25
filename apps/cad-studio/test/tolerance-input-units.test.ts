import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { defaultDrawing, type DrawingDimension, type DrawingSettings, type Tolerance } from '@barocss/cad-model/drawing/types';
import { ToleranceEditor } from '../src/ui/drawing/ToleranceEditor';

const point = { edge: 'edge1', at: 'end' as const, near: [0, 0, 0] as [number, number, number] };
function dimension(kind: DrawingDimension['kind'], tol: Tolerance): DrawingDimension {
  const common = { id: 'D1', view: 'front' as const, place: [10, 12] as [number, number], tol };
  if (kind === 'linear') return { ...common, kind, a: point, b: { ...point, near: [25.4, 0, 0] }, orient: 'horizontal' };
  if (kind === 'angle') return { ...common, kind, a: point, b: { ...point, edge: 'edge2' } };
  if (kind === 'arc-length') return { ...common, kind, arc: { edge: 'edge1', near: [0, 0, 0] } };
  if (kind === 'chamfer') return { ...common, kind, chamfer: { edge: 'edge1', near: [0, 0, 0] }, adjacent: { edge: 'edge2', near: [1, 0, 0] } };
  if (kind === 'radial-thickness') return { ...common, kind, first: { edge: 'edge1', near: [0, 0, 0] }, second: { edge: 'edge2', near: [0, 0, 0] } };
  if (kind === 'cylinder-diameter') return { ...common, kind, cylinder: { face: 'face1', near: [0, 0, 0] } };
  if (kind === 'circle-separation') return { ...common, kind, first: { edge: 'edge1', near: [0, 0, 0] }, second: { edge: 'edge2', near: [30, 0, 0] }, mode: 'min' };
  if (kind === 'pcd') return { ...common, kind, ring: [point, { ...point, edge: 'edge2' }, { ...point, edge: 'edge3' }] };
  return { ...common, kind, edge: 'edge1', near: [0, 0, 0] };
}
const displays = [
  { units: 'mm', dual: false }, { units: 'inch', dual: false },
  { units: 'mm', dual: true }, { units: 'inch', dual: true },
] as const;
function render(dim: DrawingDimension, display: typeof displays[number], tolDraft: Record<string, string> = {}) {
  const settings: DrawingSettings = { ...defaultDrawing(), ...display, dimensions: [dim] };
  const before = structuredClone({ dim, settings, tolDraft });
  const forbidden = () => assert.fail('Rendering a unit label must not change drafts, messages or authored dimensions');
  const html = renderToStaticMarkup(createElement(ToleranceEditor, { selDim: dim, settings, tolDraft,
    setTolDraft: forbidden, commitDims: forbidden, setMessage: forbidden }));
  assert.deepEqual({ dim, settings, tolDraft }, before);
  return html;
}
function input(html: string, name: string) {
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  const found = inputs.find(tag => tag.includes(`aria-label="Tolerance ${name}"`));
  assert.ok(found, name); return found;
}
test('all eight length dimension kinds retain visible mm and accessible millimetres in mm/inch and dual displays', () => {
  for (const kind of ['linear', 'diameter', 'radius', 'arc-length', 'radial-thickness', 'cylinder-diameter', 'circle-separation', 'pcd'] as const) for (const display of displays) {
    for (const tol of [{ kind: 'symmetric', value: 0.254 }, { kind: 'deviation', upper: 0.254, lower: -0.127 }] as Tolerance[]) {
      const html = render(dimension(kind, tol), display);
      const fields = tol.kind === 'symmetric' ? [['±', '0.254']] : [['Upper', '0.254'], ['Lower', '-0.127']];
      for (const [label, value] of fields) {
        assert.ok(html.includes(`<span>${label} (mm)</span>`));
        const tag = input(html, label);
        assert.ok(tag.includes('aria-description="Enter millimetres, even when the drawing displays inches. Empty is not zero."'));
        assert.ok(tag.includes(`value="${value}"`)); assert.ok(tag.includes('type="number"'));
      }
    }
  }
});
test('angle symmetric and deviation use degrees, independent of length display units', () => {
  for (const display of displays) for (const tol of [{ kind: 'symmetric', value: 0.5 }, { kind: 'deviation', upper: 0.5, lower: -0.25 }] as Tolerance[]) {
    const html = render(dimension('angle', tol), display);
    for (const [label, value] of tol.kind === 'symmetric' ? [['±', '0.5']] : [['Upper', '0.5'], ['Lower', '-0.25']]) {
      assert.ok(html.includes(`<span>${label} (°)</span>`));
      const tag = input(html, label); assert.ok(tag.includes('aria-description="Enter degrees. Empty is not zero."'));
      assert.ok(tag.includes(`value="${value}"`)); assert.doesNotMatch(tag, /millimetres/);
    }
  }
});
test('fit is a unitless string rather than a length/angle numeric field', () => {
  for (const display of displays) for (const [kind, code] of [['diameter', 'H7'], ['linear', 'h6'], ['angle', 'js6']] as const) {
    const html = render(dimension(kind, { kind: 'fit', code }), display), tag = input(html, 'Fit');
    assert.ok(html.includes('<span>Fit</span>')); assert.doesNotMatch(html, /Fit \((mm|°)\)/);
    assert.ok(tag.includes(`value="${code}"`)); assert.ok(tag.includes('type="text"')); assert.doesNotMatch(tag, /aria-description=/);
  }
});
test('raw saved precision and incomplete draft remain unchanged across display and selected kind changes', () => {
  for (const display of displays) {
    const linear = dimension('linear', { kind: 'symmetric', value: 0.25400000000000006 });
    assert.ok(input(render(linear, display), '±').includes('value="0.25400000000000006"'));
    for (const value of ['', '0.010', '0.2540000', '-']) assert.ok(input(render(linear, display, { value }), '±').includes(`value="${value}"`));
    assert.ok(render(dimension('angle', { kind: 'symmetric', value: 0.5 }), display).includes('<span>± (°)</span>'));
    assert.ok(render(linear, display).includes('<span>± (mm)</span>'));
  }
});
