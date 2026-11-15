import test from 'node:test';
import assert from 'node:assert/strict';
import { openChainGuidance, openChainFinishGuidance } from '../src/app/sketchOpenGuidance';
import { sketchStatus } from '../src/ui/sketchSettledStatus';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
const line: Polygon = { kind: 'polygon', closed: false, points: [[12, 12], [32, 12]] };

test('one or two straight points request the next point; a third or native two-point arc can close', () => {
  assert.match(openChainGuidance({ ...line, points: [[12, 12]] }, 'polygon'), /next point/);
  assert.match(sketchStatus(line, null, 'polygon').text, /next point/);
  assert.match(openChainGuidance({ ...line, points: [...line.points, [12, 28]] }, 'polygon'), /first point to close/);
  assert.match(openChainGuidance({ ...line, bulges: [1, 0] }, 'polygon'), /first point to close/);
  assert.match(openChainGuidance(line, 'arc'), /first point to close/);
  assert.match(openChainGuidance({ ...line, pending: true }, 'arc'), /bend the arc/);
});

test('Finish refusal identifies action and endpoints for each unfinished material chain without editing it', () => {
  const second: Polygon = { ...line, points: [[50, 40], [60, 40]], bulges: [1, 0] };
  const shapes = [line, second, { ...line, construction: true as const }, { ...line, closed: true }], before = JSON.stringify(shapes);
  const message = openChainFinishGuidance(shapes);
  assert.match(message, /Add another point.*chain 1 from \(12, 12\) to \(32, 12\) mm/);
  assert.match(message, /Close or trim the open chain 2 from \(50, 40\) to \(60, 40\) mm/);
  assert.equal((message.match(/from/g) ?? []).length, 2);
  assert.equal(JSON.stringify(shapes), before);
  assert.match(openChainFinishGuidance([{ ...line, pending: true, closed: true }]), /Place the last arc/);
});
