import test from 'node:test';
import assert from 'node:assert/strict';
import { bandHighlight } from '../src/app/bandHighlight';

const body = (node: number, names: string[][]) => ({ ref: { node, side: 'solid' as const }, mesh: { edges: names.map(n => ({ names: n })) } as never });

test('the Band surface picks are highlighted on the body that owns them, A and B alike', () => {
  const bodies = [body(1, [['n1.top|n1.side'], ['n1.bottom|n1.side']]), body(3, [['n3.bottom|n3.side'], ['n3.top|n3.side']])];
  const sel = bandHighlight(bodies, [{ side: 'a', parent: { node: 1, side: 'solid' }, names: ['n1.top|n1.side'] }, { side: 'b', parent: { node: 3, side: 'solid' }, names: ['n3.bottom|n3.side'] }]);
  assert.deepEqual(sel, { faces: [], edges: [{ body: 0, edge: 0 }, { body: 1, edge: 0 }], bodies: [] });
});

test('a name on another body, an unknown parent and no picks highlight nothing', () => {
  const bodies = [body(1, [['x']]), body(3, [['y']])];
  assert.equal(bandHighlight(bodies, [{ side: 'a', parent: { node: 3, side: 'solid' }, names: ['x'] }]), null);
  assert.equal(bandHighlight(bodies, [{ side: 'b', parent: { node: 9, side: 'solid' }, names: ['x'] }]), null);
  assert.equal(bandHighlight(bodies, []), null);
});

test('several display edges of one name (a split chain) are all highlighted once', () => {
  const sel = bandHighlight([body(1, [['n'], ['m'], ['n']])], [{ side: 'a', parent: { node: 1, side: 'solid' }, names: ['n', 'n'] }]);
  assert.deepEqual(sel?.edges, [{ body: 0, edge: 0 }, { body: 0, edge: 2 }]);
});

import { activeBandHighlight } from '../src/app/bandHighlight';
import { BandSurfaceEdit, bandSurfaceCommand } from '@barocss/cad-model/app/bandSurfaceCommand';
import { emptyDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import type { Active } from '../src/app/commandState';

function activeBand() {
  const node: Extract<ModelNode, { kind: 'band-surface' }> = { kind: 'band-surface', id: 'band', version: 1,
    a: { parent: { node: 1, side: 'solid' }, edges: ['a'] }, b: { parent: { node: 3, side: 'solid' }, edges: ['b'] } };
  const doc = { ...emptyDoc(), nodes: [node] };
  const cmd = new BandSurfaceEdit(0, node.id);
  const ctx = { doc, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  const active: Active = { cmd, ctx, preview: 'ok', values: cmd.defaults(ctx) };
  return { doc, active };
}

test('History Band and creation resolve current names against shown body order', () => {
  const { doc, active } = activeBand(), shown = [body(3, [['b']]), body(1, [['a']])];
  const expected = { faces: [], edges: [{ body: 1, edge: 0 }, { body: 0, edge: 0 }], bodies: [] };
  assert.deepEqual(activeBandHighlight(active, doc, shown), expected);
  assert.deepEqual(activeBandHighlight({ ...active, cmd: bandSurfaceCommand }, doc, shown), expected);
  assert.deepEqual(activeBandHighlight({ ...active, values: { ...active.values, a: '' } }, doc, shown)?.edges, [{ body: 0, edge: 0 }]);
  assert.deepEqual(activeBandHighlight(active, doc, [body(5, [['a']]), body(3, [['b']])])?.edges, [{ body: 1, edge: 0 }], 'consumed parent is not inferred from identical names');
});

test('stale source, replaced History owner, unrelated edits and cancellation have no Band highlight', () => {
  const { doc, active } = activeBand(), shown = [body(1, [['a']]), body(3, [['b']])];
  assert.equal(activeBandHighlight(active, { ...doc }, shown), null);
  assert.equal(activeBandHighlight({ ...active, ownsSource: () => false }, doc, shown), null);
  const replaced = { ...doc, nodes: doc.nodes.map(n => ({ ...n, id: 'other' })) };
  assert.equal(activeBandHighlight({ ...active, ctx: { ...active.ctx, doc: replaced } }, replaced, shown), null);
  assert.equal(activeBandHighlight({ ...active, cmd: { ...bandSurfaceCommand, id: 'edit' } }, doc, shown), null);
  assert.equal(activeBandHighlight(null, doc, shown), null);
});
