import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import type { BodyResult } from '../src/engine/evaluate';
import { defaultDrawing } from '../src/drawing/types';
import { sectionTextClearanceScope, sectionTextClearanceSource } from '../src/drawing/sectionTextClearanceScope';

type Evidence = Pick<BodyResult, 'ref' | 'family' | 'topology' | 'element'>;
const body: Evidence = { ref: { node: 1, side: 'solid' }, family: 'upright', topology: { kind: 'solid', bodyCount: 1, openShells: 0, boundaryEdges: 0 } };
const settings = defaultDrawing();

test('clearance admits only a single known made native base body without altering inputs', () => {
  const doc = rectanglePart(60, 40, 20), before = JSON.stringify({ doc, body, settings });
  assert.equal(sectionTextClearanceScope(doc, doc, settings, [body]), true);
  assert.equal(sectionTextClearanceScope(doc, doc, { ...settings, scope: { kind: 'part' } }, [body]), true);
  assert.equal(JSON.stringify({ doc, body, settings }), before);
});

test('unknown or multiple native bodies, absent ownership and mesh cannot opt in', () => {
  const doc = rectanglePart(60, 40, 20);
  for (const bodies of [undefined, [], [body, body], [{ ...body, ref: undefined }],
    [{ ...body, ref: { node: 99, side: 'solid' as const } }], [{ ...body, family: 'mesh' }],
    [{ ...body, topology: undefined }],
    [{ ...body, topology: { ...body.topology!, openShells: 1 } }],
    [{ ...body, topology: { ...body.topology!, boundaryEdges: 1 } }],
    ...[undefined, 0, 2, NaN, -1].map(bodyCount => [{ ...body, topology: { ...body.topology!, bodyCount } }]),
    ...(['unknown', 'mixed', 'sheet'] as const).map(kind => [{ ...body, topology: { ...body.topology!, kind } }])]) {
    assert.equal(sectionTextClearanceScope(doc, doc, settings, bodies), false);
  }
});

test('original instances, explicit/implicit assembly, selected body and placed scope fail closed', () => {
  const doc = rectanglePart(60, 40, 20);
  const assembly: StudioDoc = { ...doc, instances: [{ id: 'p1', name: 'part', doc, position: [0, 0, 0], rotation: [0, 0, 0] }] };
  assert.equal(sectionTextClearanceScope(assembly, doc, settings, [body]), false, 'derived document has removed instances');
  assert.equal(sectionTextClearanceScope(doc, assembly, settings, [body]), false);
  for (const s of [{ ...settings, balloons: true }, { ...settings, scope: { kind: 'assembly' as const } },
    { ...settings, scope: { kind: 'part' as const, part: 'p1' } },
    { ...settings, scope: { kind: 'part' as const, body: { key: 'b1', feature: 'n1', kind: 'extrude' as const } } },
    { ...settings, scope: { kind: 'part' as const }, balloons: true }]) {
    assert.equal(sectionTextClearanceSource(doc, s), false);
    assert.equal(sectionTextClearanceScope(doc, doc, s, [body]), false);
  }
});

test('bought fallback and changed source are excluded; made override can recover', () => {
  const doc = rectanglePart(60, 40, 20);
  const bought: StudioDoc = { ...doc, nodes: doc.nodes.map((node, i) => i === 1 ? { ...node, bought: true } : node) };
  assert.equal(sectionTextClearanceScope(bought, bought, settings, [body]), false);
  assert.equal(sectionTextClearanceScope(doc, doc, settings, [body]), true);
  const restored: StudioDoc = { ...bought, nodes: bought.nodes.map(node => ({ ...node, bought: false })) };
  assert.equal(sectionTextClearanceScope(restored, restored, settings, [body]), true);
});
