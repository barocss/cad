import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { sectionsCut } from '../src/drawing/section';
import { buildSheet, sectionExtents, sheetSections } from '../src/drawing/sheet';
import { layoutSheet } from '../src/drawing/views';
import { defaultDrawing, readDrawing, sameSection, sectionsOf, withSections, sectionHatchVisibilitySupported, type DrawingSection, type DrawingSettings } from '../src/drawing/types';
import { checkManufacturingDrawing, withManufacturingDrawing } from '../src/drawing/options';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { sectionDxfDocument } from '../src/io/dxf';
const a: DrawingSection = { id: 'A', view: 'front', at: 5 }, b: DrawingSection = { id: 'B', view: 'top', at: -4 };
const hide = { ...a, hideHatch: true as const };
test('hidden single A survives legacy canonicalization and saved read; show restores legacy format', () => {
  const original = defaultDrawing(), next = withSections(original, [hide]);
  assert.equal(next.section, undefined); assert.deepEqual(next.sections, [hide]);
  assert.deepEqual(sectionsOf(readDrawing(JSON.parse(JSON.stringify(next)))), [hide]);
  assert.deepEqual(withSections(next, [a]).section, { y: 5 });
  assert.equal(sameSection(a, hide), true); assert.deepEqual(original, defaultDrawing());
  assert.deepEqual(checkManufacturingDrawing({ sections: [hide] }), []);
  assert.deepEqual(sectionsOf(withManufacturingDrawing(original, { sections: [hide] })), [hide]);
});
test('strict input refuses invalid flags and unsupported forms; permissive saved reader does not extend them', () => {
  for (const value of [false, 1, 'true', null]) assert.ok(checkManufacturingDrawing({ sections: [{ ...a, hideHatch: value }] }).length);
  for (const extra of [{ dir: [0, 1, 0] }, { half: { line: 'vertical', at: 1, cut: 'after' } }, { steps: [{ past: 1, at: 2 }] }, { removed: {} }, { revolved: true }]) {
    const raw = { ...hide, ...extra };
    assert.equal(sectionHatchVisibilitySupported(raw as DrawingSection), false);
    assert.ok(checkManufacturingDrawing({ sections: [raw] }).length);
    assert.equal(sectionsOf(readDrawing({ ...defaultDrawing(), sections: [raw] }))[0]?.hideHatch, undefined);
  }
});
test('other-sheet edits and merge preserve independent accepted hatch flags', () => {
  const whole: DrawingSettings = { ...defaultDrawing(), sections: [hide, b], sheets: [{ id: 's2', views: ['top'] }] };
  const second = forSheet(whole, 1); assert.deepEqual(sectionsOf(second), [b]);
  const hiddenB = withSections(second, [{ ...b, hideHatch: true }]);
  const merged = mergeSheet(whole, 1, hiddenB);
  assert.equal(sectionsOf(merged).find(s => s.id === 'A')?.hideHatch, true);
  assert.equal(sectionsOf(merged).find(s => s.id === 'B')?.hideHatch, true);
  assert.deepEqual(sectionsOf(readDrawing(JSON.parse(JSON.stringify(merged)))), sectionsOf(merged));
  assert.deepEqual(whole.sections, [hide, b]);
});
test('cached native cut uses current settings: only chosen section hatch changes, including reverse toggle', () => {
  const doc = rectanglePart(20, 10, 8), native = brepsFor(doc); assert.ok('breps' in native);
  const result = projectViews(native.breps, native.prefixes); assert.ok(result.ok);
  const settings: DrawingSettings = { ...defaultDrawing(), sheet: 'A3', sections: [a, b], details: [{ id: 'C', view: 'section:A', center: [10, 4], radius: 2, scale: 2 }], datumTargets: [{ id: 'target', letter: 'A', number: 1, view: 'front', place: [25, 12], kind: 'area', area: { shape: 'circle', at: [10, 4], d: 2 } }] };
  const cuts = sheetSections(sectionsCut(doc, [a, b])), before = structuredClone(cuts);
  const area = (ring: readonly (readonly number[])[]) => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  assert.deepEqual(cuts.map(c => c.rings.reduce((sum, r) => sum + area(r), 0)), [160, 200]);
  const build = (s: DrawingSettings, c = cuts) => buildSheet(result.views, layoutSheet(result.views, s, sectionExtents(s, c)), s, { title: 'own box', date: '2026-11-17' }, c);
  const shown = build(settings), off = build({ ...settings, sections: [hide, b] });
  assert.ok(shown.groups.find(g => g.role === 'datum' && g.id === 'target')?.marks.some(m => m.kind === 'hatch'), 'area datum target hatch actually present');
  const section = (s: typeof shown, id: string) => s.groups.find(g => g.role === 'section' && g.id === id)!;
  assert.ok(section(shown, 'A').marks.some(m => m.kind === 'hatch'));
  assert.equal(section(off, 'A').marks.some(m => m.kind === 'hatch'), false);
  assert.deepEqual(section(off, 'A').marks, section(shown, 'A').marks.filter(m => m.kind !== 'hatch'));
  assert.deepEqual(off.groups.filter(g => !(g.role === 'section' && g.id === 'A')), shown.groups.filter(g => !(g.role === 'section' && g.id === 'A')));
  assert.deepEqual(build(settings, cuts.map(c => ({ ...c, hideHatch: true as const }))), shown, 'stale cut flags must not suppress restored hatch');
  assert.deepEqual(sectionDxfDocument(cuts[0]), sectionDxfDocument({ ...cuts[0], hideHatch: true } as typeof cuts[number]));
  assert.deepEqual(cuts, before); assert.deepEqual(settings.sections, [a, b]);
});

test('dimension-owned cuts permit presentation change but still refuse plane edits', () => {
  const settings: DrawingSettings = { ...defaultDrawing(), sections: [a], dimensions: [{ id: 'width', kind: 'linear', view: 'section:A',
    a: { edge: 'edge-a', at: 'end', near: [0, 5, 0] }, b: { edge: 'edge-b', at: 'end', near: [20, 5, 0] }, orient: 'horizontal', place: [10, -5] }] };
  const off = withManufacturingDrawing(settings, { sections: [hide] });
  assert.equal(off.dimensions, settings.dimensions);
  assert.equal(sectionsOf(off)[0].hideHatch, true);
  assert.throws(() => withManufacturingDrawing(off, { sections: [{ ...hide, at: 6 }] }), /changed or removed section has dimensions/);
});
test('own through-hole rings and hatch return exactly after off/on; independent section export unchanged', () => {
  const doc = withNode(rectanglePart(20, 10, 8), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [10, 5], radius: 2 });
  const native = brepsFor(doc); assert.ok('breps' in native);
  const views = projectViews(native.breps, native.prefixes); assert.ok(views.ok);
  const cuts = sheetSections(sectionsCut(doc, [b])); assert.ok(cuts[0].rings.length >= 2, 'outer and hole rings retained');
  const original = structuredClone(cuts), dxf = sectionDxfDocument(cuts[0]);
  const settings: DrawingSettings = { ...defaultDrawing(), sections: [b] };
  const build = (s: DrawingSettings) => buildSheet(views.views, layoutSheet(views.views, s, sectionExtents(s, cuts)), s, { title: 'own hole', date: '2026-11-17' }, cuts);
  const on = build(settings), off = build({ ...settings, sections: [{ ...b, hideHatch: true }] });
  const group = (sheet: typeof on) => sheet.groups.find(g => g.role === 'section' && g.id === 'B')!;
  assert.ok(group(on).marks.some(m => m.kind === 'hatch'));
  assert.deepEqual(group(off).marks, group(on).marks.filter(m => m.kind !== 'hatch'));
  assert.deepEqual(build(settings), on); assert.deepEqual(cuts, original); assert.deepEqual(sectionDxfDocument(cuts[0]), dxf);
});
