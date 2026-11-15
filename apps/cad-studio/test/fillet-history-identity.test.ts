import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { FilletTypeFields } from '../src/ui/FilletTypeFields';
import { NodeEditor } from '../src/ui/NodeEditor';
import { rectanglePart, withNode, type FilletSection } from '@barocss/cad-model/engine/doc';

const render = (props: Parameters<typeof FilletTypeFields>[0]) => renderToStaticMarkup(createElement(FilletTypeFields, props));
test('fixed edge identity has concise named read-only groups, including the exact current section and stored radius mode', () => {
  for (const [section, label] of [[undefined, 'Circular'], [{ kind: 'conic', rho: .4 }, 'Conic'], [{ kind: 'g2', tension: .5 }, 'Curvature (G2)']] as const) {
    for (const mode of ['constant', 'varying'] as const) {
      const html = render({ type: 'edge', mode, section, fixed: true });
      assert.match(html, /role="group" aria-label="Fillet type"><span>Type<\/span><span>Edge<\/span>/);
      assert.match(html, new RegExp(`aria-label="Fillet radius mode"><span>Radius mode</span><span>${mode === 'varying' ? 'Varying' : 'Constant'}</span>`));
      assert.ok(html.includes(`aria-label="Fillet section"><span>Section</span><span>${label}</span>`));
      assert.doesNotMatch(html, /<select|<input|<button|disabled=/);
    }
  }
});
test('fixed face and full-round identity do not invent an edge section or radius mode', () => {
  for (const [type, name] of [['face', 'Face'], ['full-round', 'Full round']] as const) {
    const html = render({ type, mode: 'constant', fixed: true });
    assert.ok(html.includes(`<span>${name}</span>`)); assert.doesNotMatch(html, /<select|Fillet section|Fillet radius mode/);
  }
});
test('creation remains editable with the existing accessible Type and Radius mode choices', () => {
  const html = render({ type: 'edge', mode: 'varying', onType() {}, onMode() {} });
  assert.match(html, /<select[^>]*aria-label="Fillet type"/); assert.match(html, /<select[^>]*aria-label="Fillet radius mode"/);
  assert.match(html, /value="varying" selected=""/); assert.doesNotMatch(html, /disabled=|Fillet section/);
});
test('actual History passes section identity and stored varying state without altering coefficient, radius or station fields', () => {
  for (const section of [{ kind: 'conic', rho: .4 }, { kind: 'g2', tension: .5 }] as FilletSection[]) {
    for (const varying of [false, true]) {
      const doc = withNode(rectanglePart(40, 30, 10), { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius: varying ? 1 : 4, section,
        ...(varying ? { radii: [{ at: [0, 0, 10] as [number, number, number], radius: 1, atEnd: true as const }, { at: [10, 0, 10] as [number, number, number], fraction: .25, radius: 2 }, { at: [40, 0, 10] as [number, number, number], radius: 4, atEnd: true as const }] } : {}),
      }), before = structuredClone(doc);
      const html = renderToStaticMarkup(createElement(NodeEditor, { nodes: doc.nodes, index: 2, parameters: {}, onApply() {}, onClose() {}, onRefuse() {} }));
      assert.ok(html.includes(`<span>${section.kind === 'conic' ? 'Conic' : 'Curvature (G2)'}</span>`));
      assert.ok(html.includes(`<span>${varying ? 'Varying' : 'Constant'}</span>`));
      assert.doesNotMatch(html, /<select[^>]*aria-label="Fillet (?:type|radius mode)"/);
      assert.match(html, section.kind === 'conic' ? /aria-label="Rho"/ : /aria-label="Tension"/);
      assert.match(html, varying ? /aria-label="Interior position \(%\)"/ : /aria-label="Radius"/);
      assert.deepEqual(doc, before);
    }
  }
});
