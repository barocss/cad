import test from 'node:test';
import assert from 'node:assert/strict';
import { commandById, type Ctx } from '../src/app/commands';
import { rectanglePart } from '../src/engine/doc';

const command = commandById('assembly-cut')!;
const ctx: Ctx = { doc: rectanglePart(20, 20, 5), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
test('assembly availability uses current placed count without replacing evaluated geometry', () => {
  assert.equal(command.available(ctx).ok, false);
  assert.equal(command.available({ ...ctx, placedPartCount: 1 }).ok, true);
  const withPart: Ctx = { ...ctx, doc: { ...ctx.doc, instances: [{ id: 'p1', name: 'Part', doc: ctx.doc, position: [0, 0, 0], rotation: [0, 0, 0] }] } };
  assert.equal(command.available(withPart).ok, true, 'non-Studio callers retain document fallback');
  assert.equal(command.available({ ...withPart, placedPartCount: 0 }).ok, false, 'explicit removal overrides stale evaluated instances');
});
