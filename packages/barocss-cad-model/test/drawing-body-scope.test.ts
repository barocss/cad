import { fitDimensionTable } from '../src/drawing/fitList';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { withIds } from '../src/engine/ids';
import { brepsFor, evaluateDoc, partBreps } from '../src/engine/evaluate';
import { checkDrawingScope, changeDrawingScope, drawingDocument, assertDrawingBodySettings, type DrawingScope } from '../src/drawing/scope';
import { readDrawing } from '../src/drawing/types';
import { drawingInputs, runDrawingTool } from '../src/chat/drawing';
import { assertSavedDrawingDocument } from '../src/engine/savedDrawing';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { projectViews } from '../src/drawing/project';
const scope: DrawingScope = { kind: 'part', body: { key: 'b1', feature: 'n1', kind: 'extrude' } };
function fixture(): StudioDoc {
  let d = withIds(rectanglePart(30, 12, 6));
  d = withNode(d, { kind: 'sketch', profile: 'rectangle', min: [-5, -4], max: [35, -2] });
  d = withNode(d, { kind: 'extrude', sketch: 2, height: 12, from: -3 });
  return { ...d, drawing: { ...readDrawing(undefined), scope } };
}
function inputs(d: StudioDoc) { const x = drawingInputs(d); assert.ok(typeof x !== 'string', String(x)); return x; }

test('selected body is native pre-HLR scope, not deletion or postprojection filtering', () => {
  const d = fixture(), before = JSON.stringify(d), all = brepsFor(d), one = brepsFor(d, { body: scope.kind === 'part' ? scope.body : undefined });
  assert.ok(!('error' in all) && !('error' in one));
  assert.equal(all.breps.length, 2); assert.equal(one.breps.length, 1);
  const native = brepsFor(withIds(rectanglePart(30, 12, 6))); assert.ok(!('error' in native));
  const expected = projectViews(native.breps, native.prefixes); assert.ok(expected.ok);
  const actual = inputs(d); assert.deepEqual(actual.views, expected.views);
  assert.deepEqual(actual.views.front.min, [0, 0]); assert.deepEqual(actual.views.front.max, [30, 6]);
  assert.deepEqual(actual.views.top.min, [0, 0]); assert.deepEqual(actual.views.top.max, [30, 12]);
  assert.ok(actual.views.faces?.every(f => f.name.startsWith('n1.')));
  assert.ok(actual.views.front.edges.some(e => e.pieces.some(p => p.visible)));
  assert.notDeepEqual(inputs({ ...d, drawing: readDrawing(undefined) }).views.front, actual.views.front);
  const ev = evaluateDoc(d, 1); assert.ok(ev.ok); assert.equal(ev.bodies.length, 2);
  assert.ok(Math.abs(ev.bodies.find(b => b.key === 'b1')!.volume! - 2160) < 1e-7);
  assert.equal(drawingDocument(d, readDrawing(d.drawing)).nodes.length, 4);
  assert.equal(JSON.stringify(d), before);
});

test('parameter edits retain source; consumed, missing, duplicate, implicit or replaced owner never falls back', () => {
  const d = fixture();
  const grown = { ...d, nodes: d.nodes.map((n, i) => i === 0 ? { ...n, max: [40, 12] } : n) } as StudioDoc;
  const expected = inputs({ ...withIds(rectanglePart(40, 12, 6)), drawing: readDrawing(undefined) });
  assert.deepEqual(inputs(grown).views, expected.views);
  const ev = evaluateDoc(grown, 1); assert.ok(ev.ok);
  assert.ok(Math.abs(ev.bodies.find(b => b.key === 'b1')!.volume! - 2880) < 1e-7);
  const movedOther = { ...d, nodes: d.nodes.map((n, i) => i === 3 ? { ...n, height: 20 } : n) } as StudioDoc;
  assert.deepEqual(inputs(movedOther).views, inputs(d).views);
  for (const bad of [
    { ...d, nodes: d.nodes.map((n, i) => i === 1 ? { ...n, id: 'n99' } : n) },
    { ...d, nodes: d.nodes.map((n, i) => i === 1 ? { ...n, id: undefined } : n) },
    { ...d, nodes: [...d.nodes, d.nodes[1]] },
    { ...d, nodes: d.nodes.map((n, i) => i === 1 ? { ...n, suppressed: true } : n) },
  ] as StudioDoc[]) assert.equal(typeof drawingInputs(bad), 'string');
  const consumed = withNode(d, { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [2, 0, 0] });
  assert.equal(typeof drawingInputs(consumed), 'string');
});

test('saved scope preserves exact selector, rejects unsupported settings and keeps old scope contract', async () => {
  const d = fixture(), settings = readDrawing(d.drawing);
  assert.deepEqual(settings.scope, scope); assert.deepEqual(checkDrawingScope(scope), []);
  const file = await readStudioFile(encodeStudioFile(d));
  assert.ok('doc' in file); assert.deepEqual(readDrawing(file.doc.drawing).scope, scope);
  // Previous strict reader accepts only kind/part; a body key cannot silently become whole-part scope.
  const oldScopeFields = (x: object) => Object.keys(x).every(k => k === 'kind' || k === 'part');
  assert.equal(oldScopeFields(scope), false);
  for (const extra of [
    { section: { y: 1 } }, { sections: [{ id: 'A', view: 'front', at: 1 }] },
    { details: [{ id: 'B', view: 'front', center: [1, 1], radius: 2 }] },
    { breaks: [{ axis: 'x', from: 1, to: 2 }] }, { sheets: [{ id: 's2', views: [] }] },
    { tables: [{ id: 't', from: 'fits' }] }, { balloons: true }, { weldSymbols: true },
  ]) {
    assert.throws(() => assertSavedDrawingDocument({ ...d, drawing: { ...settings, ...extra } }), /Selected-body/);
  }
  assert.throws(() => assertDrawingBodySettings({ ...settings, tables: [{ id: 't', from: 'bom' }] }), /Selected-body/);
  assert.ok(checkDrawingScope({ kind: 'part', part: 'placed', body: scope.kind === 'part' && scope.body }).length);
  assert.ok(checkDrawingScope({ kind: 'part', body: { key: 'b1_part0', feature: 'n1', kind: 'extrude' } }).length);
  assert.ok(checkDrawingScope({ kind: 'part', body: { key: 'b1', feature: 'n1', kind: 'split' } }).length);
});

test('scope change retains manual reference protection and chat uses the same selection contract', () => {
  const d = fixture(), s = readDrawing(d.drawing);
  const manual = { ...s, dimensions: [{ id: 'manual', kind: 'linear', view: 'front', a: { edge: 'n1.side0|n1.top', at: 'end', near: [0, 0, 6] }, b: { edge: 'n1.side1|n1.top', at: 'end', near: [30, 0, 6] }, orient: 'horizontal', place: [15, 10] }] } as typeof s;
  assert.throws(() => changeDrawingScope(manual, { kind: 'part' }), /manual model references/);
  assert.deepEqual(changeDrawingScope(manual, scope).dimensions, manual.dimensions);
  const auto = runDrawingTool(d, 'auto_dimension', {}); assert.ok(!('error' in auto), JSON.stringify(auto));
  assert.doesNotMatch(JSON.stringify(readDrawing(auto.doc.drawing).dimensions), /n3\./);
  assert.equal(auto.doc.nodes, d.nodes);
});


test('unresolved saved target preserves authoring document while drawing fails closed', async () => {
  const d = fixture(), missing = { ...d, nodes: d.nodes.map((n, i) => i === 1 ? { ...n, suppressed: true } : n) } as StudioDoc;
  const saved = await readStudioFile(encodeStudioFile(missing));
  assert.ok('doc' in saved); assert.deepEqual(readDrawing(saved.doc.drawing).scope, scope);
  assert.equal(typeof drawingInputs(saved.doc), 'string');
  assert.equal(saved.doc.nodes[1].suppressed, true);
});


test('supported revolve output and native same-key assembly-cut replacement are distinguished', () => {
  const profile = withNode(emptyDoc(), { kind: 'sketch', profile: 'circle', center: [20, 0], radius: 5 });
  const ring = withNode(profile, { kind: 'revolve', sketch: 0, axis: 'y', angle: 360 });
  const selected = brepsFor(ring, { body: { key: 'b1', feature: 'n1', kind: 'revolve' } });
  assert.ok(!('error' in selected), JSON.stringify(selected)); assert.equal(selected.breps.length, 1);
  const d = fixture();
  // Exact native owner, not bodyKeyOf alone: assembly-cut deliberately maps its output back to b1.
  const tool = { ...d, nodes: d.nodes.map((n, i) => i === 2 ? { ...n, min: [2, 2], max: [4, 4] } : i === 3 ? { ...n, from: 0, height: 6 } : n) } as StudioDoc;
  const cut = withNode(tool, { kind: 'difference', parent: { node: 1, side: 'solid' }, tool: { node: 3, side: 'solid' }, made: { command: 'assembly-cut', values: {}, nodes: 1 } });
  assert.ok(partBreps(cut).some(o => o.key === 'b1'));
  const r = brepsFor(cut, { body: scope.kind === 'part' ? scope.body : undefined });
  assert.ok('error' in r); assert.match(r.error, /selected body/i);
});


test('selected body does not widen the existing fit list scope', () => {
  const d = fixture(), settings = readDrawing(d.drawing);
  const result = fitDimensionTable(d, { settings, wholeSettings: settings, resolved: [] });
  assert.ok('error' in result); assert.match(result.error, /selected-body/);
});
