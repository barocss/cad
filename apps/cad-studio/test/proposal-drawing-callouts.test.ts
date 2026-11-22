import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { proposalDrawingCallouts } from '../src/engine/proposalDrawingCallouts';

const seed = JSON.parse(readFileSync('test/fixtures/b06-counterbore-two-sheets-depth-four.bcad', 'utf8')) as StudioDoc;

test('drawing preview compares printed radius additions and diameter removals on their sheet', () => {
  const drawing = seed.drawing!;
  const radius: StudioDoc = { ...seed, drawing: { ...drawing, dimensions: drawing.dimensions.map(dimension =>
    dimension.kind === 'diameter' ? { ...dimension, id: 'r1', kind: 'radius' } : dimension) } };
  assert.deepEqual(proposalDrawingCallouts(seed, seed), { changes: [] });
  const reply = proposalDrawingCallouts(seed, radius);
  assert.ok('changes' in reply);
  const [removed, added] = reply.changes;
  assert.equal(reply.changes.length, 2);
  assert.equal(removed.before?.id, 'd4');
  assert.equal(removed.before.sheet, 2);
  assert.deepEqual(removed.before.lines, ['Ø4 THRU  CBORE Ø8 × 4 DEEP']);
  assert.equal(removed.after, undefined);
  assert.equal(added.before, undefined);
  assert.equal(added.after?.id, 'r1');
  assert.equal(added.after.sheet, 2);
  assert.equal(added.after.kind, 'radius');
  assert.match(added.after.lines.join(' '), /R2\b/);
});

test('ambiguous drawing references fail instead of hiding a printed annotation', () => {
  const drawing = seed.drawing!;
  const diameter = drawing.dimensions.find(dimension => dimension.kind === 'diameter')!;
  const duplicate = { ...seed, drawing: { ...drawing, dimensions: [...drawing.dimensions, diameter] } };
  assert.deepEqual(proposalDrawingCallouts(seed, duplicate), { error: 'Callout references are ambiguous.' });
});
