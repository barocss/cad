import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { SelectionInspector } from '../src/ui/SelectionInspector';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { FaceSel } from '@barocss/cad-model/app/commands';
const base = rectanglePart(10, 10, 10), evaluated = evaluateDoc(base, 1); assert.ok(evaluated.ok);
const bodies = [evaluated.bodies[0], { ...evaluated.bodies[0], key: 'second' }];
const doc = { ...base, bodies: { [bodies[0].key]: { name: 'First body' }, second: { name: 'Second body' } } };
function render(faces: FaceSel[]) {
  return renderToStaticMarkup(createElement(SelectionInspector, {
    model: { doc, evaluated: doc, bodies, fresh: true, busy: false, massReady: true }, selection: { faces, edges: [], bodies: [] },
    materialSettings: { material: 'al6061', setMaterial() {} },
    display: { showBox: false, setShowBox() {}, inertiaAt: 'centre', setInertiaAt() {} },
    changes: { commit() { throw new Error('render must not edit'); }, setSelection() {}, edgesToCurves() {}, async loadBendTable() {}, setFlatView() {}, setCutListView() {}, separate() {} }, children: null,
  }));
}
test('single and multiple face titles count selection; first target follows ordering across bodies', () => {
  const before = JSON.stringify(doc);
  const one = render([{ body: 0, face: 0 }]); assert.match(one, /SELECTION · 1 FACE/); assert.doesNotMatch(one, /first selected face only/);
  for (const faces of [[{ body: 0, face: 0 }, { body: 0, face: 1 }], [{ body: 0, face: 1 }, { body: 0, face: 0 }], [{ body: 1, face: 1 }, { body: 0, face: 0 }]]) {
    const html = render(faces), pick = faces[0], body = bodies[pick.body];
    assert.match(html, /SELECTION · 2 FACES/);
    assert.ok(html.includes(`(${body.key}) · ${body.mesh.faces[pick.face].name} — first selected face only`));
    assert.match(html, pick.body === 1 ? /Second body/ : /First body/);
    const id = html.match(/id="([^"]+)"[^>]*aria-label="Face property and colour target"/)?.[1]; assert.ok(id);
    assert.ok(html.includes(`aria-label="Face colour" aria-describedby="${id}"`));
    assert.ok(html.includes(`aria-label="No face colour" aria-describedby="${id}"`));
    assert.match(html, /aria-label="Colour"/);
  }
  assert.equal(JSON.stringify(doc), before);
});
