import test from 'node:test';
import assert from 'node:assert/strict';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import { sewTrimBlockers } from '../src/ui/sewTrimBlockers';

test('trimmed Sew blockers retain selection positions and duplicate names without mutation', () => {
  const objects = [
    { id: 'a', name: 'bottom', source: 's', geometry: 'a' },
    { id: 'b', name: 'wall', source: 's', geometry: 'b', trims: [{ keep: 'outside', loop: [] }] },
    { id: 'c', name: 'top', source: 's', geometry: 'c', trims: [] },
    { id: 'd', name: 'wall', source: 's', geometry: 'd', trims: [{ keep: 'inside', loop: [] }] },
  ] as unknown as DirectGeometry['objects'];
  const before = JSON.stringify(objects);
  assert.deepEqual(sewTrimBlockers(objects), [{ id: 'b', name: 'wall', position: 2 }, { id: 'd', name: 'wall', position: 4 }]);
  assert.equal(JSON.stringify(objects), before);
  assert.deepEqual(sewTrimBlockers([objects[3], objects[0]]), [{ id: 'd', name: 'wall', position: 1 }]);
  assert.deepEqual(sewTrimBlockers([objects[0], objects[2]]), []);
  assert.deepEqual(sewTrimBlockers([]), []);
});
