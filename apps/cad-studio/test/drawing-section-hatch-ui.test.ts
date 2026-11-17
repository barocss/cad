import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { DrawingSection } from '@barocss/cad-model/drawing/types';
import { SectionKind } from '../src/ui/drawing/SectionKind';
import { sectionGeometryInputs, withSectionHatch } from '../src/ui/drawing/sectionHatch';
const section: DrawingSection = { id: 'A', view: 'front', at: 5 };
function render(s: DrawingSection, part = true, pending = false) {
  return renderToStaticMarkup(createElement(SectionKind, { section: s, views: null, hatchPartScope: part, hatchDraftPending: pending, onSet: () => assert.fail('render must not commit') }));
}
function hatch(html: string) { const tag = html.match(/<input[^>]*aria-label="Section A hatch"[^>]*>/)?.[0]; assert.ok(tag); return tag; }
test('hatch defaults shown, explicit off is canonical, unchanged requests preserve identity', () => {
  assert.match(hatch(render(section)), /checked/);
  const hidden = withSectionHatch(section, false, true);
  assert.deepEqual(hidden, { ...section, hideHatch: true });
  assert.doesNotMatch(hatch(render(hidden)), /checked/);
  assert.strictEqual(withSectionHatch(hidden, false, true), hidden);
  assert.deepEqual(withSectionHatch(hidden, true, true), section);
  assert.deepEqual(section, { id: 'A', view: 'front', at: 5 });
  assert.match(render(hidden), /Show this section’s hatch before changing its kind/);
  assert.match(render(hidden), /<select[^>]*aria-label="Section A kind"[^>]*disabled/);
});
test('assembly, invalid scope and unsupported forms cannot change hatch', () => {
  assert.match(hatch(render(section, false)), /disabled/);
  assert.strictEqual(withSectionHatch(section, false, false), section);
  const forms: DrawingSection[] = [
    { ...section, dir: [0, 1, 0] }, { ...section, half: { line: 'vertical', at: 0, cut: 'after' } },
    { ...section, steps: [{ past: 0, at: 5 }] }, { ...section, along: 'horizontal' },
    { ...section, removed: {} }, { ...section, revolved: true },
  ];
  for (const form of forms) { assert.match(hatch(render(form)), /disabled/); assert.strictEqual(withSectionHatch(form, false, true), form); }
});
test('pending section field disables hatch and explains required completion', () => {
  const html = render(section, true, true);
  assert.match(hatch(html), /disabled/);
  assert.match(html, /Finish or cancel the section input before changing hatch visibility/);
});
test('native key and payload exclude only display flag and preserve original geometry and input', () => {
  const original: DrawingSection[] = [section, { id: 'B', view: 'top', at: 4, hideHatch: true }, { id: 'C', view: 'right', at: 2, removed: { at: [10, 20], scale: 2 } }];
  const before = structuredClone(original), geometry = sectionGeometryInputs(original);
  assert.deepEqual(geometry, [section, { id: 'B', view: 'top', at: 4 }, original[2]]);
  const toggled = original.map(x => ({ ...x, hideHatch: true as const }));
  assert.equal(JSON.stringify(sectionGeometryInputs(toggled)), JSON.stringify(geometry));
  assert.notEqual(JSON.stringify(sectionGeometryInputs([{ ...section, at: 6 }])), JSON.stringify(sectionGeometryInputs([section])));
  assert.deepEqual(original, before);
});
