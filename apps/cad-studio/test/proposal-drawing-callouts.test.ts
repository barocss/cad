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

test('report a fit change independently of ordinary printed callout edits', () => {
  const withFit = (upper: number): StudioDoc => ({ ...seed, fits: {
    version: 1, faces: [{ face: 'n2.side0', class: 'H7' }],
    tables: [{ id: 'synthetic', rows: [{ class: 'H7', over: 3, upTo: 6, upper, lower: 0 }] }],
  } });
  const fitted = withFit(.018);
  const moved: StudioDoc = { ...fitted, drawing: { ...fitted.drawing!, dimensions: fitted.drawing!.dimensions.map(dimension =>
    dimension.id === 'd4' ? { ...dimension, place: [0, -20] } : dimension) } };
  assert.deepEqual(proposalDrawingCallouts(fitted, moved), { changes: [] });

  const updated = proposalDrawingCallouts(fitted, withFit(.0180001));
  assert.ok('changes' in updated);
  const [change] = updated.changes;
  assert.equal(updated.changes.length, 1);
  assert.equal(change.before?.fit, 'H7 (+0.018/0)');
  assert.equal(change.after?.fit, 'H7 (+0.0180001/0)');
  assert.equal(change.fitChanged, true);

  const removed = proposalDrawingCallouts(fitted, seed);
  assert.ok('changes' in removed);
  assert.equal(removed.changes[0].fitChanged, true);
  assert.equal(removed.changes[0].after?.fit, undefined);
});
