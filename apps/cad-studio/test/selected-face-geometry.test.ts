import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart, emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { offsetFaceCommand } from '@barocss/cad-model/app/profileCommands';
import { SelectionInspector } from '../src/ui/SelectionInspector';
import { selectedFaceGeometry } from '../src/ui/selectedFaceGeometry';
const base = rectanglePart(40, 30, 10);
const doc = { ...base, nodes: base.nodes.map(n => n.kind === 'extrude' ? { ...n, draft: 10 } : n) };
const result = evaluateDoc(doc, 1); assert.ok(result.ok);
const face = result.bodies[0].mesh.faces.find(f => f.name === 'n1.side1')!;
function render(fresh: boolean) {
  return renderToStaticMarkup(createElement(SelectionInspector, {
    model: { doc, evaluated: doc, bodies: result.ok ? result.bodies : [], fresh, busy: false, massReady: true },
    selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] },
    materialSettings: { material: 'al6061', setMaterial() {} },
    display: { showBox: false, setShowBox() {}, inertiaAt: 'centre', setInertiaAt() {} },
    changes: { commit() { throw new Error('must not edit'); }, setSelection() {}, edgesToCurves() {}, async loadBendTable() {}, setFlatView() {}, setCutListView() {}, separate() {} }, children: null,
  }));
}
test('native drafted wall support agrees with command and inspector without changing geometry', () => {
  const before = JSON.stringify({ doc, result });
  assert.equal(face.kind, 'curved'); assert.equal(face.exact?.kind, 'plane');
  const geometry = selectedFaceGeometry(face, true); assert.equal(geometry.label, 'Planar'); assert.ok(geometry.normal);
  assert.ok(Math.abs(geometry.normal[0] - Math.cos(Math.PI / 18)) < 1e-10);
  assert.ok(Math.abs(geometry.normal[2] - Math.sin(Math.PI / 18)) < 1e-10);
  assert.ok(result.ok && offsetFaceCommand.available!({ doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } }).ok);
  const html = render(true); assert.match(html, /Type <b>Planar/); assert.match(html, /Normal <b>0.985, 0, 0.174/);
  assert.equal(JSON.stringify({ doc, result }), before);
});
test('actual cylinder stays Curved; stale and malformed normal never claim a current plane', () => {
  const cylinder = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 10 }), { kind: 'extrude', sketch: 0, height: 10 });
  const built = evaluateDoc(cylinder, 2); assert.ok(built.ok);
  const side = built.bodies[0].mesh.faces.find(f => f.exact?.kind === 'cylinder')!; assert.ok(side);
  assert.deepEqual(selectedFaceGeometry(side, true), { label: 'Curved', normal: undefined });
  assert.deepEqual(selectedFaceGeometry(face, false), { label: 'Unknown', normal: undefined });
  assert.equal(selectedFaceGeometry({ ...face, exact: { kind: 'plane', o: [0,0,0], n: [NaN,0,0] } }, true).label, 'Unknown');
  const html = render(false); assert.match(html, /Type <b>Unknown/); assert.doesNotMatch(html, /Normal <b>/);
});
